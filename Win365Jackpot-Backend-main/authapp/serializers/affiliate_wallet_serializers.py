"""
authapp/serializers/affiliate_wallet_serializers.py
─────────────────────────────────────────────────────────────────────────────
AFFILIATE-WITHDRAWALS: new module — safe to delete entirely to remove the
feature (paired with affiliate_wallet_models.py / _service.py / _views.py /
_urls.py).
"""
from rest_framework import serializers

from authapp.models.affiliate_wallet_models import (
    AffiliateWithdrawalMethodConfig,
    AffiliateWithdrawalPaymentDetail,
    AffiliateWithdrawalRequest,
    AffiliateWithdrawalStatusHistory,
    AffiliateWalletTransaction,
)


class AffiliateWithdrawalMethodConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AffiliateWithdrawalMethodConfig
        fields = ["code", "label", "is_enabled", "field_schema", "order"]


class AffiliateWithdrawalPaymentDetailSerializer(serializers.ModelSerializer):
    method_code = serializers.CharField(source="method.code", read_only=True)

    class Meta:
        model = AffiliateWithdrawalPaymentDetail
        fields = ["method_code", "details"]


class AffiliateWithdrawalStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AffiliateWithdrawalStatusHistory
        fields = ["from_status", "to_status", "changed_by_name", "note", "created_at"]

    def get_changed_by_name(self, obj):
        if not obj.changed_by:
            return None
        return obj.changed_by.name or obj.changed_by.email


class AffiliateWithdrawalRequestListSerializer(serializers.ModelSerializer):
    """Row shape for both the affiliate's own history table and the admin
    Back Office table — same fields, the admin table just also gets the
    affiliate's identity via AffiliateWithdrawalAdminListSerializer below."""
    method_code = serializers.CharField(source="method.code", read_only=True)
    method_label = serializers.CharField(source="method.label", read_only=True)

    class Meta:
        model = AffiliateWithdrawalRequest
        fields = [
            "id", "request_reference", "method_code", "method_label", "amount", "status",
            "priority", "txn_hash", "payment_date", "requested_at", "processed_at", "updated_at",
            "rejection_reason",
        ]


class AffiliateWithdrawalAdminListSerializer(AffiliateWithdrawalRequestListSerializer):
    affiliate_id = serializers.IntegerField(source="affiliate.id", read_only=True)
    affiliate_uid = serializers.CharField(source="affiliate.user_uid", read_only=True)
    affiliate_name = serializers.CharField(source="affiliate.name", read_only=True)
    affiliate_email = serializers.CharField(source="affiliate.email", read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta(AffiliateWithdrawalRequestListSerializer.Meta):
        fields = AffiliateWithdrawalRequestListSerializer.Meta.fields + [
            "affiliate_id", "affiliate_uid", "affiliate_name", "affiliate_email",
            "admin_notes", "reviewed_by_name",
        ]

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return None
        return obj.reviewed_by.name or obj.reviewed_by.email


class AffiliateWithdrawalRequestDetailSerializer(AffiliateWithdrawalAdminListSerializer):
    """Full detail for the admin review screen — adds nested payment
    details and the complete status-change timeline."""
    payment_detail = AffiliateWithdrawalPaymentDetailSerializer(read_only=True)
    status_history = AffiliateWithdrawalStatusHistorySerializer(many=True, read_only=True)

    class Meta(AffiliateWithdrawalAdminListSerializer.Meta):
        fields = AffiliateWithdrawalAdminListSerializer.Meta.fields + ["payment_detail", "status_history"]


class AffiliateWalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AffiliateWalletTransaction
        fields = ["txn_type", "amount", "balance_before", "balance_after", "reference", "note", "created_at"]
