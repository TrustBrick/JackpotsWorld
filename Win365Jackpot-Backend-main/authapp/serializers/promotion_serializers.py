from rest_framework import serializers
from authapp.models.promotion_models import Promotion, PromotionGalleryImage, PromotionSettings
from authapp.utils.file_validation import validate_uploaded_audio


class PromotionSettingsSerializer(serializers.ModelSerializer):
    """Page-level Promotions settings (the voice-over). Exposed under short,
    frontend-friendly keys (`audio`, `enabled`) rather than the model's field
    names. `audio` serializes to the file's URL and accepts an upload on PATCH."""
    audio = serializers.FileField(source="voiceover_audio", required=False, allow_null=True)
    enabled = serializers.BooleanField(source="voiceover_enabled", required=False)

    class Meta:
        model = PromotionSettings
        fields = ["audio", "enabled", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_audio(self, value):
        return validate_uploaded_audio(value)


class PromotionGalleryImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromotionGalleryImage
        fields = ["id", "image", "order"]


class PromotionSerializer(serializers.ModelSerializer):
    # See CasinoEventSerializer: multipart form posts treat a missing
    # boolean as False, bypassing the model's default=True.
    is_active = serializers.BooleanField(default=True, required=False)
    gallery = PromotionGalleryImageSerializer(many=True, read_only=True)

    class Meta:
        model = Promotion
        fields = [
            "id", "country", "country_code", "casino_name", "casino_logo",
            "image", "video", "gallery", "title", "description", "validity_text",
            "bonus_details", "benefits", "terms_conditions", "cta_label",
            "is_active", "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
