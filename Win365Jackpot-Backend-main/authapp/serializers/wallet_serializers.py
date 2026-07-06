# authapp/serializers/wallet_serializers.py

from rest_framework import serializers
from authapp.models import (
    WalletAccount,
    WalletTransaction,
    WalletValidationLog,
    BonusConfig,
    TRANSACTION_TYPES,
    TXN_WALLET_MAP,
)

from authapp.models.casino_wallet_models import CasinoWalletTransaction


class WalletAccountSerializer(serializers.ModelSerializer):
    # 🔁 Map fields for frontend compatibility
    account_number   = serializers.CharField(source="wallet_account_number")
    last_updated     = serializers.DateTimeField(source="updated_at")
    last_scenario    = serializers.CharField(source="last_reason")
    updated_by_uid   = serializers.CharField(source="updated_by.user_uid", default=None)

    is_redeemable    = serializers.ReadOnlyField()
    is_transferrable = serializers.ReadOnlyField()

    class Meta:
        model  = WalletAccount
        fields = [
            "id",
            "wallet_type",
            "account_number",     # ✅ mapped
            "balance",
            "last_scenario",      # ✅ mapped
            "last_updated",       # ✅ mapped
            "updated_by_uid",     # ✅ mapped
            "is_redeemable",
            "is_transferrable",
        ]
        read_only_fields = fields


class WalletTransactionSerializer(serializers.ModelSerializer):
    wallet_type           = serializers.CharField(source="wallet.wallet_type",           read_only=True)
    wallet_account_number = serializers.CharField(source="wallet.wallet_account_number", read_only=True)
    performed_by_email    = serializers.CharField(source="performed_by.email",           read_only=True, default=None)
    performed_by_uid      = serializers.CharField(source="performed_by.user_uid",        read_only=True, default=None)
    performed_by_name     = serializers.CharField(source="performed_by.user_uid",        read_only=True, default="System")

    # ── ADD THESE — frontend uses tx.user_name and tx.user_uid ──
    user_name = serializers.CharField(source="user.name",     read_only=True, default="—")
    user_uid  = serializers.CharField(source="user.user_uid", read_only=True, default="—")

    casino_name           = serializers.SerializerMethodField()
    casino_balance_before = serializers.SerializerMethodField()
    casino_balance_after  = serializers.SerializerMethodField()

    class Meta:
        model  = WalletTransaction
        fields = [
            "id",
            "transaction_reference",
            "transaction_type",
            "wallet_type",
            "wallet_account_number",
            "amount",
            "balance_before",
            "balance_after",
            "validation_status",
            "note",
            "performed_by_email",
            "performed_by_uid",
            "performed_by_name",
            "user_name",   # ← added
            "user_uid",    # ← added
            "created_at",
            "casino_name",
            "casino_balance_before",
            "casino_balance_after",
        ]
        read_only_fields = "__all__"
    
  

    def get_casino_name(self, obj):
        txn = self._get_casino_txn(obj)
        return txn.casino_name if txn else None

    def get_casino_balance_before(self, obj):
        txn = self._get_casino_txn(obj)
        return float(txn.balance_before) if txn else None

    def get_casino_balance_after(self, obj):
        txn = self._get_casino_txn(obj)
        return float(txn.balance_after) if txn else None

    def _get_casino_txn(self, obj):
        # Cache per instance to avoid 3 separate DB hits per row
        if not hasattr(obj, "_casino_txn_cache"):
            from authapp.models.casino_models import CasinoWalletTransaction
            obj._casino_txn_cache = (
    CasinoWalletTransaction.objects
    .filter(unified_ref=obj.transaction_reference)
    .first()
)
        return obj._casino_txn_cache


class AdminWalletUpdateSerializer(serializers.Serializer):
    user_id          = serializers.IntegerField()
    transaction_type = serializers.ChoiceField(choices=[c[0] for c in TRANSACTION_TYPES])
    amount           = serializers.DecimalField(max_digits=14, decimal_places=2)
    note             = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, data):
        if data["transaction_type"] not in TXN_WALLET_MAP:
            raise serializers.ValidationError(
                {"transaction_type": f"Unknown transaction type: {data['transaction_type']}"}
            )
        return data


class WalletValidationSerializer(serializers.ModelSerializer):
    user_email         = serializers.CharField(source="user.email",          read_only=True)
    user_uid           = serializers.CharField(source="user.user_uid",       read_only=True)
    validated_by_email = serializers.CharField(source="validated_by.email",  read_only=True, default=None)

    class Meta:
        model  = WalletValidationLog
        fields = [
            "id", "user_uid", "user_email", "transaction_type",
            "entered_amount", "expected_amount",
            "is_valid", "rejection_reason",
            "validated_at", "validated_by_email", "transaction",
        ]
        read_only_fields = fields


class BonusConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model  = BonusConfig
        fields = ["id", "vip_level", "bonus_type", "amount", "updated_at"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Bonus amount must be greater than 0.")
        return value