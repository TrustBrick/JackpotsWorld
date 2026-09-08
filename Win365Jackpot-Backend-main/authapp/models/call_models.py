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

RECORDING
─────────
Live audio still never flows through this server: media is peer-to-peer (or
relayed by TURN, which this application does not read) and Django Channels
carries signaling only. What is stored is an *after the fact* recording — the
agent's browser mixes both sides and uploads the file once the call has ended,
because a peer-to-peer call has no other point where both halves of the audio
exist together.

That upload is opt-in per deployment (VOICE_CALL_RECORDING_ENABLED) and the
same flag puts a "this call is recorded" notice in front of the customer before
they speak, so the two can never disagree. The file itself never sits anywhere
publicly readable — see get_call_recording_storage — and is only ever served by
AdminCallRecordingView, which re-authorises every request.
"""
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from authapp.storage_backends import get_call_recording_storage

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

# ── Direction ───────────────────────────────────────────────────────────────
# Which way the call was placed. `caller` and `receiver` have always meant
# "who started it" and "who answered it" rather than "customer" and "agent" -
# the WebRTC engine already calls them initiator and acceptor - so a callback
# fits the existing model without inverting anything. What direction changes is
# *who gets rung*: inbound rings the support desk, outbound rings one player.
DIRECTION_INBOUND = "inbound"
DIRECTION_OUTBOUND = "outbound"

DIRECTION_CHOICES = [
    (DIRECTION_INBOUND,  "Player to support"),
    (DIRECTION_OUTBOUND, "Support callback"),
]


# ── End reasons ─────────────────────────────────────────────────────────────
END_CALLER_ENDED = "caller_ended"
END_RECEIVER_ENDED = "receiver_ended"
END_REJECTED = "rejected"
END_TIMEOUT = "timeout"
END_CONNECTION_FAILED = "connection_failed"
END_PERMISSION_DENIED = "permission_denied"
END_NETWORK_FAILURE = "network_failure"
# The support desk was unstaffed when the player called. Distinct from
# `timeout`, which means agents were rung and nobody picked up - a manager
# reading history needs to tell "we were closed" from "we ignored it".
END_NO_AGENTS = "no_agents"

END_REASON_CHOICES = [
    (END_CALLER_ENDED,      "Caller ended"),
    (END_RECEIVER_ENDED,    "Receiver ended"),
    (END_REJECTED,          "Rejected"),
    (END_TIMEOUT,           "Timeout"),
    (END_CONNECTION_FAILED, "Connection failed"),
    (END_PERMISSION_DENIED, "Permission denied"),
    (END_NETWORK_FAILURE,   "Network failure"),
    (END_NO_AGENTS,         "No agents available"),
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
EVENT_RECORDED = "recorded"
# Hold and forwarding. Added to the same audit stream the existing transitions
# already write to, rather than a parallel one, so a call's history reads as a
# single ordered sequence — "accepted, connected, held, forwarded, resumed,
# ended" — instead of two tables an operator has to interleave by hand.
# CallHoldEvent/CallTransfer carry the detail (durations, targets, reasons);
# these are the timeline entries pointing at them.
EVENT_HOLD = "hold"
EVENT_RESUME = "resume"
EVENT_TRANSFER = "transfer"
EVENT_TRANSFERRED = "transferred"

CALL_EVENT_CHOICES = [
    (EVENT_INITIATED, "Initiated"),
    (EVENT_RINGING,   "Ringing"),
    (EVENT_ACCEPTED,  "Accepted"),
    (EVENT_REJECTED,  "Rejected"),
    (EVENT_CONNECTED, "Connected"),
    (EVENT_MUTE,      "Mute"),
    (EVENT_UNMUTE,    "Unmute"),
    (EVENT_HOLD,      "Hold"),
    (EVENT_RESUME,    "Resume"),
    (EVENT_TRANSFER,  "Transfer requested"),
    (EVENT_TRANSFERRED, "Transferred"),
    (EVENT_ENDED,     "Ended"),
    (EVENT_FAILED,    "Failed"),
    (EVENT_TIMEOUT,   "Timeout"),
    (EVENT_RECORDED,  "Recorded"),
]


def call_recording_path(instance, filename):
    """Where a call recording lands *within* its storage root.

    Relative to that root only: the "call-recordings" segment lives on the
    backend itself (a dedicated directory locally, a bucket prefix on S3 — see
    get_call_recording_storage), so it is not repeated here.

    Foldered by month so a listing stays navigable once there are thousands,
    and named from the call's own primary key rather than anything the
    uploading browser supplied — the client picks the container format, never
    the path. The extension is taken from the recorded mime type via
    RECORDING_EXTENSIONS, so an agent's browser cannot smuggle a filename
    through `filename` at all.
    """
    ext = (filename or "").rsplit(".", 1)[-1].lower()
    if ext not in RECORDING_EXTENSIONS:
        ext = "webm"
    stamp = instance.started_at or timezone.now()
    return f"{stamp:%Y/%m}/call-{instance.pk}.{ext}"


# Container formats a browser may hand us. Chrome/Edge/Firefox record
# WebM/Opus; Safari records MP4/AAC. Anything else is rejected rather than
# stored under a guessed extension.
RECORDING_EXTENSIONS = {"webm", "ogg", "mp4", "m4a"}
RECORDING_CONTENT_TYPES = {
    "audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/aac",
    # MediaRecorder reports the full codec string on some builds.
    "video/webm",
}


class VoiceCallSettings(models.Model):
    """Singleton (pk=1) holding the switches an operator flips day to day.

    Same shape as SupportSettings/LandingSettings, and the same two-level
    arrangement: `settings.VOICE_CALL_RECORDING_ENABLED` (env) is the hard
    master switch and this row is the day-to-day one. A deployment that must
    not record at all — a jurisdiction requiring explicit consent, say — sets
    the env var False and no Back Office button can override it. Where the env
    var permits recording, this row decides.

    The default is True so that adding the switch changed nothing about how a
    deployment already behaves; turning it off is a deliberate act, and one
    worth attributing, hence updated_by.

    Read on every config request rather than cached: the whole point is that
    flipping it takes effect on the next call, and the alternative — a stale
    cache — means the agent's recorder and the customer's notice can disagree,
    which is the one thing this feature must never do.
    """
    recording_enabled = models.BooleanField(default=True)

    # ── Live Support settings ───────────────────────────────────────────────
    # Everything below is new. It lives on THIS row, not on a second
    # "LiveSupportSettings" singleton, because a second one would mean two
    # places to look for "is calling on?" and two rows that can disagree. The
    # model keeps its historical name (renaming it would rewrite a table and
    # every import for no behavioural gain) and its verbose name now says what
    # it actually is.
    #
    # Every default below reproduces the behaviour that existed before these
    # columns did: chat and calls on, hold and forwarding on, messages at the
    # wording already shown. Adding the settings changed nothing until an
    # admin changes something.

    # Master availability switches. These are platform-wide; the per-player
    # controls are PlayerCommunicationRestriction (a different question).
    chat_enabled = models.BooleanField(default=True)
    calls_enabled = models.BooleanField(default=True)

    # Working hours, in the project timezone. Both blank = always open, which
    # is what the desk did before this existed.
    working_hours_start = models.TimeField(null=True, blank=True)
    working_hours_end = models.TimeField(null=True, blank=True)
    # Hard "we are closed today" override that does not require editing hours.
    holiday_mode = models.BooleanField(default=False)

    # Ring timeout in seconds. 0 defers to settings.VOICE_CALL_RING_TIMEOUT_SECONDS,
    # so an unset value keeps the deployment's existing behaviour rather than
    # imposing a new one.
    ring_timeout_seconds = models.PositiveIntegerField(default=0)

    # ── Hold ────────────────────────────────────────────────────────────────
    hold_enabled = models.BooleanField(default=True)
    # The audio the held party hears, played by their own browser (there is no
    # media server to inject it — see the module docstring). Uploaded by an
    # admin, so the rights question is answered by whoever uploads it; nothing
    # ships a copyrighted track and no default file is bundled. With this
    # blank, clients fall back to a generated periodic comfort tone — a plain
    # sine burst synthesised in the browser via WebAudio, which is not a
    # recording and carries no rights at all.
    hold_audio = models.FileField(
        upload_to="support/hold_audio/", max_length=255, null=True, blank=True,
    )
    hold_message = models.CharField(
        max_length=300,
        default="Please hold — your support agent will be back with you shortly.",
    )
    # Seconds. 0 = no limit. When set, the server resumes the call by itself
    # so a customer is never left on a silent hold because an agent walked
    # away; the resume is recorded with auto_resumed=True. The limit is
    # enforced by the `sweep_expired_calls` command (every minute, see
    # .ebextensions/02_cron.config) — a hold has no lazy read path that could
    # expire it, so with no scheduler this value would mean nothing.
    #
    # 120s: long enough for an agent to genuinely check something on the
    # customer's behalf, short enough that a crashed agent tab does not leave
    # someone listening to hold audio. It shipped as 0, which read as "no
    # limit configured" rather than as anyone's decision.
    max_hold_seconds = models.PositiveIntegerField(default=120)

    # ── Forwarding / escalation ─────────────────────────────────────────────
    forwarding_enabled = models.BooleanField(default=True)
    # How long a forward rings its target before it is marked timed out and
    # the call returns to the original agent. 0 defers to the call ring
    # timeout above.
    transfer_ring_timeout_seconds = models.PositiveIntegerField(default=0)

    # ── Player-facing messages ──────────────────────────────────────────────
    # Every string a player can be shown when support is unavailable. Held
    # here so wording changes are a Back Office edit, never a deploy.
    offline_message = models.CharField(
        max_length=300,
        default="Support is currently offline. Leave a message and our team will reply as soon as we are back.",
    )
    queue_message = models.CharField(
        max_length=300,
        default="All our agents are busy right now. You are in the queue and will be connected shortly.",
    )
    chat_disabled_message = models.CharField(
        max_length=300,
        default="Support chat is temporarily unavailable for your account. Please check back later.",
    )
    call_disabled_message = models.CharField(
        max_length=300,
        default="Support calls are temporarily unavailable for your account. Please check back later.",
    )
    call_unavailable_message = models.CharField(
        max_length=300,
        default="Voice calling is not available right now. Please continue on chat and we will help you there.",
    )

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+",
    )

    class Meta:
        verbose_name = "Live support settings"
        verbose_name_plural = "Live support settings"

    def __str__(self):
        return "Voice Call Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


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
    # Defaults to inbound so every existing row keeps its meaning without a
    # data migration: until callbacks existed, every call was player-to-support.
    direction = models.CharField(
        max_length=10, choices=DIRECTION_CHOICES, default=DIRECTION_INBOUND, db_index=True,
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

    # ── Recording ───────────────────────────────────────────────────────────
    # The audio of the conversation, mixed and uploaded by the agent's browser
    # once the call ends (there is no media server in the path — the call is
    # peer-to-peer, so the only place both sides of the audio exist together is
    # in a participant's browser).
    #
    # Private storage, deliberately: this is a recording of a customer, in the
    # same class as a KYC document. On S3 that means presigned URLs rather than
    # public ones, and with S3 unconfigured it means a directory outside
    # MEDIA_ROOT — because MEDIA_ROOT is served publicly with no permission
    # check and these filenames are sequential. Either way the bytes are only
    # ever handed out by AdminCallRecordingView, which re-checks entitlement per
    # request rather than trusting whoever holds a link.
    recording = models.FileField(
        upload_to=call_recording_path, storage=get_call_recording_storage,
        null=True, blank=True, max_length=255,
    )
    recording_bytes = models.PositiveIntegerField(default=0)
    recording_uploaded_at = models.DateTimeField(null=True, blank=True)

    # Duplicate guard — see the module docstring. Never set from client input.
    active_key = models.PositiveBigIntegerField(null=True, blank=True, default=None)

    # ── Hold / transfer ─────────────────────────────────────────────────────
    # HOLD AND TRANSFER ARE NOT STATUSES, deliberately. A held call is still
    # `connected` — the WebRTC session is up, the peers are still negotiated,
    # and only the audio tracks are disabled. Modelling hold as a status would
    # mean every `status == "connected"` check in the service, the consumer and
    # the frontend silently stopped matching a call that is very much still
    # connected, and the recorder would tear down mid-call.
    #
    # So they are orthogonal flags, and `display_status` below composes them
    # into the single word an operator wants to read ("On Hold", "Forwarding").
    # That keeps one vocabulary in the UI without a second state machine
    # underneath it.
    is_on_hold = models.BooleanField(default=False, db_index=True)
    hold_started_at = models.DateTimeField(null=True, blank=True)
    # Accumulated across every hold period, so a call held three times reports
    # the total the customer actually spent waiting. Maintained by
    # voice_call_service.resume_call() when each period closes.
    total_hold_seconds = models.PositiveIntegerField(default=0)

    # Set while a CallTransfer is pending. Denormalised (rather than derived
    # from the transfers relation) because it is read on every state broadcast,
    # and a related query per broadcast is a per-frame cost on the hot path.
    is_transferring = models.BooleanField(default=False)
    # How many times this call has been successfully forwarded. Lets history
    # show "escalated twice" without walking the transfer rows.
    transfer_count = models.PositiveSmallIntegerField(default=0)

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

    @property
    def display_status(self):
        """The single word an operator reads, composed from `status` plus the
        orthogonal hold/transfer flags above.

        This is the ONLY place the composition happens — the API serialises
        it, the Back Office renders it, and the customer widget shows it, so
        the three can never disagree about what "on hold" looks like. The
        underlying `status` column is untouched and still means exactly what it
        always did.
        """
        if self.status == STATUS_CONNECTED:
            # FORWARDING OUTRANKS HOLD, and the order matters: requesting a
            # transfer puts the customer on hold for the ring, so both flags
            # are set at once. "On hold" would then be technically true and
            # actively misleading — an agent watching the desk needs to know
            # the call is being handed over, not that someone is waiting. The
            # hold is a consequence of the forward, not the point of it.
            if self.is_transferring:
                return "forwarding"
            if self.is_on_hold:
                return "on_hold"
            # A live call that has been handed over is, right now, simply a
            # live call — the new agent needs "connected", not a label about
            # how it got to them. That it WAS escalated is what history cares
            # about, and that is the terminal branch below.
            return STATUS_CONNECTED
        if self.status in TERMINAL_STATUSES and self.transfer_count:
            # "Forwarded" is an outcome, not a state: this call ended on a
            # different agent than it started with. A manager reviewing the day
            # needs to see that at a glance rather than by opening the transfer
            # list on every row. `end_reason` still says HOW it ended, so
            # nothing is lost by labelling it this way.
            return "forwarded"
        # NOTE on "calling": it is a caller-side reading of `ringing`, not a
        # separate server state — one row cannot be two words at once, and the
        # difference is purely who is looking. The customer widget renders it
        # from its own PHASE.CALLING (components/support/ActiveCallModal.jsx),
        # which is the moment between placing the call and an agent accepting.
        # The desk sees the same row as "ringing", which is what it is to them.
        return self.status

    @property
    def live_hold_seconds(self):
        """total_hold_seconds plus the period currently open, if any — so a
        call that is on hold *right now* reports a hold time that grows."""
        total = self.total_hold_seconds
        if self.is_on_hold and self.hold_started_at:
            total += int((timezone.now() - self.hold_started_at).total_seconds())
        return total

    @property
    def has_recording(self):
        # `bool(FieldFile)` is False for an empty field without touching
        # storage — no network call to S3 just to render a history row.
        return bool(self.recording)

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


class SupportAgentPresence(models.Model):
    """One row per open admin-inbox WebSocket belonging to a call-eligible agent.

    "Available" means exactly what it already meant in practice - the agent has
    the Back Office open - but written down so the *server* can ask the
    question. Channel-layer groups cannot be enumerated or counted, so without
    this table a call to an empty support desk rings into nothing for the full
    ring timeout and the player is told only that it was "missed". With it,
    initiate_call can refuse immediately and say why.

    Keyed by channel_name, which Channels guarantees unique per connection:

      * two browser tabs are two rows, so closing one does not mark the agent
        offline;
      * connect INSERTs and disconnect DELETEs - never read-modify-write - so
        two connections racing cannot corrupt each other's state.

    Rows are removed on disconnect. A hard process crash can strand one, so
    readers ignore anything older than PRESENCE_MAX_AGE; a reconnect (which
    happens on every reload and every network blip) writes a fresh row, so in
    practice a genuinely-present agent is never treated as absent.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="support_presence",
    )
    channel_name = models.CharField(max_length=255, unique=True)
    connected_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["user", "-connected_at"])]
        verbose_name = "Support agent presence"
        verbose_name_plural = "Support agent presence"

    def __str__(self):
        return f"{self.user_id} @ {self.channel_name[:24]}"


# A stranded row (process killed without disconnect) must not make a desk look
# staffed forever. Long enough that a genuinely open panel is never missed.
PRESENCE_MAX_AGE = timedelta(hours=12)
