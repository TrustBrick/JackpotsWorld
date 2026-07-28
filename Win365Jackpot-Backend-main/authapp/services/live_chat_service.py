# Live Support Chat — real-time, human-agent chat, backed by SupportTicket
# (is_live_chat=True) + ChatMessage. Distinct from chat_service.py, which is
# the stateless rule-based FAQ bot behind POST /api/chat/message/.
#
# Persistence always happens here (post_message), never inside a WebSocket
# consumer — the consumer is receive-only. That way a message is never lost
# just because a socket dropped: the REST call that saved it also pushes the
# realtime event, and a client that missed the push can always re-fetch the
# thread over REST.

from django.utils import timezone

from authapp.models.support_ticket_models import SupportTicket, ChatMessage

LIVE_CHAT_SUBJECT = "Live Chat Session"
ACTIVE_STATUSES = ["open", "in_progress"]


def get_or_create_active_session(user):
    """One active live-chat session per user (spec edge case). A
    resolved/closed session no longer counts, so the next click starts a
    fresh one — prior sessions remain visible in ticket history."""
    session = (
        SupportTicket.objects
        .filter(user=user, is_live_chat=True, status__in=ACTIVE_STATUSES)
        .order_by("-created_at")
        .first()
    )
    created = False
    if session is None:
        session = SupportTicket.objects.create(
            user=user,
            subject=LIVE_CHAT_SUBJECT,
            message="(live chat session)",
            is_live_chat=True,
            status="open",
        )
        created = True
    return session, created


def _broadcast(group, event_type, payload):
    """Best-effort push to the channel layer. Never raises — if Channels
    isn't configured (or the layer is briefly unavailable), the message is
    still safely persisted; connected clients simply fall back to their
    next poll instead of getting instant push."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(group, {"type": event_type, "payload": payload})
    except Exception:
        pass


def post_message(ticket, sender_type, sender_user, text):
    # Stored as plain text, not HTML-escaped — every consumer (both chat
    # widgets) renders this as text content, not raw HTML, so escaping here
    # would just show up as literal "&amp;"/"&lt;" to the recipient.
    text = (text or "").strip()
    if not text:
        return None

    msg = ChatMessage.objects.create(
        ticket=ticket,
        sender_type=sender_type,
        sender=sender_user,
        message=text,
    )

    update_fields = ["updated_at"]
    if sender_type == "user" and ticket.status == "open":
        ticket.status = "in_progress"
        update_fields.append("status")
    ticket.updated_at = timezone.now()
    ticket.save(update_fields=update_fields)

    payload = {
        "id": msg.id,
        "ticket_id": ticket.id,
        "sender_type": msg.sender_type,
        "message": msg.message,
        "is_read": msg.is_read,
        "created_at": msg.created_at.isoformat(),
    }
    _broadcast(f"livechat_{ticket.id}", "chat.message", payload)
    _broadcast("livechat_admins", "chat.message", payload)
    return msg


def notify_session_started(ticket):
    payload = {
        "ticket_id": ticket.id,
        "user_uid": getattr(ticket.user, "user_uid", None),
        "email": ticket.user.email,
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
    payload = {"ticket_id": ticket.id, "message_ids": ids}
    _broadcast(f"livechat_{ticket.id}", "chat.read", payload)
    _broadcast("livechat_admins", "chat.read", payload)
    return ids
