from rest_framework import permissions


class IsModerator(permissions.BasePermission):
    """Teachers, admins and staff."""

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_moderator)


class IsAuthorOrModeratorOrReadOnly(permissions.BasePermission):
    """Authors edit their own content. Moderators may delete (but not rewrite) anyone's."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        owner = getattr(obj, 'author', None) or getattr(obj, 'uploaded_by', None)
        if owner == request.user:
            return True
        return request.method == 'DELETE' and request.user.is_authenticated and request.user.is_moderator
