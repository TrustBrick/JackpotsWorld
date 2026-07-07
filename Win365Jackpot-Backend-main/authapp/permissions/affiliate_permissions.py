from rest_framework.permissions import BasePermission

from authapp.models.affiliate_models import AffiliateProfile


class IsAffiliate(BasePermission):
    """Allows only users with an active AffiliateProfile."""
    message = "Affiliate access required."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return AffiliateProfile.objects.filter(user=request.user, is_active=True).exists()
