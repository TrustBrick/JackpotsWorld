"""
authapp/services/voice_call_service.py
─────────────────────────────────────────────────────────────────────────────
VOICE-CALL: authorization, state machine and signaling fan-out for in-app
support calls. Mirrors live_chat_service.py's shape deliberately — same
_broadcast helper semantics, same "persist over REST, push over Channels"
split — so the two features fail the same way and are debugged the same way.

WHAT RIDES WHERE
────────────────
  REST (this module, called from voice_call_views.py)
      Everything that changes persistent state: initiate, accept, reject,
      end, mark-connected, mark-failed. These must survive a dropped socket,
      exactly like chat message persistence does, so they are never driven
      from a consumer.

  WebSocket (consumers/live_chat_consumer.py, relayed via this module's
  group names)
      Only the ephemeral WebRTC negotiation traffic — SDP offer/answer, ICE
      candidates, and mute/unmute indicators. None of it is worth persisting
      and all of it is latency-critical. The consumer re-validates the sender
      against the CallSession on every single frame; nothing is trusted
      because it arrived on an already-open socket.

GROUPS
──────
  livechat_admins      pre-existing. Carries the ring notification, so an
                       agent is alerted the same way they already are for a
                       new chat message, without needing the conversation
                       open. Metadata only — never SDP or ICE.
  livechat_<ticket>    pre-existing. Carries call state changes back to the
                       customer, whose socket is already on it.
  voicecall_<call_id>  new, per call. Only the two claimed endpoints are ever
                       added, and only by the consumer after it has verified
                       membership server-side. This is what stops customer A
                       from seeing customer B's negotiation, and what stops a
                       second agent from joining a claimed call.
"""
import hashlib
import hmac
import base64
import logging
import time
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from authapp.models.call_models import (
    ACTIVE_STATUSES,
    CallEvent,
    CallSession,
    END_CALLER_ENDED,
    END_RECEIVER_ENDED,
    END_REJECTED,
    END_TIMEOUT,
    EVENT_ACCEPTED,
    EVENT_CONNECTED,
    EVENT_ENDED,
    EVENT_FAILED,
    EVENT_INITIATED,
    EVENT_RECORDED,
    EVENT_REJECTED,
    EVENT_TIMEOUT,
    RECORDING_CONTENT_TYPES,
    RECORDING_EXTENSIONS,
    STATUS_ACCEPTED,
    STATUS_CANCELLED,
    STATUS_CONNECTED,
    STATUS_ENDED,
    STATUS_FAILED,
    STATUS_MISSED,
    STATUS_REJECTED,
    STATUS_RINGING,
    TERMINAL_STATUSES,
)
from authapp.models.support_ticket_models import SupportTicket

logger = logging.getLogger(__name__)

# Ticket states a call may be started from. A resolved or closed conversation
# is over — reopening it by phone would bypass the status machine the chat and
# ticket tabs both rely on.
CALLABLE_TICKET_STATUSES = ("open", "in_progress")


class CallError(Exception):
    """Raised for every rejected call operation. `code` is a stable machine
    string for the client; `status` is the HTTP status the view should use.
    Carrying both here keeps the views thin and keeps one operation's failure
    vocabulary in one place."""

    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


# ── Realtime capability ─────────────────────────────────────────────────────

def calling_available():
    """Whether this deployment can actually carry a call.

    Signaling needs cross-process push: the gunicorn worker that creates the
    call must reach the daphne process holding both browsers' sockets. That is
    precisely the question LIVE_CHAT_REALTIME already answers (see its comment
    in settings.py), so this reuses it rather than adding a second flag that
    could drift. On the WSGI-only cPanel target, where chat correctly falls
    back to polling, calling is reported unavailable instead of offering a
    button that would ring forever.
    """
    return bool(
        getattr(settings, "VOICE_CALL_ENABLED", True)
        and getattr(settings, "LIVE_CHAT_REALTIME", False)
    )


# ── ICE configuration ───────────────────────────────────────────────────────

def _turn_credentials():
    """Static pair, or a short-lived one when a TURN shared secret is set.

    The time-limited form is coturn's `use-auth-secret` scheme: username is
    "<unix-expiry>:<label>" and password is base64(HMAC-SHA1(secret, username)).
    The secret itself never leaves the server — only a derived credential that
    stops working after WEBRTC_TURN_CREDENTIAL_TTL seconds does, so one
    scraped out of a browser has a bounded blast radius.
    """
    secret = getattr(settings, "WEBRTC_TURN_STATIC_AUTH_SECRET", "")
    if not secret:
        return (
            getattr(settings, "WEBRTC_TURN_USERNAME", ""),
            getattr(settings, "WEBRTC_TURN_CREDENTIAL", ""),
        )
    ttl = int(getattr(settings, "WEBRTC_TURN_CREDENTIAL_TTL", 3600) or 3600)
    username = f"{int(time.time()) + ttl}:jackpotsworld"
    digest = hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()
    return username, base64.b64encode(digest).decode()


def ice_servers():
    """ICE server list handed to the browser.

    Only what RTCPeerConnection needs — never the TURN shared secret, and
    never anything about other users. Returns STUN even with no TURN
    configured, which is the correct local-development posture.
    """
    servers = []
    stun = list(getattr(settings, "WEBRTC_STUN_URLS", []) or [])
    if stun:
        servers.append({"urls": stun})

    turn = list(getattr(settings, "WEBRTC_TURN_URLS", []) or [])
    if turn:
        username, credential = _turn_credentials()
        if username and credential:
            servers.append({
                "urls": turn,
                "username": username,
                "credential": credential,
            })
        else:
            # Misconfiguration, not a crash: STUN still works for most users.
            # Logged because the symptom otherwise is "calls silently fail for
            # a minority of users on restrictive networks", which is painful
            # to diagnose from the outside.
            logger.warning(
                "voice-call: WEBRTC_TURN_URLS set but no usable credentials; "
                "serving STUN only — calls will fail behind symmetric NAT",
            )
    return servers


# ── Broadcast ───────────────────────────────────────────────────────────────

def _broadcast(group, event_type, payload):
    """Best-effort channel-layer push. Never raises.

    Same contract as live_chat_service._broadcast, including logging rather
    than silently swallowing: a signaling push that quietly does nothing looks
    exactly like a call that rings and never connects, and that is the single
    hardest failure in this feature to diagnose after the fact.
    """
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        layer = get_channel_layer()
        if layer is None:
            logger.warning("voice-call: no channel layer configured; skipping %s push", event_type)
            return
        async_to_sync(layer.group_send)(group, {"type": event_type, "payload": payload})
    except Exception:
        logger.exception("voice-call: failed to broadcast %s to %s", event_type, group)


def call_group(call_id):
    return f"voicecall_{int(call_id)}"


def _log_event(call, event, actor=None, detail=""):
    try:
        CallEvent.objects.create(call=call, event=event, actor=actor, detail=detail[:120])
    except Exception:
        # Audit must never take a call down with it.
        logger.exception("voice-call: failed to record %s for call #%s", event, call.pk)


def call_payload(call):
    """Wire representation shared by REST responses and every push.

    Deliberately minimal: identifiers, state and timing. No email, no phone
    number, no token. The caller's display name and UID are included because
    the agent's incoming-call card must show who is calling — the same fields
    the live-chat inbox already exposes to the same staff audience.
    """
    caller = call.caller
    return {
        "id": call.pk,
        "ticket_id": call.ticket_id,
        "participant_type": call.ticket.participant_type,
        "status": call.status,
        "end_reason": call.end_reason,
        "caller_id": call.caller_id,
        "caller_name": (getattr(caller, "name", "") or "").strip(),
        "caller_uid": getattr(caller, "user_uid", "") or "",
        "receiver_id": call.receiver_id,
        "receiver_name": (getattr(call.receiver, "name", "") or "").strip() if call.receiver_id else "",
        "started_at": call.started_at.isoformat() if call.started_at else None,
        "ring_expires_at": call.ring_expires_at.isoformat() if call.ring_expires_at else None,
        "connected_at": call.connected_at.isoformat() if call.connected_at else None,
        "ended_at": call.ended_at.isoformat() if call.ended_at else None,
        "duration_seconds": call.duration_seconds,
    }


def _push_state(call, to_admins=True):
    payload = call_payload(call)
    _broadcast(call_group(call.pk), "call.event", {"event": "call_state", "call": payload})
    _broadcast(f"livechat_{call.ticket_id}", "call.event", {"event": "call_state", "call": payload})
    if to_admins:
        _broadcast("livechat_admins", "call.event", {"event": "call_state", "call": payload})


# ── Expiry ──────────────────────────────────────────────────────────────────

def expire_if_due(call):
    """Lazily transitions a lapsed ringing call to `missed`.

    Called on every read and before every transition, so the backend's answer
    to "is this call still live?" comes from the row's own timestamp rather
    than from whether some browser happened to still be running a timer. A
    customer who closes the tab mid-ring still produces a correctly recorded
    missed call the next time anything touches it — and sweep_expired_calls
    below covers the case where nothing ever does.
    """
    if call.status != STATUS_RINGING:
        return call
    if call.ring_expires_at and timezone.now() < call.ring_expires_at:
        return call

    updated = CallSession.objects.filter(pk=call.pk, status=STATUS_RINGING).update(
        status=STATUS_MISSED,
        end_reason=END_TIMEOUT,
        ended_at=timezone.now(),
        active_key=None,
    )
    call.refresh_from_db()
    if updated:
        _log_event(call, EVENT_TIMEOUT, None, "ring window lapsed")
        logger.info(
            "voice-call: call=%s ticket=%s transition=ringing->missed reason=timeout",
            call.pk, call.ticket_id,
        )
        _push_state(call)
    return call


def sweep_expired_calls():
    """Bulk version of the above, for the management command.

    The lazy path covers every call anyone looks at; this covers the rest, so
    a ringing row whose both participants vanished cannot sit in `ringing`
    forever holding its ticket's active slot.
    """
    due = CallSession.objects.filter(
        status=STATUS_RINGING, ring_expires_at__lt=timezone.now(),
    )
    swept = 0
    for call in due.select_related("ticket", "caller", "receiver"):
        before = call.status
        expire_if_due(call)
        if call.status != before:
            swept += 1
    return swept


# ── Authorization ───────────────────────────────────────────────────────────

def get_callable_ticket(user, ticket_id):
    """Resolves the ticket a customer is trying to call from.

    Scoped by `user=user`, so a forged ticket id in the request body resolves
    to nothing rather than to somebody else's conversation — the same pattern
    LiveChatMessageListCreateView._ticket already uses. Never trusts an
    agent id, participant id or room id from the client; none is accepted as
    input anywhere in this module.
    """
    ticket = (
        SupportTicket.objects
        .filter(pk=ticket_id, user=user, is_live_chat=True)
        .select_related("user")
        .first()
    )
    if ticket is None:
        raise CallError("ticket_not_found", "Support conversation not found.", status=404)
    if ticket.status not in CALLABLE_TICKET_STATUSES:
        raise CallError(
            "ticket_not_callable",
            "This conversation is closed. Start a new chat to call support.",
            status=409,
        )
    return ticket


def get_call_for_participant(user, call_id):
    """Loads a call the given user is genuinely part of.

    Returns 404 rather than 403 for a non-participant: whether a given call id
    exists is itself information, and an unrelated customer should not be able
    to probe for it.
    """
    call = (
        CallSession.objects
        .filter(pk=call_id)
        .select_related("ticket", "caller", "receiver")
        .first()
    )
    if call is None:
        raise CallError("call_not_found", "Call not found.", status=404)
    expire_if_due(call)
    if not call.is_participant(user):
        raise CallError("call_not_found", "Call not found.", status=404)
    return call


def load_call_for_endpoint(user, call_id):
    """The signaling authorization predicate: may `user` send WebRTC frames
    into `call_id`? Returns the CallSession, or None.

    Deliberately stricter than CallSession.is_participant, which admits any
    staff member so they can see and answer a ringing call. That is right for
    the incoming-call card and wrong here — an agent who has not accepted must
    not be able to inject SDP into someone else's negotiation. Only the caller
    and the agent who actually claimed the call qualify.

    Refusing terminal calls is the replay guard: a stale `offer` or
    `ice_candidate` replayed after hangup finds a non-live row and is dropped
    rather than reopening the session.

    Lives here rather than in the consumer because it is an authorization
    decision about database state, not a transport concern — which also means
    it is directly testable without standing up a socket.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    try:
        call = CallSession.objects.select_related("ticket").get(pk=int(call_id))
    except (CallSession.DoesNotExist, ValueError, TypeError):
        return None
    if call.status not in ACTIVE_STATUSES:
        return None
    if user.id != call.caller_id and user.id != call.receiver_id:
        return None
    return call


def active_call_for_ticket(ticket):
    call = (
        CallSession.objects
        .filter(ticket=ticket, status__in=ACTIVE_STATUSES)
        .select_related("ticket", "caller", "receiver")
        .first()
    )
    if call is None:
        return None
    expire_if_due(call)
    return call if call.is_active else None


# ── Transitions ─────────────────────────────────────────────────────────────

def initiate_call(user, ticket):
    """Customer starts a call. Returns (call, created)."""
    if not calling_available():
        raise CallError(
            "calling_unavailable",
            "Voice calling is not available on this server right now.",
            status=503,
        )

    existing = active_call_for_ticket(ticket)
    if existing is not None:
        # Their own still-live call — hand it back rather than erroring, so a
        # double-click or a reconnecting tab rejoins instead of being told no.
        if existing.caller_id == user.id:
            return existing, False
        raise CallError("call_in_progress", "A call is already in progress.", status=409)

    timeout = int(getattr(settings, "VOICE_CALL_RING_TIMEOUT_SECONDS", 30) or 30)
    try:
        with transaction.atomic():
            call = CallSession.objects.create(
                ticket=ticket,
                caller=user,
                status=STATUS_RINGING,
                ring_expires_at=timezone.now() + timedelta(seconds=timeout),
                active_key=ticket.pk,
            )
    except Exception as exc:
        # The unique constraint on active_key is the real duplicate guard —
        # two concurrent initiates both pass the check above, and exactly one
        # survives the insert. Losing that race is not an error worth showing.
        existing = active_call_for_ticket(ticket)
        if existing is not None:
            if existing.caller_id == user.id:
                return existing, False
            raise CallError("call_in_progress", "A call is already in progress.", status=409)
        logger.exception("voice-call: failed to create call for ticket=%s", ticket.pk)
        raise CallError("call_failed", "Could not start the call. Please try again.", status=500) from exc

    _log_event(call, EVENT_INITIATED, user)
    logger.info(
        "voice-call: call=%s ticket=%s transition=none->ringing caller=%s",
        call.pk, ticket.pk, user.pk,
    )
    payload = call_payload(call)
    # Ring the on-duty agents the same way a new chat message reaches them.
    _broadcast("livechat_admins", "call.event", {"event": "call_incoming", "call": payload})
    _broadcast(f"livechat_{ticket.pk}", "call.event", {"event": "call_state", "call": payload})
    return call, True


def accept_call(agent, call):
    """An agent claims a ringing call.

    The claim is a single conditional UPDATE, not a read-then-write: two
    agents pressing Accept at the same instant both see `ringing`, and only
    the one whose UPDATE matches a still-ringing row wins. The loser gets a
    409 rather than silently joining a call that already has two endpoints.
    """
    if not getattr(agent, "is_staff", False):
        raise CallError("not_authorized", "Only support agents can answer calls.", status=403)
    expire_if_due(call)
    if call.status != STATUS_RINGING:
        raise CallError("call_not_ringing", "This call is no longer ringing.", status=409)

    claimed = CallSession.objects.filter(pk=call.pk, status=STATUS_RINGING).update(
        status=STATUS_ACCEPTED, receiver=agent,
    )
    if not claimed:
        raise CallError("call_already_taken", "This call was already answered.", status=409)

    call.refresh_from_db()
    _log_event(call, EVENT_ACCEPTED, agent)
    logger.info(
        "voice-call: call=%s ticket=%s transition=ringing->accepted receiver=%s",
        call.pk, call.ticket_id, agent.pk,
    )
    _push_state(call)
    return call


def reject_call(agent, call):
    if not getattr(agent, "is_staff", False):
        raise CallError("not_authorized", "Only support agents can decline calls.", status=403)
    expire_if_due(call)
    if call.status != STATUS_RINGING:
        raise CallError("call_not_ringing", "This call is no longer ringing.", status=409)

    rejected = CallSession.objects.filter(pk=call.pk, status=STATUS_RINGING).update(
        status=STATUS_REJECTED,
        receiver=agent,
        end_reason=END_REJECTED,
        ended_at=timezone.now(),
        active_key=None,
    )
    if not rejected:
        raise CallError("call_already_taken", "This call was already answered.", status=409)

    call.refresh_from_db()
    _log_event(call, EVENT_REJECTED, agent)
    logger.info(
        "voice-call: call=%s ticket=%s transition=ringing->rejected by=%s",
        call.pk, call.ticket_id, agent.pk,
    )
    _push_state(call)
    return call


def mark_connected(user, call):
    """Both peers report ICE connected. Idempotent — either side may call it,
    and whichever arrives first stamps connected_at."""
    expire_if_due(call)
    if call.status == STATUS_CONNECTED:
        return call
    if call.status != STATUS_ACCEPTED:
        raise CallError("invalid_transition", "This call is not ready to connect.", status=409)

    now = timezone.now()
    updated = CallSession.objects.filter(pk=call.pk, status=STATUS_ACCEPTED).update(
        status=STATUS_CONNECTED, connected_at=now,
    )
    call.refresh_from_db()
    if updated:
        _log_event(call, EVENT_CONNECTED, user)
        logger.info(
            "voice-call: call=%s ticket=%s transition=accepted->connected",
            call.pk, call.ticket_id,
        )
        _push_state(call)
    return call


def end_call(user, call, reason=None):
    """Hang up, from either side, from any live state.

    Terminal calls are returned untouched rather than erroring: a hangup that
    crosses the other party's hangup on the wire is the normal case, not a
    fault, and "end" is the one operation that must always appear to succeed
    so a client is never stuck holding a call it cannot close. This is also
    the replay guard — an old `end` for an already-ended call changes nothing
    and cannot resurrect or re-time it.
    """
    expire_if_due(call)
    if call.status in TERMINAL_STATUSES:
        return call

    if reason is None:
        reason = END_CALLER_ENDED if user.id == call.caller_id else END_RECEIVER_ENDED

    now = timezone.now()
    duration = 0
    if call.connected_at:
        duration = max(0, int((now - call.connected_at).total_seconds()))

    # A call that never connected ends as `missed` (nobody spoke) rather than
    # `ended`, so call history distinguishes "hung up while ringing" from
    # "had a conversation". The caller abandoning their own ring is a
    # cancellation.
    if call.status == STATUS_RINGING:
        new_status = STATUS_CANCELLED if user.id == call.caller_id else STATUS_MISSED
    else:
        new_status = STATUS_ENDED

    before = call.status
    updated = CallSession.objects.filter(pk=call.pk, status__in=ACTIVE_STATUSES).update(
        status=new_status,
        end_reason=reason,
        ended_at=now,
        duration_seconds=duration,
        active_key=None,
    )
    call.refresh_from_db()
    if updated:
        _log_event(call, EVENT_ENDED, user, f"{before}->{new_status}:{reason}")
        logger.info(
            "voice-call: call=%s ticket=%s transition=%s->%s reason=%s duration=%ss",
            call.pk, call.ticket_id, before, new_status, reason, duration,
        )
        _push_state(call)
    return call


def fail_call(user, call, reason):
    """Negotiation or transport died. Distinct from end_call so the failure
    category survives in history instead of looking like a normal hangup."""
    expire_if_due(call)
    if call.status in TERMINAL_STATUSES:
        return call

    now = timezone.now()
    duration = 0
    if call.connected_at:
        duration = max(0, int((now - call.connected_at).total_seconds()))

    before = call.status
    updated = CallSession.objects.filter(pk=call.pk, status__in=ACTIVE_STATUSES).update(
        status=STATUS_FAILED,
        end_reason=reason,
        ended_at=now,
        duration_seconds=duration,
        active_key=None,
    )
    call.refresh_from_db()
    if updated:
        _log_event(call, EVENT_FAILED, user, f"{before}->failed:{reason}")
        logger.warning(
            "voice-call: call=%s ticket=%s transition=%s->failed reason=%s",
            call.pk, call.ticket_id, before, reason,
        )
        _push_state(call)
    return call


# ── Recording ───────────────────────────────────────────────────────────────

def recording_enabled():
    """Whether calls on this deployment are recorded.

    Reported to both browsers by the config endpoint so the agent's recorder
    and the customer's "this call is recorded" notice are driven by one flag.
    They must never disagree — a recording made without the notice showing is
    the failure mode this single source of truth exists to prevent.
    """
    return bool(getattr(settings, "VOICE_CALL_RECORDING_ENABLED", False))


def attach_recording(agent, call, upload):
    """Store the agent-side recording of a finished call.

    Only the agent who actually handled the call may upload one (a superuser
    included, matching how the rest of the panel treats the two roles). That
    is stricter than CallSession.is_participant on purpose: any staff member
    can *see* a call, but audio for a conversation someone else handled has no
    business arriving from their browser.

    Refuses to replace an existing recording. The upload is a one-shot
    post-call action, so a second one is either a duplicate from a retry or an
    attempt to overwrite the record of what was said — neither should win.
    """
    if not recording_enabled():
        raise CallError("recording_disabled", "Call recording is not enabled.", status=409)
    if not getattr(agent, "is_staff", False):
        raise CallError("not_authorized", "Only support agents can upload recordings.", status=403)
    if call.receiver_id != agent.id and not getattr(agent, "is_superuser", False):
        raise CallError("not_authorized", "This call was handled by another agent.", status=403)
    if call.recording:
        raise CallError("recording_exists", "This call already has a recording.", status=409)
    if upload is None:
        raise CallError("recording_missing", "No audio was uploaded.", status=400)

    max_bytes = int(getattr(settings, "VOICE_CALL_RECORDING_MAX_BYTES", 25 * 1024 * 1024))
    size = getattr(upload, "size", 0) or 0
    if size <= 0:
        raise CallError("recording_empty", "The uploaded audio was empty.", status=400)
    if size > max_bytes:
        raise CallError("recording_too_large", "That recording is too large to store.", status=413)

    # Content type is checked against a fixed set rather than sniffed: the only
    # producer is MediaRecorder, whose container set is known and small. The
    # stored extension comes from this too — see call_recording_path, which
    # never uses the client's filename.
    content_type = (getattr(upload, "content_type", "") or "").split(";")[0].strip().lower()
    if content_type not in RECORDING_CONTENT_TYPES:
        raise CallError(
            "recording_unsupported",
            "That audio format is not supported.",
            status=415,
        )
    ext = {"audio/mp4": "mp4", "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/ogg": "ogg"}.get(
        content_type, "webm",
    )
    if ext not in RECORDING_EXTENSIONS:
        ext = "webm"

    call.recording.save(f"call-{call.pk}.{ext}", upload, save=False)
    call.recording_bytes = size
    call.recording_uploaded_at = timezone.now()
    call.save(update_fields=["recording", "recording_bytes", "recording_uploaded_at", "updated_at"])

    _log_event(call, EVENT_RECORDED, agent, f"{size}B:{content_type}")
    logger.info(
        "voice-call: call=%s ticket=%s recording stored bytes=%s type=%s",
        call.pk, call.ticket_id, size, content_type,
    )
    return call
