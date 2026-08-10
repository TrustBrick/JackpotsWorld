# authapp/routing.py — LIVE-CHAT WebSocket routes, wired into backend/asgi.py.
from django.urls import re_path

from authapp.consumers.live_chat_consumer import (
    LiveChatSessionConsumer,
    LiveChatAdminInboxConsumer,
)

websocket_urlpatterns = [
    re_path(r"^ws/live-chat/admin/inbox/$", LiveChatAdminInboxConsumer.as_asgi()),
    re_path(r"^ws/live-chat/(?P<ticket_id>\d+)/$", LiveChatSessionConsumer.as_asgi()),
]
