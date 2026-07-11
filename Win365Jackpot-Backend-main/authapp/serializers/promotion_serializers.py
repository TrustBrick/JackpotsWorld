from rest_framework import serializers
from authapp.models.promotion_models import Promotion, PromotionGalleryImage


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
