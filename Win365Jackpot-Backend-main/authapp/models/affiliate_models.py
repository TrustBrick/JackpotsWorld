from decimal import Decimal

from django.conf import settings
from django.db import models


class AffiliateProfile(models.Model):
    """Marks a User as an affiliate — mirrors AdminProfile's pattern of
    layering a role-specific profile on top of the base User account."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="affiliate_profile",
    )
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("10.00"))
    is_active = models.BooleanField(default=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="affiliates_approved",
    )
    total_earned = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    can_view_player_transactions = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Affiliate: {self.user.email} ({self.commission_rate}%)"

    @property
    def total_pending(self):
        return self.total_earned - self.total_paid


class ReferralCommission(models.Model):
    STATUS_CHOICES = [("pending", "Pending"), ("paid", "Paid")]

    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="referral_commissions",
    )
    referred_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="commissions_generated",
    )
    source_transaction_ref = models.CharField(max_length=100, blank=True)
    deposit_amount = models.DecimalField(max_digits=14, decimal_places=2)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending", db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["affiliate", "status"])]

    def __str__(self):
        return f"{self.affiliate_id} earns {self.amount} from {self.referred_user_id}"


class AffiliateClickLog(models.Model):
    """One row per referral-link visit — recorded from the public landing
    page (see AuthModal.jsx's existing ?ref= capture) before any signup
    happens, so 'Total Clicks' can be tracked independently of conversions."""

    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="click_logs",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    landing_path = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["affiliate", "created_at"])]

    def __str__(self):
        return f"Click for {self.affiliate_id} at {self.created_at}"


class AffiliateLoginLog(models.Model):
    """One row per successful affiliate login — written from AffiliateLoginView."""

    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="affiliate_login_logs",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Login for {self.affiliate_id} at {self.created_at}"
