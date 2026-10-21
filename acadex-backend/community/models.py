"""
Student Community models. Based on MU-CONNECT's questions app.

Changes from MU-CONNECT:
- Vote uses real foreign keys + DB constraints instead of (content_type string, object_id int),
  so votes can't point at missing rows and duplicates are impossible.
- Rooms (course / branch / general) and a post `kind` (question, notes, resource, event).
- Anonymous posting, faculty-verified answers, an explicit accepted answer.
- Flags + hiding for moderation.
"""
from django.conf import settings
from django.db import models
from django.db.models import Q

User = settings.AUTH_USER_MODEL


class Room(models.Model):
    class Kind(models.TextChoices):
        COURSE = 'course', 'Course'
        BRANCH = 'branch', 'Branch'
        GENERAL = 'general', 'General'

    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(unique=True)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.GENERAL)
    description = models.TextField(blank=True)
    members = models.ManyToManyField(User, related_name='rooms', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['kind', 'name']

    def __str__(self):
        return self.name


class Tag(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    usage_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-usage_count', 'name']

    def __str__(self):
        return self.name


class Question(models.Model):
    class Kind(models.TextChoices):
        QUESTION = 'question', 'Question'
        NOTES = 'notes', 'Notes'
        RESOURCE = 'resource', 'Resource'
        EVENT = 'event', 'Event'

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='questions', null=True, blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.QUESTION, db_index=True)
    title = models.CharField(max_length=300)
    content = models.TextField(blank=True)
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='questions')
    is_anonymous = models.BooleanField(default=False)
    tags = models.ManyToManyField(Tag, related_name='questions', blank=True)
    accepted_answer = models.OneToOneField('Answer', null=True, blank=True, on_delete=models.SET_NULL, related_name='accepted_for')
    view_count = models.PositiveIntegerField(default=0)
    is_pinned = models.BooleanField(default=False)
    is_hidden = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_pinned', '-created_at']
        indexes = [models.Index(fields=['room', '-created_at']), models.Index(fields=['author'])]

    def __str__(self):
        return self.title

    @property
    def is_solved(self):
        return self.accepted_answer_id is not None


class Answer(models.Model):
    content = models.TextField()
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='answers')
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='answers')
    is_faculty_verified = models.BooleanField(default=False)
    is_hidden = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_faculty_verified', '-created_at']
        indexes = [models.Index(fields=['question'])]

    def __str__(self):
        return f'Answer #{self.pk} to {self.question_id}'


class Comment(models.Model):
    content = models.TextField()
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    answer = models.ForeignKey(Answer, on_delete=models.CASCADE, related_name='comments')
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='replies')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'Comment #{self.pk}'


class Vote(models.Model):
    UP, DOWN = 1, -1
    voter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='votes')
    question = models.ForeignKey(Question, null=True, blank=True, on_delete=models.CASCADE, related_name='votes')
    answer = models.ForeignKey(Answer, null=True, blank=True, on_delete=models.CASCADE, related_name='votes')
    value = models.SmallIntegerField(choices=[(UP, 'Upvote'), (DOWN, 'Downvote')])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=(Q(question__isnull=False, answer__isnull=True) | Q(question__isnull=True, answer__isnull=False)),
                name='vote_exactly_one_target'),
            models.UniqueConstraint(fields=['voter', 'question'], condition=Q(question__isnull=False), name='one_vote_per_question'),
            models.UniqueConstraint(fields=['voter', 'answer'], condition=Q(answer__isnull=False), name='one_vote_per_answer'),
        ]


class Attachment(models.Model):
    question = models.ForeignKey(Question, null=True, blank=True, on_delete=models.CASCADE, related_name='attachments')
    answer = models.ForeignKey(Answer, null=True, blank=True, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='attachments/')
    uploaded_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.CheckConstraint(
            check=(Q(question__isnull=False, answer__isnull=True) | Q(question__isnull=True, answer__isnull=False)),
            name='attachment_exactly_one_target')]


class Flag(models.Model):
    """User report of a post or answer, reviewed by teachers/admins."""

    class Reason(models.TextChoices):
        SPAM = 'spam', 'Spam'
        ABUSE = 'abuse', 'Abusive or harassing'
        OFFTOPIC = 'offtopic', 'Off topic'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        DISMISSED = 'dismissed', 'Dismissed'
        REMOVED = 'removed', 'Content removed'

    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='flags')
    question = models.ForeignKey(Question, null=True, blank=True, on_delete=models.CASCADE, related_name='flags')
    answer = models.ForeignKey(Answer, null=True, blank=True, on_delete=models.CASCADE, related_name='flags')
    reason = models.CharField(max_length=10, choices=Reason.choices)
    note = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN, db_index=True)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=(Q(question__isnull=False, answer__isnull=True) | Q(question__isnull=True, answer__isnull=False)),
                name='flag_exactly_one_target'),
            models.UniqueConstraint(fields=['reporter', 'question'], condition=Q(question__isnull=False), name='one_flag_per_question'),
            models.UniqueConstraint(fields=['reporter', 'answer'], condition=Q(answer__isnull=False), name='one_flag_per_answer'),
        ]
