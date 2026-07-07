from rest_framework import serializers
from authapp.models.promotion_models import Promotion


class PromotionSerializer(serializers.ModelSerializer):
    # See CasinoEventSerializer: multipart form posts treat a missing
    # boolean as False, bypassing the model's default=True.
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = Promotion
        fields = [
            "id", "country", "country_code", "casino_name", "casino_logo",
            "image", "title", "description", "validity_text",
            "bonus_details", "benefits", "cta_label",
            "is_active", "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
