# Live Support Chat — real-time, human-agent chat, backed by SupportTicket
# (is_live_chat=True) + ChatMessage. Distinct from chat_service.py, which is
# the stateless rule-based FAQ bot behind POST /api/chat/message/.
#
# Persistence always happens here (post_message), never inside a WebSocket
# consumer — the consumer is receive-only. That way a message is never lost
# just because a socket dropped: the REST call that saved it also pushes the
# realtime event, and a client that missed the push can always re-fetch the
# thread over REST.

import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from authapp.models.affiliate_models import AffiliateProfile
from authapp.models.support_ticket_models import (
    SupportTicket,
    ChatMessage,
    PARTICIPANT_AFFILIATE,
    PARTICIPANT_PLAYER,
)

logger = logging.getLogger(__name__)

LIVE_CHAT_SUBJECT = "Live Chat Session"
AFFILIATE_LIVE_CHAT_SUBJECT = "Affiliate Live Chat Session"
ACTIVE_STATUSES = ["open", "in_progress"]


def resolve_participant_type(user, requested):
    """Decides which portal a session belongs to.

    The client says which portal it *thinks* it is (it knows which panel the
    widget was opened from), but that claim is only ever honoured after
    checking the database: "affiliate" requires a real, active AffiliateProfile
    on the authenticated user. Anything else — a forged body, a stale hint from
    a revoked affiliate — falls back to "player" rather than being trusted or
    rejected outright. A user cannot reach another user's thread either way,
    since the session is always looked up by request.user.
    """
    if requested != PARTICIPANT_AFFILIATE:
        return PARTICIPANT_PLAYER
    is_affiliate = AffiliateProfile.objects.filter(user=user, is_active=True).exists()
    return PARTICIPANT_AFFILIATE if is_affiliate else PARTICIPANT_PLAYER


def get_or_create_active_session(user, participant_type=PARTICIPANT_PLAYER):
    """One active live-chat session per user *per portal*. A resolved/closed
    session no longer counts, so the next click starts a fresh one — prior
    sessions remain visible in ticket history.

    Scoping by participant_type is what stops the same person's affiliate
    conversation and player conversation from collapsing into one thread:
    AffiliateProfile is a OneToOne on User, so both portals authenticate as
    the same User row and the FK alone can't tell them apart.
    """
    session = (
        SupportTicket.objects
        .filter(
            user=user,
            is_live_chat=True,
            participant_type=participant_type,
            status__in=ACTIVE_STATUSES,
        )
        .order_by("-created_at")
        .first()
    )
    created = False
    if session is None:
        session = SupportTicket.objects.create(
            user=user,
            subject=(
                AFFILIATE_LIVE_CHAT_SUBJECT
                if participant_type == PARTICIPANT_AFFILIATE
                else LIVE_CHAT_SUBJECT
            ),
            message="(live chat session)",
            is_live_chat=True,
            participant_type=participant_type,
            status="open",
        )
        created = True
    return session, created


def _broadcast(group, event_type, payload):
    """Best-effort push to the channel layer. Never raises — if Channels
    isn't configured (or the layer is briefly unavailable), the message is
    still safely persisted; connected clients simply fall back to their
    next poll instead of getting instant push.

    The failure is logged rather than swallowed silently: a broadcast that
    quietly does nothing is indistinguishable, from the outside, from the
    exact "message only shows up after a refresh" symptom this feature is
    meant to avoid, and that made the original bug much harder to find
    than it needed to be."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        layer = get_channel_layer()
        if layer is None:
            logger.warning("live-chat: no channel layer configured; skipping %s push", event_type)
            return
        async_to_sync(layer.group_send)(group, {"type": event_type, "payload": payload})
    except Exception:
        logger.exception("live-chat: failed to broadcast %s to %s", event_type, group)


def _message_payload(ticket, msg):
    return {
        "id": msg.id,
        "ticket_id": ticket.id,
        # Lets the admin inbox file an incoming message under Players or
        # Affiliates without re-fetching the session list to find out which.
        "participant_type": ticket.participant_type,
        "sender_type": msg.sender_type,
        "message": msg.message,
        "is_read": msg.is_read,
        "client_message_id": msg.client_message_id,
        "created_at": msg.created_at.isoformat(),
    }


# Ticket states that still accept new messages. Deliberately the same pair as
# voice_call_service.CALLABLE_TICKET_STATUSES: a resolved or closed
# conversation is over, and letting a late message through would silently
# revive it behind the status machine both admin tabs read from — the session
# would show as resolved while still accumulating replies.
MESSAGEABLE_TICKET_STATUSES = ("open", "in_progress")


def ticket_accepts_messages(ticket):
    """True while the conversation is still live. Checked in the views so the
    caller controls the HTTP response, matching how the rest of this module
    keeps transport concerns out of the service layer."""
    return ticket.status in MESSAGEABLE_TICKET_STATUSES


def post_message(ticket, sender_type, sender_user, text, client_message_id=None):
    # Stored as plain text, not HTML-escaped — every consumer (both chat
    # widgets) renders this as text content, not raw HTML, so escaping here
    # would just show up as literal "&amp;"/"&lt;" to the recipient.
    text = (text or "").strip()
    if not text:
        return None

    client_message_id = (client_message_id or "").strip() or None

    # Idempotent on client_message_id (see the field's comment): a retried
    # send whose first attempt actually landed returns the original row
    # instead of writing a second copy. Racing requests are caught by the
    # unique constraint rather than by a check-then-insert, which would still
    # let two concurrent retries through.
    if client_message_id:
        existing = ChatMessage.objects.filter(
            ticket=ticket, client_message_id=client_message_id,
        ).first()
        if existing:
            return existing

    try:
        with transaction.atomic():
            msg = ChatMessage.objects.create(
                ticket=ticket,
                sender_type=sender_type,
                sender=sender_user,
                message=text,
                client_message_id=client_message_id,
            )
    except IntegrityError:
        if not client_message_id:
            raise
        existing = ChatMessage.objects.filter(
            ticket=ticket, client_message_id=client_message_id,
        ).first()
        if existing is None:
            raise
        return existing

    update_fields = ["updated_at"]
    if sender_type == "user" and ticket.status == "open":
        ticket.status = "in_progress"
        update_fields.append("status")
    ticket.updated_at = timezone.now()
    ticket.save(update_fields=update_fields)

    payload = _message_payload(ticket, msg)
    _broadcast(f"livechat_{ticket.id}", "chat.message", payload)
    _broadcast("livechat_admins", "chat.message", payload)
    return msg


def notify_session_started(ticket):
    payload = {
        "ticket_id": ticket.id,
        "participant_type": ticket.participant_type,
        "user_uid": getattr(ticket.user, "user_uid", None),
        "email": ticket.user.email,
        "name": getattr(ticket.user, "name", "") or "",
        "status": ticket.status,
        "created_at": ticket.created_at.isoformat(),
    }
    _broadcast("livechat_admins", "chat.created", payload)


def mark_read(ticket, reader_is_admin):
    """Marks the *other* side's messages as read and broadcasts it."""
    other_sender = "user" if reader_is_admin else "admin"
    updated = ChatMessage.objects.filter(ticket=ticket, sender_type=other_sender, is_read=False)
    ids = list(updated.values_list("id", flat=True))
    if not ids:
        return []
    updated.update(is_read=True)
    payload = {
        "ticket_id": ticket.id,
        "participant_type": ticket.participant_type,
        "message_ids": ids,
    }
    _broadcast(f"livechat_{ticket.id}", "chat.read", payload)
    _broadcast("livechat_admins", "chat.read", payload)
    return ids
