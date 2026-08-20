"""
authapp/models/call_models.py
─────────────────────────────────────────────────────────────────────────────
VOICE-CALL: in-app WebRTC voice calling between a customer and a support
agent, layered on top of the existing Live Support Chat. Safe to delete this
module plus its import block in models/__init__.py, voice_call_service.py,
voice_call_views.py, voice_call_urls.py and the call_* handlers in
consumers/live_chat_consumer.py to remove the feature entirely.

Nothing here is a new identity or conversation store. A call always hangs off
an existing SupportTicket(is_live_chat=True) — the same row the chat thread
already uses — and both participants are ordinary User rows. There is no
separate customer table, no separate agent table, and no second ticket system.

WHO MAY ANSWER
──────────────
This project has never had per-ticket agent assignment: every staff user can
already read and reply to every live-chat session
(AdminLiveChatMessageListCreateView is gated on IsAdminOrSuperAdmin alone, with
no assignment filter). So "the authorized agent" here means exactly what it
means for chat today — any on-duty staff member — and a call rings to the same
`livechat_admins` group that already receives new-message notifications.

The first agent to accept *claims* the call: `receiver` is set in the same
atomic UPDATE that moves the row out of `ringing`, so a second agent hitting
accept loses the race and gets a 409. After that point no other agent can join
the call's signaling group. `receiver` is therefore nullable by design — a
ringing call genuinely has no receiver yet, and modelling it as NOT NULL would
mean inventing an assignment concept the rest of the app does not have.

DUPLICATE PREVENTION
────────────────────
`active_key` holds the ticket id while the call is in a live state and NULL
once it reaches a terminal one, under a unique constraint. MySQL has no partial
indexes, but it does treat NULLs as distinct in a unique index — the same
technique ChatMessage.client_message_id already relies on. The result is a
database-level guarantee of at most one live call per ticket that survives
concurrent requests, rather than a check-then-insert two racing clients can
both pass.

NO RECORDING
────────────
Only metadata is stored: who called, who answered, which ticket, timestamps,
duration, status and end reason. No audio ever reaches the server — media is
peer-to-peer (or relayed by TURN, which this application does not read) and
Django Channels carries signaling only.
"""
from django.conf import settings
from django.db import models

# ── Status vocabulary ───────────────────────────────────────────────────────
# The live states are the ones that hold `active_key`; the terminal states
# release it. Keeping the two lists next to the choices means the state
# machine in voice_call_service can never disagree with the DB constraint.
STATUS_RINGING = "ringing"
STATUS_ACCEPTED = "accepted"
STATUS_CONNECTED = "connected"
STATUS_REJECTED = "rejected"
STATUS_ENDED = "ended"
STATUS_MISSED = "missed"
STATUS_FAILED = "failed"
STATUS_CANCELLED = "cancelled"

CALL_STATUS_CHOICES = [
    (STATUS_RINGING,   "Ringing"),
    (STATUS_ACCEPTED,  "Accepted"),
    (STATUS_CONNECTED, "Connected"),
    (STATUS_REJECTED,  "Rejected"),
    (STATUS_ENDED,     "Ended"),
    (STATUS_MISSED,    "Missed"),
    (STATUS_FAILED,    "Failed"),
    (STATUS_CANCELLED, "Cancelled"),
]

# A call in one of these states occupies its ticket's single active slot.
ACTIVE_STATUSES = (STATUS_RINGING, STATUS_ACCEPTED, STATUS_CONNECTED)
TERMINAL_STATUSES = (
    STATUS_REJECTED, STATUS_ENDED, STATUS_MISSED, STATUS_FAILED, STATUS_CANCELLED,
)

# ── End reasons ─────────────────────────────────────────────────────────────
END_CALLER_ENDED = "caller_ended"
END_RECEIVER_ENDED = "receiver_ended"
END_REJECTED = "rejected"
END_TIMEOUT = "timeout"
END_CONNECTION_FAILED = "connection_failed"
END_PERMISSION_DENIED = "permission_denied"
END_NETWORK_FAILURE = "network_failure"

END_REASON_CHOICES = [
    (END_CALLER_ENDED,      "Caller ended"),
    (END_RECEIVER_ENDED,    "Receiver ended"),
    (END_REJECTED,          "Rejected"),
    (END_TIMEOUT,           "Timeout"),
    (END_CONNECTION_FAILED, "Connection failed"),
    (END_PERMISSION_DENIED, "Permission denied"),
    (END_NETWORK_FAILURE,   "Network failure"),
]

# ── Audit event types ───────────────────────────────────────────────────────
EVENT_INITIATED = "initiated"
EVENT_RINGING = "ringing"
EVENT_ACCEPTED = "accepted"
EVENT_REJECTED = "rejected"
EVENT_CONNECTED = "connected"
EVENT_MUTE = "mute"
EVENT_UNMUTE = "unmute"
EVENT_ENDED = "ended"
EVENT_FAILED = "failed"
EVENT_TIMEOUT = "timeout"

CALL_EVENT_CHOICES = [
    (EVENT_INITIATED, "Initiated"),
    (EVENT_RINGING,   "Ringing"),
    (EVENT_ACCEPTED,  "Accepted"),
    (EVENT_REJECTED,  "Rejected"),
    (EVENT_CONNECTED, "Connected"),
    (EVENT_MUTE,      "Mute"),
    (EVENT_UNMUTE,    "Unmute"),
    (EVENT_ENDED,     "Ended"),
    (EVENT_FAILED,    "Failed"),
    (EVENT_TIMEOUT,   "Timeout"),
]


class CallSession(models.Model):
    ticket = models.ForeignKey(
        "authapp.SupportTicket", on_delete=models.CASCADE, related_name="call_sessions",
    )
    caller = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="outgoing_calls",
    )
    # NULL until an agent claims the call — see the module docstring.
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="incoming_calls",
    )

    status = models.CharField(
        max_length=12, choices=CALL_STATUS_CHOICES, default=STATUS_RINGING, db_index=True,
    )
    end_reason = models.CharField(
        max_length=20, choices=END_REASON_CHOICES, blank=True, default="",
    )

    started_at = models.DateTimeField(auto_now_add=True)
    # When the ring window lapses. Stored rather than derived so the backend
    # can decide "is this call expired?" from the row alone, without trusting
    # a browser timer that a closed tab would simply never fire.
    ring_expires_at = models.DateTimeField(db_index=True)
    connected_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    # Wall-clock seconds of actual conversation (connected_at → ended_at), so
    # a 30-second unanswered ring records 0 rather than 30.
    duration_seconds = models.PositiveIntegerField(default=0)

    # Duplicate guard — see the module docstring. Never set from client input.
    active_key = models.PositiveBigIntegerField(null=True, blank=True, default=None)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["ticket", "-created_at"]),
            models.Index(fields=["caller", "-created_at"]),
            models.Index(fields=["receiver", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["active_key"], name="uniq_callsession_active_per_ticket",
            ),
        ]

    def __str__(self):
        return f"call #{self.pk} · ticket #{self.ticket_id} · {self.status}"

    @property
    def is_active(self):
        return self.status in ACTIVE_STATUSES

    def is_participant(self, user):
        """May this user *see and act on* this call through the REST layer?

        Staff qualify for any call, which is not a new privilege: every staff
        member can already read and reply to every live-chat conversation
        (AdminLiveChatMessageListCreateView is gated on IsAdminOrSuperAdmin
        alone). Anything narrower here would also make an agent's second
        Accept on an already-claimed call return 404 instead of the 409 that
        actually describes what happened.

        This is deliberately *not* the test that guards WebRTC signaling. That
        one is voice_call_service.load_call_for_endpoint, which admits only the
        two confirmed endpoints of a live call — an agent who has not accepted
        can see a ringing call in order to answer it, but must never be able to
        inject SDP into someone else's negotiation.
        """
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        if user.id == self.caller_id:
            return True
        if self.receiver_id is not None and user.id == self.receiver_id:
            return True
        return bool(getattr(user, "is_staff", False))


class CallEvent(models.Model):
    """Append-only lifecycle log for one call.

    Deliberately separate from ActivityLog: that model is the *user-account*
    audit trail (logins, profile changes, admin actions on a user) and is
    surfaced in the admin Logs tab and the player's own activity feed. Call
    signaling produces several rows per call, including mute toggles, which
    would drown both of those views in traffic that belongs to a single
    support interaction. This table is read only by the call-history views.
    """
    call = models.ForeignKey(CallSession, on_delete=models.CASCADE, related_name="events")
    event = models.CharField(max_length=12, choices=CALL_EVENT_CHOICES, db_index=True)
    # NULL for server-generated events such as the timeout sweep.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    # Small, non-sensitive context only (previous status, failure category).
    # Never SDP, ICE candidates, tokens or TURN credentials.
    detail = models.CharField(max_length=120, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["call", "created_at"])]

    def __str__(self):
        return f"{self.event} · call #{self.call_id}"
