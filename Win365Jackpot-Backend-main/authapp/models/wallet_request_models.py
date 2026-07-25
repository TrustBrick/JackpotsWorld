"""
authapp/models/wallet_request_models.py
─────────────────────────────────────────────────────────────────────────────
WALLET-REQUESTS: new module — safe to delete entirely to remove the feature
(paired with wallet_request_service.py / _views.py / _urls.py /
_serializers.py, the small extraction into services/wallet_service.py, and
the additive ActivityLog choices in models/user_model.py).

Adds a self-service Deposit Request / Withdrawal Request workflow on top of
the existing MAIN wallet (WalletAccount/WalletTransaction — NOT the
affiliate wallet, NOT the per-casino wallet). Per product decision, both
request types operate on the Cash wallet ("C") only:
  • Withdrawal Requests draw against WalletAccount(wallet_type="C").
  • Approved Deposit Requests credit WalletAccount(wallet_type="C") using
    the existing "DAC" transaction code — the very same code the admin
    Offline Transactions tool already uses for a casino deposit debit, kept
    consistent so transaction history reads the same way regardless of
    which flow moved the money.

Deliberately reuses rather than duplicates:
  • Money movement -> authapp/services/wallet_service.py's
    credit_main_wallet/debit_main_wallet (the same functions the existing
    admin Offline Transactions tool calls).
  • Transaction ledger -> the existing WalletTransaction model (linked back
    here via a nullable FK for traceability) — no separate "TransactionLog"
    model.
  • Audit trail -> the existing ActivityLog model — no separate "AuditLog"
    model.
  • select_for_update() row-locking + before/after balance snapshot pattern,
    matching every other wallet-mutating flow in this codebase.
"""
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, models
from django.utils import timezone
import time


class WalletRequestMethodConfig(models.Model):
    """DB-driven payment-method registry for Deposit Requests, so future
    methods (Crypto/Bank/UPI/Wise/Stripe/Casino Deposit APIs/etc.) are a
    data change, not a schema change or code refactor."""

    code = models.CharField(max_length=30, unique=True)
    label = models.CharField(max_length=60)
    is_enabled = models.BooleanField(default=False)
    field_schema = models.JSONField(default=list, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "code"]

    def __str__(self):
        return f"{self.code} ({'enabled' if self.is_enabled else 'disabled'})"


def _gen_request_reference(prefix: str) -> str:
    now = timezone.now()
    return f"{prefix}-{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S%f')[:9]}"


class DepositRequest(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("cancelled", "Cancelled"),
    ]
    OPEN_STATUSES = ("pending", "processing")

    request_reference = models.CharField(max_length=40, unique=True, db_index=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="deposit_requests")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    casino = models.ForeignKey("authapp.Casino", null=True, blank=True, on_delete=models.SET_NULL, related_name="deposit_requests")
    method = models.ForeignKey(WalletRequestMethodConfig, null=True, blank=True, on_delete=models.PROTECT, related_name="deposit_requests")
    payment_reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="pending", db_index=True)
    admin_notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)

    # Set only on approval — points at the WalletTransaction that actually
    # credited the wallet, so this row never needs its own duplicate ledger.
    wallet_transaction = models.ForeignKey(
        "authapp.WalletTransaction", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="deposit_request",
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="deposit_requests_reviewed",
    )

    requested_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["status", "requested_at"]),
        ]

    def __str__(self):
        return f"{self.request_reference} — {self.user_id} — {self.amount} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.request_reference:
            for _ in range(5):
                try:
                    self.request_reference = _gen_request_reference("DEP")
                    super().save(*args, **kwargs)
                    return
                except IntegrityError:
                    time.sleep(0.01)
            raise Exception("Failed to generate unique deposit request reference after retries")
        super().save(*args, **kwargs)


class WithdrawalRequest(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("paid", "Paid"),
        ("cancelled", "Cancelled"),
    ]
    OPEN_STATUSES = ("pending", "processing", "approved")

    request_reference = models.CharField(max_length=40, unique=True, db_index=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="withdrawal_requests")
    # Cash-only per product decision; kept as a field (not hardcoded in
    # logic) so a future decision to allow another wallet type is a data
    # change, not a refactor.
    wallet_type = models.CharField(max_length=2, default="C")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    # Which casino wallet the withdrawal is drawn against — nullable so
    # existing rows created before this field was added stay valid; new
    # requests always set it (view-layer requires casino_id).
    casino = models.ForeignKey("authapp.Casino", null=True, blank=True, on_delete=models.SET_NULL, related_name="withdrawal_requests")
    method = models.ForeignKey(WalletRequestMethodConfig, null=True, blank=True, on_delete=models.PROTECT, related_name="withdrawal_requests")
    notes = models.TextField(blank=True)

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="pending", db_index=True)
    admin_notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)

    wallet_transaction = models.ForeignKey(
        "authapp.WalletTransaction", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="withdrawal_request",
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="withdrawal_requests_reviewed",
    )

    requested_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["status", "requested_at"]),
        ]

    def __str__(self):
        return f"{self.request_reference} — {self.user_id} — {self.amount} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.request_reference:
            for _ in range(5):
                try:
                    self.request_reference = _gen_request_reference("WDL")
                    super().save(*args, **kwargs)
                    return
                except IntegrityError:
                    time.sleep(0.01)
            raise Exception("Failed to generate unique withdrawal request reference after retries")
        super().save(*args, **kwargs)


class DepositRequestStatusHistory(models.Model):
    request = models.ForeignKey(DepositRequest, on_delete=models.CASCADE, related_name="status_history")
    from_status = models.CharField(max_length=12, blank=True)
    to_status = models.CharField(max_length=12)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="deposit_request_status_changes",
    )
    note = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class WithdrawalRequestStatusHistory(models.Model):
    request = models.ForeignKey(WithdrawalRequest, on_delete=models.CASCADE, related_name="status_history")
    from_status = models.CharField(max_length=12, blank=True)
    to_status = models.CharField(max_length=12)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="withdrawal_request_status_changes",
    )
    note = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
