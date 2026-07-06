"""
authapp/serializers/gift_level_serializers.py
────────────────────────────────────────────────────────────────────────────
Serializers for:
  - UserGift     (admin create + user read/claim)
  - UserLevel    (read)
  - PointsLog    (read)
"""

from rest_framework import serializers
from authapp.models.gift_level_models import UserGift, UserLevel, PointsLog, LEVEL_THRESHOLDS, next_level_threshold


# ─── UserGift ────────────────────────────────────────────────────────────────

class UserGiftSerializer(serializers.ModelSerializer):
    is_claimable = serializers.SerializerMethodField()
    is_expired   = serializers.SerializerMethodField()
    created_by_uid = serializers.SerializerMethodField()

    class Meta:
        model  = UserGift
        fields = [
            "id", "amount", "gift_type", "status", "description",
            "expires_at", "created_at", "claimed_at",
            "is_claimable", "is_expired", "created_by_uid",
        ]

    def get_is_claimable(self, obj):
        return obj.is_claimable

    def get_is_expired(self, obj):
        return obj.is_expired

    def get_created_by_uid(self, obj):
        return obj.created_by.user_uid if obj.created_by else None


class AdminCreateGiftSerializer(serializers.Serializer):
    user_id     = serializers.IntegerField()
    amount      = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=1)
    gift_type   = serializers.ChoiceField(choices=[c[0] for c in UserGift.GIFT_TYPE_CHOICES], default="manual")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    note        = serializers.CharField(required=False, allow_blank=True, default="")
    expires_at  = serializers.DateTimeField(required=False, allow_null=True, default=None)


# ─── UserLevel ───────────────────────────────────────────────────────────────

class UserLevelSerializer(serializers.ModelSerializer):
    next_level          = serializers.SerializerMethodField()
    next_level_points   = serializers.SerializerMethodField()
    points_to_next      = serializers.SerializerMethodField()
    progress_pct        = serializers.SerializerMethodField()
    level_thresholds    = serializers.SerializerMethodField()

    class Meta:
        model  = UserLevel
        fields = [
            "level", "points", "updated_at",
            "next_level", "next_level_points", "points_to_next",
            "progress_pct", "level_thresholds",
        ]

    def get_next_level(self, obj):
        lvl, _ = next_level_threshold(obj.level)
        return lvl

    def get_next_level_points(self, obj):
        _, pts = next_level_threshold(obj.level)
        return pts

    def get_points_to_next(self, obj):
        _, pts = next_level_threshold(obj.level)
        if pts is None:
            return 0
        return max(pts - obj.points, 0)

    def get_progress_pct(self, obj):
        # Progress within the current level band
        current_threshold = 0
        for lvl, threshold in LEVEL_THRESHOLDS:
            if lvl == obj.level:
                current_threshold = threshold
                break
        _, next_pts = next_level_threshold(obj.level)
        if next_pts is None:
            return 100
        band = next_pts - current_threshold
        progress = obj.points - current_threshold
        return min(round((progress / band) * 100, 1), 100) if band > 0 else 100

    def get_level_thresholds(self, obj):
        return [{"level": l, "points": p} for l, p in LEVEL_THRESHOLDS]


# ─── PointsLog ───────────────────────────────────────────────────────────────

class PointsLogSerializer(serializers.ModelSerializer):
    recorded_by_uid = serializers.SerializerMethodField()

    class Meta:
        model  = PointsLog
        fields = [
            "id", "points_added", "points_before", "points_after",
            "level_before", "level_after", "leveled_up", "reason",
            "recorded_by_uid", "created_at",
        ]

    def get_recorded_by_uid(self, obj):
        return obj.recorded_by.user_uid if obj.recorded_by else None


# ─── Admin Add Points ─────────────────────────────────────────────────────────

class AdminAddPointsSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    points  = serializers.IntegerField()   # allow negative for deductions
    reason  = serializers.CharField(required=False, allow_blank=True, default="")


# ─── Admin Add OTP ────────────────────────────────────────────────────────────

class AdminAddOTPSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    amount  = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=1)
    note    = serializers.CharField(required=False, allow_blank=True, default="")
    otp_type = serializers.CharField(required=False, default="OTP_ADD")