from django.db import models
from django.conf import settings
import uuid


CASINO_WALLET_TYPES = [
    ("C",  "Cash"),
    ("NC", "Non-Cash"),
    ("O",  "OTP"),
]


# 🏦 ─────────────────────────────────────────────
# Casino Wallet Account (Current Balance)
# ─────────────────────────────────────────────
class CasinoWalletAccount(models.Model):

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # 🔹 FK (REAL RELATION)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="casino_wallets",
        db_index=True,
    )

    # 🔹 READABLE FIELD
    user_uid = models.CharField(max_length=20, db_index=True, blank=True)

    casino_name = models.CharField(max_length=120, db_index=True)

    # Country this specific wallet belongs to — stamped from the country the
    # admin actually selected when the deposit was made. Casino names collide
    # across countries in the Casino reference table, so this is the only
    # reliable way to know which country a given wallet is really for.
    country = models.CharField(max_length=100, blank=True, default="", db_index=True)

    wallet_type = models.CharField(
        max_length=3,
        choices=CASINO_WALLET_TYPES,
        db_index=True,
    )

    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    is_active = models.BooleanField(default=True)

    # 🔹 Audit
    last_transaction_type = models.CharField(max_length=20, blank=True)
    updated_by_email = models.EmailField(null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "casino_name", "wallet_type")
        indexes = [
            models.Index(fields=["user", "casino_name"]),
            models.Index(fields=["user_uid"]),
        ]

    def save(self, *args, **kwargs):
        # ✅ AUTO SYNC USER UID
        if self.user and not self.user_uid:
            self.user_uid = self.user.user_uid
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user_uid} | {self.casino_name} | {self.wallet_type} | ${self.balance}"


# 📜 ─────────────────────────────────────────────
# Casino Wallet Transaction (History / Ledger)
# ─────────────────────────────────────────────
class CasinoWalletTransaction(models.Model):

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # 🔹 USER (Owner)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="casino_transactions",
    )
    unified_ref = models.CharField(max_length=100, blank=True, db_index=True)

    user_uid = models.CharField(max_length=20, db_index=True, blank=True)

    # 🔹 Wallet Context
    casino_name = models.CharField(max_length=120, db_index=True)
    wallet_type = models.CharField(max_length=3, db_index=True)

    # 🔹 Transaction Info
    transaction_type = models.CharField(max_length=10, db_index=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)

    # 🔥 CORE (VERY IMPORTANT)
    balance_before = models.DecimalField(max_digits=14, decimal_places=2)
    balance_after  = models.DecimalField(max_digits=14, decimal_places=2)

    # 🔹 Admin Info
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="casino_transactions_performed",
    )

    performed_by_email = models.EmailField(null=True, blank=True)

    note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["user_uid", "casino_name"]),
            models.Index(fields=["transaction_type"]),
            models.Index(fields=["created_at"]),
        ]

    def save(self, *args, **kwargs):
        # ✅ AUTO SYNC USER UID
        if self.user and not self.user_uid:
            self.user_uid = self.user.user_uid

        # ✅ AUTO SYNC ADMIN EMAIL
        if self.performed_by and not self.performed_by_email:
            self.performed_by_email = self.performed_by.email

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user_uid} | {self.casino_name} | {self.wallet_type} | {self.transaction_type} | ${self.amount}"