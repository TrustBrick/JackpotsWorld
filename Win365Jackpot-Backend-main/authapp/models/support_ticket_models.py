from django.db import models
from django.conf import settings

from authapp.storage_backends import get_private_storage

TICKET_STATUS_CHOICES = [
    ("open",        "Open"),
    ("in_progress", "In Progress"),
    ("resolved",    "Resolved"),
    ("closed",      "Closed"),
]

# LIVE-CHAT ROUTING: which portal a live-chat session belongs to. An affiliate
# is the *same* User row as a player (AffiliateProfile is a OneToOne on top of
# it), so the user FK alone cannot say which of the two the person was using
# when they opened the chat — and the same human legitimately has both. This
# is what keeps a player conversation and an affiliate conversation separate
# instead of silently reusing each other's thread.
PARTICIPANT_PLAYER = "player"
PARTICIPANT_AFFILIATE = "affiliate"
PARTICIPANT_TYPE_CHOICES = [
    (PARTICIPANT_PLAYER,    "Player"),
    (PARTICIPANT_AFFILIATE, "Affiliate"),
]


class SupportTicket(models.Model):
    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="support_tickets",
    )
    subject     = models.CharField(max_length=200)
    message     = models.TextField()
    # storage=get_private_storage: a user's own support submission, not
    # marketing content — kept off the public bucket policy like KYC docs.
    attachment  = models.FileField(upload_to="support/attachments/", max_length=255, storage=get_private_storage, null=True, blank=True)
    status      = models.CharField(max_length=15, choices=TICKET_STATUS_CHOICES, default="open", db_index=True)
    admin_reply = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    # MULTILINGUAL-CHAT: added fields, all nullable/defaulted — existing rows
    # and the existing create/update API contract are unaffected. `message`
    # and `admin_reply` above remain the source of truth (original customer
    # text, and the agent's always-English reply); these only add the
    # translated counterparts alongside them, never overwriting either.
    preferred_language     = models.CharField(max_length=8, default="en")
    message_translated     = models.TextField(null=True, blank=True)
    admin_reply_translated = models.TextField(null=True, blank=True)
    translated_at          = models.DateTimeField(null=True, blank=True)

    # LIVE-CHAT: marks a ticket created via the real-time chat widget rather
    # than the ticket form — default False, so every existing row and the
    # existing ticket-form API contract are unaffected. Lets the "Support
    # Tickets" admin tab and the new "Live Support" tab each filter to what
    # they care about while sharing the same underlying model/status machine.
    is_live_chat = models.BooleanField(default=False, db_index=True)

    # LIVE-CHAT ROUTING: see PARTICIPANT_TYPE_CHOICES above. Defaults to
    # "player", so every pre-existing row (and every async ticket-form ticket,
    # which ignores this field entirely) keeps its current meaning.
    participant_type = models.CharField(
        max_length=10, choices=PARTICIPANT_TYPE_CHOICES,
        default=PARTICIPANT_PLAYER, db_index=True,
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            # Backs the one-active-session-per-(user, portal) lookup in
            # live_chat_service.get_or_create_active_session.
            models.Index(fields=["is_live_chat", "participant_type", "status"]),
        ]

    def __str__(self):
        return f"{self.user} — {self.subject} ({self.status})"


# LIVE-CHAT: message thread for a live-chat SupportTicket. Async ticket
# replies keep using SupportTicket.admin_reply (unchanged); this is only
# used for is_live_chat=True sessions.
class ChatMessage(models.Model):
    SENDER_CHOICES = [
        ("user",  "User"),
        ("admin", "Admin"),
    ]

    ticket      = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name="chat_messages")
    sender_type = models.CharField(max_length=5, choices=SENDER_CHOICES)
    sender      = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    message     = models.TextField(blank=True)

    # An attached document, on the same private storage SupportTicket.attachment
    # already uses: files land under the bucket's `private/` prefix, which the
    # bucket policy does not expose anonymously, and FieldFile.url hands back a
    # presigned link that expires. A support attachment is a customer's ID scan
    # or bank statement as often as not, so it must never be a stable public
    # URL the way marketing media is.
    #
    # `message` becomes blank-able above because an attachment on its own is a
    # complete message -- the caller sends a file with no covering note. The
    # view still refuses a message that is empty *and* has no attachment.
    attachment      = models.FileField(
        upload_to="support/chat/", max_length=255, storage=get_private_storage,
        null=True, blank=True,
    )
    # The name the customer's file had. Storage mangles the stored key on
    # collision (Django appends a random suffix), so without this the agent
    # sees `passport_a8Kd2P.pdf` instead of what was actually sent.
    attachment_name = models.CharField(max_length=255, blank=True)

    is_read     = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)

    # Idempotency key generated by the sender. The chat clients retry a send
    # once when the response doesn't come back OK, and a request that actually
    # succeeded but whose response was lost would otherwise be written twice;
    # the retry carries the same key, so the second write is recognised as the
    # same message instead of duplicating it.
    #
    # NULL (not "") for absent, deliberately: MySQL has no partial indexes, but
    # it does treat NULLs as distinct in a unique index — so legacy rows and
    # any client that doesn't send a key coexist under the constraint below,
    # while real keys stay unique per ticket.
    client_message_id = models.CharField(max_length=64, null=True, blank=True, default=None)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["ticket", "created_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["ticket", "client_message_id"],
                name="uniq_chatmessage_ticket_client_id",
            ),
        ]

    def __str__(self):
        return f"{self.sender_type} — ticket #{self.ticket_id} @ {self.created_at:%Y-%m-%d %H:%M}"
