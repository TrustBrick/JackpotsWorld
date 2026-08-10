from decimal import Decimal

from rest_framework import serializers

from authapp.models.affiliate_commission_models import (
    AffiliateCommissionAssignment, AffiliatePlayerCommissionStatus, CommissionPlan,
)
from authapp.models.affiliate_models import (
    AffiliateProfile, ReferralCommission, AffiliateClickLog, AffiliateLoginLog, AffiliateCampaign,
)
from authapp.services.affiliate_commission_service import commission_display_status


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
    """Backs both the plain 'Total Clicks' detail view and the Activity tab's
    Referral Clicks list — country/city/device/browser are resolved once at
    write time (see AffiliateTrackClickView), never computed here."""
    campaign_name = serializers.CharField(source="campaign.name", read_only=True, default=None)
    visitor = serializers.SerializerMethodField()
    registered = serializers.SerializerMethodField()

    class Meta:
        model = AffiliateClickLog
        fields = [
            "id", "landing_path", "created_at", "ip_address",
            "country", "city", "device", "browser",
            "campaign", "campaign_name", "visitor", "registered",
        ]

    def get_visitor(self, obj):
        if obj.registered_user_id:
            u = obj.registered_user
            return u.name or u.email
        return obj.ip_address or "Unknown"

    def get_registered(self, obj):
        return obj.registered_user_id is not None


class AffiliateLoginLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AffiliateLoginLog
        fields = ["id", "ip_address", "created_at"]


# ─── Campaigns ────────────────────────────────────────────────────────────────

class AffiliateCampaignSerializer(serializers.ModelSerializer):
    """List-row shape. Expects the view to have attached a `.stats` dict to
    each campaign instance before serializing — campaign click/visitor/
    conversion counts need one batched query across the whole list rather
    than one query per row, so they're computed view-side, not here."""
    total_clicks = serializers.SerializerMethodField()
    total_visitors = serializers.SerializerMethodField()
    registered_players = serializers.SerializerMethodField()
    deposit_players = serializers.SerializerMethodField()
    qualified_players = serializers.SerializerMethodField()

    class Meta:
        model = AffiliateCampaign
        fields = [
            "id", "name", "campaign_id", "status", "notes", "created_at", "updated_at",
            "total_clicks", "total_visitors", "registered_players",
            "deposit_players", "qualified_players",
        ]

    def _stats(self, obj):
        return getattr(obj, "stats", {}) or {}

    def get_total_clicks(self, obj):
        return self._stats(obj).get("total_clicks", 0)

    def get_total_visitors(self, obj):
        return self._stats(obj).get("total_visitors", 0)

    def get_registered_players(self, obj):
        return self._stats(obj).get("registered_players", 0)

    def get_deposit_players(self, obj):
        return self._stats(obj).get("deposit_players", 0)

    def get_qualified_players(self, obj):
        return self._stats(obj).get("qualified_players", 0)


class AffiliateCampaignDetailSerializer(AffiliateCampaignSerializer):
    deposits_generated = serializers.SerializerMethodField()
    conversion_rate = serializers.SerializerMethodField()

    class Meta(AffiliateCampaignSerializer.Meta):
        fields = AffiliateCampaignSerializer.Meta.fields + ["deposits_generated", "conversion_rate"]

    def get_deposits_generated(self, obj):
        return self._stats(obj).get("deposits_generated", 0)

    def get_conversion_rate(self, obj):
        stats = self._stats(obj)
        visitors = stats.get("total_visitors", 0)
        qualified = stats.get("qualified_players", 0)
        if not visitors:
            return 0.0
        return round((qualified / visitors) * 100, 2)


# ─── Commission Engine ─────────────────────────────────────────────────────

class CommissionPlanSerializer(serializers.ModelSerializer):
    commission_type_display = serializers.CharField(source="get_commission_type_display", read_only=True)

    class Meta:
        model = CommissionPlan
        fields = [
            "id", "commission_type", "commission_type_display", "name", "rate", "min_deposit",
            "wagering_multiplier", "is_active", "is_default", "description",
            "created_at", "updated_at",
        ]


class AffiliateCommissionAssignmentSerializer(serializers.ModelSerializer):
    """Read shape includes the full plan detail (plan_detail) so the
    affiliate-facing /commission-plan/ endpoint is a single round trip;
    plain `plan` stays a writable PK field for the admin assign action."""
    plan_detail = CommissionPlanSerializer(source="plan", read_only=True)
    affiliate_email = serializers.CharField(source="affiliate.email", read_only=True)
    affiliate_name = serializers.CharField(source="affiliate.name", read_only=True)
    assigned_by_email = serializers.CharField(source="assigned_by.email", read_only=True, default=None)

    class Meta:
        model = AffiliateCommissionAssignment
        fields = [
            "id", "affiliate", "affiliate_email", "affiliate_name", "plan", "plan_detail",
            "assigned_by", "assigned_by_email", "assigned_at", "agreed_at", "updated_at",
        ]
        read_only_fields = ["assigned_at", "updated_at"]


class AffiliatePlayerCommissionStatusSerializer(serializers.ModelSerializer):
    """The 'Commission Slip' row — backs both the affiliate-facing Commission
    Slip table and the admin Back Office reporting table off the exact same
    fields, all read directly from the row evaluate_player_commission()
    continuously maintains. Never recomputes a financial figure here."""
    affiliate_email = serializers.CharField(source="affiliate.email", read_only=True)
    player_name = serializers.CharField(source="referred_user.name", read_only=True)
    player_email = serializers.CharField(source="referred_user.email", read_only=True)
    player_uid = serializers.CharField(source="referred_user.user_uid", read_only=True)
    commission_type_display = serializers.CharField(source="get_commission_type_display", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    remaining_wagering = serializers.SerializerMethodField()
    referral_status = serializers.SerializerMethodField()
    commission_status = serializers.SerializerMethodField()
    paid_at = serializers.SerializerMethodField()

    class Meta:
        model = AffiliatePlayerCommissionStatus
        fields = [
            "id", "affiliate", "affiliate_email", "referred_user", "player_name", "player_email",
            "player_uid", "commission_type", "commission_type_display", "plan", "plan_name",
            "rate_applied", "deposit_total", "required_wagering", "completed_wagering",
            "remaining_wagering", "player_loss", "rolling_amount", "qualification_status",
            "not_qualified_reason", "commission_amount", "referral_status", "commission_status",
            "commission", "last_evaluated_at", "created_at", "updated_at", "paid_at",
        ]

    def get_remaining_wagering(self, obj):
        remaining = (obj.required_wagering or Decimal("0")) - (obj.completed_wagering or Decimal("0"))
        return max(remaining, Decimal("0"))

    def _linked_commission(self, obj):
        return obj.commission if obj.commission_id else None

    def get_referral_status(self, obj):
        commission = self._linked_commission(obj)
        return commission.status if commission else None

    def get_commission_status(self, obj):
        commission = self._linked_commission(obj)
        return commission_display_status(obj.qualification_status, commission.status if commission else None)

    def get_paid_at(self, obj):
        commission = self._linked_commission(obj)
        return commission.paid_at if commission else None


class CampaignVisitorSerializer(serializers.Serializer):
    """One row in a campaign's visitor table — built from a dict the view
    assembles per AffiliateClickLog row, not a model instance directly."""
    id = serializers.IntegerField()
    visitor = serializers.CharField()
    country = serializers.CharField(allow_blank=True)
    city = serializers.CharField(allow_blank=True)
    device = serializers.CharField(allow_blank=True)
    browser = serializers.CharField(allow_blank=True)
    click_date = serializers.DateTimeField(source="created_at")
    registration_status = serializers.CharField()
    deposit_status = serializers.CharField()
    bet_status = serializers.CharField()
