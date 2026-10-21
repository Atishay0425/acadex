from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers

from .models import Answer, Attachment, Comment, Flag, Question, Room, Tag

User = get_user_model()
ANON = {'id': None, 'username': None, 'full_name': 'Anonymous', 'role': None, 'avatar': None}


class AuthorSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'role', 'avatar']
        read_only_fields = fields


def _viewer(serializer):
    request = serializer.context.get('request')
    return request.user if request and request.user.is_authenticated else None


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name', 'slug', 'description', 'usage_count']
        read_only_fields = ['slug', 'usage_count']
        extra_kwargs = {'name': {'validators': []}}  # duplicates are resolved by get_or_create below

    def create(self, validated_data):
        slug = slugify(validated_data['name'])
        tag, _ = Tag.objects.get_or_create(slug=slug, defaults=validated_data)
        return tag

    def validate_name(self, value):
        return value.strip()


class RoomSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)
    is_member = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ['id', 'name', 'slug', 'kind', 'description', 'member_count', 'is_member']
        read_only_fields = ['slug']

    def get_is_member(self, obj):
        u = _viewer(self)
        if not u:
            return False
        if hasattr(obj, 'is_member_flag'):
            return obj.is_member_flag
        return obj.members.filter(pk=u.pk).exists()

    def create(self, validated_data):
        validated_data['slug'] = slugify(validated_data['name'])
        return super().create(validated_data)


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attachment
        fields = ['id', 'file', 'question', 'answer', 'uploaded_by', 'created_at']
        read_only_fields = ['uploaded_by', 'created_at']

    def validate_file(self, f):
        if f.size > 10 * 1024 * 1024:
            raise serializers.ValidationError('Files must be 10 MB or smaller.')
        return f

    def validate(self, data):
        if bool(data.get('question')) == bool(data.get('answer')):
            raise serializers.ValidationError('Attach to exactly one of question or answer.')
        return data


class CommentSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ['id', 'content', 'author', 'answer', 'parent', 'created_at', 'updated_at']
        read_only_fields = ['author', 'created_at', 'updated_at']

    def validate(self, data):
        parent = data.get('parent')
        if parent:
            if parent.answer_id != data['answer'].id:
                raise serializers.ValidationError({'parent': 'Parent comment belongs to a different answer.'})
            if parent.parent_id:
                raise serializers.ValidationError({'parent': 'Replies can only be one level deep.'})
        return data


class VoteFieldsMixin(serializers.Serializer):
    """Reads counts from queryset annotations (see views.annotate_votes), so a list costs a constant number of queries."""
    upvote_count = serializers.SerializerMethodField()
    downvote_count = serializers.SerializerMethodField()
    vote_score = serializers.SerializerMethodField()
    user_vote = serializers.SerializerMethodField()

    def get_upvote_count(self, obj):
        return getattr(obj, 'upvotes', 0)

    def get_downvote_count(self, obj):
        return getattr(obj, 'downvotes', 0)

    def get_vote_score(self, obj):
        return getattr(obj, 'upvotes', 0) - getattr(obj, 'downvotes', 0)

    def get_user_vote(self, obj):
        v = getattr(obj, 'my_vote', None)
        return {1: 'upvote', -1: 'downvote'}.get(v)


class AnswerSerializer(VoteFieldsMixin, serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    comments = CommentSerializer(many=True, read_only=True)
    is_accepted = serializers.SerializerMethodField()

    class Meta:
        model = Answer
        fields = ['id', 'content', 'author', 'question', 'is_accepted', 'is_faculty_verified',
                  'upvote_count', 'downvote_count', 'vote_score', 'user_vote',
                  'attachments', 'comments', 'created_at', 'updated_at']
        read_only_fields = ['author', 'is_faculty_verified', 'created_at', 'updated_at']

    def get_is_accepted(self, obj):
        return obj.question.accepted_answer_id == obj.id

    def validate_question(self, q):
        if q.is_hidden:
            raise serializers.ValidationError('This post is not accepting answers.')
        return q


class QuestionListSerializer(VoteFieldsMixin, serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    room = serializers.SlugRelatedField(slug_field='slug', queryset=Room.objects.all(), required=False, allow_null=True)
    room_name = serializers.CharField(source='room.name', read_only=True, default=None)
    tags = serializers.SlugRelatedField(many=True, slug_field='name', read_only=True)
    tag_names = serializers.ListField(child=serializers.CharField(max_length=100), write_only=True, required=False, max_length=8)
    answer_count = serializers.SerializerMethodField()
    is_solved = serializers.BooleanField(read_only=True)

    class Meta:
        model = Question
        fields = ['id', 'room', 'room_name', 'kind', 'title', 'content', 'author', 'is_anonymous', 'tags', 'tag_names',
                  'view_count', 'answer_count', 'is_solved', 'accepted_answer', 'is_pinned', 'is_hidden',
                  'upvote_count', 'downvote_count', 'vote_score', 'user_vote', 'created_at', 'updated_at']
        read_only_fields = ['author', 'view_count', 'accepted_answer', 'is_pinned', 'is_hidden', 'created_at', 'updated_at']

    def get_author(self, obj):
        u = _viewer(self)
        if obj.is_anonymous and not (u and (u.pk == obj.author_id or u.is_moderator)):
            return ANON
        return AuthorSerializer(obj.author, context=self.context).data

    def get_answer_count(self, obj):
        return getattr(obj, 'answers_total', None) if hasattr(obj, 'answers_total') else obj.answers.count()

    def validate_tag_names(self, names):
        return list({n.strip() for n in names if n.strip()})

    def _set_tags(self, question, names):
        tags = []
        for n in names:
            tag, _ = Tag.objects.get_or_create(slug=slugify(n) or n.lower(), defaults={'name': n})
            tags.append(tag)
        question.tags.set(tags)

    @transaction.atomic
    def create(self, validated_data):
        names = validated_data.pop('tag_names', [])
        q = super().create(validated_data)
        self._set_tags(q, names)
        return q

    @transaction.atomic
    def update(self, instance, validated_data):
        names = validated_data.pop('tag_names', None)
        q = super().update(instance, validated_data)
        if names is not None:
            self._set_tags(q, names)
        return q


class QuestionDetailSerializer(QuestionListSerializer):
    answers = serializers.SerializerMethodField()
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta(QuestionListSerializer.Meta):
        fields = QuestionListSerializer.Meta.fields + ['answers', 'attachments']

    def get_answers(self, obj):
        # `visible_answers` is prefetched in the view (annotated, ordered, hidden ones removed).
        return AnswerSerializer(getattr(obj, 'visible_answers', obj.answers.all()), many=True, context=self.context).data


class FlagSerializer(serializers.ModelSerializer):
    reporter = AuthorSerializer(read_only=True)
    target = serializers.SerializerMethodField()

    class Meta:
        model = Flag
        fields = ['id', 'reporter', 'question', 'answer', 'reason', 'note', 'status', 'target', 'created_at']
        read_only_fields = ['reporter', 'question', 'answer', 'status', 'created_at']

    def get_target(self, obj):
        if obj.question_id:
            return {'type': 'question', 'id': obj.question_id, 'text': obj.question.title}
        return {'type': 'answer', 'id': obj.answer_id, 'text': obj.answer.content[:140]}
