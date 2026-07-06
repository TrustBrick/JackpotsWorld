"""
authapp/models/wallet_models.py
─────────────────────────────────────────────────────────────────────────────
Wallet tables per requirements:

  • WalletAccount         – Available balance table.
                           Always 4 rows per user (C, NC, O, RP).
                           Unique on (user + wallet_type).
                           Unique level fields: wallet_account_number + updated_at.

  • WalletTransaction     – Balance transaction history.
                           Every credit / debit on any wallet.
                           Unique level fields: transaction_reference
                           (format: YYYYMMDD-TXN_TYPE-HHMMSSMS).

  • WalletValidationLog   – System validation table.
                           Validates LUB / WBA / MBA amounts against
                           configured fixed values before back-office
                           can post them. Logs pass / fail with reason.

Transaction type codes (from spec):
  Cash (C)     : DAC, WAC, TAC, LUB, WBA, MBA, RMB, WIN, GBE, CBG
  Non-Cash (NC): CBGNC, LUBNC
  OTP (O)      : CBGOT, LUBOT
  Rolling (RP) : ROP
"""

import uuid
from django.db import models
from django.utils import timezone
from django.conf import settings
from django.db import IntegrityError
import time

from authapp.models.notification_model import Notification

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _gen_txn_ref(txn_type: str) -> str:
    """
    Format: TYPE-DDMMYYHHMMSSMMM
    Example: LAC-150426143052123
    """
    now = timezone.now()

    return f"{txn_type}{now.strftime('%d%m%y%H%M%S%f')[:15]}"


# ─────────────────────────────────────────────────────────────────────────────
# Wallet type & transaction type constants
# ─────────────────────────────────────────────────────────────────────────────

WALLET_TYPES = [
    ("C",  "Cash"),
    ("NC", "Non-Cash"),
    ("O",  "OTP"),
    ("RP", "Rolling Points"),
]

# Which wallet_types each transaction code is allowed on (spec enforcement)
TRANSACTION_TYPES = [
    # ── Cash (C) ──────────────────────────────────────────────────────────────
    ("DAC",   "Deposit at Casino"),
    ("WAC",   "Withdraw at Casino"),
    ("LAC",  "Lost at Casino"),
    ("TAC",   "Transfer to Another Casino"),
    ("LUB",   "Level Up Bonus"),
    ("WBA",   "Weekly Bonus Added"),
    ("MBA",   "Monthly Bonus Added"),
    ("RMB",   "Reimbursement"),
    ("WIN",   "Winnings"),
    ("GBE",   "Gifts/Benefits Encashment"),
    ("CBG",   "Cash Back / Gift (Cash)"),
    # ── Non-Cash (NC) ─────────────────────────────────────────────────────────
    ("CBGNC", "Non-Cash Cashback/Gift"),
    ("LUBNC", "Non-Cash Level Up Bonus"),
    # ── OTP (O) ───────────────────────────────────────────────────────────────
    ("CBGOT", "OTP Cashback/Gift"),
    ("LUBOT", "OTP Level Up Bonus"),
    # ── Rolling Points (RP) ───────────────────────────────────────────────────
    ("ROP",   "Rolling Points"),
]

# Allowed wallet_type for each transaction code (for validation)
TXN_WALLET_MAP = {
    "DAC":   "C",
    "WAC":   "C",
    "LAC":   "C",
    "TAC":   "C",
    "LUB":   "C",
    "WBA":   "C",
    "MBA":   "C",
    "RMB":   "C",
    "WIN":   "C",
    "GBE":   "C",
    "CBG":   "C",
    "CBGNC": "NC",
    "LUBNC": "NC",
    "CBGOT": "O",
    "LUBOT": "O",
    "ROP":   "RP",
}

# Transaction types that require system validation against fixed bonus values
VALIDATED_TXN_TYPES = {"LUB", "WBA", "MBA", "LUBNC", "LUBOT"}

# Rolling points can never be redeemed or transferred (spec requirement)
NON_REDEEMABLE_WALLETS = {"RP"}
NON_TRANSFERRABLE_WALLETS = {"RP"}

# Non-cash wallets that are not transferrable
NON_TRANSFERRABLE_TXN_TYPES = {"CBGNC", "CBGOT"}


# ─────────────────────────────────────────────────────────────────────────────
# WalletAccount  (Available Balance table)
# ─────────────────────────────────────────────────────────────────────────────

class WalletAccount(models.Model):
    """
    Available Balance table.
    Always exactly 4 rows per user — one per wallet type.
    Created automatically via post_save signal on User creation.

    Unique level fields (per spec): wallet_account_number + updated_at
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wallets",
        db_index=True,
    )
    wallet_type = models.CharField(
        max_length=3, choices=WALLET_TYPES, db_index=True
    )
    # Format: {user_uid}-{wallet_type}  e.g. WINAB12-C
    wallet_account_number = models.CharField(max_length=30, unique=True, db_index=True)

    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Who last updated this wallet and why
    updated_at  = models.DateTimeField(auto_now=True, db_index=True)
    updated_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="wallet_updates_made",
    )
    # Last transaction type that changed this balance (DAC, LUB, etc.)
    last_reason = models.CharField(max_length=10, blank=True)

    class Meta:
        # Only one row per (user, wallet_type) — enforces the 4-row rule
        unique_together = ("user", "wallet_type")
        indexes = [
            models.Index(fields=["user", "wallet_type"]),
            models.Index(fields=["wallet_account_number", "updated_at"]),
        ]

    def __str__(self):
        return f"{self.wallet_account_number} | ${self.balance}"

    @property
    def is_redeemable(self):
        return self.wallet_type not in NON_REDEEMABLE_WALLETS

    @property
    def is_transferrable(self):
        return self.wallet_type not in NON_TRANSFERRABLE_WALLETS


# ─────────────────────────────────────────────────────────────────────────────
# WalletTransaction  (Balance Transaction History table)
# ─────────────────────────────────────────────────────────────────────────────

class WalletTransaction(models.Model):

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wallet_transactions",
        db_index=True,
    )

    wallet = models.ForeignKey(
        WalletAccount,   # ✅ CHANGE: remove string, use direct reference
        on_delete=models.CASCADE,
        related_name="transactions",
    )

    transaction_type = models.CharField(
        max_length=10,
        choices=TRANSACTION_TYPES,
        db_index=True
    )

    amount = models.DecimalField(max_digits=14, decimal_places=2)

    balance_before = models.DecimalField(max_digits=14, decimal_places=2)
    balance_after  = models.DecimalField(max_digits=14, decimal_places=2)

    transaction_reference = models.CharField(
        max_length=60,
        unique=True,
        db_index=True
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="transactions_performed",
    )

    note = models.TextField(blank=True)

    validation_status = models.CharField(
        max_length=10,
        choices=[
            ("pending", "Pending"),
            ("approved", "Approved"),
            ("rejected", "Rejected")
        ],
        default="approved",
        db_index=True,
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["transaction_type", "created_at"]),
            models.Index(fields=["wallet", "created_at"]),
            models.Index(fields=["transaction_reference"]),  # ✅ ADD THIS
        ]

    def save(self, *args, **kwargs):

        creating = self._state.adding  # ✅ BEST WAY

        if not self.transaction_reference:
            for _ in range(5):
                try:
                    self.transaction_reference = _gen_txn_ref(self.transaction_type)
                    super().save(*args, **kwargs)
                    break
                except IntegrityError:
                    time.sleep(0.01)
            else:
                raise Exception("Failed to generate unique transaction reference after retries")
        else:
            super().save(*args, **kwargs)

        



# ─────────────────────────────────────────────────────────────────────────────
# WalletValidationLog  (System Validation table)
# ─────────────────────────────────────────────────────────────────────────────

class WalletValidationLog(models.Model):
    """
    System validation table.
    For LUB / WBA / MBA / LUBNC / LUBOT transactions, the system checks
    the entered amount against the configured fixed bonus value for the
    user's VIP level. This table logs every such check.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wallet_validations",
        db_index=True,
    )

    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)

    # The amount the back-office operator entered
    entered_amount  = models.DecimalField(max_digits=14, decimal_places=2)
    # The amount the system expected based on VIP level config
    expected_amount = models.DecimalField(max_digits=14, decimal_places=2)

    is_valid        = models.BooleanField(default=False, db_index=True)
    rejection_reason = models.TextField(blank=True)

    validated_at = models.DateTimeField(auto_now_add=True, db_index=True)

    # The admin who attempted the transaction
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="validations_performed",
    )

    # Link to the transaction if it was approved and created
    transaction = models.OneToOneField(
        WalletTransaction,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="validation_log",
    )

    class Meta:
        ordering = ["-validated_at"]
        indexes = [
            models.Index(fields=["user", "validated_at"]),
            models.Index(fields=["is_valid", "validated_at"]),
        ]

    def __str__(self):
        status = "✅" if self.is_valid else "❌"
        return f"{status} {self.user} | {self.transaction_type} | entered={self.entered_amount} expected={self.expected_amount}"


# ─────────────────────────────────────────────────────────────────────────────
# BonusConfig  (fixed bonus values per VIP level — used for validation)
# ─────────────────────────────────────────────────────────────────────────────

class BonusConfig(models.Model):
    """
    Fixed bonus values configured by superadmin.
    System validates LUB / WBA / MBA amounts against these.
    One row per (vip_level + bonus_type).
    """

    BONUS_TYPE_CHOICES = [
        ("LUB",   "Level Up Bonus"),
        ("WBA",   "Weekly Bonus"),
        ("MBA",   "Monthly Bonus"),
        ("LUBNC", "Non-Cash Level Up Bonus"),
        ("LUBOT", "OTP Level Up Bonus"),
    ]

    vip_level  = models.PositiveSmallIntegerField(db_index=True)
    bonus_type = models.CharField(max_length=10, choices=BONUS_TYPE_CHOICES, db_index=True)
    amount     = models.DecimalField(max_digits=14, decimal_places=2)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
    )

    class Meta:
        unique_together = ("vip_level", "bonus_type")
        ordering = ["vip_level", "bonus_type"]

    def __str__(self):
        return f"VIP {self.vip_level} | {self.bonus_type} | ${self.amount}"