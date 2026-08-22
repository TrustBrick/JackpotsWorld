"""
authapp/views/support_views.py
─────────────────────────────────────────────────────────────────────────────
Live Support / Responsible Gambling backend:
  • ResponsibleGamblingSettingsView — GET/PATCH /api/user/responsible-gambling/
  • SupportTicketListCreateView     — GET/POST  /api/support/tickets/
  • AdminSupportTicketListView      — GET       /api/admin-panel/support/tickets/
  • AdminSupportTicketUpdateView    — PATCH     /api/admin-panel/support/tickets/<id>/
  • SupportConfigView               — GET       /api/support/config/            (MULTILINGUAL-CHAT)
  • SupportSettingsView             — GET/PATCH /api/admin-panel/support-settings/ (MULTILINGUAL-CHAT)
"""
from django.conf import settings as django_settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.responsible_gambling_models import ResponsibleGamblingSettings
from authapp.models.support_ticket_models import SupportTicket
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
# SERVICE-REQUEST CONVERSATION: opening a customer's own ticket as a live thread
from authapp.services import live_chat_service
from authapp.serializers.live_chat_serializers import ChatMessageSerializer
from authapp.serializers.support_serializers import (
    ResponsibleGamblingSettingsSerializer,
    SupportTicketSerializer,
    AdminSupportTicketSerializer,
    SupportSettingsSerializer,
)
# MULTILINGUAL-CHAT: new imports
from authapp.models.support_settings_models import SupportSettings
from authapp.services.translation_service import TranslationService, LANGUAGE_NATIVE_NAMES
from authapp.services.language_detector import detect_preferred_language, normalize_language_code
from authapp.serializers.support_serializers import SupportScriptSerializer
from authapp.models.support_script_models import SupportScript


def _multilingual_active():
    """Master switch (env var) AND day-to-day admin toggle both have to be on."""
    return bool(django_settings.ENABLE_MULTILINGUAL_CHAT) and SupportSettings.load().enabled


class ResponsibleGamblingSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings_obj, _ = ResponsibleGamblingSettings.objects.get_or_create(user=request.user)
        return Response(ResponsibleGamblingSettingsSerializer(settings_obj).data)

    def patch(self, request):
        settings_obj, _ = ResponsibleGamblingSettings.objects.get_or_create(user=request.user)
        serializer = ResponsibleGamblingSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SupportTicketListCreateView(generics.ListCreateAPIView):
    serializer_class = SupportTicketSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SupportTicket.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        # MULTILINGUAL-CHAT: when the feature is off, this is exactly the
        # original one-liner — no extra queries, no translation call.
        if not _multilingual_active():
            serializer.save(user=self.request.user)
            return

        # An explicit choice from the chat's own language selector wins over
        # auto-detection — that selector is intentionally decoupled from
        # request.user.preferred_language (the site-wide i18n field), so it
        # has to be read from the request body instead.
        lang = normalize_language_code(serializer.validated_data.get("preferred_language")) or detect_preferred_language(
            user=self.request.user,
            accept_language_header=self.request.META.get("HTTP_ACCEPT_LANGUAGE", ""),
        )
        message = serializer.validated_data.get("message", "")
        translated = TranslationService().translate(message, lang, "en") if lang != "en" else message
        serializer.save(
            user=self.request.user,
            preferred_language=lang,
            message_translated=translated,
            translated_at=timezone.now(),
        )


class SupportTicketOpenConversationView(APIView):
    """POST /api/support/tickets/<id>/open-conversation/

    Opens one of the customer's OWN Service Requests as a live conversation.
    An active ticket-form request is promoted in place to a real-time thread
    (never a new ticket — see live_chat_service.open_ticket_conversation) and
    returned with its transcript plus the realtime transport config the chat
    client needs. A resolved/closed request is returned read-only: it is not
    promoted, so the existing status gates keep refusing new messages and
    calls, and the client renders it from the ticket's own message/admin_reply.

    Owner-scoped: the get_object_or_404 on user=request.user is the whole
    access rule, so a customer can never open another customer's request — the
    same owner-or-staff boundary the WebSocket consumer already enforces.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, pk=ticket_id, user=request.user)
        live_chat_service.open_ticket_conversation(ticket)
        messages = ticket.chat_messages.all()
        return Response({
            "ticket": {
                "id": ticket.id,
                "subject": ticket.subject,
                "status": ticket.status,
                "created_at": ticket.created_at.isoformat(),
                "is_live_chat": ticket.is_live_chat,
                # Original submission + async reply, so the client can show a
                # resolved (unpromoted) request's history without a thread.
                "message": ticket.message,
                "admin_reply": ticket.admin_reply,
                "admin_reply_translated": ticket.admin_reply_translated,
                "preferred_language": ticket.preferred_language,
            },
            "messages": ChatMessageSerializer(messages, many=True).data,
            # Same realtime hint the live-chat endpoints return, so the client
            # picks WebSocket-vs-poll here exactly as the floating widget does.
            "realtime": bool(getattr(django_settings, "LIVE_CHAT_REALTIME", False)),
            "poll_interval_ms": 2000,
        })


class AdminSupportTicketListView(generics.ListAPIView):
    queryset = SupportTicket.objects.select_related("user").order_by("-created_at")
    serializer_class = AdminSupportTicketSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminSupportTicketUpdateView(generics.UpdateAPIView):
    queryset = SupportTicket.objects.all()
    serializer_class = AdminSupportTicketSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    http_method_names = ["patch"]

    def perform_update(self, serializer):
        # MULTILINGUAL-CHAT: the translation step still only runs when the
        # feature is active; the live-status push below runs either way.
        instance = serializer.save()
        if _multilingual_active():
            lang = instance.preferred_language or "en"
            if instance.admin_reply and lang != "en":
                translated = TranslationService().translate(instance.admin_reply, "en", lang)
                instance.admin_reply_translated = translated
                instance.translated_at = timezone.now()
                instance.save(update_fields=["admin_reply_translated", "translated_at"])
        # SERVICE-REQUEST CONVERSATION: when an agent resolves (or otherwise
        # moves the status of) a live session, push it so the customer's open
        # conversation reflects it at once — composer and call disabled. A
        # no-op for async form tickets: nobody is subscribed to their group.
        if instance.is_live_chat:
            live_chat_service.broadcast_ticket_status(instance)


# MULTILINGUAL-CHAT: new view — public, read-only. Lets the frontend decide
# whether to render the language selector / translated-reply UI at all,
# without needing to duplicate the feature-flag logic client-side.
class SupportConfigView(APIView):
    permission_classes = []

    def get(self, request):
        active = _multilingual_active()
        s = SupportSettings.load()
        return Response({
            "enabled": active,
            "default_language": s.default_language,
            "fallback_language": s.fallback_language,
            "auto_detect_enabled": s.auto_detect_enabled,
            "supported_languages": [
                {"code": code, "name": name} for code, name in LANGUAGE_NATIVE_NAMES.items()
            ],
        })


# MULTILINGUAL-CHAT: new view — the Admin Settings screen's backend.
class SupportSettingsView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        return Response(SupportSettingsSerializer(SupportSettings.load()).data)

    def patch(self, request):
        obj = SupportSettings.load()
        serializer = SupportSettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ── Support script library (Back Office) ────────────────────────────────────
# The standard wording from the Call & Live Chat Script Manual. Admin-only:
# IsAdminOrSuperAdmin on both, matching every other Back Office content
# resource, so a player can neither read nor edit the agent playbook.
class AdminSupportScriptListCreateView(generics.ListCreateAPIView):
    queryset = SupportScript.objects.all()
    serializer_class = SupportScriptSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)


class AdminSupportScriptDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = SupportScript.objects.all()
    serializer_class = SupportScriptSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
