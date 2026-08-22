"""
authapp/views/voice_call_views.py
─────────────────────────────────────────────────────────────────────────────
VOICE-CALL: REST surface for in-app support calls. Follows live_chat_views.py's
conventions exactly — same permission classes, same get_object_or_404-by-owner
scoping, same "customer routes at api/, agent routes at api/admin-panel/" split.

  Customer (IsAuthenticated, always scoped to request.user's own ticket)
    GET  /api/live-chat/calls/config/            transport + ICE servers
    POST /api/live-chat/<ticket_id>/calls/       start a call
    GET  /api/live-chat/<ticket_id>/calls/       history for that conversation
    GET  /api/live-chat/calls/<call_id>/         one call's state
    POST /api/live-chat/calls/<call_id>/connected/
    POST /api/live-chat/calls/<call_id>/end/
    POST /api/live-chat/calls/<call_id>/failed/
    GET  /api/live-chat/calls/                   the caller's own history

  Agent (IsAdminOrSuperAdmin)
    POST /api/admin-panel/live-chat/calls/<call_id>/accept/
    POST /api/admin-panel/live-chat/calls/<call_id>/reject/
    POST /api/admin-panel/live-chat/calls/<call_id>/connected/
    POST /api/admin-panel/live-chat/calls/<call_id>/end/
    POST /api/admin-panel/live-chat/calls/<call_id>/failed/
    GET  /api/admin-panel/live-chat/calls/       agent-visible history

No endpoint accepts a caller id, receiver id, agent id or signaling room id
from the request body. The caller is always request.user; the receiver is
always the authenticated agent who accepted; the room name is always derived
server-side from the call's own primary key.
"""
import logging

from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.call_models import (
    END_CONNECTION_FAILED,
    END_NETWORK_FAILURE,
    END_PERMISSION_DENIED,
    STATUS_RINGING,
    CallSession,
)
from authapp.models.support_ticket_models import SupportTicket
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.voice_call_serializers import CallSessionSerializer
from authapp.services import voice_call_service
from authapp.services.voice_call_service import CallError
from authapp.throttles import VoiceCallStartRateThrottle

logger = logging.getLogger(__name__)

# The only failure categories a client may report. Anything else is coerced to
# connection_failed rather than being written through — end_reason feeds
# support analytics, and a free-text field a browser can set would poison it.
CLIENT_FAILURE_REASONS = {
    END_CONNECTION_FAILED,
    END_NETWORK_FAILURE,
    END_PERMISSION_DENIED,
}


def _error(exc):
    return Response({"error": exc.message, "code": exc.code}, status=exc.status)


class VoiceCallConfigView(APIView):
    """What the browser needs before it can offer a call button.

    `available` is false on any deployment that cannot carry signaling across
    processes (see voice_call_service.calling_available) — the client hides
    the button rather than offering a call that would ring into nothing.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "available": voice_call_service.calling_available(),
            "ice_servers": voice_call_service.ice_servers(),
            "ring_timeout_seconds": getattr(settings, "VOICE_CALL_RING_TIMEOUT_SECONDS", 30),
        })


class TicketCallListCreateView(APIView):
    """Start a call on, or list calls for, one of the customer's own tickets."""
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        return [VoiceCallStartRateThrottle()] if self.request.method == "POST" else []

    def post(self, request, ticket_id):
        try:
            ticket = voice_call_service.get_callable_ticket(request.user, ticket_id)
            call, created = voice_call_service.initiate_call(request.user, ticket)
        except CallError as exc:
            return _error(exc)
        return Response(
            CallSessionSerializer(call).data, status=201 if created else 200,
        )

    def get(self, request, ticket_id):
        ticket = get_object_or_404(
            SupportTicket, pk=ticket_id, user=request.user, is_live_chat=True,
        )
        calls = (
            CallSession.objects
            .filter(ticket=ticket)
            .select_related("ticket", "caller", "receiver")
        )
        return Response(CallSessionSerializer(calls, many=True).data)


class CallDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, call_id):
        try:
            call = voice_call_service.get_call_for_participant(request.user, call_id)
        except CallError as exc:
            return _error(exc)
        return Response(CallSessionSerializer(call).data)


class _CallActionView(APIView):
    """Shared plumbing for the participant-scoped transitions.

    Both the customer and the agent routes resolve the call through
    get_call_for_participant, so neither can act on a call they are not part
    of — the permission class differs between the two mounts, but the
    ownership check is the same code either way.
    """
    permission_classes = [IsAuthenticated]

    def act(self, request, call):  # pragma: no cover - overridden
        raise NotImplementedError

    def post(self, request, call_id):
        try:
            call = voice_call_service.get_call_for_participant(request.user, call_id)
            call = self.act(request, call)
        except CallError as exc:
            return _error(exc)
        return Response(CallSessionSerializer(call).data)


class CallConnectedView(_CallActionView):
    def act(self, request, call):
        return voice_call_service.mark_connected(request.user, call)


class CallEndView(_CallActionView):
    def act(self, request, call):
        return voice_call_service.end_call(request.user, call)


class CallFailedView(_CallActionView):
    def act(self, request, call):
        raw = (request.data.get("reason") or "").strip()
        reason = raw if raw in CLIENT_FAILURE_REASONS else END_CONNECTION_FAILED
        return voice_call_service.fail_call(request.user, call, reason)


class MyCallHistoryView(generics.ListAPIView):
    """The signed-in customer's own calls, newest first."""
    serializer_class = CallSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            CallSession.objects
            .filter(caller=self.request.user)
            .select_related("ticket", "caller", "receiver")
        )


# ── Agent side ──────────────────────────────────────────────────────────────

class AdminCallAcceptView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, call_id):
        try:
            call = voice_call_service.get_call_for_participant(request.user, call_id)
            call = voice_call_service.accept_call(request.user, call)
        except CallError as exc:
            return _error(exc)
        return Response(CallSessionSerializer(call).data)


class AdminCallRejectView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, call_id):
        try:
            call = voice_call_service.get_call_for_participant(request.user, call_id)
            call = voice_call_service.reject_call(request.user, call)
        except CallError as exc:
            return _error(exc)
        return Response(CallSessionSerializer(call).data)


class AdminCallConnectedView(_CallActionView):
    permission_classes = [IsAdminOrSuperAdmin]

    def act(self, request, call):
        return voice_call_service.mark_connected(request.user, call)


class AdminCallEndView(_CallActionView):
    permission_classes = [IsAdminOrSuperAdmin]

    def act(self, request, call):
        return voice_call_service.end_call(request.user, call)


class AdminCallFailedView(_CallActionView):
    permission_classes = [IsAdminOrSuperAdmin]

    def act(self, request, call):
        raw = (request.data.get("reason") or "").strip()
        reason = raw if raw in CLIENT_FAILURE_REASONS else END_CONNECTION_FAILED
        return voice_call_service.fail_call(request.user, call, reason)


class AdminCallHistoryView(generics.ListAPIView):
    """Call history for the support panel.

    Scoped to calls this agent actually handled, plus anything still ringing
    (which they are entitled to answer). A superuser sees everything, matching
    how the rest of the admin panel already treats the two roles — this view
    introduces no new privilege, it only mirrors the existing one.
    """
    serializer_class = CallSessionSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def list(self, request, *args, **kwargs):
        """Retire lapsed rings before answering, so the panel never offers a
        call that can no longer be answered.

        Every *action* on a call already expires it first (accept, reject, end
        and the rest all call expire_if_due), but a list is not an action: the
        queryset below simply read `status`, so a call whose ring window had
        lapsed kept appearing as "ringing" indefinitely. An agent could click
        Accept on it — correctly refused, since accept expires it first — but
        the panel was showing them something to click that could never work,
        and abandoned rings accumulated at the top of the list.

        sweep_expired_calls() is the same routine the management command runs,
        and it is a real state transition per call rather than a bulk UPDATE:
        each lapsed row goes through expire_if_due, which releases the ticket's
        active_key and broadcasts the change, so a freed ticket can take a new
        call immediately. In the normal case there is nothing due and it costs
        one indexed SELECT that matches no rows.

        Placed here rather than in get_queryset because it is a write, and this
        is the one method guaranteed to run exactly once per request.

        The scheduled sweep is still worth running: this only fires when an
        agent opens the panel, so a deployment where nobody does would still
        leave rings holding their tickets. See
        authapp/management/commands/sweep_expired_calls.py.
        """
        voice_call_service.sweep_expired_calls()
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = CallSession.objects.select_related("ticket", "caller", "receiver")
        if not self.request.user.is_superuser:
            qs = qs.filter(Q(receiver=self.request.user) | Q(status=STATUS_RINGING))
        ticket_id = self.request.query_params.get("ticket_id")
        if ticket_id:
            try:
                qs = qs.filter(ticket_id=int(ticket_id))
            except (TypeError, ValueError):
                # Malformed filter degrades to unfiltered, never a 400 — same
                # posture as live_chat_views._after_id_filter.
                pass
        return qs
