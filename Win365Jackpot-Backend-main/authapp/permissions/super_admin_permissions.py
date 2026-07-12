from rest_framework.permissions import BasePermission

from authapp.utils.ip_allowlist import is_superadmin_ip_allowed


def _client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


class IsSuperAdmin(BasePermission):
    """
    Super Admin = is_superuser=True (is_staff=True as well, not used to distinguish)

    Also enforces SUPERADMIN_IP_ALLOWLIST (see authapp/utils/ip_allowlist.py)
    on every request, not just at login — an already-issued JWT used from an
    IP outside the allowlist (e.g. a stolen/exfiltrated token) is rejected
    here too, not just at the login endpoint.
    """
    message = "Only Super Admin allowed."

    def has_permission(self, request, view):
        if not bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        ):
            return False
        return is_superadmin_ip_allowed(_client_ip(request))


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