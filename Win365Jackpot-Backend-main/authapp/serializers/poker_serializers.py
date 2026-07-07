from rest_framework import serializers
from authapp.models.poker_models import PokerTournament


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
