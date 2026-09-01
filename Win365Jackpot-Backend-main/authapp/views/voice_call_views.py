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
    POST /api/admin-panel/live-chat/calls/<call_id>/recording/   upload audio
    GET  /api/admin-panel/live-chat/calls/<call_id>/recording/   play it back
    DELETE /api/admin-panel/live-chat/calls/<call_id>/  erase one call (manager)
    GET  /api/admin-panel/voice-call-settings/   read the recording switch
    PATCH /api/admin-panel/voice-call-settings/  flip it (manager only)

No endpoint accepts a caller id, receiver id, agent id or signaling room id
from the request body. The caller is always request.user; the receiver is
always the authenticated agent who accepted; the room name is always derived
server-side from the call's own primary key.
"""
import logging

from django.conf import settings
from django.db.models import Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.call_models import (
    END_CONNECTION_FAILED,
    END_NETWORK_FAILURE,
    END_PERMISSION_DENIED,
    STATUS_RINGING,
    CallSession,
    VoiceCallSettings,
)
from authapp.models.support_ticket_models import SupportTicket
from authapp.permissions.admin_role_permissions import IsSupportManager
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin, IsSuperAdmin
from authapp.serializers.voice_call_serializers import (
    CallSessionSerializer,
    VoiceCallSettingsSerializer,
)
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


# The browser attaches a short ICE summary to a failure so history can say
# *why* a call died (see voiceCallService.iceSummary). It is client-supplied,
# so it is filtered to a tight character set and truncated rather than trusted:
# it lands in an audit row a human reads, and free text a browser controls has
# no business there.
_FAILURE_DETAIL_ALLOWED = set(
    "abcdefghijklmnopqrstuvwxyz0123456789+=:,._-"
)
_FAILURE_DETAIL_MAX = 60


def _sanitize_failure_detail(raw):
    text = (str(raw or "")).strip().lower()
    kept = "".join(ch for ch in text if ch in _FAILURE_DETAIL_ALLOWED)
    return kept[:_FAILURE_DETAIL_MAX]


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
            # Drives two things from one flag: the agent's recorder, and the
            # notice the customer is shown before they speak. Both browsers ask
            # this endpoint, so they cannot disagree about whether the call is
            # being recorded.
            "recording_enabled": voice_call_service.recording_enabled(),
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
        return voice_call_service.fail_call(
            request.user, call, reason,
            detail=_sanitize_failure_detail(request.data.get("detail")),
        )


class CallAcceptView(APIView):
    """The player answers a support callback.

    The customer-side counterpart of AdminCallAcceptView. Kept as its own route
    rather than widening the admin one, because the two answer different
    questions: the admin route resolves a race between agents claiming a
    ringing call, this one only asks whether the requester is the single person
    that callback was placed to.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, call_id):
        try:
            call = voice_call_service.get_call_for_participant(request.user, call_id)
            call = voice_call_service.accept_callback(request.user, call)
        except CallError as exc:
            return _error(exc)
        return Response(CallSessionSerializer(call).data)


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
        return voice_call_service.fail_call(
            request.user, call, reason,
            detail=_sanitize_failure_detail(request.data.get("detail")),
        )


class AdminCallbackView(APIView):
    """Call a player back on a conversation - typically one they missed.

    Reuses the whole existing call machinery: same CallSession, same signaling
    groups, same WebRTC engine, same recording path. Only the direction and who
    gets rung differ. There is deliberately no second calling system here.
    """

    permission_classes = [IsAdminOrSuperAdmin]
    throttle_classes = [VoiceCallStartRateThrottle]

    def post(self, request, ticket_id):
        try:
            ticket = voice_call_service.get_callback_ticket(request.user, ticket_id)
            call, created = voice_call_service.initiate_callback(request.user, ticket)
        except CallError as exc:
            return _error(exc)
        return Response(
            CallSessionSerializer(call).data, status=201 if created else 200,
        )


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


class AdminCallRecordingView(APIView):
    """Upload (POST) or play back (GET) one call's recording.

    Both verbs live on one route because they are two halves of the same
    object: the agent's browser PUTs the audio it captured when the call ends,
    and the panel reads it back later.

    The bytes are deliberately NOT handed out as a storage URL — the same
    reasoning as LiveChatAttachmentView, which this mirrors. A local /media/
    path is permanently public and guessable; an S3 presigned link is
    replayable by anyone holding the string until it expires. Routing playback
    through here means entitlement is re-checked against the requester's own
    session on every fetch, which is what authorising a recording of a
    customer's conversation actually requires.
    """

    permission_classes = [IsAdminOrSuperAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, call_id):
        try:
            call = voice_call_service.get_call_for_participant(request.user, call_id)
            call = voice_call_service.attach_recording(
                request.user, call, request.FILES.get("file"),
            )
        except CallError as exc:
            return _error(exc)
        return Response(
            CallSessionSerializer(call, context={"request": request}).data, status=201,
        )

    def get(self, request, call_id):
        call = get_object_or_404(
            CallSession.objects.select_related("ticket"), pk=call_id,
        )
        # Staff-only route already, but scope it the same way the history view
        # does: an agent sees the calls they handled, a superuser sees all.
        # Anything else 404s rather than 403s — a recording someone may not
        # hear should not confirm its own existence.
        if not request.user.is_superuser and call.receiver_id != request.user.id:
            raise Http404
        if not call.recording:
            raise Http404

        try:
            fh = call.recording.open("rb")
        except Exception:
            # Storage-layer failures here are "the object is gone" as far as
            # the caller is concerned; the specific boto/OS error is for the log.
            logger.warning("voice-call: recording for call %s missing from storage", call.pk)
            raise Http404

        resp = FileResponse(fh, content_type=_recording_content_type(call.recording.name))
        # Inline, not as_attachment: the panel plays this in an <audio> element
        # rather than downloading it. nosniff still pins the declared type.
        resp["X-Content-Type-Options"] = "nosniff"
        resp["Cache-Control"] = "private, no-store"
        return resp


def _recording_content_type(name):
    ext = (name or "").rsplit(".", 1)[-1].lower()
    return {
        "webm": "audio/webm",
        "ogg": "audio/ogg",
        "mp4": "audio/mp4",
        "m4a": "audio/mp4",
    }.get(ext, "application/octet-stream")


class AdminVoiceCallSettingsView(APIView):
    """The Back Office's recording switch.

    Readable by any staff member — an agent's own call surfaces already tell
    them whether calls are recorded, so hiding the state from them would be
    theatre. Writable only by a super admin: an agent who could silently stop
    recording their own calls is a hole in the control this switch exists to
    be, and turning it off also removes the notice the *customer* sees. That
    is an operator decision, not an agent one.

    PATCH takes effect on the next call. In-flight calls keep the answer they
    started with, because the customer was shown a notice based on it — the
    recorder and the notice must agree for the whole of a call, not just at
    the moment it began.

    GET stays on IsAdminOrSuperAdmin (any staff member can see whether calls
    are recorded — their own call surfaces tell them anyway). PATCH is
    IsSupportManager: switching recording off also removes the notice the
    *customer* is shown, so it is a management decision, not one an agent
    makes about their own calls.
    """

    permission_classes = [IsAdminOrSuperAdmin]

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsSupportManager()]
        return super().get_permissions()

    def get(self, request):
        return Response(VoiceCallSettingsSerializer(VoiceCallSettings.load()).data)

    def patch(self, request):
        if "recording_enabled" not in request.data:
            return Response(
                {"error": "recording_enabled is required.", "code": "invalid"},
                status=400,
            )
        row = voice_call_service.set_recording_enabled(
            request.user, request.data.get("recording_enabled"),
        )
        return Response(VoiceCallSettingsSerializer(row).data)


class AdminCallDeleteView(APIView):
    """Erase one call from history — the row, its events, and its audio.

    Customer Support Manager only. IsSupportManager gates the route, and
    voice_call_service.delete_call repeats the same predicate next to the
    deletion it guards, so the rule holds however the service is reached —
    belt and suspenders, not either/or. A support admin deleting the record of
    their own call is exactly what this prevents.

    DELETE and nothing else: there is deliberately no admin GET on this route.
    A call's detail is already served by the history list and the participant
    route, and adding a second read path would be one more place for the
    scoping rules to drift.
    """

    permission_classes = [IsSupportManager]

    def delete(self, request, call_id):
        call = get_object_or_404(
            CallSession.objects.select_related("ticket", "caller"), pk=call_id,
        )
        try:
            result = voice_call_service.delete_call(request.user, call)
        except CallError as exc:
            return _error(exc)
        return Response(result, status=200)
