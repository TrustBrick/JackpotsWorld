from rest_framework import serializers

from authapp.models.support_ticket_models import SupportTicket, ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["id", "sender_type", "message", "is_read", "created_at"]
        read_only_fields = fields


class LiveChatSessionSerializer(serializers.ModelSerializer):
    unread_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    user_uid     = serializers.CharField(source="user.user_uid", read_only=True)
    email        = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = SupportTicket
        fields = [
            "id", "user_uid", "email", "status", "created_at", "updated_at",
            "unread_count", "last_message",
        ]
        read_only_fields = fields

    def get_unread_count(self, obj):
        # Admin list view: how many unread *user* messages this session has.
        return obj.chat_messages.filter(sender_type="user", is_read=False).count()

    def get_last_message(self, obj):
        last = obj.chat_messages.order_by("-created_at").first()
        return ChatMessageSerializer(last).data if last else None
