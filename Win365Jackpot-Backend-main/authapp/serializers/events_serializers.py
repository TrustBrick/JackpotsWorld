from rest_framework import serializers
from authapp.models.events_models import CasinoEvent, EventTicketRequest


class CasinoEventSerializer(serializers.ModelSerializer):
    # Declared explicitly: DRF's multipart parsing treats a missing boolean
    # field as False (HTML checkbox semantics), which would silently ignore
    # the model's default=True whenever the admin form omits this field.
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = CasinoEvent
        fields = [
            "id", "image", "name", "country", "city", "venue",
            "event_date", "event_time", "category",
            "short_description", "description", "ticket_note",
            "status", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class EventTicketRequestAdminSerializer(serializers.ModelSerializer):
    """Back Office lead-capture view — one row per 'Get Ticket' click."""
    user_name  = serializers.CharField(source="user.name", read_only=True)
    user_uid   = serializers.CharField(source="user.user_uid", read_only=True)
    event_name = serializers.CharField(source="event.name", read_only=True)
    venue      = serializers.CharField(source="event.venue", read_only=True)
    event_date = serializers.DateField(source="event.event_date", read_only=True)
    phone      = serializers.CharField(source="user.phone", read_only=True)
    email      = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = EventTicketRequest
        fields = [
            "id", "user_name", "user_uid", "event_name", "venue",
            "event_date", "phone", "email", "created_at", "status", "admin_note",
        ]
        read_only_fields = [
            "id", "user_name", "user_uid", "event_name", "venue",
            "event_date", "phone", "email", "created_at",
        ]
