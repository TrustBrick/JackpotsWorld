"""
authapp/views/call_control_views.py
─────────────────────────────────────────────────────────────────────────────
REST surface for hold/resume, call forwarding, support departments, live
support settings and per-player communication restrictions.

Follows voice_call_views.py's conventions exactly: the same _error() shape for
CallError, the same "agent routes under api/admin-panel/" split, and the same
rule that NO endpoint accepts a caller id, receiver id or room id from the
body. Every authorization decision is made in the service layer, not here.

  Agent (IsAdminOrSuperAdmin)
    POST /api/admin-panel/live-chat/calls/<call_id>/hold/
    POST /api/admin-panel/live-chat/calls/<call_id>/resume/
    POST /api/admin-panel/live-chat/calls/<call_id>/transfer/
    GET  /api/admin-panel/live-chat/calls/<call_id>/transfers/
    POST /api/admin-panel/live-chat/transfers/<transfer_id>/accept/
    POST /api/admin-panel/live-chat/transfers/<transfer_id>/decline/
    POST /api/admin-panel/live-chat/transfers/<transfer_id>/cancel/
    GET  /api/admin-panel/live-chat/transfer-targets/
    GET  /api/admin-panel/live-chat/call-control-config/

  Back Office management (IsAdminOrSuperAdmin)
    GET/POST         /api/admin-panel/support-departments/
    GET/PATCH/DELETE /api/admin-panel/support-departments/<pk>/
    GET/PATCH        /api/admin-panel/live-support-settings/
    GET              /api/admin-panel/players/<user_id>/communication/
    POST             /api/admin-panel/players/<user_id>/communication/
    GET              /api/admin-panel/players/<user_id>/communication/history/

  Customer (IsAuthenticated, own account only)
    GET  /api/live-chat/communication-status/
"""
import logging

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.call_models import VoiceCallSettings
from authapp.models.support_communication_models import (
    CHANNEL_CALL,
    CHANNEL_CHAT,
    CallTransfer,
    SupportDepartment,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.call_control_serializers import (
    CallHoldEventSerializer,
    CallTransferSerializer,
    LiveSupportSettingsSerializer,
    SupportDepartmentSerializer,
)
from authapp.services import (
    call_control_service,
    communication_restriction_service,
    voice_call_service,
)
from authapp.services.voice_call_service import CallError

logger = logging.getLogger(__name__)
User = get_user_model()


def _error(exc):
    """Identical shape to voice_call_views._error, so a client handles a
    control failure exactly as it handles a call failure."""
    return Response({"error": exc.message, "code": exc.code}, status=exc.status)


def _load_call(user, call_id):
    """The call, scoped and expiry-checked. Reuses voice_call_service's own
    participant check rather than a second opinion about who may see a call."""
    return voice_call_service.get_call_for_participant(user, call_id)


# ── Hold ────────────────────────────────────────────────────────────────────
class AdminCallHoldView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, call_id):
        try:
            call = _load_call(request.user, call_id)
            call = call_control_service.hold_call(request.user, call)
        except CallError as exc:
            return _error(exc)
        return Response(call_control_service.call_control_payload(call))


class AdminCallResumeView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, call_id):
        try:
            call = _load_call(request.user, call_id)
            call = call_control_service.resume_call(request.user, call)
        except CallError as exc:
            return _error(exc)
        return Response(call_control_service.call_control_payload(call))


# ── Transfer ────────────────────────────────────────────────────────────────
class AdminCallTransferView(APIView):
    """POST {to_agent_id?, to_department_id?, reason?, note?}"""

    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, call_id):
        to_agent = None
        raw_agent = request.data.get("to_agent_id")
        if raw_agent:
            to_agent = User.objects.filter(pk=raw_agent, is_staff=True).first()
            if to_agent is None:
                return Response(
                    {"error": "That agent does not exist.", "code": "agent_not_found"},
                    status=404,
                )
        try:
            department = call_control_service.get_department(
                request.data.get("to_department_id"),
            )
            call = _load_call(request.user, call_id)
            transfer = call_control_service.request_transfer(
                request.user, call,
                to_agent=to_agent,
                to_department=department,
                reason=(request.data.get("reason") or "").strip(),
                note=(request.data.get("note") or "").strip(),
            )
        except CallError as exc:
            return _error(exc)
        return Response(call_control_service.transfer_payload(transfer), status=201)


class AdminCallTransferListView(APIView):
    """Every transfer attempt on one call, newest first — including the ones
    that were declined or timed out, which is the point."""

    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request, call_id):
        try:
            call = _load_call(request.user, call_id)
        except CallError as exc:
            return _error(exc)
        transfers = (
            CallTransfer.objects
            .select_related("from_agent", "to_agent", "to_department", "accepted_by", "call", "call__caller")
            .filter(call=call)
        )
        holds = call.hold_events.select_related("held_by", "resumed_by").all()
        return Response({
            "call": call_control_service.call_control_payload(call),
            "transfers": CallTransferSerializer(transfers, many=True).data,
            "holds": CallHoldEventSerializer(holds, many=True).data,
        })


class _TransferActionView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]
    action = None  # set by subclass

    def post(self, request, transfer_id):
        try:
            transfer = call_control_service.get_transfer_for_agent(request.user, transfer_id)
            handler = getattr(call_control_service, self.action)
            transfer = handler(request.user, transfer)
        except CallError as exc:
            return _error(exc)
        return Response(call_control_service.transfer_payload(transfer))


class AdminTransferAcceptView(_TransferActionView):
    action = "accept_transfer"


class AdminTransferDeclineView(_TransferActionView):
    action = "decline_transfer"


class AdminTransferCancelView(_TransferActionView):
    action = "cancel_transfer"


class AdminTransferTargetsView(APIView):
    """Who this agent can forward to RIGHT NOW.

    `agents` contains only colleagues who can actually take the call: an active
    call-handling role, the Back Office open, and not already on a call. An
    agent who is mid-call with a player is NOT listed — forwarding to them
    would ring nobody and leave the customer on hold until the window lapsed.

    Deliberately not "every staff user", and equally deliberately not "every
    eligible user": eligibility says who is allowed to accept, availability
    says who can be offered. See call_control_service for why the two are kept
    apart (the accept path must still admit an agent who came free a moment
    ago).

    `unavailable_count` is the number withheld, so the picker can say why the
    list is short instead of leaving an agent wondering where the desk went.
    It is a count only — no names, no reasons per person.
    """

    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        eligible = list(
            call_control_service.eligible_transfer_targets(exclude_user_id=request.user.id)
        )
        available_ids = call_control_service.available_transfer_agent_ids(
            exclude_user_id=request.user.id,
        )
        busy_ids = voice_call_service.busy_agent_ids()

        agents = [
            {
                "id": profile.user_id,
                "name": (profile.user.name or "").strip() or profile.user.email,
                "email": profile.user.email,
                "role": profile.role,
                "department": profile.department or "",
            }
            for profile in eligible
            if profile.user_id in available_ids
        ]

        departments = SupportDepartment.objects.filter(is_active=True).prefetch_related("agents")
        department_rows = SupportDepartmentSerializer(departments, many=True).data
        # Overlay how many members are free, so the picker can grey out a
        # department whose whole team is mid-call rather than offering it and
        # failing on submit. `agent_count` (total membership) is left alone —
        # both numbers are useful and they answer different questions.
        by_id = {d.id: d for d in departments}
        for row in department_rows:
            dept = by_id.get(row["id"])
            row["available_agent_count"] = call_control_service.department_available_agent_count(
                dept, exclude_user_id=request.user.id,
            )

        return Response({
            "agents": agents,
            "unavailable_count": sum(
                1 for p in eligible if p.user_id not in available_ids
            ),
            "on_call_count": sum(1 for p in eligible if p.user_id in busy_ids),
            "departments": department_rows,
            **call_control_service.forwarding_settings(),
        })


class AdminCallControlConfigView(APIView):
    """Hold + forwarding configuration for the agent console, in one call."""

    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        return Response({
            **call_control_service.hold_settings(request),
            **call_control_service.forwarding_settings(),
        })


# ── Departments ─────────────────────────────────────────────────────────────
class AdminSupportDepartmentListCreateView(generics.ListCreateAPIView):
    queryset = SupportDepartment.objects.all().prefetch_related("agents")
    serializer_class = SupportDepartmentSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    pagination_class = None


class AdminSupportDepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = SupportDepartment.objects.all().prefetch_related("agents")
    serializer_class = SupportDepartmentSerializer
    permission_classes = [IsAdminOrSuperAdmin]


# ── Live support settings ───────────────────────────────────────────────────
class AdminLiveSupportSettingsView(APIView):
    """The whole live-support configuration singleton.

    Same row VoiceCallSettings has always been — the recording switch is still
    there and still means what it did. This view exposes the rest of it (chat/
    call availability, hours, hold, forwarding, every player-facing message)
    so there is ONE place to configure the desk rather than two that can
    disagree.
    """

    # Multipart as well as JSON, so the hold-audio upload and the plain
    # settings save go to the same endpoint. Same parser set the other
    # media-carrying admin views use.
    permission_classes = [IsAdminOrSuperAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        row = VoiceCallSettings.load()
        return Response(LiveSupportSettingsSerializer(row, context={"request": request}).data)

    def patch(self, request):
        row = VoiceCallSettings.load()
        serializer = LiveSupportSettingsSerializer(
            row, data=request.data, partial=True, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data)


# ── Per-player communication restrictions ───────────────────────────────────
class AdminPlayerCommunicationView(APIView):
    """GET the player's chat/call access; POST to change one channel.

    ADMIN-ONLY, and that is the security requirement in item 21: a player must
    not be able to lift their own restriction. There is no player-facing write
    path to this anywhere — the only player-facing endpoint is the read-only
    status below, which returns the message and nothing else.
    """

    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        return Response({
            "user_id": user.id,
            "user_uid": getattr(user, "user_uid", ""),
            "email": user.email,
            "name": (user.name or "").strip(),
            "channels": communication_restriction_service.restrictions_for(user),
        })

    def post(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        channel = (request.data.get("channel") or "").strip().lower()
        if channel not in (CHANNEL_CHAT, CHANNEL_CALL):
            return Response(
                {"error": "channel must be 'chat' or 'call'."}, status=400,
            )

        is_enabled = request.data.get("is_enabled")
        if isinstance(is_enabled, str):
            is_enabled = is_enabled.strip().lower() in ("1", "true", "yes", "on")
        if is_enabled is None:
            return Response({"error": "is_enabled is required."}, status=400)

        communication_restriction_service.set_restriction(
            request.user, user, channel,
            is_enabled=bool(is_enabled),
            disabled_until=request.data.get("disabled_until") or None,
            reason=request.data.get("reason") or "",
            admin_note=request.data.get("admin_note") or "",
            player_message=request.data.get("player_message") or "",
        )
        return Response({
            "user_id": user.id,
            "channels": communication_restriction_service.restrictions_for(user),
        })


class AdminPlayerCommunicationHistoryView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        return Response({
            "user_id": user.id,
            "history": communication_restriction_service.history_for(user),
        })


class MyCommunicationStatusView(APIView):
    """What the widget needs to know before offering chat or a call.

    Returns the player-safe message ONLY. `reason` and `admin_note` are not in
    this payload and are not reachable from any player-facing endpoint — that
    separation is enforced here and again in the service (see
    communication_restriction_service's module docstring).

    Advisory: the frontend uses this to hide a button and explain why, but the
    real gate is server-side in live_chat_service / voice_call_service, so a
    player who calls those endpoints directly still gets a 403.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        chat = communication_restriction_service.chat_allowed(request.user)
        call = communication_restriction_service.calls_allowed(request.user)
        row = VoiceCallSettings.load()
        return Response({
            "chat": chat.as_dict(),
            "call": call.as_dict(),
            # Shown while an agent is being found — the queue wording is a
            # setting, not a hardcoded string in the widget.
            "queue_message": row.queue_message,
            "offline_message": row.offline_message,
            "hold_message": row.hold_message,
        })
