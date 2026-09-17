"""
authapp/serializers/email_log_serializers.py
─────────────────────────────────────────────────────────────────────────────
Two shapes, because the list and the detail view answer different questions.

Both are read-only. An email log is a record of something that already
happened; the only write path is the retry endpoint, which creates a NEW row
rather than editing this one.
"""

from rest_framework import serializers

from authapp.models.email_log_models import EmailLog


class EmailLogListSerializer(serializers.ModelSerializer):
    """One table row. Deliberately omits smtp_response and metadata — a list of
    500 rows should not carry 500 SMTP transcripts to the browser."""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    email_type_display = serializers.CharField(source="get_email_type_display", read_only=True)

    class Meta:
        model = EmailLog
        fields = [
            "id", "recipient_email", "subject",
            "email_type", "email_type_display",
            "status", "status_display",
            "provider", "provider_message_id",
            "created_at", "sent_at", "delivered_at", "failed_at",
            "retry_count",
            # Enough of the reason to be readable in the row; the full text is
            # in the detail view.
            "error_message",
        ]
        read_only_fields = fields


class EmailLogDetailSerializer(serializers.ModelSerializer):
    """Everything known about one message."""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    email_type_display = serializers.CharField(source="get_email_type_display", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True, default="")
    user_uid = serializers.CharField(source="user.user_uid", read_only=True, default="")
    is_retryable = serializers.BooleanField(read_only=True)
    # What this row's status actually proves, in words, so the UI never has to
    # decide for itself whether "sent" means "delivered".
    status_explanation = serializers.SerializerMethodField()

    class Meta:
        model = EmailLog
        fields = [
            "id", "recipient_email", "all_recipients", "from_email", "subject",
            "email_type", "email_type_display",
            "status", "status_display", "status_explanation",
            "provider", "provider_message_id", "message_id",
            "smtp_response", "error_message",
            "created_at", "updated_at", "sent_at", "delivered_at", "failed_at",
            "retry_count", "retry_of", "is_retryable",
            "user", "user_email", "user_uid", "triggered_by", "metadata",
        ]
        read_only_fields = fields

    def get_status_explanation(self, obj):
        from authapp.models.email_log_models import (
            STATUS_BOUNCED, STATUS_DELIVERED, STATUS_FAILED, STATUS_PENDING, STATUS_SENT,
        )

        if obj.status == STATUS_PENDING:
            return ("Queued. The application created this record but the send has not "
                    "finished — a row left here usually means the process stopped mid-send.")
        if obj.status == STATUS_SENT:
            return ("The SMTP server accepted this message for delivery. That is NOT "
                    "proof it reached the mailbox: the current provider reports no "
                    "delivery events, so acceptance is the furthest this can be tracked.")
        if obj.status == STATUS_DELIVERED:
            return "The email provider confirmed this message reached the recipient's mailbox."
        if obj.status == STATUS_FAILED:
            return "The send attempt failed. The provider's own response is below."
        if obj.status == STATUS_BOUNCED:
            return ("The provider accepted this message and then reported it could not "
                    "be delivered.")
        return ""
