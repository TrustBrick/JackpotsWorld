from rest_framework.permissions import BasePermission


class IsSuperAdmin(BasePermission):
    """
    Super Admin = is_superuser=True (is_staff=True as well, not used to distinguish)
    """
    message = "Only Super Admin allowed."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        )


class IsAdminOrSuperAdmin(BasePermission):
    """
    Allows both:
    - Admin       (is_staff=True, is_superuser=False)
    - Super Admin (is_staff=True, is_superuser=True)
    """
    message = "Admin or Super Admin access required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )