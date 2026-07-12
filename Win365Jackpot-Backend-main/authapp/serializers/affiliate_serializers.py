from rest_framework import serializers

from authapp.models.affiliate_models import (
    AffiliateProfile, ReferralCommission, AffiliateClickLog, AffiliateLoginLog,
)


class AffiliateProfileSerializer(serializers.ModelSerializer):
    total_pending = serializers.SerializerMethodField()

    class Meta:
        model = AffiliateProfile
        fields = [
            "commission_rate", "is_active", "approved_by", "total_earned", "total_paid",
            "total_pending", "can_view_player_transactions", "created_at",
        ]

    def get_total_pending(self, obj):
        return obj.total_earned - obj.total_paid


class ReferredUserSerializer(serializers.Serializer):
    """One row in the affiliate's referred-users table."""
    id = serializers.IntegerField()
    user_uid = serializers.CharField()
    name = serializers.CharField()
    email = serializers.CharField()
    date_joined = serializers.DateTimeField()
    is_active = serializers.BooleanField()
    kyc_status = serializers.CharField()
    user_level = serializers.IntegerField()
    country = serializers.CharField(allow_blank=True, allow_null=True)
    commission_earned = serializers.DecimalField(max_digits=14, decimal_places=2)
    commission_pending = serializers.DecimalField(max_digits=14, decimal_places=2)
    commission_paid = serializers.DecimalField(max_digits=14, decimal_places=2)


class ReferralCommissionSerializer(serializers.ModelSerializer):
    referred_user_email = serializers.CharField(source="referred_user.email", read_only=True)
    referred_user_name = serializers.CharField(source="referred_user.name", read_only=True)
    affiliate_email = serializers.CharField(source="affiliate.email", read_only=True)

    class Meta:
        model = ReferralCommission
        fields = [
            "id", "affiliate", "affiliate_email", "referred_user", "referred_user_email",
            "referred_user_name", "deposit_amount", "commission_rate", "amount",
            "status", "created_at", "paid_at",
        ]


class AffiliateClickLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AffiliateClickLog
        fields = ["id", "landing_path", "created_at"]


class AffiliateLoginLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AffiliateLoginLog
        fields = ["id", "ip_address", "created_at"]
