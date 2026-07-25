"""
authapp/serializers/wallet_request_serializers.py
─────────────────────────────────────────────────────────────────────────────
WALLET-REQUESTS: new module — safe to delete entirely to remove the feature.
"""
from rest_framework import serializers

from authapp.models.wallet_request_models import (
    DepositRequest,
    DepositRequestStatusHistory,
    WalletRequestMethodConfig,
    WithdrawalRequest,
    WithdrawalRequestStatusHistory,
)


class WalletRequestMethodConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletRequestMethodConfig
        fields = ["code", "label", "is_enabled", "field_schema", "order"]


class DepositRequestStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DepositRequestStatusHistory
        fields = ["from_status", "to_status", "changed_by_name", "note", "created_at"]

    def get_changed_by_name(self, obj):
        if not obj.changed_by:
            return None
        return obj.changed_by.name or obj.changed_by.email


class WithdrawalRequestStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WithdrawalRequestStatusHistory
        fields = ["from_status", "to_status", "changed_by_name", "note", "created_at"]

    def get_changed_by_name(self, obj):
        if not obj.changed_by:
            return None
        return obj.changed_by.name or obj.changed_by.email


class DepositRequestListSerializer(serializers.ModelSerializer):
    casino_name = serializers.CharField(source="casino.name", read_only=True, default=None)
    method_code = serializers.CharField(source="method.code", read_only=True, default=None)
    method_label = serializers.CharField(source="method.label", read_only=True, default=None)
    transaction_reference = serializers.CharField(source="wallet_transaction.transaction_reference", read_only=True, default=None)

    class Meta:
        model = DepositRequest
        fields = [
            "id", "request_reference", "amount", "casino_name", "method_code", "method_label",
            "payment_reference", "notes", "status", "admin_notes", "rejection_reason",
            "transaction_reference", "requested_at", "processed_at", "updated_at",
        ]


class DepositRequestAdminListSerializer(DepositRequestListSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    user_uid = serializers.CharField(source="user.user_uid", read_only=True)
    user_name = serializers.CharField(source="user.name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta(DepositRequestListSerializer.Meta):
        fields = DepositRequestListSerializer.Meta.fields + [
            "user_id", "user_uid", "user_name", "user_email", "reviewed_by_name",
        ]

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return None
        return obj.reviewed_by.name or obj.reviewed_by.email


class DepositRequestDetailSerializer(DepositRequestAdminListSerializer):
    status_history = DepositRequestStatusHistorySerializer(many=True, read_only=True)

    class Meta(DepositRequestAdminListSerializer.Meta):
        fields = DepositRequestAdminListSerializer.Meta.fields + ["status_history"]


class WithdrawalRequestListSerializer(serializers.ModelSerializer):
    casino_name = serializers.CharField(source="casino.name", read_only=True, default=None)
    casino_country = serializers.CharField(source="casino.country", read_only=True, default=None)
    method_code = serializers.CharField(source="method.code", read_only=True, default=None)
    method_label = serializers.CharField(source="method.label", read_only=True, default=None)
    transaction_reference = serializers.CharField(source="wallet_transaction.transaction_reference", read_only=True, default=None)

    class Meta:
        model = WithdrawalRequest
        fields = [
            "id", "request_reference", "wallet_type", "amount",
            "casino_name", "casino_country", "method_code", "method_label",
            "notes", "status", "admin_notes", "rejection_reason", "transaction_reference",
            "requested_at", "processed_at", "updated_at",
        ]


class WithdrawalRequestAdminListSerializer(WithdrawalRequestListSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    user_uid = serializers.CharField(source="user.user_uid", read_only=True)
    user_name = serializers.CharField(source="user.name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    # The requesting user's CURRENT Cash wallet balance — admin context for
    # reviewing the request, not a snapshot of the balance at request time.
    user_cash_balance = serializers.SerializerMethodField()

    class Meta(WithdrawalRequestListSerializer.Meta):
        fields = WithdrawalRequestListSerializer.Meta.fields + [
            "user_id", "user_uid", "user_name", "user_email", "reviewed_by_name", "user_cash_balance",
        ]

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return None
        return obj.reviewed_by.name or obj.reviewed_by.email

    def get_user_cash_balance(self, obj):
        from authapp.models.wallet_models import WalletAccount
        acct = WalletAccount.objects.filter(user=obj.user, wallet_type="C").first()
        return acct.balance if acct else 0


class WithdrawalRequestDetailSerializer(WithdrawalRequestAdminListSerializer):
    status_history = WithdrawalRequestStatusHistorySerializer(many=True, read_only=True)

    class Meta(WithdrawalRequestAdminListSerializer.Meta):
        fields = WithdrawalRequestAdminListSerializer.Meta.fields + ["status_history"]
