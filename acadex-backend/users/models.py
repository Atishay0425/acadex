from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user (from MU-CONNECT) with the Acadex role-based access fields."""

    class Role(models.TextChoices):
        STUDENT = 'student', 'Student'
        TEACHER = 'teacher', 'Teacher'
        ADMIN = 'admin', 'Admin'

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.STUDENT, db_index=True)
    enrollment_id = models.CharField(max_length=30, unique=True, null=True, blank=True)
    branch = models.CharField(max_length=40, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    avatar = models.ImageField(upload_to='profiles/avatars/', null=True, blank=True)
    bio = models.TextField(blank=True, max_length=500)
    interests = models.CharField(max_length=500, blank=True, help_text='Comma-separated interests')
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.username} ({self.role})'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip() or self.username

    @property
    def is_moderator(self):
        return self.role in (self.Role.TEACHER, self.Role.ADMIN) or self.is_staff
