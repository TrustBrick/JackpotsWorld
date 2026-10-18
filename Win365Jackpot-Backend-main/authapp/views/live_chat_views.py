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
import logging

from django.conf import settings
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.support_ticket_models import (
    ChatMessage,
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
from authapp.utils.file_validation import validate_uploaded_document

try:  # botocore is only present when S3 storage is in play
    from botocore.exceptions import ClientError
except ImportError:  # pragma: no cover - local filesystem storage
    class ClientError(Exception):
        pass

logger = logging.getLogger(__name__)

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
        try:
            session, created = live_chat_service.get_or_create_active_session(
                request.user, participant_type,
            )
        except live_chat_service.ChatRestricted as exc:
            # 403 with the player-safe message only. The admin's reason and
            # internal note are never serialised here -- see
            # services/communication_restriction_service.py.
            body = {"error": exc.message, "code": "chat_restricted"}
            if exc.result is not None:
                body["restriction"] = {
                    "scope": exc.result.scope,
                    "until": exc.result.until.isoformat() if exc.result.until else None,
                }
            return Response(body, status=403)
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

    # Multipart so a document can ride along with the message. JSON still works
    # unchanged -- DRF selects the parser from the request's content type, so
    # every existing text-only client is untouched.
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _ticket(self):
        return get_object_or_404(
            SupportTicket, pk=self.kwargs["ticket_id"], user=self.request.user, is_live_chat=True,
        )

    def get_queryset(self):
        return _after_id_filter(self._ticket().chat_messages.all(), self.request)

    def create(self, request, *args, **kwargs):
        ticket = self._ticket()
        text = (request.data.get("message") or "").strip()
        attachment = request.FILES.get("attachment")

        # An attachment on its own is a complete message; nothing at all is not.
        if not text and attachment is None:
            return Response({"error": "message or attachment is required"}, status=400)

        if attachment is not None:
            # Validated server-side against the file's own bytes -- never the
            # filename or Content-Type the client claimed, since both are
            # attacker-controlled. Raises a DRF ValidationError, rendered as a
            # 400 carrying the reason the sender needs.
            validate_uploaded_document(attachment)
        # A resolved conversation is finished — see MESSAGEABLE_TICKET_STATUSES.
        if not live_chat_service.ticket_accepts_messages(ticket):
            return Response(
                {"error": "This conversation has been resolved.", "code": "ticket_not_active"},
                status=409,
            )
        msg = live_chat_service.post_message(
            ticket, "user", request.user, text,
            client_message_id=request.data.get("client_message_id"),
            attachment=attachment,
        )
        return Response(ChatMessageSerializer(msg).data, status=201)

    def get_throttles(self):
        # Only throttle sends, not the read/list path.
        if self.request.method == "POST":
            return [LiveChatSendRateThrottle()]
        return []


class LiveChatAttachmentView(APIView):
    """Download one chat attachment, authorising the requester first.

    The file is deliberately NOT handed out as a storage URL. On the local
    filesystem backend a storage URL is a permanently public, guessable
    /media/ path; on S3 it is a presigned link that anyone holding it can
    replay until it expires. Both hand the document to whoever has the
    string. Routing the bytes through here instead means entitlement is
    re-checked against the requester's own session on every fetch, which is
    what verifying authorisation server-side actually requires.

    Entitlement is: the player who owns the conversation, or support staff.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, message_id):
        msg = get_object_or_404(
            ChatMessage.objects.select_related("ticket"), pk=message_id,
        )
        if not msg.attachment:
            raise Http404

        user = request.user
        owns_conversation = msg.ticket.user_id == user.id
        # The same predicate the admin chat views gate on, so agent access to a
        # document can never be broader than agent access to the conversation.
        is_support = IsAdminOrSuperAdmin().has_permission(request, self)
        if not (owns_conversation or is_support):
            # 404 rather than 403: a stranger should not even learn that the
            # message exists.
            raise Http404

        try:
            fh = msg.attachment.open("rb")
        except (FileNotFoundError, OSError, ClientError):
            logger.warning("chat attachment %s missing from storage", msg.pk)
            raise Http404

        # as_attachment forces a download rather than an in-origin render, so a
        # crafted document can never execute against this site's origin, and
        # nosniff stops the browser second-guessing the declared type.
        resp = FileResponse(
            fh,
            as_attachment=True,
            filename=msg.attachment_name or "attachment",
        )
        resp["X-Content-Type-Options"] = "nosniff"
        resp["Cache-Control"] = "private, no-store"
        return resp


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

    # Multipart so a document can ride along with the message. JSON still works
    # unchanged -- DRF selects the parser from the request's content type, so
    # every existing text-only client is untouched.
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _ticket(self):
        return get_object_or_404(SupportTicket, pk=self.kwargs["ticket_id"], is_live_chat=True)

    def get_queryset(self):
        return _after_id_filter(self._ticket().chat_messages.all(), self.request)

    def create(self, request, *args, **kwargs):
        ticket = self._ticket()
        text = (request.data.get("message") or "").strip()
        attachment = request.FILES.get("attachment")

        # An attachment on its own is a complete message; nothing at all is not.
        if not text and attachment is None:
            return Response({"error": "message or attachment is required"}, status=400)

        if attachment is not None:
            # Validated server-side against the file's own bytes -- never the
            # filename or Content-Type the client claimed, since both are
            # attacker-controlled. Raises a DRF ValidationError, rendered as a
            # 400 carrying the reason the sender needs.
            validate_uploaded_document(attachment)
        # Same gate as the customer side — resolving ends it for both.
        if not live_chat_service.ticket_accepts_messages(ticket):
            return Response(
                {"error": "This conversation has been resolved.", "code": "ticket_not_active"},
                status=409,
            )
        msg = live_chat_service.post_message(
            ticket, "admin", request.user, text,
            client_message_id=request.data.get("client_message_id"),
            attachment=attachment,
        )
        return Response(ChatMessageSerializer(msg).data, status=201)


class AdminLiveChatReadView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, pk=ticket_id, is_live_chat=True)
        ids = live_chat_service.mark_read(ticket, reader_is_admin=True)
        return Response({"marked_read": ids})


# ─── Presence + agent-initiated conversations ────────────────────────────────

class LiveChatPresenceView(APIView):
    """POST /api/live-chat/presence/  {"portal": "player"|"affiliate"}

    The signed-in site's heartbeat. Stamps the caller as online (for the
    Back Office contact picker's green dot) and tells the widget whether an
    agent has reached out on this portal's active conversation:

      session_id              -- the active live conversation, or null
      latest_admin_message_id -- newest agent message on it the user has not
                                 read, so the widget opens only for new ones
      incoming_call           -- a support callback ringing this user right
                                 now, so a widget that was not connected when
                                 the ring went out can still show it
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from authapp.models.call_models import CallSession, DIRECTION_OUTBOUND, STATUS_RINGING
        from authapp.services import presence_service, voice_call_service

        presence_service.touch(request.user)
        participant_type = live_chat_service.resolve_participant_type(
            request.user, (request.data.get("portal") or "").strip().lower(),
        )
        session = (
            SupportTicket.objects
            .filter(
                user=request.user, is_live_chat=True,
                participant_type=participant_type,
                status__in=live_chat_service.ACTIVE_STATUSES,
            )
            .order_by("-created_at")
            .first()
        )
        body = {
            "heartbeat_seconds": presence_service.PRESENCE_HEARTBEAT_SECONDS,
            "session_id": None,
            "latest_admin_message_id": None,
            "incoming_call": None,
        }
        if session is None:
            return Response(body)

        body["session_id"] = session.pk
        body["latest_admin_message_id"] = (
            session.chat_messages
            .filter(sender_type="admin", is_read=False)
            .order_by("-id")
            .values_list("id", flat=True)
            .first()
        )
        call = (
            CallSession.objects
            .filter(ticket=session, receiver=request.user,
                    direction=DIRECTION_OUTBOUND, status=STATUS_RINGING)
            .order_by("-id")
            .first()
        )
        if call is not None:
            voice_call_service.expire_if_due(call)
            if call.status == STATUS_RINGING:
                body["incoming_call"] = voice_call_service.call_payload(call)
        return Response(body)


def _contact_row(user, affiliate_ids, active_by_key, now):
    from authapp.services import presence_service

    is_affiliate = user.pk in affiliate_ids
    return {
        "id": user.pk,
        "user_uid": user.user_uid,
        "name": user.name or "",
        "email": user.email,
        "phone": f"{user.dial_code} {user.phone}".strip() if user.phone else "",
        "is_affiliate": is_affiliate,
        "affiliate_id": f"AFF-{user.user_uid}" if is_affiliate else None,
        "is_online": presence_service.is_online(user, now),
        "last_seen_at": user.last_seen_at.isoformat() if user.last_seen_at else None,
        "player_session_id": active_by_key.get((user.pk, PARTICIPANT_PLAYER)),
        "affiliate_session_id": active_by_key.get((user.pk, PARTICIPANT_AFFILIATE)),
    }


class AdminLiveChatContactsView(APIView):
    """GET /api/admin-panel/live-chat/contacts/?q=<text>&type=all|player|affiliate

    Players and affiliates an agent can start a conversation with, each with
    an online flag. With no search text it lists who is online right now, so
    the agent can see at a glance who is reachable.
    """
    permission_classes = [IsAdminOrSuperAdmin]
    LIMIT = 30

    def get(self, request):
        from django.contrib.auth import get_user_model
        from django.db.models import Q
        from django.utils import timezone
        from authapp.models.affiliate_models import AffiliateProfile
        from authapp.services import presence_service

        User = get_user_model()
        q = (request.query_params.get("q") or "").strip()
        kind = (request.query_params.get("type") or "all").strip().lower()
        now = timezone.now()

        qs = User.objects.filter(is_active=True, is_staff=False)
        if kind == PARTICIPANT_AFFILIATE:
            qs = qs.filter(pk__in=AffiliateProfile.objects.filter(is_active=True).values("user_id"))
        if q:
            uid = q.upper().removeprefix("AFF-")
            qs = qs.filter(
                Q(name__icontains=q) | Q(email__icontains=q)
                | Q(user_uid__icontains=uid) | Q(phone__icontains=q)
            )
        else:
            qs = qs.filter(last_seen_at__gte=presence_service.online_cutoff(now))
        users = list(qs.order_by("-last_seen_at", "name")[: self.LIMIT])

        ids = [u.pk for u in users]
        affiliate_ids = set(
            AffiliateProfile.objects.filter(user_id__in=ids, is_active=True).values_list("user_id", flat=True)
        )
        active_by_key = {}
        for tid, uid, ptype in (
            SupportTicket.objects
            .filter(user_id__in=ids, is_live_chat=True, status__in=live_chat_service.ACTIVE_STATUSES)
            .order_by("created_at")
            .values_list("id", "user_id", "participant_type")
        ):
            active_by_key[(uid, ptype)] = tid

        from authapp.services import voice_call_service
        return Response({
            # Calling stays limited to the support desk roles (see
            # voice_call_service.is_call_eligible_agent); the picker uses this
            # to explain a disabled Call button instead of failing on click.
            "agent_can_call": voice_call_service.is_call_eligible_agent(request.user),
            "results": [_contact_row(u, affiliate_ids, active_by_key, now) for u in users],
        })


class AdminLiveChatStartView(APIView):
    """POST /api/admin-panel/live-chat/start/  {"user_id": n, "participant_type": "player"|"affiliate"}

    An agent opens (or rejoins) a conversation with a player or affiliate,
    instead of waiting for them to start one. Returns the session in the same
    shape as the inbox list, so the Back Office can select it straight away
    and text or call on it. The customer site picks it up on its next
    presence heartbeat and opens the chat widget.
    """
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request):
        from django.contrib.auth import get_user_model
        from authapp.models.affiliate_models import AffiliateProfile

        User = get_user_model()
        try:
            user = User.objects.get(pk=int(request.data.get("user_id")), is_active=True, is_staff=False)
        except (User.DoesNotExist, TypeError, ValueError):
            return Response({"error": "Player not found."}, status=404)

        participant_type = (request.data.get("participant_type") or PARTICIPANT_PLAYER).strip().lower()
        if participant_type not in {PARTICIPANT_PLAYER, PARTICIPANT_AFFILIATE}:
            return Response({"error": "participant_type must be player or affiliate."}, status=400)
        if (participant_type == PARTICIPANT_AFFILIATE
                and not AffiliateProfile.objects.filter(user=user, is_active=True).exists()):
            return Response({"error": "This user is not an active affiliate."}, status=400)

        try:
            session, created = live_chat_service.get_or_create_active_session(
                user, participant_type, greet=False,
            )
        except live_chat_service.ChatRestricted as exc:
            return Response({"error": exc.message, "code": "chat_restricted"}, status=409)
        if created:
            live_chat_service.notify_session_started(session)
        return Response({
            "created": created,
            "session": LiveChatSessionSerializer(session).data,
        }, status=201 if created else 200)
