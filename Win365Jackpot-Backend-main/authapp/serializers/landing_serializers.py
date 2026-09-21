from rest_framework import serializers
from authapp.models.landing_models import (
    EnquiryMessage,
    LandingSettings, HeroStat, WhyChooseUsFeature, TrustBadge,
    GiftItem, GiftStep, VipTier, VipTierBenefit, Testimonial,
    Destination, DestinationMedia, VipServiceImage, TourPackage,
    PremiumPartner, SectionMedia, FeaturedDestinationShowcase,
    CruisePackage, CruisePackageDetail, CruisePackageMedia,
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
        partner_type = attrs.get(
            "partner_type", getattr(instance, "partner_type", "top_premium"),
        )
        # "Others" has nothing mandatory. Saved without media it is simply
        # left out of the hero (the showcase drops media-less slides), so it
        # still can't render an empty frame.
        if partner_type == PremiumPartner.OTHERS_TYPE:
            return attrs
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


class FeaturedDestinationShowcaseSerializer(serializers.ModelSerializer):
    """Back Office CRUD. `destination_name` is read-only convenience for the
    admin list so it doesn't have to join Destination client-side."""

    is_active = serializers.BooleanField(default=True, required=False)
    destination_name = serializers.CharField(source="destination.name", read_only=True)

    class Meta:
        model = FeaturedDestinationShowcase
        fields = [
            "id", "destination", "destination_name", "title", "description",
            "media_type", "media", "mobile_media", "poster_image", "cta_text",
            "is_active", "display_order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "destination_name", "created_at", "updated_at"]

    def _validate_media_file(self, media_file, media_type):
        # Same reasoning as DestinationMediaSerializer.validate: one field
        # holds either an image or a video depending on the sibling
        # media_type, so this can't be a single-field validator.
        if media_type == "video":
            validate_uploaded_video(media_file)
        else:
            validate_uploaded_image(media_file)

    def validate_poster_image(self, value):
        return validate_uploaded_image(value)

    def validate(self, attrs):
        def resolved(field, default=None):
            if field in attrs:
                return attrs[field]
            return getattr(self.instance, field, default)

        media_type = resolved("media_type", "video")

        # Validate any file actually being uploaded in this request, against
        # the media_type that will be in effect after the save.
        for field in ("media", "mobile_media"):
            uploaded = attrs.get(field)
            if uploaded:
                try:
                    self._validate_media_file(uploaded, media_type)
                except serializers.ValidationError as exc:
                    raise serializers.ValidationError({field: exc.detail})

        # An active section with nothing to show would render an empty frame,
        # so require something renderable — mirrors SectionMediaSerializer.
        is_active = attrs.get("is_active", getattr(self.instance, "is_active", True))
        if is_active and not resolved("media") and not resolved("poster_image"):
            raise serializers.ValidationError({
                "media": "An active showcase needs media or a poster image.",
            })
        return attrs


class PublicFeaturedDestinationShowcaseSerializer(serializers.ModelSerializer):
    """What the landing page actually renders — deliberately narrower than the
    admin serializer: no is_active (the endpoint only ever returns active
    rows), no timestamps, nothing an anonymous visitor has no use for.

    `destination_name` and `destination_slug` come from the existing
    Destination row rather than being duplicated onto this model, so renaming
    a destination updates the showcase automatically.
    """

    destination_name = serializers.CharField(source="destination.name", read_only=True)
    destination_accent = serializers.CharField(source="destination.accent_color", read_only=True)

    class Meta:
        model = FeaturedDestinationShowcase
        fields = [
            "id", "destination", "destination_name", "destination_accent",
            "title", "description", "media_type", "media", "mobile_media",
            "poster_image", "cta_text", "display_order",
        ]
        read_only_fields = fields


class EnquiryMessageSerializer(serializers.ModelSerializer):
    """Back Office view: everything an admin edits, plus who touched it last."""
    is_active = serializers.BooleanField(default=True, required=False)
    updated_by_email = serializers.EmailField(source="updated_by.email", read_only=True, default="")

    class Meta:
        model = EnquiryMessage
        fields = [
            "id", "key", "label", "description", "template", "placeholders",
            "is_active", "order", "created_at", "updated_at", "updated_by_email",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "updated_by_email"]


class PublicEnquiryMessageSerializer(serializers.ModelSerializer):
    """What the site is allowed to see: the key and the text, nothing else.

    Deliberately narrower than the admin serializer. The public endpoint is
    unauthenticated, so it returns only what a button needs to build its link
    -- no ids, no timestamps, no record of which admin last edited it.
    """

    class Meta:
        model = EnquiryMessage
        fields = ["key", "template", "placeholders"]


class CruisePackageDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = CruisePackageDetail
        fields = ["id", "package", "icon_name", "label", "value", "order"]
        read_only_fields = ["id"]


class CruisePackageMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = CruisePackageMedia
        fields = ["id", "package", "media", "media_type", "label", "order", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        # Same two-field problem DestinationMediaSerializer has: which
        # validator applies depends on the sibling media_type, and a PATCH
        # carrying only a new file has to fall back to the saved one.
        media_file = attrs.get("media")
        if media_file:
            media_type = attrs.get("media_type") or getattr(self.instance, "media_type", "image")
            if media_type == "video":
                validate_uploaded_video(media_file)
            else:
                validate_uploaded_image(media_file)
        return attrs


class CruisePackageSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(default=True, required=False)
    details = CruisePackageDetailSerializer(many=True, read_only=True)
    media = CruisePackageMediaSerializer(many=True, read_only=True)

    class Meta:
        model = CruisePackage
        fields = [
            "id", "eyebrow_text", "title", "subtitle", "icon_name", "accent_color",
            "highlights", "inclusions", "cta_text", "enquiry_key",
            "details", "media",
            "is_active", "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _clean_lines(self, value, field_name):
        """`highlights` and `inclusions` are plain lists of non-empty strings.

        The Back Office sends them as a JSON array built from a textarea, so
        blank lines and stray whitespace are the normal case rather than an
        error — they are dropped. Anything that is not a list of scalars is
        rejected outright, because storing a dict in here would render as
        [object Object] on the public page.
        """
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError({field_name: "Expected a list of lines."})
        cleaned = []
        for entry in value:
            if isinstance(entry, (dict, list)):
                raise serializers.ValidationError({field_name: "Each line must be plain text."})
            text = str(entry).strip()
            if text:
                cleaned.append(text)
        return cleaned

    def validate_highlights(self, value):
        return self._clean_lines(value, "highlights")

    def validate_inclusions(self, value):
        return self._clean_lines(value, "inclusions")
