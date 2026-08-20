"""
authapp/views/live_chat_views.py
─────────────────────────────────────────────────────────────────────────────
Live Support Chat — real-time human-agent chat (distinct from the rule-based
FAQ bot in chat_views.py). Backed by SupportTicket(is_live_chat=True) +
ChatMessage (see authapp/services/live_chat_service.py).

  • LiveChatConfigView              — GET  /api/live-chat/config/
  • LiveChatStartView               — POST /api/live-chat/start/
  • LiveChatMessageListCreateView   — GET/POST /api/live-chat/<ticket_id>/messages/
  • LiveChatReadView                — POST /api/live-chat/<ticket_id>/read/
  • AdminLiveChatListView           — GET  /api/admin-panel/live-chat/list/
  • AdminLiveChatMessageListCreateView — GET/POST /api/admin-panel/live-chat/<ticket_id>/messages/

Closing/resolving a session reuses the existing
PATCH /api/admin-panel/support/tickets/<id>/ (AdminSupportTicketUpdateView).

Two delivery-related notes, both load-bearing for the chat feeling
"instant" rather than "appears after a refresh":

1. The message-list endpoints deliberately opt OUT of the project-wide
   PageNumberPagination (PAGE_SIZE=20 in settings). A chat transcript is
   not a paged report: with pagination on, GET returned an envelope
   ({count, next, results}) instead of a list *and* silently truncated
   every conversation to its oldest 20 messages, so message 21 onwards
   could never appear no matter how many times the page was reloaded.

2. Both list endpoints accept ?after_id=<n> and return only messages
   newer than that id. That makes the clients' fallback poll cheap enough
   to run every couple of seconds (one indexed lookup, usually zero rows)
   instead of re-downloading the whole transcript.
"""
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.support_ticket_models import (
    SupportTicket,
    PARTICIPANT_AFFILIATE,
    PARTICIPANT_PLAYER,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.live_chat_serializers import (
    ChatMessageSerializer,
    LiveChatSessionSerializer,
)
from authapp.services import live_chat_service
from authapp.throttles import LiveChatSendRateThrottle

# How often a client without a live WebSocket should poll for new messages.
# Kept low because ?after_id= makes each poll a single indexed query that
# almost always returns an empty list.
FALLBACK_POLL_INTERVAL_MS = 2000


def _realtime_config():
    """What the browser needs in order to decide between WebSocket push and
    polling. See settings.LIVE_CHAT_REALTIME for why this can be False."""
    return {
        "realtime": bool(getattr(settings, "LIVE_CHAT_REALTIME", False)),
        "poll_interval_ms": FALLBACK_POLL_INTERVAL_MS,
    }


def _after_id_filter(queryset, request):
    """Applies ?after_id=<n>, ignoring a malformed value rather than 400ing —
    a bad poll should degrade to a full fetch, never break the chat."""
    raw = request.query_params.get("after_id")
    if not raw:
        return queryset
    try:
        return queryset.filter(id__gt=int(raw))
    except (TypeError, ValueError):
        return queryset


class LiveChatConfigView(APIView):
    """Lets both chat clients learn whether /ws/ can work here before they
    spend ~60s of exponential backoff failing to connect to it."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_realtime_config())


class LiveChatStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # `portal` is a hint, never an authorisation: the widget knows which
        # panel it was mounted in, but resolve_participant_type re-checks the
        # claim against an active AffiliateProfile before honouring it. The
        # session itself is always keyed to request.user, so the worst a
        # forged value can do is pick the wrong one of *your own* two threads.
        participant_type = live_chat_service.resolve_participant_type(
            request.user, (request.data.get("portal") or "").strip().lower(),
        )
        session, created = live_chat_service.get_or_create_active_session(
            request.user, participant_type,
        )
        if created:
            live_chat_service.notify_session_started(session)
        messages = session.chat_messages.all()
        return Response({
            "session": LiveChatSessionSerializer(session).data,
            "messages": ChatMessageSerializer(messages, many=True).data,
            **_realtime_config(),
        })


class LiveChatMessageListCreateView(generics.ListCreateAPIView):
    serializer_class = ChatMessageSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # see module docstring, note 1

    def _ticket(self):
        return get_object_or_404(
            SupportTicket, pk=self.kwargs["ticket_id"], user=self.request.user, is_live_chat=True,
        )

    def get_queryset(self):
        return _after_id_filter(self._ticket().chat_messages.all(), self.request)

    def create(self, request, *args, **kwargs):
        ticket = self._ticket()
        text = (request.data.get("message") or "").strip()
        if not text:
            return Response({"error": "message is required"}, status=400)
        # A resolved conversation is finished — see MESSAGEABLE_TICKET_STATUSES.
        if not live_chat_service.ticket_accepts_messages(ticket):
            return Response(
                {"error": "This conversation has been resolved.", "code": "ticket_not_active"},
                status=409,
            )
        msg = live_chat_service.post_message(
            ticket, "user", request.user, text,
            client_message_id=request.data.get("client_message_id"),
        )
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
        qs = (
            SupportTicket.objects
            .filter(is_live_chat=True)
            .select_related("user")
            .order_by("-updated_at")
        )
        # ?participant_type=player|affiliate backs the inbox's Players /
        # Affiliates tabs. An unrecognised value is ignored rather than 400ing
        # so the "All" tab and any older client keep working unchanged.
        wanted = (self.request.query_params.get("participant_type") or "").strip().lower()
        if wanted in {PARTICIPANT_PLAYER, PARTICIPANT_AFFILIATE}:
            qs = qs.filter(participant_type=wanted)
        return qs


class AdminLiveChatMessageListCreateView(generics.ListCreateAPIView):
    serializer_class = ChatMessageSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    pagination_class = None  # see module docstring, note 1

    def _ticket(self):
        return get_object_or_404(SupportTicket, pk=self.kwargs["ticket_id"], is_live_chat=True)

    def get_queryset(self):
        return _after_id_filter(self._ticket().chat_messages.all(), self.request)

    def create(self, request, *args, **kwargs):
        ticket = self._ticket()
        text = (request.data.get("message") or "").strip()
        if not text:
            return Response({"error": "message is required"}, status=400)
        # Same gate as the customer side — resolving ends it for both.
        if not live_chat_service.ticket_accepts_messages(ticket):
            return Response(
                {"error": "This conversation has been resolved.", "code": "ticket_not_active"},
                status=409,
            )
        msg = live_chat_service.post_message(
            ticket, "admin", request.user, text,
            client_message_id=request.data.get("client_message_id"),
        )
        return Response(ChatMessageSerializer(msg).data, status=201)


class AdminLiveChatReadView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, pk=ticket_id, is_live_chat=True)
        ids = live_chat_service.mark_read(ticket, reader_is_admin=True)
        return Response({"marked_read": ids})
