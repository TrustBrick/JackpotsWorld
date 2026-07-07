from rest_framework import serializers
from authapp.models.events_models import CasinoEvent


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
