from rest_framework import serializers
from authapp.models.poker_models import (
    PokerTournament, PokerRegistration, PokerSource, PokerSyncLog, PokerEventChangeLog,
)


class PokerTournamentSerializer(serializers.ModelSerializer):
    """Shared by the public list/detail and the Back Office CRUD form.

    The Part 6 fields are additive: every field the original serializer
    exposed is still here under the same name, so existing consumers
    (PokerCard, PokerDetails, the admin Manage Poker table) keep working
    untouched.
    """
    # See CasinoEventSerializer: multipart form posts treat a missing
    # boolean as False, bypassing the model's default=True.
    is_active = serializers.BooleanField(default=True, required=False)
    source_name = serializers.CharField(source="source.name", read_only=True, default="")

    class Meta:
        model = PokerTournament
        fields = [
            "id", "image", "name", "casino_name", "location",
            "event_date", "event_time", "prize_pool", "buy_in",
            "status", "description", "seats_available",
            # Part 6 additions
            "series", "country", "city", "end_date", "currency",
            "game_type", "organizer", "official_url",
            # Provenance / review
            "review_status", "source", "source_name", "source_event_id", "source_url",
            "duplicate_of", "discovered_at", "last_synced_at",
            "reviewed_at", "review_note",
            "is_active", "created_at", "updated_at",
        ]
        # review_status is deliberately read-only here — it moves only through
        # the transition endpoint, which validates the lifecycle and writes a
        # change-history row. A blanket PATCH must not be able to publish.
        read_only_fields = [
            "id", "review_status", "source_name", "discovered_at", "last_synced_at",
            "reviewed_at", "created_at", "updated_at",
        ]

    def validate(self, attrs):
        instance = self.instance
        start = attrs.get("event_date", getattr(instance, "event_date", None))
        end = attrs.get("end_date", getattr(instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "End date cannot be before the start date."})
        for field in ("buy_in", "prize_pool"):
            value = attrs.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: "Cannot be negative."})
        return attrs


class PokerSourceSerializer(serializers.ModelSerializer):
    tournament_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = PokerSource
        fields = [
            "id", "name", "source_type", "url", "is_enabled", "config",
            "permission_note", "last_attempted_sync", "last_successful_sync",
            "sync_status", "error_message", "tournament_count",
            "created_at", "updated_at",
        ]
        # Sync bookkeeping is written by the sync loop, never by a client.
        read_only_fields = [
            "id", "last_attempted_sync", "last_successful_sync",
            "sync_status", "error_message", "created_at", "updated_at",
        ]


class PokerSyncLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = PokerSyncLog
        fields = [
            "id", "source", "source_name", "started_at", "finished_at", "status",
            "fetched_count", "created_count", "updated_count",
            "duplicate_count", "skipped_count", "error_message",
        ]
        read_only_fields = fields


class PokerEventChangeLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True, default="")
    tournament_name = serializers.CharField(source="tournament.name", read_only=True)

    class Meta:
        model = PokerEventChangeLog
        fields = [
            "id", "tournament", "tournament_name", "action",
            "from_status", "to_status", "changed_fields", "note",
            "actor", "actor_email", "created_at",
        ]
        read_only_fields = fields


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
