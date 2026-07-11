from rest_framework import serializers

from authapp.models.spin_models import SpinConfig, SpinSettings, SpinHistory


class SpinConfigSerializer(serializers.ModelSerializer):
    # Declared explicitly: DRF's multipart parsing treats a missing boolean
    # field as False (HTML checkbox semantics), which would silently ignore
    # the model's default=True whenever the admin form omits this field —
    # same fix already applied to PokerTournamentSerializer/CasinoEventSerializer.
    is_active = serializers.BooleanField(default=True, required=False)
    is_jackpot = serializers.BooleanField(default=False, required=False)
    tournament_name = serializers.CharField(source="tournament.name", read_only=True, default=None)
    event_name = serializers.CharField(source="event.name", read_only=True, default=None)

    class Meta:
        model = SpinConfig
        fields = [
            "id", "label", "reward_type", "value", "casino_name",
            "tournament", "tournament_name", "event", "event_name",
            "image_url", "weight", "is_jackpot", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SpinSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpinSettings
        fields = ["max_spins_per_month", "jackpot_every_n_users", "sound_enabled", "updated_at"]
        read_only_fields = ["updated_at"]


class SpinHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SpinHistory
        fields = [
            "id", "reward_type_snapshot", "reward_label_snapshot", "value_snapshot",
            "is_jackpot_win", "needs_manual_fulfillment", "spun_at",
        ]
