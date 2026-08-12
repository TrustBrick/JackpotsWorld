from rest_framework import serializers
from authapp.models.landing_models import (
    LandingSettings, HeroStat, WhyChooseUsFeature, TrustBadge,
    GiftItem, GiftStep, VipTier, VipTierBenefit, Testimonial,
    Destination, DestinationMedia, VipServiceImage, TourPackage,
)
from authapp.utils.file_validation import validate_uploaded_image, validate_uploaded_video


class LandingSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandingSettings
        fields = [
            "id", "hero_badge_text", "hero_background_video",
            "hero_cta_primary_label", "hero_cta_secondary_label", "hero_tagline",
            "global_reach_tagline", "trust_banner_heading", "trust_banner_subtext",
            "whatsapp_number", "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]

    def validate_hero_background_video(self, value):
        return validate_uploaded_video(value)


class HeroStatSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = HeroStat
        fields = ["id", "label", "value", "is_active", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class WhyChooseUsFeatureSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = WhyChooseUsFeature
        fields = ["id", "icon_name", "color", "title", "description", "is_active", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class TrustBadgeSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = TrustBadge
        fields = ["id", "icon_name", "color", "label", "is_active", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class GiftItemSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)
    featured = serializers.BooleanField(default=False, required=False)

    class Meta:
        model = GiftItem
        fields = [
            "id", "tier", "tier_color", "name", "subtitle", "logo", "value",
            "description", "perks", "accent_color", "featured", "is_active",
            "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_logo(self, value):
        return validate_uploaded_image(value)


class GiftStepSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = GiftStep
        fields = ["id", "icon", "label", "description", "is_active", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class VipTierBenefitSerializer(serializers.ModelSerializer):
    class Meta:
        model = VipTierBenefit
        fields = ["id", "tier", "name", "description", "order", "created_at"]
        read_only_fields = ["id", "created_at"]


class VipTierSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)
    benefits = VipTierBenefitSerializer(many=True, read_only=True)

    class Meta:
        model = VipTier
        fields = ["id", "label", "accent_color", "accent_bg", "benefits", "is_active", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class TestimonialSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = Testimonial
        fields = [
            "id", "name", "city", "country_code", "rating", "amount_won",
            "destination", "accent_color", "avatar", "text", "is_active",
            "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_avatar(self, value):
        return validate_uploaded_image(value)


class DestinationMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = DestinationMedia
        fields = ["id", "destination", "media", "media_type", "label", "order", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        # `media` can be an image or a video depending on the sibling
        # `media_type` field, so the right check can't be a single-field
        # validator — it has to read both together. Falls back to the
        # existing instance's media_type (or the model default) so a partial
        # PATCH that only sends a new file still validates against the
        # media_type that's actually already saved.
        media_file = attrs.get("media")
        if media_file:
            media_type = attrs.get("media_type") or getattr(self.instance, "media_type", "image")
            if media_type == "video":
                validate_uploaded_video(media_file)
            else:
                validate_uploaded_image(media_file)
        return attrs


class DestinationSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)
    images = DestinationMediaSerializer(many=True, read_only=True)

    class Meta:
        model = Destination
        fields = [
            "id", "name", "flag_country_code", "tagline", "accent_color",
            "casinos_text", "best_for", "images", "is_active", "order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class VipServiceImageSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = VipServiceImage
        fields = ["id", "image", "label", "category", "is_active", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_image(self, value):
        return validate_uploaded_image(value)


class TourPackageSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = TourPackage
        fields = [
            "id", "name", "price", "icon", "color", "badge", "duration",
            "flight", "hotel", "food", "liquor",
            "airport_vip", "jackpot_rewards", "vip_transport", "vip_transport_note",
            "spa", "spa_note", "shopping_voucher", "shopping_note", "visa",
            "is_active", "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
