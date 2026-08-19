# authapp/consumers/live_chat_consumer.py
#
# LIVE-CHAT: for chat, these consumers are receive-only — message persistence
# always happens over REST (authapp/services/live_chat_service.py), which
# then pushes to these consumers via the channel layer. See that module's
# module docstring for why (message-delivery-failure resilience). No chat
# message is ever accepted over a socket, and that has not changed.
#
# VOICE-CALL added the one exception, and only for traffic that must not be
# persisted: WebRTC signaling (SDP/ICE/mute). See the "WebRTC signaling relay"
# section below for the frames that are accepted and how each one is
# re-validated. Call *state* still moves over REST like everything else.
#
# Auth: the browser's native WebSocket API can't set an Authorization
# header, so the JWT access token is passed as a query param
# (?token=...) and validated manually here — there is no session auth in
# this project (JWTAuthentication only), so AuthMiddlewareStack doesn't
# apply.

import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework_simplejwt.tokens import AccessToken

from authapp.models.support_ticket_models import SupportTicket

logger = logging.getLogger(__name__)


@database_sync_to_async
def _authenticate(query_string):
    from django.contrib.auth import get_user_model

    token = parse_qs(query_string).get("token", [None])[0]
    if not token:
        return None
    try:
        validated = AccessToken(token)
        user = get_user_model().objects.get(pk=validated["user_id"])
    except Exception:
        return None
    return user


@database_sync_to_async
def _get_ticket(ticket_id):
    try:
        return SupportTicket.objects.select_related("user").get(pk=ticket_id, is_live_chat=True)
    except SupportTicket.DoesNotExist:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# VOICE-CALL: WebRTC signaling relay
#
# This is the one place in the project where a browser sends data *into* a
# consumer. Chat deliberately does not (see the module docstring above), and
# that stays true — nothing below writes a ChatMessage or touches a ticket.
# Only ephemeral negotiation traffic travels here: SDP offer/answer, ICE
# candidates, and mute indicators. Everything that changes persistent call
# state still goes over REST (authapp/views/voice_call_views.py), so a dropped
# socket can never lose a call's status the way it could lose a message.
#
# The security model is "re-verify every frame". An open socket proves who the
# user is, never what they may do: each inbound frame is looked up against the
# CallSession in the database and dropped unless that user is one of the two
# confirmed endpoints of that specific call. A client-supplied room name is
# never used — the group is always derived from the call's own primary key.
# ─────────────────────────────────────────────────────────────────────────────

# SDP bodies are a few KB in practice; ICE candidates a few hundred bytes.
# The cap exists so a signaling frame cannot be used to push large payloads
# through the channel layer (Redis) at another participant.
MAX_SIGNAL_BYTES = 64 * 1024

# Relayable signal types. `call.subscribe` is handled separately because it
# changes group membership rather than being forwarded.
RELAYABLE_SIGNALS = {
    "call.offer": "offer",
    "call.answer": "answer",
    "call.ice_candidate": "ice_candidate",
    "call.mute": "mute",
    "call.unmute": "unmute",
}


@database_sync_to_async
def _load_call_for_endpoint(user, call_id):
    """Async adapter only. The actual authorization rule lives in
    voice_call_service.load_call_for_endpoint — see its docstring for why it is
    stricter than CallSession.is_participant, and why it refuses terminal
    calls. Keeping the rule in the service (and this a one-line adapter) is
    what lets it be tested without standing up a socket."""
    from authapp.services.voice_call_service import load_call_for_endpoint

    return load_call_for_endpoint(user, call_id)


class CallSignalingMixin:
    """Shared by both consumers so the customer socket and the agent socket
    cannot drift apart on how signaling is validated."""

    async def _call_subscribe(self, call_id):
        from authapp.services.voice_call_service import call_group

        call = await _load_call_for_endpoint(self.user, call_id)
        if call is None:
            # Not an error the client can act on, and saying *why* would leak
            # whether a given call id exists. Log for operators, stay quiet on
            # the wire.
            logger.info(
                "voice-call: refused signaling subscribe user=%s call=%s",
                getattr(self.user, "id", None), call_id,
            )
            await self.send_json({"event": "call_subscribe_denied", "data": {"call_id": call_id}})
            return

        group = call_group(call.pk)
        self._call_groups.add(group)
        await self.channel_layer.group_add(group, self.channel_name)
        await self.send_json({"event": "call_subscribed", "data": {"call_id": call.pk}})

    async def _call_relay(self, action, content):
        from authapp.services.voice_call_service import call_group

        raw_id = content.get("call_id")
        try:
            call_id = int(raw_id)
        except (TypeError, ValueError):
            return

        call = await _load_call_for_endpoint(self.user, call_id)
        if call is None:
            logger.info(
                "voice-call: dropped %s from user=%s for call=%s (not an endpoint or not live)",
                action, getattr(self.user, "id", None), call_id,
            )
            return

        signal = RELAYABLE_SIGNALS[action]
        data = content.get("data")
        if data is not None:
            try:
                if len(str(data)) > MAX_SIGNAL_BYTES:
                    logger.warning(
                        "voice-call: oversized %s dropped for call=%s", signal, call_id,
                    )
                    return
            except Exception:
                return

        await self.channel_layer.group_send(call_group(call.pk), {
            "type": "call.event",
            "payload": {
                "event": "call_signal",
                "call_id": call.pk,
                "signal": signal,
                "data": data,
                "from_user_id": self.user.id,
            },
            # Group sends fan out to every member including the sender; the
            # handler drops its own echo on this.
            "sender_channel": self.channel_name,
        })

    async def handle_call_frame(self, content):
        """Returns True if the frame was a call frame (handled or rejected)."""
        action = content.get("action")
        if action == "call.subscribe":
            try:
                call_id = int(content.get("call_id"))
            except (TypeError, ValueError):
                return True
            await self._call_subscribe(call_id)
            return True
        if action in RELAYABLE_SIGNALS:
            await self._call_relay(action, content)
            return True
        return False

    async def discard_call_groups(self):
        for group in getattr(self, "_call_groups", set()):
            try:
                await self.channel_layer.group_discard(group, self.channel_name)
            except Exception:  # pragma: no cover - teardown is best-effort
                pass
        self._call_groups = set()

    async def call_event(self, event):
        """Channel-layer handler for every call push — state changes from the
        REST layer and relayed signaling alike."""
        if event.get("sender_channel") == self.channel_name:
            return
        payload = event["payload"]
        await self.send_json({"event": payload.get("event", "call_state"), "data": payload})


class LiveChatSessionConsumer(CallSignalingMixin, AsyncJsonWebsocketConsumer):
    """ws/live-chat/<ticket_id>/ — one session's transcript. Reachable by
    the ticket's own user, or by any staff/admin.

    VOICE-CALL: also the customer's signaling socket. Chat behaviour below is
    unchanged; the call additions are the receive_json handler and the
    call_event push from the mixin.
    """

    async def connect(self):
        self.user = await _authenticate(self.scope["query_string"].decode())
        if self.user is None:
            await self.close(code=4001)
            return

        self.ticket_id = self.scope["url_route"]["kwargs"]["ticket_id"]
        ticket = await _get_ticket(self.ticket_id)
        if ticket is None:
            await self.close(code=4004)
            return
        if ticket.user_id != self.user.id and not self.user.is_staff:
            await self.close(code=4003)
            return

        self._call_groups = set()
        self.group_name = f"livechat_{self.ticket_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if getattr(self, "group_name", None):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        await self.discard_call_groups()

    async def receive_json(self, content, **kwargs):
        """VOICE-CALL only. Chat messages are still persisted over REST and
        are not accepted here — an unrecognised frame is ignored rather than
        answered, so this cannot become a second, unvalidated write path."""
        if not isinstance(content, dict):
            return
        await self.handle_call_frame(content)

    async def chat_message(self, event):
        await self.send_json({"event": "new_message", "data": event["payload"]})

    async def chat_read(self, event):
        await self.send_json({"event": "message_read", "data": event["payload"]})


class LiveChatAdminInboxConsumer(CallSignalingMixin, AsyncJsonWebsocketConsumer):
    """ws/live-chat/admin/inbox/ — admin-only, cross-session feed for the
    sidebar unread badge + session list, so an admin doesn't have to have
    a specific session open to be notified of new ones.

    VOICE-CALL: also the agent's ring channel and, once they accept, their
    signaling socket. Ringing reuses this group for exactly the reason chat
    already does — an agent must be reachable without having the relevant
    conversation open. Only call *metadata* is fanned out here (who is
    calling, which ticket); SDP and ICE never touch this group, they go to
    the per-call group the mixin joins after verifying the agent claimed
    that specific call.
    """

    GROUP_NAME = "livechat_admins"

    async def connect(self):
        self.user = await _authenticate(self.scope["query_string"].decode())
        if self.user is None or not self.user.is_staff:
            await self.close(code=4001 if self.user is None else 4003)
            return

        self._call_groups = set()
        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)
        await self.discard_call_groups()

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict):
            return
        await self.handle_call_frame(content)

    async def chat_message(self, event):
        await self.send_json({"event": "new_message", "data": event["payload"]})

    async def chat_created(self, event):
        await self.send_json({"event": "chat_created", "data": event["payload"]})

    async def chat_read(self, event):
        await self.send_json({"event": "message_read", "data": event["payload"]})
