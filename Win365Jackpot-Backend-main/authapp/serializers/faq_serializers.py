"""
authapp/serializers/faq_serializers.py
─────────────────────────────────────────────────────────────────────────────
Public/admin split. The public serializer is deliberately minimal — a visitor
needs the question, the answer and the order, and has no business seeing which
admin last edited it or when.
"""
from rest_framework import serializers

from authapp.models.faq_models import FAQ


class FAQPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQ
        fields = ["id", "question", "answer", "category", "is_featured", "order"]
        read_only_fields = fields


class FAQAdminSerializer(serializers.ModelSerializer):
    updated_by_email = serializers.CharField(
        source="updated_by.email", read_only=True, default="",
    )
    # Declared explicitly: DRF's multipart parsing treats an omitted boolean as
    # False, which would otherwise flip is_active off on every create made from
    # a multipart Back Office form. Same guard the event serializers use.
    is_active = serializers.BooleanField(required=False, default=True)
    is_featured = serializers.BooleanField(required=False, default=False)

    class Meta:
        model = FAQ
        fields = [
            "id", "category", "question", "answer",
            "is_active", "is_featured", "order",
            "created_at", "updated_at", "updated_by_email",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "updated_by_email"]

    def validate_question(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("A question is required.")
        return value

    def validate_answer(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("An answer is required.")
        return value
