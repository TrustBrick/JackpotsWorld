from rest_framework import serializers

from authapp.models.support_ticket_models import (
    SupportTicket,
    ChatMessage,
    PARTICIPANT_AFFILIATE,
)


class ChatMessageSerializer(serializers.ModelSerializer):
    # A link to the attached document, or null. Read through FieldFile.url, so
    # on S3 this is a presigned link that expires (see PrivateMediaStorage) and
    # the raw object stays unreadable to anyone without one. Recomputed on every
    # serialisation rather than stored, which is what keeps the expiry short and
    # means a link that leaks stops working on its own.
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = [
            "id", "sender_type", "message", "is_read", "client_message_id",
            "attachment_url", "attachment_name", "created_at",
        ]
        read_only_fields = fields

    def get_attachment_url(self, obj):
        # The authorised download endpoint, never the raw storage URL -- see
        # LiveChatAttachmentView for why the storage URL must not leave the
        # server. Relative on purpose: the client resolves it against the API
        # base it is already authenticated to.
        if not obj.attachment:
            return None
        return "/api/live-chat/attachments/%s/" % obj.pk


class LiveChatSessionSerializer(serializers.ModelSerializer):
    unread_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    user_uid     = serializers.CharField(source="user.user_uid", read_only=True)
    email        = serializers.EmailField(source="user.email", read_only=True)
    name         = serializers.SerializerMethodField()
    # Human-facing affiliate reference for the admin inbox. Null for player
    # sessions, so the UI can render the row's identity from one field rather
    # than branching on participant_type in two places.
    affiliate_id = serializers.SerializerMethodField()

    class Meta:
        model = SupportTicket
        fields = [
            "id", "participant_type", "user_uid", "email", "name", "affiliate_id",
            "status", "created_at", "updated_at", "unread_count", "last_message",
        ]
        read_only_fields = fields

    def get_name(self, obj):
        return getattr(obj.user, "name", "") or ""

    def get_affiliate_id(self, obj):
        """AFF-<user_uid> for affiliate sessions only.

        Derived from the user rather than stored, because AffiliateProfile has
        no separate public identifier of its own — user_uid is already the
        stable per-account reference shown everywhere else in the panel.
        """
        if obj.participant_type != PARTICIPANT_AFFILIATE:
            return None
        uid = getattr(obj.user, "user_uid", None)
        return f"AFF-{uid}" if uid else None

    def get_unread_count(self, obj):
        # Admin list view: how many unread *user* messages this session has.
        return obj.chat_messages.filter(sender_type="user", is_read=False).count()

    def get_last_message(self, obj):
        last = obj.chat_messages.order_by("-created_at").first()
        return ChatMessageSerializer(last).data if last else None
