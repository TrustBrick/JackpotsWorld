# authapp/consumers/live_chat_consumer.py
#
# LIVE-CHAT: receive-only WebSocket consumers — actual message persistence
# always happens over REST (authapp/services/live_chat_service.py), which
# then pushes to these consumers via the channel layer. See that module's
# module docstring for why (message-delivery-failure resilience).
#
# Auth: the browser's native WebSocket API can't set an Authorization
# header, so the JWT access token is passed as a query param
# (?token=...) and validated manually here — there is no session auth in
# this project (JWTAuthentication only), so AuthMiddlewareStack doesn't
# apply.

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework_simplejwt.tokens import AccessToken

from authapp.models.support_ticket_models import SupportTicket


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


class LiveChatSessionConsumer(AsyncJsonWebsocketConsumer):
    """ws/live-chat/<ticket_id>/ — one session's transcript. Reachable by
    the ticket's own user, or by any staff/admin."""

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

        self.group_name = f"livechat_{self.ticket_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if getattr(self, "group_name", None):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def chat_message(self, event):
        await self.send_json({"event": "new_message", "data": event["payload"]})

    async def chat_read(self, event):
        await self.send_json({"event": "message_read", "data": event["payload"]})


class LiveChatAdminInboxConsumer(AsyncJsonWebsocketConsumer):
    """ws/live-chat/admin/inbox/ — admin-only, cross-session feed for the
    sidebar unread badge + session list, so an admin doesn't have to have
    a specific session open to be notified of new ones."""

    GROUP_NAME = "livechat_admins"

    async def connect(self):
        self.user = await _authenticate(self.scope["query_string"].decode())
        if self.user is None or not self.user.is_staff:
            await self.close(code=4001 if self.user is None else 4003)
            return

        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)

    async def chat_message(self, event):
        await self.send_json({"event": "new_message", "data": event["payload"]})

    async def chat_created(self, event):
        await self.send_json({"event": "chat_created", "data": event["payload"]})

    async def chat_read(self, event):
        await self.send_json({"event": "message_read", "data": event["payload"]})
