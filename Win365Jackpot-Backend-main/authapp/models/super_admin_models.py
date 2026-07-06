# authapp/models/super_admin_models.py
"""
SuperAdminWallet  — single-instance global wallet owned by the super admin.
AdminWallet       — single-instance wallet that admins draw from to credit users.
SuperAdminTransaction — full immutable ledger of every fund movement at the
                        super-admin / admin-wallet level.

Flow:
  SuperAdmin credits AdminWallet  →  AdminWallet balance rises
  Admin transfers to User         →  AdminWallet balance falls, User wallet rises
"""

import uuid
from django.db import models
from django.conf import settings


# ─────────────────────────────────────────────────────────────────────────────
# AdminWallet  (single row — the "house" wallet admins draw from)
# ─────────────────────────────────────────────────────────────────────────────

class AdminWallet(models.Model):
    """
    Singleton table — always exactly ONE row (pk=1).
    SuperAdmin is the only one who can credit it.
    Admins can only transfer OUT of it to users.
    """
    cash_balance     = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    non_cash_balance = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    otp_balance      = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="admin_wallet_updates",
    )

    class Meta:
        verbose_name = "Admin Wallet"

    def __str__(self):
        return f"AdminWallet | Cash={self.cash_balance} NC={self.non_cash_balance} OTP={self.otp_balance}"

    @classmethod
    def get(cls):
        """Always returns the single AdminWallet instance, creating it if absent."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def get_balance(self, wallet_type: str):
        field = _wallet_field(wallet_type)
        return getattr(self, field)

    def credit(self, wallet_type: str, amount):
        field = _wallet_field(wallet_type)
        setattr(self, field, getattr(self, field) + amount)

    def debit(self, wallet_type: str, amount):
        field = _wallet_field(wallet_type)
        current = getattr(self, field)
        if current < amount:
            raise ValueError(
                f"Insufficient AdminWallet {wallet_type} balance "
                f"(have {current}, need {amount})"
            )
        setattr(self, field, current - amount)


def _wallet_field(wallet_type: str) -> str:
    mapping = {"C": "cash_balance", "NC": "non_cash_balance", "O": "otp_balance"}
    field = mapping.get(wallet_type)
    if not field:
        raise ValueError(f"Unknown wallet_type for AdminWallet: {wallet_type!r}")
    return field


# ─────────────────────────────────────────────────────────────────────────────
# SuperAdminTransaction  (immutable ledger)
# ─────────────────────────────────────────────────────────────────────────────

SUPER_TXN_TYPES = [
    # SuperAdmin → AdminWallet
    ("SA_CREDIT",   "SuperAdmin credited AdminWallet"),
    ("SA_DEBIT",    "SuperAdmin debited AdminWallet"),
    # Admin → User  (deducts AdminWallet, credits User wallet)
    ("ADM_TRANSFER","Admin transferred to User"),
]

class SuperAdminTransaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    txn_type    = models.CharField(max_length=20, choices=SUPER_TXN_TYPES, db_index=True)
    wallet_type = models.CharField(max_length=3, db_index=True)   # C / NC / O
    amount      = models.DecimalField(max_digits=18, decimal_places=2)

    # AdminWallet snapshot
    admin_wallet_before = models.DecimalField(max_digits=18, decimal_places=2)
    admin_wallet_after  = models.DecimalField(max_digits=18, decimal_places=2)

    # Who did it
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, on_delete=models.SET_NULL,
        related_name="super_admin_txns_performed",
    )
    performed_by_email = models.EmailField(blank=True)

    # Target user (only for ADM_TRANSFER)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="super_admin_txns_received",
    )
    target_user_uid = models.CharField(max_length=20, blank=True)

    # User wallet snapshot (only for ADM_TRANSFER)
    user_wallet_before = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    user_wallet_after  = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    note       = models.TextField(blank=True)
    reference  = models.CharField(max_length=80, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["txn_type", "created_at"]),
            models.Index(fields=["wallet_type", "created_at"]),
            models.Index(fields=["performed_by", "created_at"]),
        ]

    def __str__(self):
        return f"{self.txn_type} | {self.wallet_type} | {self.amount} | {self.created_at:%Y-%m-%d}"