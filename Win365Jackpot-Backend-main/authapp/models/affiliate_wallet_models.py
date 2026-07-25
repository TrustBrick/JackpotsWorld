"""
authapp/models/affiliate_wallet_models.py
─────────────────────────────────────────────────────────────────────────────
AFFILIATE-WITHDRAWALS: new module — safe to delete entirely to remove the
feature (see the matching migration + service/views/urls files, and the
small additive hooks in affiliate_service.py / user_model.py's ActivityLog).

Extends the existing affiliate system (AffiliateProfile / ReferralCommission
in affiliate_models.py, unchanged) with a genuinely separate wallet + a
proper affiliate-initiated withdrawal-request workflow. Deliberately mirrors
the house patterns already used for the main WalletAccount/WalletTransaction
(wallet_models.py) and CasinoWalletAccount (casino_wallet_models.py):
  • select_for_update() row-locking before any balance mutation
  • before/after balance snapshots on every ledger row
  • auto-generated, retry-on-collision unique transaction references

Why a separate wallet instead of reusing the regular WalletAccount(NC) that
commission payouts land in today (see AdminMarkCommissionPaidView): that
flow credits an *internal* casino/gambling wallet, which is correct for
that use case but wrong here — a Phase 1 USDT withdrawal is money leaving
the platform via an external blockchain transfer, so it must never also
credit an internal spendable balance (that would be free money). The old
per-commission "mark paid" endpoint is untouched and still works exactly
as before; this module is an additive alternative path, not a replacement.

Models:
  • AffiliateWalletAccount        — the lockable balance row (1:1 per user)
  • AffiliateWithdrawalMethodConfig — which payout methods are enabled
                                       (only USDT today; DB-driven, not
                                       hardcoded, so enabling more later is
                                       a data change, not a redesign)
  • AffiliateWithdrawalRequest    — one row per withdrawal request
  • AffiliateWithdrawalPaymentDetail — method-specific fields, stored as
                                       JSON so new methods never need a
                                       schema change
  • AffiliateWithdrawalStatusHistory — one row per status transition
  • AffiliateWalletTransaction    — the balance ledger (earned/locked/
                                       unlocked/paid/refunded)
  • AffiliateWithdrawalSettings   — singleton: minimum amount, processing
                                       copy, master on/off switch
"""
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, models
from django.utils import timezone
import time


# ─────────────────────────────────────────────────────────────────────────────
# Withdrawal method config — DB-driven, extensible without a schema change
# ─────────────────────────────────────────────────────────────────────────────

class AffiliateWithdrawalMethodConfig(models.Model):
    """One row per potential payout method. Only `code="USDT"` is seeded as
    enabled today; every other method listed in the product spec is seeded
    disabled so the frontend/backend already know about them without
    exposing them — flipping `is_enabled` later (plus building that
    method's own small set of frontend fields) is all a future rollout
    needs, no model/migration changes."""

    code = models.CharField(max_length=30, unique=True)
    label = models.CharField(max_length=60)
    is_enabled = models.BooleanField(default=False)
    # Hints the frontend can use to know what fields a given method needs
    # once it's enabled, e.g. ["network", "wallet_address"] for USDT or
    # ["account_number", "ifsc", "account_name"] for a future Bank method.
    field_schema = models.JSONField(default=list, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "code"]

    def __str__(self):
        return f"{self.code} ({'enabled' if self.is_enabled else 'disabled'})"


# ─────────────────────────────────────────────────────────────────────────────
# Wallet — the lockable balance row
# ─────────────────────────────────────────────────────────────────────────────

class AffiliateWalletAccount(models.Model):
    """Tracks the affiliate's withdrawable balance, separate from
    AffiliateProfile.total_earned/total_paid (which stay as lifetime
    counters, unchanged, still used by the existing dashboard). `balance`
    is what's actually available to request a withdrawal against;
    `locked_for_withdrawal` is the sum currently tied up in pending/
    processing/approved requests."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="affiliate_wallet",
    )
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    locked_for_withdrawal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"AffiliateWallet({self.user_id}): available={self.balance} locked={self.locked_for_withdrawal}"


def _gen_affiliate_wallet_ref(prefix: str) -> str:
    """Same idiom as wallet_models._gen_txn_ref: TYPE-DDMMYYHHMMSSMMM."""
    now = timezone.now()
    return f"{prefix}{now.strftime('%d%m%y%H%M%S%f')[:15]}"


class AffiliateWalletTransaction(models.Model):
    """The balance ledger — one immutable row per balance-affecting event,
    with a before/after snapshot, mirroring WalletTransaction's pattern."""

    TXN_TYPES = [
        ("EARNED", "Commission Earned"),
        ("LOCKED", "Locked For Withdrawal"),
        ("UNLOCKED", "Unlocked (Rejected/Cancelled)"),
        ("PAID", "Withdrawal Paid"),
    ]

    wallet = models.ForeignKey(AffiliateWalletAccount, on_delete=models.CASCADE, related_name="transactions")
    withdrawal_request = models.ForeignKey(
        "AffiliateWithdrawalRequest", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="wallet_transactions",
    )
    txn_type = models.CharField(max_length=10, choices=TXN_TYPES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    balance_before = models.DecimalField(max_digits=14, decimal_places=2)
    balance_after = models.DecimalField(max_digits=14, decimal_places=2)
    reference = models.CharField(max_length=60, unique=True, db_index=True, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["wallet", "created_at"])]

    def __str__(self):
        return f"{self.txn_type} {self.amount} ({self.reference})"

    def save(self, *args, **kwargs):
        if not self.reference:
            for _ in range(5):
                try:
                    self.reference = _gen_affiliate_wallet_ref(f"AW{self.txn_type[:3]}")
                    super().save(*args, **kwargs)
                    return
                except IntegrityError:
                    time.sleep(0.01)
            raise Exception("Failed to generate unique affiliate wallet transaction reference after retries")
        super().save(*args, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# Withdrawal request
# ─────────────────────────────────────────────────────────────────────────────

def _gen_withdrawal_reference() -> str:
    """Human-readable request ID, e.g. WD-20260719-000482."""
    now = timezone.now()
    return f"WD-{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S%f')[:9]}"


class AffiliateWithdrawalRequest(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("paid", "Paid"),
        ("cancelled", "Cancelled"),
    ]
    PRIORITY_CHOICES = [
        ("low", "Low"), ("normal", "Normal"), ("high", "High"), ("urgent", "Urgent"),
    ]
    # Statuses where funds are still locked / the request is still "live".
    OPEN_STATUSES = ("pending", "processing", "approved")

    request_reference = models.CharField(max_length=40, unique=True, db_index=True, blank=True)
    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="affiliate_withdrawal_requests",
    )
    method = models.ForeignKey(AffiliateWithdrawalMethodConfig, on_delete=models.PROTECT, related_name="requests")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="pending", db_index=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default="normal")

    admin_notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)
    txn_hash = models.CharField(max_length=200, blank=True)
    payment_date = models.DateTimeField(null=True, blank=True)

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="affiliate_withdrawals_reviewed",
    )

    requested_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)  # first non-pending transition
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["affiliate", "status"]),
            models.Index(fields=["status", "requested_at"]),
        ]

    def __str__(self):
        return f"{self.request_reference} — {self.affiliate_id} — {self.amount} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.request_reference:
            for _ in range(5):
                try:
                    self.request_reference = _gen_withdrawal_reference()
                    super().save(*args, **kwargs)
                    return
                except IntegrityError:
                    time.sleep(0.01)
            raise Exception("Failed to generate unique withdrawal request reference after retries")
        super().save(*args, **kwargs)


class AffiliateWithdrawalPaymentDetail(models.Model):
    """Method-specific payout details for one request, stored as JSON so a
    future method (Bank/UPI/etc.) with a completely different field set
    never needs a new column or migration."""

    request = models.OneToOneField(
        AffiliateWithdrawalRequest, on_delete=models.CASCADE, related_name="payment_detail",
    )
    method = models.ForeignKey(AffiliateWithdrawalMethodConfig, on_delete=models.PROTECT)
    # For USDT today: {"network": "TRC20", "wallet_address": "..."}
    details = models.JSONField(default=dict)

    def __str__(self):
        return f"PaymentDetail for {self.request.request_reference}"


class AffiliateWithdrawalStatusHistory(models.Model):
    """One row per status transition — who changed it, from/to, why, and
    from where. Complements the generic ActivityLog (which also gets an
    entry for every action) with a request-scoped timeline the admin
    review screen can render directly."""

    request = models.ForeignKey(
        AffiliateWithdrawalRequest, on_delete=models.CASCADE, related_name="status_history",
    )
    from_status = models.CharField(max_length=12, blank=True)
    to_status = models.CharField(max_length=12)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="affiliate_withdrawal_status_changes",
    )
    note = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.request_id}: {self.from_status} → {self.to_status}"


# ─────────────────────────────────────────────────────────────────────────────
# Settings singleton
# ─────────────────────────────────────────────────────────────────────────────

class AffiliateWithdrawalSettings(models.Model):
    """Singleton (pk=1) — mirrors SupportSettings/LandingSettings' pattern."""

    is_withdrawal_enabled = models.BooleanField(default=True)
    minimum_withdrawal_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("50.00"))
    estimated_processing_time_text = models.CharField(max_length=100, default="1–3 business days")
    processing_notes = models.TextField(
        blank=True,
        default="Withdrawals are reviewed manually and paid out via USDT. Double-check your wallet "
                "address and network before submitting — payments sent to an incorrect address cannot "
                "be recovered.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Affiliate Withdrawal Settings"
