from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('rooms', views.RoomViewSet, basename='room')
router.register('tags', views.TagViewSet, basename='tag')
router.register('questions', views.QuestionViewSet, basename='question')
router.register('answers', views.AnswerViewSet, basename='answer')
router.register('comments', views.CommentViewSet, basename='comment')
router.register('attachments', views.AttachmentViewSet, basename='attachment')
router.register('flags', views.FlagViewSet, basename='flag')

urlpatterns = [path('stats/', views.stats, name='stats'), path('', include(router.urls))]
