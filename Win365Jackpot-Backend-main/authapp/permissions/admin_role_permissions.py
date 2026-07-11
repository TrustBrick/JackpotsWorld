"""
authapp/permissions/admin_role_permissions.py
─────────────────────────────────────────────────────────────────────────────
Enforces the granular AdminProfile capability flags (can_manage_finance,
can_approve_kyc, can_edit_users, can_send_notifs, can_manage_vip) that were
already defined on the model but never checked by any view. Super admins
always pass; staff without an AdminProfile are denied (fail-safe).
"""

from rest_framework.permissions import BasePermission

from authapp.models import AdminProfile


def _has_capability(user, flag: str) -> bool:
    if not (user and user.is_authenticated and user.is_staff):
        return False
    if user.is_superuser:
        return True
    profile = AdminProfile.objects.filter(user=user).first()
    if not profile or not profile.is_active:
        return False
    return bool(getattr(profile, flag, False))


class HasFinanceAccess(BasePermission):
    message = "Finance access required."

    def has_permission(self, request, view):
        return _has_capability(request.user, "can_manage_finance")


class HasKYCAccess(BasePermission):
    message = "KYC approval access required."

    def has_permission(self, request, view):
        return _has_capability(request.user, "can_approve_kyc")


class HasUserEditAccess(BasePermission):
    message = "User management access required."

    def has_permission(self, request, view):
        return _has_capability(request.user, "can_edit_users")


class HasNotifAccess(BasePermission):
    message = "Notification access required."

    def has_permission(self, request, view):
        return _has_capability(request.user, "can_send_notifs")


class HasVIPAccess(BasePermission):
    message = "VIP management access required."

    def has_permission(self, request, view):
        return _has_capability(request.user, "can_manage_vip")
