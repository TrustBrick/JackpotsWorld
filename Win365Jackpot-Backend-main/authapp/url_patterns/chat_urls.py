# authapp/url_patterns/chat_urls.py
from django.urls import path
from authapp.views.chat_views import ChatMessageView

# Public — mounted at api/
public_urlpatterns = [
    path("chat/message/", ChatMessageView.as_view()),
]
