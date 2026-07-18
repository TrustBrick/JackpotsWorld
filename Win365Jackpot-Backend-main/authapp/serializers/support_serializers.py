from rest_framework import serializers

from authapp.models.responsible_gambling_models import ResponsibleGamblingSettings
from authapp.models.support_ticket_models import SupportTicket
# MULTILINGUAL-CHAT: new import
from authapp.models.support_settings_models import SupportSettings


class ResponsibleGamblingSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResponsibleGamblingSettings
        fields = [
            "deposit_limit_daily", "deposit_limit_weekly", "deposit_limit_monthly",
            "cooling_off_until", "self_exclusion_until", "updated_at",
        ]


class SupportTicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicket
        # MULTILINGUAL-CHAT: added preferred_language (write) + admin_reply_translated
        # (read) — both no-ops while the feature flag is off (see support_views.py).
        fields = [
            "id", "subject", "message", "status", "admin_reply", "created_at", "updated_at",
            "preferred_language", "admin_reply_translated",
        ]
        read_only_fields = ["id", "status", "admin_reply", "admin_reply_translated", "created_at", "updated_at"]


class AdminSupportTicketSerializer(serializers.ModelSerializer):
    user_uid = serializers.CharField(source="user.user_uid", read_only=True)
    email    = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = SupportTicket
        # MULTILINGUAL-CHAT: added preferred_language + message_translated (read-only,
        # this is the Back Office's "English" column) alongside the existing fields.
        fields = [
            "id", "user_uid", "email", "subject", "message", "status", "admin_reply", "created_at", "updated_at",
            "preferred_language", "message_translated", "admin_reply_translated", "translated_at",
        ]
        read_only_fields = [
            "id", "user_uid", "email", "subject", "message", "created_at", "updated_at",
            "preferred_language", "message_translated", "admin_reply_translated", "translated_at",
        ]


# MULTILINGUAL-CHAT: new serializer
class SupportSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportSettings
        fields = [
            "enabled", "default_language", "translation_provider",
            "fallback_language", "auto_detect_enabled", "updated_at",
        ]
        read_only_fields = ["updated_at"]
