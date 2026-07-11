from rest_framework import serializers
from authapp.models.location_models import SupportedLocation


class SupportedLocationSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = SupportedLocation
        fields = [
            "id", "name", "country_code", "is_active", "order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
