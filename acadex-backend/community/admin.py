from django.contrib import admin
from .models import Answer, Comment, Flag, Question, Room, Tag, Vote


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('name', 'kind', 'created_at')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('title', 'kind', 'room', 'author', 'is_hidden', 'created_at')
    list_filter = ('kind', 'room', 'is_hidden')
    search_fields = ('title', 'content')


admin.site.register([Tag, Answer, Comment, Vote, Flag])
