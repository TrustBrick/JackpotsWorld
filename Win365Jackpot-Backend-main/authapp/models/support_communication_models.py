"""
authapp/models/support_communication_models.py
─────────────────────────────────────────────────────────────────────────────
Three additions layered on top of the existing live-chat + WebRTC voice call
stack (support_ticket_models.py, call_models.py). Nothing here replaces or
migrates any of that; every model below is additive and every existing call
and chat flow behaves identically when none of these rows exist.

  SupportDepartment            — a named routing target (Payments, KYC, VIP …)
                                 with its own agent roster. Forwarding needs
                                 somewhere to forward *to*, and AdminProfile
                                 already has a free-text `department` column
                                 that cannot be a routing target: it is typed
                                 per staff row, so "Payments"/"payments"/
                                 "Payment" are three departments. This is the
                                 managed list, and `AdminProfile.department`
                                 stays exactly what it was (an HR label).

  CallTransfer                 — one row per forward/escalation attempt on a
                                 CallSession, including the ones that were
                                 declined or timed out. A transfer that failed
                                 is precisely what a manager needs to see, so
                                 it is a row, not a deleted row.

  CallHoldEvent                — one row per hold and per resume. Paired by
                                 `resumed_at` on the hold row rather than two
                                 unrelated rows, so hold duration is a column
                                 and not a query.

  PlayerCommunicationRestriction — per-player chat/call access, with an expiry,
                                 an admin-visible reason and a player-safe
                                 message. This is the "your issue will be
                                 answered within 24 hours, please stop calling"
                                 control.

WHY HOLD AND TRANSFER ARE REAL HERE, NOT DECORATIVE
───────────────────────────────────────────────────
Media in this app is peer-to-peer (see call_models.py) — Django Channels
carries signaling only and no audio ever traverses the server. That rules out
server-side mixing, and therefore rules out server-injected hold music. What
it does NOT rule out, and what is implemented:

  • HOLD genuinely stops audio. The holding agent disables their outbound
    audio track and mutes the inbound one; the held party's own browser plays
    the configured hold audio locally. Nothing is faked: both directions
    really do go silent, the held party really does hear the hold track, and
    the state is authoritative on the server (CallSession.is_on_hold), so both
    ends and the Back Office agree.

  • TRANSFER genuinely moves the call. `CallSession.receiver` is reassigned in
    the same conditional UPDATE that completes the transfer, which drops the
    old agent out of the per-call signaling group and lets the new one in, and
    the two endpoints renegotiate. The customer keeps one CallSession — same
    row, same ticket, same recording, continuous duration — which is what
    "maintain call context" means.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone


# ── Departments ─────────────────────────────────────────────────────────────
class SupportDepartment(models.Model):
    """A routing target for call forwarding and escalation."""

    name = models.CharField(max_length=80, unique=True)
    # Stable identifier used by the API and remembered by clients; the name is
    # free to be renamed for display without breaking anything pointing at it.
    slug = models.SlugField(max_length=80, unique=True)
    description = models.CharField(max_length=255, blank=True)

    # Agents who receive forwards for this department. Deliberately a real M2M
    # rather than matching on AdminProfile.department's free text — see the
    # module docstring. A department with no members is still valid (it just
    # cannot be forwarded to, and the API says so rather than ringing nobody).
    agents = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="support_departments",
    )

    # How long a forwarded call rings this department before it is treated as
    # unanswered. 0 falls back to the call ring timeout, so a department only
    # needs its own value when it genuinely wants a different one.
    ring_timeout_seconds = models.PositiveIntegerField(default=0)

    is_active = models.BooleanField(default=True, db_index=True)
    order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


# ── Call transfer / forwarding ──────────────────────────────────────────────
TRANSFER_REQUESTED = "requested"
TRANSFER_RINGING = "ringing"
TRANSFER_ACCEPTED = "accepted"
TRANSFER_DECLINED = "declined"
TRANSFER_CANCELLED = "cancelled"
TRANSFER_TIMEOUT = "timeout"
TRANSFER_FAILED = "failed"

TRANSFER_STATUS_CHOICES = [
    (TRANSFER_REQUESTED, "Requested"),
    (TRANSFER_RINGING, "Ringing"),
    (TRANSFER_ACCEPTED, "Accepted"),
    (TRANSFER_DECLINED, "Declined"),
    (TRANSFER_CANCELLED, "Cancelled"),
    (TRANSFER_TIMEOUT, "Timed out"),
    (TRANSFER_FAILED, "Failed"),
]

# A transfer in one of these states is still competing for the call and holds
# the call's single pending-transfer slot.
TRANSFER_PENDING_STATUSES = (TRANSFER_REQUESTED, TRANSFER_RINGING)


class CallTransfer(models.Model):
    """One forward/escalation attempt on a call.

    `to_agent` and `to_department` are both optional and mean different
    things:
      • to_agent set        — a warm handoff to one named person.
      • to_department set   — offered to every active agent in that
                              department; whoever accepts first claims it,
                              which is the same first-to-accept race
                              accept_call() already resolves for inbound
                              calls, resolved the same way (a conditional
                              UPDATE, not a read-then-write).
    At least one is always set; the service layer enforces it, and
    `accepted_by` records who actually took it, which for a department
    transfer is the only place that answer exists.
    """

    call = models.ForeignKey(
        "authapp.CallSession", on_delete=models.CASCADE, related_name="transfers",
    )
    from_agent = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name="call_transfers_initiated",
    )
    to_agent = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="call_transfers_received",
    )
    to_department = models.ForeignKey(
        SupportDepartment, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="call_transfers",
    )
    # Who actually answered. Differs from `to_agent` for a department transfer,
    # and is NULL for every transfer that was never accepted.
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="call_transfers_accepted",
    )

    status = models.CharField(
        max_length=12, choices=TRANSFER_STATUS_CHOICES, default=TRANSFER_REQUESTED, db_index=True,
    )
    # Agent-supplied context carried to whoever picks up — "customer needs a
    # withdrawal reversal, KYC already verified". Internal only; never sent to
    # the customer.
    reason = models.CharField(max_length=255, blank=True)
    note = models.TextField(blank=True)

    ring_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    # Mirrors CallSession.active_key: holds the call id while this transfer is
    # pending and NULL once it is resolved, under a unique constraint. Every
    # backend treats NULLs in a unique index as distinct, so this is a
    # database-level guarantee of at most ONE pending transfer per call that
    # survives two agents pressing Forward at the same instant — rather than a
    # check-then-insert both of them pass.
    pending_key = models.PositiveBigIntegerField(null=True, blank=True, default=None)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["call", "status"]),
            models.Index(fields=["to_department", "status"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["pending_key"], name="uniq_call_transfer_pending"),
        ]

    def __str__(self):
        target = self.to_agent_id or (self.to_department.name if self.to_department else "?")
        return f"Transfer call={self.call_id} -> {target} ({self.status})"

    @property
    def is_pending(self):
        return self.status in TRANSFER_PENDING_STATUSES


# ── Hold ────────────────────────────────────────────────────────────────────
class CallHoldEvent(models.Model):
    """One hold period. `resumed_at` is NULL while the call is still held.

    Stored as one row per period rather than two rows (a "hold" and an
    "unhold") because the question anyone actually asks is "how long was this
    customer left waiting", and that is a subtraction on one row instead of a
    pairing problem across two.
    """

    call = models.ForeignKey(
        "authapp.CallSession", on_delete=models.CASCADE, related_name="hold_events",
    )
    held_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+",
    )
    resumed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )

    held_at = models.DateTimeField(default=timezone.now, db_index=True)
    resumed_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)

    # "manual" for an agent pressing Hold, "transfer" for the automatic hold a
    # forward puts the customer on while the target is ringing. Distinguishing
    # them is what stops a transfer wait being read as an agent leaving
    # somebody hanging.
    REASON_MANUAL = "manual"
    REASON_TRANSFER = "transfer"
    REASON_CHOICES = [(REASON_MANUAL, "Manual"), (REASON_TRANSFER, "Transfer")]
    reason = models.CharField(max_length=12, choices=REASON_CHOICES, default=REASON_MANUAL)

    # True when the hold ended because the server hit the configured maximum
    # rather than because the agent came back.
    auto_resumed = models.BooleanField(default=False)

    class Meta:
        ordering = ["-held_at"]
        indexes = [models.Index(fields=["call", "held_at"])]

    def __str__(self):
        return f"Hold call={self.call_id} {self.duration_seconds}s"


# ── Per-player communication restrictions ───────────────────────────────────
CHANNEL_CHAT = "chat"
CHANNEL_CALL = "call"
CHANNEL_CHOICES = [(CHANNEL_CHAT, "Chat"), (CHANNEL_CALL, "Calls")]


class PlayerCommunicationRestriction(models.Model):
    """Chat and/or call access for ONE user.

    One row per (user, channel), enforced by unique_together, so "is this
    player allowed to call?" is a single indexed lookup and there is never a
    pair of contradictory rows to reconcile.

    EXPIRY IS EVALUATED ON READ, not by a scheduled job. `is_currently_active`
    below is the single place that decides, and every gate calls it — so a
    restriction that expired thirty seconds ago is already lifted the next
    time the player tries, with no cron to fall behind. A management command
    can tidy expired rows for reporting, but nothing depends on it having run.

    `admin_note` is never serialised to a player. `player_message` is the only
    field a player can see, and if an admin leaves it blank the API falls back
    to the configured default message rather than exposing the internal
    reason.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="communication_restrictions",
    )
    channel = models.CharField(max_length=8, choices=CHANNEL_CHOICES, db_index=True)

    # False = the channel is blocked. Modelled as "is_enabled" rather than
    # "is_blocked" so the Back Office toggle reads the same way round as the
    # question ("Chat: enabled/disabled") and nobody has to invert it mentally.
    is_enabled = models.BooleanField(default=True)

    # NULL = indefinite. A time in the past = already lifted (see
    # is_currently_active), which is why nothing needs to sweep this table.
    disabled_until = models.DateTimeField(null=True, blank=True, db_index=True)

    reason = models.CharField(max_length=255, blank=True)
    admin_note = models.TextField(blank=True)
    # Shown to the player instead of the reason. Blank falls back to the
    # configured default.
    player_message = models.CharField(max_length=300, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )

    class Meta:
        unique_together = ("user", "channel")
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["user", "channel", "is_enabled"])]

    def __str__(self):
        state = "enabled" if self.is_currently_active is False else "disabled"
        return f"{self.user_id} {self.channel}: {state}"

    @property
    def is_currently_active(self):
        """True when this row is actually blocking right now."""
        if self.is_enabled:
            return False
        if self.disabled_until is None:
            return True
        return timezone.now() < self.disabled_until


class PlayerCommunicationRestrictionLog(models.Model):
    """Append-only history of every change to a player's restrictions.

    The restriction row itself is mutable (an admin toggles it back and
    forth); this is what makes "view history" answerable, and it is the record
    that survives the restriction being deleted.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="communication_restriction_logs",
    )
    channel = models.CharField(max_length=8, choices=CHANNEL_CHOICES, db_index=True)
    is_enabled = models.BooleanField()
    disabled_until = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=255, blank=True)
    admin_note = models.TextField(blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self):
        return f"{self.user_id} {self.channel} -> {'enabled' if self.is_enabled else 'disabled'}"
