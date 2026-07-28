from django.db import models
from django.conf import settings

TICKET_STATUS_CHOICES = [
    ("open",        "Open"),
    ("in_progress", "In Progress"),
    ("resolved",    "Resolved"),
    ("closed",      "Closed"),
]


class SupportTicket(models.Model):
    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="support_tickets",
    )
    subject     = models.CharField(max_length=200)
    message     = models.TextField()
    attachment  = models.FileField(upload_to="support/attachments/", null=True, blank=True)
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

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "status"])]

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
    message     = models.TextField()
    is_read     = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["ticket", "created_at"])]

    def __str__(self):
        return f"{self.sender_type} — ticket #{self.ticket_id} @ {self.created_at:%Y-%m-%d %H:%M}"
