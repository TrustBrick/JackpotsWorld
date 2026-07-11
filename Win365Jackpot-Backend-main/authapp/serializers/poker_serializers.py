from rest_framework import serializers
from authapp.models.poker_models import PokerTournament, PokerRegistration


class PokerTournamentSerializer(serializers.ModelSerializer):
    # See CasinoEventSerializer: multipart form posts treat a missing
    # boolean as False, bypassing the model's default=True.
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = PokerTournament
        fields = [
            "id", "image", "name", "casino_name", "location",
            "event_date", "event_time", "prize_pool", "buy_in",
            "status", "description", "seats_available",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PokerRegistrationAdminSerializer(serializers.ModelSerializer):
    """Back Office lead-capture view — one row per 'Get Ticket' click."""
    user_name       = serializers.CharField(source="user.name", read_only=True)
    user_uid        = serializers.CharField(source="user.user_uid", read_only=True)
    tournament_name = serializers.CharField(source="tournament.name", read_only=True)
    casino_name     = serializers.CharField(source="tournament.casino_name", read_only=True)
    event_date      = serializers.DateField(source="tournament.event_date", read_only=True)
    phone           = serializers.CharField(source="user.phone", read_only=True)
    email           = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = PokerRegistration
        fields = [
            "id", "user_name", "user_uid", "tournament_name", "casino_name",
            "event_date", "phone", "email", "created_at", "status", "admin_note",
        ]
        read_only_fields = [
            "id", "user_name", "user_uid", "tournament_name", "casino_name",
            "event_date", "phone", "email", "created_at",
        ]
