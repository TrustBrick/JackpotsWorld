# authapp/serializers/register_serializers.py

import re
from rest_framework import serializers
from authapp.models.register_models import Registration


class RegistrationCreateSerializer(serializers.ModelSerializer):
    """
    POST /api/register/
    Accepts user-submitted fields only.
    IP, geo, user-agent are injected server-side in the view.
    """
    class Meta:
        model = Registration
        fields = [
            "full_name",
            "country",
            "whatsapp_number",
            "destination",
            "package",
            "interested_in_vip_deals",
            "interested_in_pro_tips",
        ]

    def validate_full_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Full name must be at least 2 characters.")
        if not re.search(r"[a-zA-Z]", value):
            raise serializers.ValidationError("Enter a valid full name.")
        return value

    def validate_whatsapp_number(self, value):
        if not value:
            return value  # optional field
        # Strip everything except digits and leading +
        cleaned = re.sub(r"[^\d+]", "", value)
        digits_only = re.sub(r"\D", "", cleaned)
        if len(digits_only) < 4 or len(digits_only) > 15:
            raise serializers.ValidationError(
                "Enter a valid WhatsApp number (4–15 digits, including country code)."
            )
        return cleaned  # store with + prefix if present

    def validate_country(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Country is required.")
        return value

    def validate_destination(self, value):
        if not value:
            raise serializers.ValidationError("Please select a destination.")
        return value

    def validate_package(self, value):
        if not value:
            raise serializers.ValidationError("Please select a package.")
        return value


class RegistrationDetailSerializer(serializers.ModelSerializer):
    """Full read-only detail view including all tracking data."""
    contact_interests = serializers.ReadOnlyField()

    class Meta:
        model = Registration
        fields = "__all__"


class RegistrationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list/admin endpoints."""
    contact_interests = serializers.ReadOnlyField()

    class Meta:
        model = Registration
        fields = [
            "id",
            "full_name",
            "country",
            "whatsapp_number",
            "destination",
            "package",
            "interested_in_vip_deals",
            "interested_in_pro_tips",
            "contact_interests",
            "ip_address",
            "geo_country",
            "geo_city",
            "created_at",
        ]
