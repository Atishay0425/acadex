from django.db.models import F
from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from .models import Question, Tag


@receiver(m2m_changed, sender=Question.tags.through)
def keep_tag_usage_in_sync(sender, instance, action, pk_set, **kwargs):
    """MU-CONNECT only incremented usage_count on create and never decremented it."""
    if action == 'post_add' and pk_set:
        Tag.objects.filter(pk__in=pk_set).update(usage_count=F('usage_count') + 1)
    elif action == 'post_remove' and pk_set:
        Tag.objects.filter(pk__in=pk_set, usage_count__gt=0).update(usage_count=F('usage_count') - 1)
    elif action == 'pre_clear':
        Tag.objects.filter(questions=instance, usage_count__gt=0).update(usage_count=F('usage_count') - 1)
