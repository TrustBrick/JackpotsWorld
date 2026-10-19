"""VISITOR-FEEDBACK serializers: the public form and the Back Office row."""

from rest_framework import serializers

from authapp.models.visitor_feedback_models import (
    MESSAGE_MAX,
    STATUS_CHOICES,
    TRIGGER_CHOICES,
    TRIGGER_MANUAL,
    VisitorFeedback,
)


class VisitorFeedbackCreateSerializer(serializers.ModelSerializer):
    """What a visitor may send. Status, user, IP and the testimonial link are
    set by the view, never accepted from the client."""

    class Meta:
        model = VisitorFeedback
        fields = ["rating", "category", "trigger", "message", "name", "email",
                  "page_path", "language", "country_code"]
        extra_kwargs = {
            "category": {"required": False},
            "trigger": {"required": False},
            # Prompted feedback is often a star alone; the comment is optional.
            "message": {"required": False, "allow_blank": True},
            "name": {"required": False},
            "email": {"required": False},
            "page_path": {"required": False},
            "language": {"required": False},
            "country_code": {"required": False},
        }

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def to_internal_value(self, data):
        # An unknown trigger (a newer frontend, a hand-made request) is stored
        # as "manual" rather than refusing the feedback.
        if hasattr(data, "copy"):
            data = data.copy()
        if data.get("trigger") not in dict(TRIGGER_CHOICES):
            data["trigger"] = TRIGGER_MANUAL
        return super().to_internal_value(data)

    def validate_message(self, value):
        value = (value or "").strip()
        if len(value) > MESSAGE_MAX:
            raise serializers.ValidationError(f"Feedback is limited to {MESSAGE_MAX} characters.")
        return value

    def validate_name(self, value):
        return (value or "").strip()[:120]

    def validate_page_path(self, value):
        return (value or "").strip()[:300]

    def validate_language(self, value):
        return (value or "").strip()[:12]

    def validate_country_code(self, value):
        return (value or "").strip()[:8]


class VisitorFeedbackAdminSerializer(serializers.ModelSerializer):
    """Back Office row. Only `status` and `admin_note` are writable — what the
    visitor wrote is a record, not a draft."""

    user_email = serializers.EmailField(source="user.email", read_only=True, default=None)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    trigger_label = serializers.CharField(source="get_trigger_display", read_only=True)

    class Meta:
        model = VisitorFeedback
        fields = [
            "id", "rating", "category", "category_label", "trigger", "trigger_label",
            "message", "name", "email",
            "page_path", "language", "country_code", "user_email",
            "status", "status_label", "admin_note", "testimonial",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "rating", "category", "category_label", "trigger", "trigger_label",
            "message", "name", "email",
            "page_path", "language", "country_code", "user_email",
            "status_label", "testimonial", "created_at", "updated_at",
        ]

    def validate_status(self, value):
        if value not in dict(STATUS_CHOICES):
            raise serializers.ValidationError("Unknown status.")
        return value


class PublishTestimonialSerializer(serializers.Serializer):
    """Optional edits an admin makes while publishing feedback as a
    testimonial. Anything left out is taken from the feedback itself."""

    name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    text = serializers.CharField(max_length=MESSAGE_MAX, required=False, allow_blank=True)
