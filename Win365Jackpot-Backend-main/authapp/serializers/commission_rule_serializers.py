"""
authapp/serializers/commission_rule_serializers.py
─────────────────────────────────────────────────────────────────────────────
Two audiences, two serializer sets. The admin ones expose the whole rule
configuration; the affiliate-facing ones deliberately expose only the
affiliate's own earnings and never the rule internals (Part 40: "Do not expose
internal admin-only commission rules"), so an affiliate can see *that* they're
on 12% in Sri Lanka without seeing every other affiliate's arrangement.
"""
from decimal import Decimal

from rest_framework import serializers

from authapp.models.commission_rule_models import (
    MANUAL_COMMISSION_TYPE,
    CommissionCondition, CommissionLedgerEntry, CommissionRule, CommissionTier,
)


class CommissionTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommissionTier
        fields = [
            "id", "rule", "name", "metric", "min_value", "max_value",
            "rate", "fixed_amount", "order", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        instance = self.instance
        min_value = attrs.get("min_value", getattr(instance, "min_value", None))
        max_value = attrs.get("max_value", getattr(instance, "max_value", None))
        if min_value is not None and max_value is not None and max_value < min_value:
            raise serializers.ValidationError({"max_value": "Upper bound cannot be below the lower bound."})
        for field in ("rate", "fixed_amount", "min_value"):
            value = attrs.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: "Cannot be negative."})
        return attrs


class CommissionConditionSerializer(serializers.ModelSerializer):
    # SerializerMethodField, not CharField — CommissionCondition.label is a
    # method, so a plain field would serialise the bound method object.
    label = serializers.SerializerMethodField()

    def get_label(self, obj):
        return obj.label()

    class Meta:
        model = CommissionCondition
        fields = [
            "id", "rule", "metric", "operator", "value",
            "description", "label", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "label", "created_at", "updated_at"]


class CommissionRuleSerializer(serializers.ModelSerializer):
    tiers = CommissionTierSerializer(many=True, read_only=True)
    conditions = CommissionConditionSerializer(many=True, read_only=True)
    casino_name = serializers.CharField(source="casino.name", read_only=True, default="")
    affiliate_email = serializers.EmailField(source="affiliate.email", read_only=True, default="")
    affiliate_uid = serializers.CharField(source="affiliate.user_uid", read_only=True, default="")
    scope_label = serializers.CharField(read_only=True)
    specificity = serializers.IntegerField(read_only=True)
    # How many ledger entries this rule has produced — the Part 39 "view usage"
    # column, annotated by the view.
    usage_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = CommissionRule
        fields = [
            "id", "name", "affiliate", "affiliate_email", "affiliate_uid",
            "country", "casino", "casino_name",
            "commission_type", "rate_type", "rate", "fixed_amount", "currency",
            "min_qualifying_amount", "max_commission",
            "start_date", "end_date", "is_active", "priority",
            "specificity", "scope_label", "notes",
            "tiers", "conditions", "usage_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "specificity", "scope_label", "created_at", "updated_at"]

    def validate(self, attrs):
        instance = self.instance

        def current(field):
            return attrs.get(field, getattr(instance, field, None))

        start_date, end_date = current("start_date"), current("end_date")
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": "End date cannot be before the start date."})

        for field in ("rate", "fixed_amount", "min_qualifying_amount"):
            value = attrs.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: "Cannot be negative."})

        max_commission = attrs.get("max_commission")
        if max_commission is not None and max_commission <= 0:
            raise serializers.ValidationError({"max_commission": "Must be greater than zero, or left blank."})

        rate_type = current("rate_type")
        if rate_type == "percentage" and not current("rate"):
            raise serializers.ValidationError({"rate": "A percentage rule needs a rate above zero."})
        if rate_type == "fixed" and not current("fixed_amount"):
            raise serializers.ValidationError({"fixed_amount": "A fixed rule needs an amount above zero."})

        # Part 47's country/casino integrity check — a rule scoped to a casino
        # in a different country than it names could never match anything.
        casino, country = current("casino"), current("country")
        if casino and country and casino.country.strip().lower() != country.strip().lower():
            raise serializers.ValidationError({
                "casino": f"'{casino.name}' is in {casino.country}, which doesn't match the selected country.",
            })

        return attrs


class CommissionLedgerEntrySerializer(serializers.ModelSerializer):
    """Back Office view — the full audit trail."""
    affiliate_email = serializers.EmailField(source="affiliate.email", read_only=True)
    affiliate_uid = serializers.CharField(source="affiliate.user_uid", read_only=True)
    affiliate_name = serializers.CharField(source="affiliate.name", read_only=True)
    player_email = serializers.EmailField(source="referred_player.email", read_only=True, default="")
    player_uid = serializers.CharField(source="referred_player.user_uid", read_only=True, default="")
    casino_name = serializers.CharField(source="casino.name", read_only=True, default="")
    # For a manual/bonus row this is the admin who granted it; for a
    # calculated row, whoever last moved it through the approval flow. The
    # Back Office labels it accordingly rather than storing the same person
    # twice under two names.
    reviewed_by_email = serializers.EmailField(source="reviewed_by.email", read_only=True, default="")
    is_manual = serializers.SerializerMethodField()

    def get_is_manual(self, obj):
        return obj.commission_type == MANUAL_COMMISSION_TYPE

    class Meta:
        model = CommissionLedgerEntry
        fields = [
            "id", "affiliate", "affiliate_email", "affiliate_uid", "affiliate_name",
            "referred_player", "player_email", "player_uid",
            "country", "casino", "casino_name",
            "rule", "rule_name", "tier", "tier_name",
            "commission_type", "is_manual",
            "base_amount", "commission_rate", "commission_amount", "currency",
            "conditions_snapshot", "calculation_trace", "qualification_reason",
            "status", "reference_id", "admin_notes", "reviewed_by_email",
            "created_at", "qualified_at", "approved_at", "paid_at", "updated_at",
        ]
        # Everything except status/admin_notes is a historical fact — Part 37's
        # "do not overwrite historical commission records".
        read_only_fields = [
            f for f in fields if f not in ("status", "admin_notes")
        ]


class AffiliateCommissionLedgerSerializer(serializers.ModelSerializer):
    """Affiliate-facing view. Excludes calculation_trace, rule/tier names and
    ids, admin_notes and reviewed_by — an affiliate sees what they earned and
    whether they qualified, not how the rules are configured internally.

    `reference_id` is the exception among the traceability fields, and
    deliberately so: it is the affiliate's own bet-slip number (or the
    synthetic deposit key for a deposit commission), which is what lets them
    tie a ledger row back to the activity that produced it. It reveals nothing
    about the rule configuration.
    """
    casino_name = serializers.CharField(source="casino.name", read_only=True, default="")
    player_uid = serializers.CharField(source="referred_player.user_uid", read_only=True, default="")

    class Meta:
        model = CommissionLedgerEntry
        fields = [
            "id", "country", "casino_name", "player_uid",
            "commission_type", "base_amount", "commission_rate", "commission_amount",
            "currency", "status", "qualification_reason", "reference_id",
            "created_at", "qualified_at", "paid_at",
        ]
        read_only_fields = fields


class ManualCommissionCreateSerializer(serializers.Serializer):
    """Input for POST .../commissions/manual/.

    Deliberately a plain Serializer, not a ModelSerializer: an admin supplies
    an intent (who, how much, what for), not a ledger row. Every derived field
    — status, rate, base amount, the entry itself — is decided by
    services/manual_commission_service.py, so no client can post a
    commission_amount that disagrees with what it asked for, or set a status
    of its own choosing.

    The heavier rules (the affiliate is genuinely an active affiliate, the
    currency is one the platform supports, the reason is present) live in the
    service, so they hold for any caller rather than only for requests that
    happen to arrive through this serializer.
    """

    affiliate = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    currency = serializers.CharField(max_length=8, required=False, default="USD")
    reason = serializers.CharField(max_length=255)
    note = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")
    # Supplied by the Back Office once per opened form. Two submissions of the
    # same form carry the same key and produce one commission.
    idempotency_key = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    # Accepted so the API reads the way the UI does, and rejected if it says
    # anything other than "manual" -- this endpoint grants bonuses and nothing
    # else. The other three types are calculated, never posted.
    commission_type = serializers.CharField(max_length=10, required=False, default=MANUAL_COMMISSION_TYPE)

    def validate_reason(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("A reason is required for every manual commission.")
        return value

    def validate_commission_type(self, value):
        value = (value or MANUAL_COMMISSION_TYPE).strip().lower()
        if value != MANUAL_COMMISSION_TYPE:
            raise serializers.ValidationError(
                f"This endpoint only creates '{MANUAL_COMMISSION_TYPE}' commissions. "
                f"Deposit, losing and rolling commissions are calculated from rules."
            )
        return value
