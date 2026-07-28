"""
authapp/views/live_chat_views.py
─────────────────────────────────────────────────────────────────────────────
Live Support Chat — real-time human-agent chat (distinct from the rule-based
FAQ bot in chat_views.py). Backed by SupportTicket(is_live_chat=True) +
ChatMessage (see authapp/services/live_chat_service.py).

  • LiveChatStartView               — POST /api/live-chat/start/
  • LiveChatMessageListCreateView   — GET/POST /api/live-chat/<ticket_id>/messages/
  • LiveChatReadView                — POST /api/live-chat/<ticket_id>/read/
  • AdminLiveChatListView           — GET  /api/admin-panel/live-chat/list/
  • AdminLiveChatMessageListCreateView — GET/POST /api/admin-panel/live-chat/<ticket_id>/messages/

Closing/resolving a session reuses the existing
PATCH /api/admin-panel/support/tickets/<id>/ (AdminSupportTicketUpdateView).
"""
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.support_ticket_models import SupportTicket
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.live_chat_serializers import (
    ChatMessageSerializer,
    LiveChatSessionSerializer,
)
from authapp.services import live_chat_service
from authapp.throttles import LiveChatSendRateThrottle


class LiveChatStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        session, created = live_chat_service.get_or_create_active_session(request.user)
        if created:
            live_chat_service.notify_session_started(session)
        messages = session.chat_messages.all()
        return Response({
            "session": LiveChatSessionSerializer(session).data,
            "messages": ChatMessageSerializer(messages, many=True).data,
        })


class LiveChatMessageListCreateView(generics.ListCreateAPIView):
    serializer_class = ChatMessageSerializer
    permission_classes = [IsAuthenticated]

    def _ticket(self):
        return get_object_or_404(
            SupportTicket, pk=self.kwargs["ticket_id"], user=self.request.user, is_live_chat=True,
        )

    def get_queryset(self):
        return self._ticket().chat_messages.all()

    def create(self, request, *args, **kwargs):
        ticket = self._ticket()
        text = (request.data.get("message") or "").strip()
        if not text:
            return Response({"error": "message is required"}, status=400)
        msg = live_chat_service.post_message(ticket, "user", request.user, text)
        return Response(ChatMessageSerializer(msg).data, status=201)

    def get_throttles(self):
        # Only throttle sends, not the read/list path.
        if self.request.method == "POST":
            return [LiveChatSendRateThrottle()]
        return []


class LiveChatReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, pk=ticket_id, user=request.user, is_live_chat=True)
        ids = live_chat_service.mark_read(ticket, reader_is_admin=False)
        return Response({"marked_read": ids})


class AdminLiveChatListView(generics.ListAPIView):
    serializer_class = LiveChatSessionSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        return (
            SupportTicket.objects
            .filter(is_live_chat=True)
            .select_related("user")
            .order_by("-updated_at")
        )


class AdminLiveChatMessageListCreateView(generics.ListCreateAPIView):
    serializer_class = ChatMessageSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def _ticket(self):
        return get_object_or_404(SupportTicket, pk=self.kwargs["ticket_id"], is_live_chat=True)

    def get_queryset(self):
        return self._ticket().chat_messages.all()

    def create(self, request, *args, **kwargs):
        ticket = self._ticket()
        text = (request.data.get("message") or "").strip()
        if not text:
            return Response({"error": "message is required"}, status=400)
        msg = live_chat_service.post_message(ticket, "admin", request.user, text)
        return Response(ChatMessageSerializer(msg).data, status=201)


class AdminLiveChatReadView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, pk=ticket_id, is_live_chat=True)
        ids = live_chat_service.mark_read(ticket, reader_is_admin=True)
        return Response({"marked_read": ids})
