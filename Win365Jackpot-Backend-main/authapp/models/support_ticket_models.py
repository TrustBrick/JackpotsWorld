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

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "status"])]

    def __str__(self):
        return f"{self.user} — {self.subject} ({self.status})"
