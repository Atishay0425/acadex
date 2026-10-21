from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'full_name', 'first_name', 'last_name', 'role',
                  'enrollment_id', 'branch', 'year', 'avatar', 'bio', 'interests', 'is_verified']
        read_only_fields = ['id', 'username', 'email', 'role', 'enrollment_id', 'is_verified', 'full_name']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name', 'enrollment_id', 'branch', 'year']

    def create(self, validated_data):
        # Self-registration always creates a student; teachers/admins are created by an admin.
        return User.objects.create_user(role=User.Role.STUDENT, **validated_data)


class AcadexTokenSerializer(TokenObtainPairSerializer):
    """JWT that carries the role, so the Next.js middleware and other services can authorise by role."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['name'] = user.full_name
        return token
