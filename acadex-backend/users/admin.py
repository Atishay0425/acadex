from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class AcadexUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'role', 'branch', 'is_verified')
    list_filter = ('role', 'branch', 'is_verified')
    fieldsets = UserAdmin.fieldsets + (('Acadex', {'fields': ('role', 'enrollment_id', 'branch', 'year', 'avatar', 'bio', 'interests', 'is_verified')}),)
