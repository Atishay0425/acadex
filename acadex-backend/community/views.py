from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, F, OuterRef, Prefetch, Q, Subquery
from django.db.models.functions import TruncDate
from django.utils import timezone
from django_filters import rest_framework as df
from rest_framework import filters, mixins, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .models import Answer, Attachment, Comment, Flag, Question, Room, Tag, Vote
from .permissions import IsAuthorOrModeratorOrReadOnly, IsModerator
from .serializers import (AnswerSerializer, AttachmentSerializer, CommentSerializer, FlagSerializer,
                          QuestionDetailSerializer, QuestionListSerializer, RoomSerializer, TagSerializer)


# --------------------------------------------------------------------------- helpers
def annotate_votes(qs, user, fk):
    """One query for the whole list. MU-CONNECT ran 3 COUNT queries per row (N+1) plus one per row for user_vote."""
    qs = qs.annotate(
        upvotes=Count('votes', filter=Q(votes__value=Vote.UP), distinct=True),
        downvotes=Count('votes', filter=Q(votes__value=Vote.DOWN), distinct=True),
    )
    if user and user.is_authenticated:
        mine = Vote.objects.filter(voter=user, **{fk: OuterRef('pk')}).values('value')[:1]
        qs = qs.annotate(my_vote=Subquery(mine))
    return qs


def cast_vote(user, obj, fk, value):
    """Toggle/switch a vote atomically. Returns the voter's resulting vote (or None)."""
    if obj.author_id == user.id:
        raise ValidationError('You cannot vote on your own content.')
    with transaction.atomic():
        existing = Vote.objects.select_for_update().filter(voter=user, **{fk: obj}).first()
        if existing and existing.value == value:
            existing.delete()
            return None
        if existing:
            existing.value = value
            existing.save(update_fields=['value'])
            return value
        Vote.objects.create(voter=user, value=value, **{fk: obj})
        return value


def parse_vote(request):
    v = request.data.get('vote_type')
    if v not in ('upvote', 'downvote'):
        raise ValidationError({'vote_type': "Must be 'upvote' or 'downvote'."})
    return Vote.UP if v == 'upvote' else Vote.DOWN


def file_flag(request, obj, fk):
    reason = request.data.get('reason')
    if reason not in Flag.Reason.values:
        raise ValidationError({'reason': f'Choose one of {Flag.Reason.values}.'})
    if obj.author_id == request.user.id:
        raise ValidationError('You cannot flag your own content.')
    try:
        with transaction.atomic():
            Flag.objects.create(reporter=request.user, reason=reason, note=request.data.get('note', '')[:300], **{fk: obj})
    except IntegrityError:
        return Response({'detail': 'You already flagged this.'}, status=status.HTTP_409_CONFLICT)
    open_flags = Flag.objects.filter(status=Flag.Status.OPEN, **{fk: obj}).count()
    hidden = False
    if open_flags >= settings.FLAG_HIDE_THRESHOLD and not obj.is_hidden:
        obj.is_hidden = True
        obj.save(update_fields=['is_hidden'])
        hidden = True
    return Response({'status': 'flagged', 'open_flags': open_flags, 'auto_hidden': hidden}, status=status.HTTP_201_CREATED)


class VoteResponseMixin:
    def vote_response(self, request, obj, fk, value):
        my = cast_vote(request.user, obj, fk, value)
        fresh = annotate_votes(type(obj).objects.filter(pk=obj.pk), request.user, fk).get()
        return Response({'upvote_count': fresh.upvotes, 'downvote_count': fresh.downvotes,
                         'vote_score': fresh.upvotes - fresh.downvotes,
                         'user_vote': {1: 'upvote', -1: 'downvote'}.get(my)})


# --------------------------------------------------------------------------- rooms & tags
class RoomViewSet(viewsets.ModelViewSet):
    serializer_class = RoomSerializer
    lookup_field = 'slug'
    filterset_fields = ['kind']
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        if self.action == 'create':
            return [IsModerator()]
        if self.action in ('join', 'leave'):
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        qs = Room.objects.annotate(member_count=Count('members', distinct=True)).order_by('kind', 'name')
        u = self.request.user
        if u.is_authenticated:
            qs = qs.annotate(is_member_flag=Exists(Room.members.through.objects.filter(room=OuterRef('pk'), user=u)))
        return qs

    @action(detail=True, methods=['post'])
    def join(self, request, slug=None):
        self.get_object().members.add(request.user)
        return Response({'status': 'joined'})

    @action(detail=True, methods=['post'])
    def leave(self, request, slug=None):
        self.get_object().members.remove(request.user)
        return Response({'status': 'left'})


class TagViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'slug']


# --------------------------------------------------------------------------- questions
class QuestionFilter(df.FilterSet):
    room = df.CharFilter(field_name='room__slug')
    tag = df.CharFilter(field_name='tags__slug')
    author = df.CharFilter(field_name='author__username')
    solved = df.BooleanFilter(method='filter_solved')
    mine = df.BooleanFilter(method='filter_mine')

    class Meta:
        model = Question
        fields = ['kind']

    def filter_solved(self, qs, name, value):
        return qs.filter(accepted_answer__isnull=not value)

    def filter_mine(self, qs, name, value):
        u = self.request.user
        return qs.filter(author=u) if value and u.is_authenticated else qs


class QuestionViewSet(VoteResponseMixin, viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrModeratorOrReadOnly]
    filterset_class = QuestionFilter
    filter_backends = [df.DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'content', 'tags__name']
    ordering_fields = ['created_at', 'view_count', 'score', 'answers_total']
    ordering = ['-is_pinned', '-created_at']

    def get_throttles(self):
        self.throttle_scope = {'create': 'post', 'vote': 'vote', 'flag': 'flag'}.get(self.action)
        return super().get_throttles() if self.throttle_scope else []

    def get_queryset(self):
        u = self.request.user
        qs = Question.objects.select_related('author', 'room').prefetch_related('tags')
        qs = annotate_votes(qs, u, 'question').annotate(
            answers_total=Count('answers', filter=Q(answers__is_hidden=False), distinct=True),
            score=F('upvotes') - F('downvotes'),
        )
        # Hidden posts are only visible to their author and to moderators.
        if not (u.is_authenticated and u.is_moderator):
            qs = qs.filter(Q(is_hidden=False) | Q(author=u.pk if u.is_authenticated else None))
        if self.action == 'retrieve':
            answers = annotate_votes(Answer.objects.filter(is_hidden=False).select_related('author', 'question'), u, 'answer')
            answers = answers.prefetch_related(Prefetch('comments', Comment.objects.select_related('author')), 'attachments')
            qs = qs.prefetch_related(Prefetch('answers', answers, to_attr='visible_answers'), 'attachments')
        return qs

    def get_serializer_class(self):
        return QuestionDetailSerializer if self.action == 'retrieve' else QuestionListSerializer

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def _fresh(self, request, pk):
        self.kwargs['pk'] = pk
        return QuestionListSerializer(self.get_queryset().get(pk=pk), context={'request': request}).data

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        self.perform_create(s)
        return Response(self._fresh(request, s.instance.pk), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return Response(self._fresh(request, self.get_object().pk))

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def vote(self, request, pk=None):
        return self.vote_response(request, self.get_object(), 'question', parse_vote(request))

    @action(detail=True, methods=['post'], permission_classes=[permissions.AllowAny])
    def view(self, request, pk=None):
        """Count one view per viewer per hour (MU-CONNECT never counted views at all)."""
        q = self.get_object()
        who = request.user.pk if request.user.is_authenticated else request.META.get('REMOTE_ADDR', 'anon')
        if cache.add(f'qview:{q.pk}:{who}', 1, timeout=3600):
            Question.objects.filter(pk=q.pk).update(view_count=F('view_count') + 1)
            q.view_count += 1
        return Response({'view_count': q.view_count})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def flag(self, request, pk=None):
        return file_flag(request, self.get_object(), 'question')

    @action(detail=True, methods=['post'], permission_classes=[IsModerator])
    def pin(self, request, pk=None):
        q = self.get_object()
        q.is_pinned = not q.is_pinned
        q.save(update_fields=['is_pinned'])
        return Response({'is_pinned': q.is_pinned})


# --------------------------------------------------------------------------- answers & comments
class AnswerViewSet(VoteResponseMixin, viewsets.ModelViewSet):
    serializer_class = AnswerSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrModeratorOrReadOnly]
    filterset_fields = ['question']

    def get_throttles(self):
        self.throttle_scope = {'create': 'post', 'vote': 'vote', 'flag': 'flag'}.get(self.action)
        return super().get_throttles() if self.throttle_scope else []

    def get_queryset(self):
        u = self.request.user
        qs = Answer.objects.select_related('author', 'question').prefetch_related('attachments', Prefetch('comments', Comment.objects.select_related('author')))
        qs = annotate_votes(qs, u, 'answer')
        if not (u.is_authenticated and u.is_moderator):
            qs = qs.filter(is_hidden=False)
        return qs

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def vote(self, request, pk=None):
        return self.vote_response(request, self.get_object(), 'answer', parse_vote(request))

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def flag(self, request, pk=None):
        return file_flag(request, self.get_object(), 'answer')

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def accept(self, request, pk=None):
        """Question author (or a moderator) accepts an answer; calling it again on the same answer un-accepts it."""
        a = self.get_object()
        q = a.question
        if q.author_id != request.user.id and not request.user.is_moderator:
            raise PermissionDenied('Only the question author or a teacher can accept an answer.')
        q.accepted_answer = None if q.accepted_answer_id == a.id else a
        q.save(update_fields=['accepted_answer'])
        return Response({'is_accepted': q.accepted_answer_id == a.id})

    @action(detail=True, methods=['post'], permission_classes=[IsModerator])
    def verify(self, request, pk=None):
        """A teacher marks an answer as faculty-verified."""
        a = self.get_object()
        a.is_faculty_verified = not a.is_faculty_verified
        a.save(update_fields=['is_faculty_verified'])
        return Response({'is_faculty_verified': a.is_faculty_verified})


class CommentViewSet(viewsets.ModelViewSet):
    queryset = Comment.objects.select_related('author')
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrModeratorOrReadOnly]
    filterset_fields = ['answer']

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class AttachmentViewSet(viewsets.ModelViewSet):
    queryset = Attachment.objects.all()
    serializer_class = AttachmentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrModeratorOrReadOnly]
    parser_classes = [MultiPartParser, FormParser]

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)


# --------------------------------------------------------------------------- moderation
class FlagViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Moderation queue for teachers and admins."""
    serializer_class = FlagSerializer
    permission_classes = [IsModerator]
    filterset_fields = ['status']

    def get_queryset(self):
        return Flag.objects.select_related('reporter', 'question', 'answer')

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        flag = self.get_object()
        decision = request.data.get('decision')
        if decision not in ('dismiss', 'remove'):
            raise ValidationError({'decision': "Must be 'dismiss' or 'remove'."})
        target, fk = (flag.question, 'question') if flag.question_id else (flag.answer, 'answer')
        with transaction.atomic():
            siblings = Flag.objects.filter(status=Flag.Status.OPEN, **{fk: target})
            if decision == 'remove':
                target.is_hidden = True
                target.save(update_fields=['is_hidden'])
                siblings.update(status=Flag.Status.REMOVED, reviewed_by=request.user)
            else:
                flag.status = Flag.Status.DISMISSED
                flag.reviewed_by = request.user
                flag.save(update_fields=['status', 'reviewed_by'])
                if target.is_hidden and not siblings.exclude(pk=flag.pk).filter(status=Flag.Status.OPEN).exists() \
                        and siblings.count() < settings.FLAG_HIDE_THRESHOLD:
                    target.is_hidden = False  # restore posts that were only auto-hidden
                    target.save(update_fields=['is_hidden'])
        return Response({'status': 'resolved', 'decision': decision})


@api_view(['GET'])
@permission_classes([IsModerator])
def stats(request):
    """Numbers for the admin analytics dashboard."""
    week = timezone.now() - timezone.timedelta(days=7)
    base = Question.objects.filter(is_hidden=False)
    per_day = (base.filter(created_at__gte=week).annotate(day=TruncDate('created_at')).values('day').annotate(posts=Count('id')).order_by('day'))
    return Response({
        'posts_total': base.count(),
        'posts_last_7_days': base.filter(created_at__gte=week).count(),
        'unanswered': base.filter(kind=Question.Kind.QUESTION, answers__isnull=True).count(),
        'solved': base.filter(accepted_answer__isnull=False).count(),
        'open_flags': Flag.objects.filter(status=Flag.Status.OPEN).count(),
        'by_room': list(Room.objects.annotate(posts=Count('questions', filter=Q(questions__is_hidden=False))).values('slug', 'name', 'posts')),
        'posts_per_day': list(per_day),
    })
