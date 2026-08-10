from rest_framework import serializers

from authapp.models.wheel_models import (
    SignupWheelSettings, SignupWheelReward, SignupWheelSpin,
    BonusWheel, BonusWheelReward, BonusWheelAssignment, BonusWheelGrant, BonusWheelSpin,
)


def _resolved_image(obj, context):
    if not obj.image:
        return None
    request = context.get("request")
    return request.build_absolute_uri(obj.image.url) if request else obj.image.url


# ─── Signup Wheel ───────────────────────────────────────────────────────────

class SignupWheelSettingsSerializer(serializers.ModelSerializer):
    # Explicit boolean declarations — DRF's multipart parsing treats a
    # missing boolean as False (HTML checkbox semantics), which would
    # silently defeat the model's default=True on a partial PATCH that
    # omits this field (same fix already applied to SpinConfigSerializer).
    is_enabled = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = SignupWheelSettings
        fields = ["is_enabled", "max_lifetime_spins", "eligibility_window_days", "updated_at"]
        read_only_fields = ["updated_at"]


class SignupWheelRewardSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)
    no_repeat_for_player = serializers.BooleanField(default=False, required=False)
    resolved_image = serializers.SerializerMethodField()

    class Meta:
        model = SignupWheelReward
        fields = [
            "id", "label", "reward_type", "value", "probability_pct", "no_repeat_for_player",
            "icon", "color", "image", "resolved_image", "display_order", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_resolved_image(self, obj):
        return _resolved_image(obj, self.context)


class SignupWheelSpinSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True, default=None)
    user_name = serializers.CharField(source="user.name", read_only=True, default=None)

    class Meta:
        model = SignupWheelSpin
        fields = [
            "id", "user", "user_email", "user_name", "reward_label_snapshot",
            "reward_type_snapshot", "value_snapshot", "spin_number", "spun_at",
        ]


# ─── Bonus Wheel ────────────────────────────────────────────────────────────

class BonusWheelRewardSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)
    allow_repeat = serializers.BooleanField(default=True, required=False)
    is_mystery = serializers.BooleanField(default=False, required=False)
    resolved_image = serializers.SerializerMethodField()
    event_name = serializers.CharField(source="event.name", read_only=True, default=None)

    class Meta:
        model = BonusWheelReward
        fields = [
            "id", "wheel", "label", "reward_type", "value", "casino_name", "event", "event_name",
            "icon", "color", "image", "resolved_image", "is_mystery", "weight", "allow_repeat",
            "max_winners", "daily_limit", "monthly_limit", "is_active", "display_order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_resolved_image(self, obj):
        return _resolved_image(obj, self.context)


class BonusWheelSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)
    rewards = BonusWheelRewardSerializer(many=True, read_only=True)
    related_event_name = serializers.CharField(source="related_event.name", read_only=True, default=None)
    created_by_email = serializers.CharField(source="created_by.email", read_only=True, default=None)
    is_currently_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = BonusWheel
        fields = [
            "id", "name", "campaign_tag", "related_event", "related_event_name", "description",
            "is_active", "is_currently_active", "active_from", "active_until", "theme",
            "rewards", "created_by", "created_by_email", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


class BonusWheelListSerializer(BonusWheelSerializer):
    """List-row shape — omits the nested rewards array (fetched separately
    per-wheel when the admin opens it) so the wheel list stays a single
    cheap query instead of N+1-ing every wheel's reward set. Keeps a plain
    count instead, so the list cards can still show "N reward tier(s)"
    without paying for the full nested serialization."""
    reward_count = serializers.IntegerField(source="rewards.count", read_only=True)

    class Meta(BonusWheelSerializer.Meta):
        fields = [f for f in BonusWheelSerializer.Meta.fields if f != "rewards"] + ["reward_count"]


class BonusWheelAssignmentSerializer(serializers.ModelSerializer):
    wheel_name = serializers.CharField(source="wheel.name", read_only=True)
    created_by_email = serializers.CharField(source="created_by.email", read_only=True, default=None)
    target_user_emails = serializers.SerializerMethodField()

    class Meta:
        model = BonusWheelAssignment
        fields = [
            "id", "wheel", "wheel_name", "target_type", "target_users", "target_user_emails",
            "target_vip_level", "target_country", "target_event", "spins_granted", "grant_reason",
            "expires_at", "note", "created_by", "created_by_email", "created_at", "recipient_count",
        ]
        read_only_fields = ["id", "created_by", "created_at", "recipient_count"]

    def get_target_user_emails(self, obj):
        if obj.target_type != "individual":
            return []
        return list(obj.target_users.values_list("email", flat=True))


class BonusWheelGrantSerializer(serializers.ModelSerializer):
    wheel_name = serializers.CharField(source="wheel.name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_name = serializers.CharField(source="user.name", read_only=True)
    spins_remaining = serializers.IntegerField(read_only=True)
    is_usable = serializers.BooleanField(read_only=True)
    grant_reason = serializers.CharField(source="assignment.grant_reason", read_only=True, default=None)

    class Meta:
        model = BonusWheelGrant
        fields = [
            "id", "wheel", "wheel_name", "assignment", "grant_reason", "user", "user_email", "user_name",
            "spins_total", "spins_used", "spins_remaining", "is_usable", "expires_at", "created_at",
        ]
        read_only_fields = fields


class BonusWheelSpinSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True, default=None)
    user_name = serializers.CharField(source="user.name", read_only=True, default=None)
    wheel_name = serializers.CharField(source="wheel.name", read_only=True, default=None)

    class Meta:
        model = BonusWheelSpin
        fields = [
            "id", "user", "user_email", "user_name", "wheel", "wheel_name",
            "reward_label_snapshot", "reward_type_snapshot", "value_snapshot", "spun_at",
        ]
