from rest_framework import serializers
from authapp.models.landing_models import (
    LandingSettings, HeroStat, WhyChooseUsFeature, TrustBadge,
    GiftItem, GiftStep, VipTier, VipTierBenefit, Testimonial,
    Destination, DestinationMedia, VipServiceImage, TourPackage,
    PremiumPartner, SectionMedia,
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


class PremiumPartnerSerializer(serializers.ModelSerializer):
    # Multipart posts send a missing boolean as absent, which would otherwise
    # bypass the model defaults — same treatment the other landing
    # serializers give is_active.
    is_active           = serializers.BooleanField(default=True, required=False)
    is_featured_in_hero = serializers.BooleanField(default=True, required=False)
    # Derived, so the hero never has to guess from a file extension.
    media_type          = serializers.CharField(read_only=True)

    class Meta:
        model = PremiumPartner
        fields = [
            "id", "name", "country", "city", "flag_country_code", "description",
            "logo", "hero_image", "hero_video", "media_type",
            "partner_type", "is_featured_in_hero", "is_active", "order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "media_type", "created_at", "updated_at"]

    # Reuses the project's shared upload validation rather than a second set
    # of rules: extension + content-type + size, plus a structural decode for
    # images. Raising here means DRF returns a 400 with the real reason, which
    # the Back Office surfaces verbatim instead of a generic "upload failed".
    def validate_logo(self, value):
        return validate_uploaded_image(value)

    def validate_hero_image(self, value):
        return validate_uploaded_image(value)

    def validate_hero_video(self, value):
        return validate_uploaded_video(value)

    def validate(self, attrs):
        """A hero partner with no media would render an empty band, so require
        one — but only when the saved row wouldn't already have some. Checked
        here rather than per-field because either file satisfies it."""
        instance = self.instance

        def resolved(field):
            # A PATCH that doesn't mention the field keeps whatever is saved;
            # explicitly sending null clears it.
            return attrs[field] if field in attrs else getattr(instance, field, None)

        featured = attrs.get(
            "is_featured_in_hero", getattr(instance, "is_featured_in_hero", True),
        )
        if featured and not resolved("hero_image") and not resolved("hero_video"):
            raise serializers.ValidationError({
                "hero_image": "A partner featured in the hero needs an image or a video.",
            })
        return attrs


class SectionMediaSerializer(serializers.ModelSerializer):
    """`section` is read-only here: the two admin views (TeenPattiMedia*/
    PokerMedia*) each hardcode which section they serve and inject it on
    every write (see views/landing_views.py), so it's never taken from the
    client — the Back Office form doesn't even offer it as a field."""
    is_active = serializers.BooleanField(default=True, required=False)
    section = serializers.CharField(read_only=True)
    media_type = serializers.CharField(read_only=True)

    class Meta:
        model = SectionMedia
        fields = [
            "id", "section", "slot", "label", "video", "poster_image",
            "media_type", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "section", "media_type", "created_at", "updated_at"]

    def validate_video(self, value):
        return validate_uploaded_video(value)

    def validate_poster_image(self, value):
        return validate_uploaded_image(value)

    def validate(self, attrs):
        instance = self.instance

        def resolved(field):
            return attrs[field] if field in attrs else getattr(instance, field, None)

        is_active = attrs.get("is_active", getattr(instance, "is_active", True))
        if is_active and not resolved("video") and not resolved("poster_image"):
            raise serializers.ValidationError({
                "video": "An active slot needs a video or a poster image.",
            })
        return attrs
