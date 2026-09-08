"""
authapp/services/call_control_service.py
─────────────────────────────────────────────────────────────────────────────
HOLD / RESUME and FORWARD (transfer / escalation) for in-app support calls.

Layered on voice_call_service.py in exactly the way that module is layered on
live_chat_service.py — same _broadcast semantics, same "persist over REST,
push over Channels" split, same "authorize on every call, trust nothing that
arrived on an open socket" posture. Nothing here reimplements the call state
machine; it composes with it.

────────────────────────────────────────────────────────────────────────────
HOW HOLD IS REAL, NOT DECORATIVE
────────────────────────────────────────────────────────────────────────────
There is no media server in this architecture. Audio is peer-to-peer (or TURN
relayed, which this application never reads) and Django Channels carries
signaling only — see call_models.py. That rules out server-side mixing, and
therefore rules out the usual "inject hold music into the mixed stream"
implementation. What it does not rule out is a hold that genuinely stops audio,
and that is what is implemented:

  SERVER (here)  — CallSession.is_on_hold is the single authority. It is set
                   in a conditional UPDATE, recorded as a CallHoldEvent, and
                   pushed to BOTH endpoints and the agent desk. Neither browser
                   decides; both are told.

  AGENT BROWSER  — on `call_hold`, disables its outbound audio track
                   (sender.track.enabled = false) and mutes the inbound
                   element. Nothing of the agent's room reaches the customer.

  CUSTOMER BROWSER — on `call_hold`, mutes the inbound audio and plays the
                   configured hold audio locally, looping, until `call_resume`.

So on hold: the customer really cannot hear the agent, the agent really cannot
hear the customer, and the customer really does hear the hold track. The call
stays `connected` throughout — the peer connection is never torn down, the
recording is never interrupted, and resuming re-enables the tracks rather than
renegotiating.

WHY THE STATE LIVES ON THE SERVER AND NOT IN THE AGENT'S BROWSER: an agent
whose tab crashes mid-hold would otherwise leave a customer listening to hold
audio for ever with nothing able to tell them otherwise. Because the flag is a
column, the customer's next state push (or reconnect) corrects them, and
`max_hold_seconds` gives the server a way to end a hold nobody came back from.

────────────────────────────────────────────────────────────────────────────
HOW FORWARDING IS REAL
────────────────────────────────────────────────────────────────────────────
A transfer moves the SAME CallSession to a different agent. It does not create
a second call, and the customer is not asked to hang up and be called back —
"maintain call context" means the ticket, the history, the recording and the
elapsed duration all continue on one row.

  1. Agent A requests a transfer to an agent or a department. The call is put
     on hold (reason="transfer") so the customer is not left listening to
     silence, `is_transferring` is set, and a CallTransfer row is created. Its
     `pending_key` holds the call id under a unique constraint, so two agents
     pressing Forward at the same instant produce exactly one pending transfer
     — a database guarantee, not a check-then-insert both would pass.
  2. The target is rung over the channel layer: one agent's own group for a
     named transfer, the shared agent group for a department (the payload
     names the department so only its members render the card).
  3. The first eligible agent to accept wins, via the same conditional-UPDATE
     race accept_call() already uses for inbound calls. The agent's side of the
     call is reassigned in that same UPDATE — `receiver` on an inbound call,
     `caller` on a callback the agent placed (see agent_field).
  4. Reassigning the agent's side is what moves the call: the WebSocket
     consumer authorises signaling membership against caller/receiver on every
     frame, so agent A is dropped from the call's signaling group at that
     moment and agent B is admitted. Both endpoints are told to renegotiate,
     the customer comes off hold, and B is talking to them.
  5. A declined or timed-out transfer returns the call to agent A and takes the
     customer off hold. The failed attempt stays as a row, because "we tried to
     escalate this and nobody picked up" is exactly what a manager needs to see.

No telephony provider is involved and none is required: this is the app's own
WebRTC stack, which already exists and already carries real audio.
"""
import logging
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from authapp.models.call_models import (
    DIRECTION_OUTBOUND,
    EVENT_HOLD,
    EVENT_RESUME,
    EVENT_TRANSFER,
    EVENT_TRANSFERRED,
    STATUS_ACCEPTED,
    STATUS_CONNECTED,
    CallSession,
    VoiceCallSettings,
)
from authapp.models.support_communication_models import (
    TRANSFER_ACCEPTED,
    TRANSFER_CANCELLED,
    TRANSFER_DECLINED,
    TRANSFER_PENDING_STATUSES,
    TRANSFER_RINGING,
    TRANSFER_TIMEOUT,
    CallHoldEvent,
    CallTransfer,
    SupportDepartment,
)
from authapp.services import voice_call_service
from authapp.services.voice_call_service import CallError, _broadcast, _log_event, call_group

logger = logging.getLogger(__name__)

# A call must be up for hold or transfer to mean anything. `accepted` is
# included because an agent can legitimately act the instant they pick up,
# before the ICE handshake has reported `connected`.
CONTROLLABLE_STATUSES = (STATUS_ACCEPTED, STATUS_CONNECTED)

# Per-agent ring group for a named transfer. The shared CALL_AGENTS_GROUP
# carries every agent's incoming calls, so ringing one person through it would
# put the card in front of the whole desk.
def agent_group(user_id):
    return f"livechat_agent_{int(user_id)}"


# ── Settings helpers ────────────────────────────────────────────────────────
def settings_row():
    return VoiceCallSettings.load()


def hold_settings(request=None):
    """The hold configuration the clients need, in one place so the agent's
    controls and the customer's player can never be configured differently.

    `request`, when given, makes the audio URL absolute. Local storage returns
    a root-relative path ("/media/..."), which the held customer's browser
    resolves against the FRONTEND origin — and that is only the same host as
    the API when Django is serving the built SPA. In development (Vite on
    :5173, API on :8000) the path hit the dev server's SPA fallback instead:
    200, `text/html`, an <audio> element that cannot decode it, and a customer
    who hears the fallback comfort tone rather than the tune an admin
    uploaded. S3 storage already returns an absolute URL and is unaffected.
    """
    row = settings_row()
    audio_url = ""
    if row.hold_audio:
        try:
            audio_url = row.hold_audio.url
        except Exception:
            # A storage backend that cannot produce a URL must not take the
            # call config down with it; clients fall back to the generated
            # comfort tone.
            audio_url = ""
        if audio_url and request is not None:
            audio_url = request.build_absolute_uri(audio_url)
    return {
        "hold_enabled": row.hold_enabled,
        "hold_audio_url": audio_url,
        "hold_message": row.hold_message,
        "max_hold_seconds": row.max_hold_seconds,
    }


def forwarding_settings():
    row = settings_row()
    return {
        "forwarding_enabled": row.forwarding_enabled,
        "transfer_ring_timeout_seconds": (
            row.transfer_ring_timeout_seconds
            or row.ring_timeout_seconds
            or 30
        ),
    }


# ── Authorization ───────────────────────────────────────────────────────────
def agent_field(call):
    """Which COLUMN holds the agent on this call: "caller" or "receiver".

    A call's two sides are not "customer and agent" in a fixed order. A player
    ringing the desk is `caller=player, receiver=agent`; a support callback is
    the exact mirror, `caller=agent, receiver=player`. The whole control layer
    used to assume the agent was always `receiver`, which is true of inbound
    calls only — so on every call an agent placed themselves, Hold and Forward
    answered 403 "Only the agent currently on this call can control it" to the
    very agent who was on it.

    `direction` is recorded when the row is created and never changes, so it is
    the reliable answer; a transfer moves this side, not the customer's.
    """
    return "caller" if call.direction == DIRECTION_OUTBOUND else "receiver"


def controlling_agent_id(call):
    """The id of the agent currently on the call, whichever side they are."""
    return call.caller_id if agent_field(call) == "caller" else call.receiver_id


def _require_controlling_agent(user, call):
    """Only the agent currently ON the call may hold, resume or forward it.

    Deliberately narrower than CallSession.is_participant(), which admits any
    staff member so that a ringing call can be answered and a second Accept
    returns 409 rather than 404. Control of a live call is a different
    question: a second agent must not be able to put someone else's customer
    on hold or hand their call away.
    """
    if not getattr(user, "is_staff", False):
        raise CallError("not_authorized", "Only support agents can control a call.", status=403)
    if controlling_agent_id(call) != user.id:
        raise CallError(
            "not_call_owner",
            "Only the agent currently on this call can control it.",
            status=403,
        )
    if call.status not in CONTROLLABLE_STATUSES:
        raise CallError("call_not_active", "This call is not active.", status=409)


# ── Hold ────────────────────────────────────────────────────────────────────
def hold_call(agent, call, *, reason=CallHoldEvent.REASON_MANUAL):
    """Put the customer on hold. Idempotent — holding an already-held call
    returns it unchanged rather than opening a second hold period."""
    _require_controlling_agent(agent, call)

    row = settings_row()
    if not row.hold_enabled:
        raise CallError("hold_disabled", "Hold is turned off for this desk.", status=409)

    if call.is_on_hold:
        return call

    now = timezone.now()
    with transaction.atomic():
        # Conditional UPDATE, not a save(): two clicks a few milliseconds apart
        # must open one hold period, not two overlapping ones.
        changed = CallSession.objects.filter(
            pk=call.pk, is_on_hold=False, status__in=CONTROLLABLE_STATUSES,
        ).update(is_on_hold=True, hold_started_at=now)
        if not changed:
            call.refresh_from_db()
            return call
        CallHoldEvent.objects.create(
            call=call, held_by=agent, held_at=now, reason=reason,
        )

    call.refresh_from_db()
    _log_event(call, EVENT_HOLD, agent, f"reason={reason}")
    logger.info("voice-call: call=%s hold by agent=%s reason=%s", call.pk, agent.pk, reason)
    _push_control_state(call, event="call_hold")
    return call


def resume_call(agent, call, *, auto=False):
    """Take the customer off hold and re-enable both audio directions.

    `auto=True` is the server ending a hold that hit max_hold_seconds — the
    same transition, recorded as such, so history distinguishes an agent coming
    back from the system giving up on them.
    """
    if not auto:
        _require_controlling_agent(agent, call)

    if not call.is_on_hold:
        return call

    now = timezone.now()
    with transaction.atomic():
        open_event = (
            CallHoldEvent.objects.select_for_update()
            .filter(call=call, resumed_at__isnull=True)
            .order_by("-held_at")
            .first()
        )
        elapsed = 0
        if open_event is not None:
            elapsed = max(int((now - open_event.held_at).total_seconds()), 0)
            open_event.resumed_at = now
            open_event.resumed_by = agent if not auto else None
            open_event.duration_seconds = elapsed
            open_event.auto_resumed = auto
            open_event.save(update_fields=[
                "resumed_at", "resumed_by", "duration_seconds", "auto_resumed",
            ])

        changed = CallSession.objects.filter(pk=call.pk, is_on_hold=True).update(
            is_on_hold=False,
            hold_started_at=None,
            # Accumulated rather than replaced, so a call held three times
            # reports the total the customer actually spent waiting.
            total_hold_seconds=_accumulate_hold(call.total_hold_seconds, elapsed),
        )
        if not changed:
            call.refresh_from_db()
            return call

    call.refresh_from_db()
    _log_event(
        call, EVENT_RESUME, None if auto else agent,
        f"held={call.total_hold_seconds}s{' auto' if auto else ''}",
    )
    logger.info("voice-call: call=%s resume auto=%s", call.pk, auto)
    _push_control_state(call, event="call_resume")
    return call


def close_hold_on_end(call, ended_at=None):
    """Close the hold period of a call that has just ended.

    A hold is the one call state with no natural end of its own: `resume` ends
    it, the sweep ends it, and until now NOTHING ended it when the call itself
    ended. The flag stayed set on the terminal row, and because
    `live_hold_seconds` adds "now minus hold_started_at" whenever the flag is
    set, every ended-while-held call reported a hold time that grew for as
    long as the row existed — call #43 here ended at 11:29 and was still
    reporting a hold two seconds longer every two seconds.

    This is deliberately NOT `resume_call`: nobody resumed anything. The
    period is closed at the moment the call ended, with no `resumed_by` and
    `auto_resumed` left False, so history says what happened — the hold ran
    until the call did — rather than inventing an agent or a timeout. No push
    either: the terminal state push carries the same row a moment later.

    Called from the terminal transitions in voice_call_service. Safe to call
    on a call that is not held, and on one another process just closed.
    """
    if not call.is_on_hold:
        return call

    when = ended_at or call.ended_at or timezone.now()
    with transaction.atomic():
        open_event = (
            CallHoldEvent.objects.select_for_update()
            .filter(call=call, resumed_at__isnull=True)
            .order_by("-held_at")
            .first()
        )
        elapsed = 0
        if open_event is not None:
            elapsed = max(int((when - open_event.held_at).total_seconds()), 0)
            open_event.resumed_at = when
            open_event.duration_seconds = elapsed
            open_event.save(update_fields=["resumed_at", "duration_seconds"])
        elif call.hold_started_at:
            # Flag set with no open event to pair it with — shouldn't happen,
            # but the customer's waiting time is still real, so count it.
            elapsed = max(int((when - call.hold_started_at).total_seconds()), 0)

        CallSession.objects.filter(pk=call.pk, is_on_hold=True).update(
            is_on_hold=False,
            hold_started_at=None,
            total_hold_seconds=_accumulate_hold(call.total_hold_seconds, elapsed),
        )

    call.refresh_from_db()
    logger.info(
        "voice-call: call=%s hold closed by call end, held=%ss",
        call.pk, call.total_hold_seconds,
    )
    return call


def _accumulate_hold(current, delta):
    """Add this hold period to the running total.

    Plain addition, deliberately not an F() expression: resume_call() holds
    the open CallHoldEvent under select_for_update() for the whole
    transaction, so this row's hold accounting is already serialised, and an
    F() would leave the in-memory object carrying a deferred expression that
    the refresh_from_db() on the next line has to resolve anyway.
    """
    return int(current or 0) + int(delta or 0)


def sweep_expired_holds():
    """End any hold that has exceeded the configured maximum.

    Driven by the `sweep_expired_calls` management command (every minute; see
    .ebextensions/02_cron.config). Unlike a lapsed ring or a stale transfer,
    a hold has no lazy read path that could expire it — the customer is the
    only one waiting on it, and their client is doing exactly what it was told
    to do. So this is the only thing standing between a crashed agent tab and
    a customer left on hold indefinitely, which is why the command runs on
    every instance rather than a leader.

    A no-op while `max_hold_seconds` is 0, which is the default: no limit
    configured means no hold is overdue. Returns the number of calls resumed.
    """
    row = settings_row()
    limit = row.max_hold_seconds
    if not limit:
        return 0

    cutoff = timezone.now() - timedelta(seconds=limit)
    stale = list(
        CallSession.objects.filter(
            is_on_hold=True, hold_started_at__lt=cutoff,
            status__in=CONTROLLABLE_STATUSES,
        )[:20]
    )
    for call in stale:
        try:
            resume_call(None, call, auto=True)
        except Exception:
            logger.exception("voice-call: failed to auto-resume call #%s", call.pk)
    return len(stale)


# ── Transfer / forwarding ───────────────────────────────────────────────────
def eligible_transfer_targets(exclude_user_id=None):
    """Agents ALLOWED to receive a forward — the same eligibility inbound calls
    use, so a call can never be forwarded to somebody who could not have
    answered it in the first place.

    Deliberately says nothing about whether they can take one RIGHT NOW; see
    available_transfer_agent_ids() for that, and this module's docstring for
    why the two are kept apart.
    """
    from authapp.models.user_model import AdminProfile

    qs = AdminProfile.objects.filter(
        is_active=True,
        role__in=AdminProfile.CALL_ELIGIBLE_ROLES,
        user__is_active=True,
    ).select_related("user")
    if exclude_user_id:
        qs = qs.exclude(user_id=exclude_user_id)
    return qs


def online_agent_ids():
    """Eligible agents with the Back Office actually open.

    Same presence query available_agent_count() uses, returning the ids rather
    than a count — including its re-check of the role, so an agent demoted
    while their socket is still open stops being offered without anyone having
    to hunt down their session.
    """
    from authapp.models.call_models import PRESENCE_MAX_AGE, SupportAgentPresence
    from authapp.models.user_model import AdminProfile

    cutoff = timezone.now() - PRESENCE_MAX_AGE
    return set(
        SupportAgentPresence.objects
        .filter(
            connected_at__gte=cutoff,
            user__is_superuser=False,
            user__admin_profile__is_active=True,
            user__admin_profile__role__in=AdminProfile.CALL_ELIGIBLE_ROLES,
        )
        .values_list("user_id", flat=True)
    )


def free_transfer_agent_ids(exclude_user_id=None):
    """Eligible agents who are not on a call.

    BUSY ONLY — deliberately says nothing about presence. This is the hard,
    always-trustworthy signal (see the module note on the two), and it is what
    the server enforces and what department routing uses, so neither can be
    broken by a blinking socket.
    """
    eligible = set(
        eligible_transfer_targets(exclude_user_id).values_list("user_id", flat=True)
    )
    return eligible - voice_call_service.busy_agent_ids()


def available_transfer_agent_ids(exclude_user_id=None):
    """Agents to OFFER in the picker: not on a call, and online where we can
    tell.

    Presence narrows the list but never empties it: with no presence rows at
    all, presence is not being tracked rather than everybody being away, so the
    filter stands down instead of making forwarding impossible. That is the one
    case where an offline agent is still offered — and forwarding to someone
    away degrades gracefully anyway, since the ring lapses and the call comes
    back.

    The forwarding agent is excluded twice over: explicitly, and because they
    are the receiver of the call being forwarded and therefore busy.
    """
    free = free_transfer_agent_ids(exclude_user_id)
    online = online_agent_ids()
    if not online:
        return free
    return free & online


def _department_agent_ids(department, exclude_user_id=None, available_only=False):
    """Members of `department` who may receive a call.

    `available_only=False` is the AUTHORIZATION question — may this person
    accept? It must stay unfiltered by availability: an agent who finishes
    another call a second before clicking Accept is legitimately entitled to
    take this one, and filtering here would refuse them for being busy at the
    moment the card was drawn rather than the moment they answered.

    `available_only=True` is the OFFER question — who should be rung, and does
    this department have anyone free right now. It excludes agents on a call
    but NOT agents who merely look offline, because presence is the soft signal
    and a department that looks empty refuses the forward outright.
    """
    ids = set(department.agents.filter(is_active=True).values_list("id", flat=True))
    # Intersected with call eligibility rather than trusted on its own: an
    # admin could add a finance user to a department, and that must not make
    # them answerable for calls.
    if available_only:
        # free_, not available_: department routing must not depend on presence
        # (see the module note) or a department looks empty the moment a socket
        # blinks, and request_transfer refuses the whole forward.
        return ids & free_transfer_agent_ids(exclude_user_id)
    eligible = set(
        eligible_transfer_targets(exclude_user_id).values_list("user_id", flat=True)
    )
    return ids & eligible


def department_available_agent_count(department, exclude_user_id=None):
    """How many of this department's members could take a call right now.

    The public read of _department_agent_ids(available_only=True), so the
    picker does not have to reach into a private helper to grey out a
    department whose whole team is mid-call.
    """
    if department is None:
        return 0
    return len(
        _department_agent_ids(department, exclude_user_id=exclude_user_id, available_only=True)
    )


def request_transfer(agent, call, *, to_agent=None, to_department=None, reason="", note=""):
    """Agent A forwards the call. Returns the CallTransfer row."""
    _require_controlling_agent(agent, call)

    row = settings_row()
    if not row.forwarding_enabled:
        raise CallError("forwarding_disabled", "Call forwarding is turned off.", status=409)

    if to_agent is None and to_department is None:
        raise CallError("no_target", "Choose an agent or a department to forward to.", status=400)

    if to_agent is not None:
        if to_agent.id == agent.id:
            raise CallError("self_transfer", "You are already on this call.", status=400)
        if not eligible_transfer_targets().filter(user_id=to_agent.id).exists():
            raise CallError(
                "target_not_eligible",
                "That person is not set up to receive calls.",
                status=400,
            )
        # THE SERVER-SIDE GATE, on the hard signal only. The picker already
        # hides an agent who is on a call, but that is presentation — a stale
        # card, a second tab or a direct POST would otherwise hand a customer
        # to somebody who is demonstrably mid-conversation with someone else,
        # and they would sit on hold until the ring window lapsed.
        #
        # Being OFFLINE is deliberately not refused here: presence comes from a
        # WebSocket and a dropped socket reads the same as an empty chair, so
        # refusing on it would block transfers that would have worked. An
        # absent agent already degrades gracefully — the ring lapses and the
        # call returns. See this module's note on the two signals.
        if to_agent.id in voice_call_service.busy_agent_ids():
            raise CallError(
                "target_on_a_call",
                f"{(to_agent.name or to_agent.email)} is already on a call.",
                status=409,
            )

    if to_department is not None:
        if not to_department.is_active:
            raise CallError("department_inactive", "That department is not active.", status=400)
        # Availability, not membership: a department whose every member is
        # mid-call cannot take this one, and offering it would ring nobody.
        if not _department_agent_ids(
            to_department, exclude_user_id=agent.id, available_only=True,
        ):
            raise CallError(
                "department_empty",
                f"Nobody in {to_department.name} is free to take this call right now.",
                status=409,
            )

    timeout = forwarding_settings()["transfer_ring_timeout_seconds"]
    expires = timezone.now() + timedelta(seconds=timeout)

    try:
        with transaction.atomic():
            transfer = CallTransfer.objects.create(
                call=call,
                from_agent=agent,
                to_agent=to_agent,
                to_department=to_department,
                status=TRANSFER_RINGING,
                reason=(reason or "")[:255],
                note=note or "",
                ring_expires_at=expires,
                # The unique constraint on this column is the real duplicate
                # guard — see the model.
                pending_key=call.pk,
            )
    except IntegrityError:
        raise CallError(
            "transfer_in_progress",
            "A transfer is already in progress for this call.",
            status=409,
        ) from None

    CallSession.objects.filter(pk=call.pk).update(is_transferring=True)
    call.refresh_from_db()

    # The customer goes on hold for the duration of the ring, so they hear the
    # hold track rather than an agent who has stopped talking to them. Hold
    # being switched off is not a reason to refuse the transfer — it just means
    # the customer waits in silence, which is the operator's choice to make.
    if row.hold_enabled and not call.is_on_hold:
        try:
            hold_call(agent, call, reason=CallHoldEvent.REASON_TRANSFER)
            call.refresh_from_db()
        except CallError:
            logger.warning("voice-call: could not hold call #%s for transfer", call.pk)

    _log_event(
        call, EVENT_TRANSFER, agent,
        f"to={'agent:%s' % to_agent.id if to_agent else 'dept:%s' % to_department.id}",
    )
    _ring_transfer(transfer)
    _push_control_state(call, event="call_transfer_pending", transfer=transfer)
    return transfer


def _ring_transfer(transfer):
    """Put the incoming-transfer card in front of whoever may take it."""
    payload = transfer_payload(transfer)
    if transfer.to_agent_id:
        _broadcast(agent_group(transfer.to_agent_id), "call.event",
                   {"event": "call_transfer_offer", "transfer": payload})
        return
    for user_id in _department_agent_ids(
        transfer.to_department, exclude_user_id=transfer.from_agent_id,
        available_only=True,
    ):
        _broadcast(agent_group(user_id), "call.event",
                   {"event": "call_transfer_offer", "transfer": payload})


def accept_transfer(agent, transfer):
    """The target takes the call.

    The claim is a single conditional UPDATE on the transfer AND a second on
    the call, both inside one transaction: two agents in a department pressing
    Accept at the same instant both see `ringing`, and only the one whose
    UPDATE matches a still-ringing row wins. The loser gets a 409 rather than
    silently joining a call that already has two agents.
    """
    if not getattr(agent, "is_staff", False):
        raise CallError("not_authorized", "Only support agents can accept a transfer.", status=403)

    expire_transfer_if_due(transfer)
    if transfer.status not in TRANSFER_PENDING_STATUSES:
        raise CallError("transfer_not_pending", "This transfer is no longer available.", status=409)

    if transfer.to_agent_id and transfer.to_agent_id != agent.id:
        raise CallError("not_transfer_target", "This transfer was not offered to you.", status=403)
    if transfer.to_department_id and agent.id not in _department_agent_ids(transfer.to_department):
        raise CallError("not_transfer_target", "This transfer was not offered to you.", status=403)

    call = transfer.call
    if call.status not in CONTROLLABLE_STATUSES:
        raise CallError("call_not_active", "That call has already ended.", status=409)

    now = timezone.now()
    with transaction.atomic():
        claimed = CallTransfer.objects.filter(
            pk=transfer.pk, status__in=TRANSFER_PENDING_STATUSES,
        ).update(
            status=TRANSFER_ACCEPTED, accepted_by=agent, responded_at=now,
            pending_key=None,
        )
        if not claimed:
            raise CallError("transfer_already_taken", "This transfer was already accepted.", status=409)

        # THE LINE THAT ACTUALLY MOVES THE CALL. The consumer authorises
        # signaling membership against caller/receiver on every frame, so this
        # single reassignment drops the old agent out of the call's signaling
        # group and admits the new one.
        #
        # It writes the AGENT's column, which is `receiver` on an inbound call
        # and `caller` on a callback the agent placed. Hardcoding `receiver`
        # here would, on a callback, have overwritten the CUSTOMER with the new
        # agent — taking the person the call is for off their own call and
        # leaving a row with two agents on it. Unreachable until now only
        # because the 403 above fired first.
        CallSession.objects.filter(pk=call.pk).update(
            **{agent_field(call): agent},
            is_transferring=False,
            transfer_count=call.transfer_count + 1,
        )

    transfer.refresh_from_db()
    call.refresh_from_db()
    _log_event(call, EVENT_TRANSFERRED, agent, f"from={transfer.from_agent_id}")
    logger.info(
        "voice-call: call=%s transferred from=%s to=%s",
        call.pk, transfer.from_agent_id, agent.pk,
    )

    # Tell the old agent their leg is over, before the customer comes off hold
    # — otherwise there is a window where two agents believe they are on the
    # call.
    if transfer.from_agent_id:
        _broadcast(agent_group(transfer.from_agent_id), "call.event",
                   {"event": "call_transfer_completed", "transfer": transfer_payload(transfer),
                    "call": voice_call_service.call_payload(call)})

    # Both endpoints renegotiate: the customer's peer connection was built
    # against the previous agent and has to be rebuilt against this one.
    _broadcast(call_group(call.pk), "call.event",
               {"event": "call_renegotiate", "call": voice_call_service.call_payload(call)})

    if call.is_on_hold:
        resume_call(agent, call)
        call.refresh_from_db()

    _push_control_state(call, event="call_transferred", transfer=transfer)
    return transfer


def decline_transfer(agent, transfer):
    """The target says no. The call returns to the original agent."""
    if not getattr(agent, "is_staff", False):
        raise CallError("not_authorized", "Only support agents can decline a transfer.", status=403)
    expire_transfer_if_due(transfer)
    if transfer.status not in TRANSFER_PENDING_STATUSES:
        raise CallError("transfer_not_pending", "This transfer is no longer pending.", status=409)

    _close_transfer(transfer, TRANSFER_DECLINED, actor=agent)
    return transfer


def cancel_transfer(agent, transfer):
    """The forwarding agent changes their mind before anyone answers."""
    if transfer.from_agent_id != getattr(agent, "id", None):
        raise CallError("not_authorized", "Only the forwarding agent can cancel.", status=403)
    expire_transfer_if_due(transfer)
    if transfer.status not in TRANSFER_PENDING_STATUSES:
        raise CallError("transfer_not_pending", "This transfer is no longer pending.", status=409)

    _close_transfer(transfer, TRANSFER_CANCELLED, actor=agent)
    return transfer


def expire_transfer_if_due(transfer):
    """Lazily time out a transfer whose ring window has lapsed.

    Called on every read and before every transition, so the answer to "is this
    transfer still live?" comes from the row's own timestamp rather than from
    whether some browser happened to still be running a timer — exactly the
    contract voice_call_service.expire_if_due has for calls.
    """
    if transfer.status not in TRANSFER_PENDING_STATUSES:
        return transfer
    if transfer.ring_expires_at and timezone.now() < transfer.ring_expires_at:
        return transfer
    _close_transfer(transfer, TRANSFER_TIMEOUT, actor=None)
    return transfer


def _close_transfer(transfer, status, *, actor=None):
    """Resolve a pending transfer and hand the call back to its original
    agent, taking the customer off hold."""
    now = timezone.now()
    CallTransfer.objects.filter(pk=transfer.pk, status__in=TRANSFER_PENDING_STATUSES).update(
        status=status, responded_at=now, pending_key=None,
    )
    transfer.refresh_from_db()

    call = transfer.call
    CallSession.objects.filter(pk=call.pk).update(is_transferring=False)
    call.refresh_from_db()

    # Only lift a hold this transfer imposed. A customer the agent had
    # deliberately put on hold BEFORE forwarding should stay on hold — ending
    # a failed transfer is not a decision to resume the conversation.
    if call.is_on_hold:
        open_hold = (
            CallHoldEvent.objects.filter(call=call, resumed_at__isnull=True)
            .order_by("-held_at").first()
        )
        if open_hold is not None and open_hold.reason == CallHoldEvent.REASON_TRANSFER:
            resume_call(transfer.from_agent, call, auto=True)
            call.refresh_from_db()

    if transfer.from_agent_id:
        _broadcast(agent_group(transfer.from_agent_id), "call.event",
                   {"event": "call_transfer_failed", "transfer": transfer_payload(transfer),
                    "call": voice_call_service.call_payload(call)})
    _push_control_state(call, event="call_transfer_failed", transfer=transfer)
    logger.info("voice-call: transfer #%s closed as %s", transfer.pk, status)
    return transfer


# ── Payloads ────────────────────────────────────────────────────────────────
def transfer_payload(transfer):
    """Wire shape for a transfer.

    `reason` and `note` are internal agent-to-agent context and are included
    here because every group this is pushed to is a STAFF group — the
    per-agent transfer groups and the agent desk. It is deliberately NOT part
    of call_control_payload below, which reaches the customer's own ticket
    thread.
    """
    call = transfer.call
    return {
        "id": transfer.pk,
        "call_id": transfer.call_id,
        "ticket_id": call.ticket_id,
        "status": transfer.status,
        "from_agent_id": transfer.from_agent_id,
        "from_agent_name": (getattr(transfer.from_agent, "name", "") or "").strip(),
        "to_agent_id": transfer.to_agent_id,
        "to_agent_name": (getattr(transfer.to_agent, "name", "") or "").strip(),
        "to_department_id": transfer.to_department_id,
        "to_department_name": transfer.to_department.name if transfer.to_department_id else "",
        "accepted_by_id": transfer.accepted_by_id,
        "accepted_by_name": (getattr(transfer.accepted_by, "name", "") or "").strip(),
        "reason": transfer.reason,
        "note": transfer.note,
        "created_at": transfer.created_at.isoformat() if transfer.created_at else None,
        "responded_at": transfer.responded_at.isoformat() if transfer.responded_at else None,
        "ring_expires_at": (
            transfer.ring_expires_at.isoformat() if transfer.ring_expires_at else None
        ),
        "caller_name": (getattr(call.caller, "name", "") or "").strip(),
        "caller_uid": getattr(call.caller, "user_uid", "") or "",
    }


def call_control_payload(call):
    """The hold/transfer state, merged into the standard call payload.

    Customer-safe: it says THAT a transfer is in progress and nothing about
    who to or why. The reason an agent typed is internal, and this payload
    reaches the customer's ticket group.
    """
    payload = voice_call_service.call_payload(call)
    payload.update({
        "display_status": call.display_status,
        "is_on_hold": call.is_on_hold,
        "hold_seconds": call.live_hold_seconds,
        "total_hold_seconds": call.total_hold_seconds,
        "is_transferring": call.is_transferring,
        "transfer_count": call.transfer_count,
    })
    return payload


def _push_control_state(call, *, event, transfer=None):
    """Push the new state to the two endpoints, the ticket thread and the desk.

    Two different payloads on purpose. The customer-facing groups get
    call_control_payload (no internal transfer reason, no target identity);
    the staff group additionally gets the transfer row.
    """
    public = call_control_payload(call)
    _broadcast(call_group(call.pk), "call.event", {"event": event, "call": public})
    _broadcast(f"livechat_{call.ticket_id}", "call.event", {"event": event, "call": public})

    staff = {"event": event, "call": public}
    if transfer is not None:
        staff["transfer"] = transfer_payload(transfer)
    _broadcast(voice_call_service.CALL_AGENTS_GROUP, "call.event", staff)


# ── Lookups used by the views ───────────────────────────────────────────────
def get_department(department_id):
    if not department_id:
        return None
    dept = SupportDepartment.objects.filter(pk=department_id).first()
    if dept is None:
        raise CallError("department_not_found", "That department does not exist.", status=404)
    return dept


def get_transfer_for_agent(user, transfer_id):
    """A transfer this staff user is allowed to act on, with expiry applied."""
    if not getattr(user, "is_staff", False):
        raise CallError("not_authorized", "Support agents only.", status=403)
    transfer = (
        CallTransfer.objects
        .select_related("call", "call__caller", "call__ticket", "from_agent", "to_agent", "to_department")
        .filter(pk=transfer_id)
        .first()
    )
    if transfer is None:
        raise CallError("transfer_not_found", "That transfer does not exist.", status=404)
    expire_transfer_if_due(transfer)
    return transfer
