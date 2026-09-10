"""Serializers for the VIP destination pillars and their enquiries."""
from rest_framework import serializers

from authapp.models.experience_models import (
    CATEGORY_CHOICES,
    Experience,
    ExperienceEnquiry,
)


class ExperienceSerializer(serializers.ModelSerializer):
    """The public shape of one pillar card.

    Read-only in both directions: this endpoint is AllowAny and there is no
    public write path to Experience at all. `updated_by` and the timestamps
    are absent rather than read-only — who last edited a card is Back Office
    context, not something the landing page needs.
    """

    destination_name = serializers.CharField(source="destination.name", read_only=True, default="")
    destination_flag = serializers.CharField(
        source="destination.flag_country_code", read_only=True, default="",
    )

    class Meta:
        model = Experience
        fields = [
            "id", "category", "title", "subtitle", "description",
            "destination", "destination_name", "destination_flag", "city",
            "partner", "image", "video", "icon_name", "accent_color",
            "cta_text", "cta_link", "enquiry_key",
            "is_featured", "display_order",
        ]
        read_only_fields = fields


class ExperienceAdminSerializer(serializers.ModelSerializer):
    """Back Office CRUD. Everything editable except the audit trail."""

    destination_name = serializers.CharField(source="destination.name", read_only=True, default="")

    class Meta:
        model = Experience
        fields = [
            "id", "category", "title", "subtitle", "description",
            "destination", "destination_name", "city", "partner",
            "image", "video", "icon_name", "accent_color",
            "cta_text", "cta_link", "enquiry_key",
            "is_featured", "is_active", "display_order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "destination_name", "created_at", "updated_at"]


class ExperienceEnquiryCreateSerializer(serializers.ModelSerializer):
    """What an anonymous visitor is allowed to send.

    THE WRITABLE SET IS THE POINT. `status`, `admin_note`, `user`,
    `submitted_ip`, `category` and `experience_title` are all absent here, so
    a crafted POST cannot open an enquiry that claims to be already contacted,
    attach a staff note, impersonate a member, or mislabel itself as being
    about a different pillar. The view derives every one of those server-side
    from the `experience` actually referenced.

    `experience` is required: an enquiry that is about nothing has no card to
    route it to and no title to show a host.
    """

    experience = serializers.PrimaryKeyRelatedField(
        queryset=Experience.objects.filter(is_active=True),
    )

    class Meta:
        model = ExperienceEnquiry
        fields = [
            "experience", "name", "email", "phone",
            "destination", "travel_date", "party_size", "requirements", "message",
        ]

    def validate_name(self, value):
        value = (value or "").strip()
        if len(value) < 2:
            raise serializers.ValidationError("Please tell us your name.")
        return value

    def validate_party_size(self, value):
        # A party of a few hundred is not an enquiry, it is a typo or a bot.
        if value is not None and (value < 1 or value > 500):
            raise serializers.ValidationError("Please enter a realistic number of guests.")
        return value

    def validate(self, attrs):
        # One contact route is the minimum that makes an enquiry actionable —
        # a host cannot follow up on a name alone. Either channel will do,
        # because a visitor who prefers WhatsApp should not be forced to
        # surrender an email address.
        if not (attrs.get("email") or "").strip() and not (attrs.get("phone") or "").strip():
            raise serializers.ValidationError(
                {"email": "Add an email address or a phone number so we can reply."},
            )
        return attrs


class ExperienceEnquiryAdminSerializer(serializers.ModelSerializer):
    """The Back Office view of an enquiry — everything the visitor sent, plus
    the two fields a host works with.

    Only `status` and `admin_note` are writable. What somebody asked for is a
    fact, not a field to edit. `submitted_ip` is absent entirely: it exists to
    rate-limit the endpoint, not to be shown to staff.
    """

    experience_name = serializers.CharField(source="experience.title", read_only=True, default="")
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True, default="")

    class Meta:
        model = ExperienceEnquiry
        fields = [
            "id", "experience", "experience_name", "experience_title",
            "category", "category_label",
            "user", "user_email", "name", "email", "phone",
            "destination", "travel_date", "party_size", "requirements", "message",
            "status", "admin_note", "created_at", "updated_at",
        ]
        read_only_fields = [
            f for f in fields if f not in ("status", "admin_note")
        ]


def category_vocabulary():
    """The pillar list, served from the model's own CHOICES.

    The frontend renders sections from this rather than from a second hardcoded
    list, so adding a pillar is a CHOICES entry and not a frontend change.
    """
    return [{"category": slug, "label": label} for slug, label in CATEGORY_CHOICES]
