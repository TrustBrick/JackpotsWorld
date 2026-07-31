# authapp/url_patterns/live_chat_urls.py
from django.urls import path
from authapp.views.live_chat_views import (
    LiveChatConfigView,
    LiveChatStartView,
    LiveChatMessageListCreateView,
    LiveChatReadView,
    AdminLiveChatListView,
    AdminLiveChatMessageListCreateView,
    AdminLiveChatReadView,
)

# Public (authenticated user) — mounted at api/
# `config/` is used by the admin panel too: it only reports transport
# capability, so it needs no admin-specific variant.
public_urlpatterns = [
    path("live-chat/config/", LiveChatConfigView.as_view()),
    path("live-chat/start/", LiveChatStartView.as_view()),
    path("live-chat/<int:ticket_id>/messages/", LiveChatMessageListCreateView.as_view()),
    path("live-chat/<int:ticket_id>/read/", LiveChatReadView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/
admin_urlpatterns = [
    path("live-chat/list/", AdminLiveChatListView.as_view()),
    path("live-chat/<int:ticket_id>/messages/", AdminLiveChatMessageListCreateView.as_view()),
    path("live-chat/<int:ticket_id>/read/", AdminLiveChatReadView.as_view()),
]
