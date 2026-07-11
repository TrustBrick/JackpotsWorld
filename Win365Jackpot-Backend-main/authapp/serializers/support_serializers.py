from rest_framework import serializers

from authapp.models.responsible_gambling_models import ResponsibleGamblingSettings
from authapp.models.support_ticket_models import SupportTicket


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
        fields = ["id", "subject", "message", "status", "admin_reply", "created_at", "updated_at"]
        read_only_fields = ["id", "status", "admin_reply", "created_at", "updated_at"]


class AdminSupportTicketSerializer(serializers.ModelSerializer):
    user_uid = serializers.CharField(source="user.user_uid", read_only=True)
    email    = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = SupportTicket
        fields = ["id", "user_uid", "email", "subject", "message", "status", "admin_reply", "created_at", "updated_at"]
        read_only_fields = ["id", "user_uid", "email", "subject", "message", "created_at", "updated_at"]
