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
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.responsible_gambling_models import ResponsibleGamblingSettings
from authapp.models.support_ticket_models import SupportTicket
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
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
        # MULTILINGUAL-CHAT: when off, identical to the original save().
        if not _multilingual_active():
            serializer.save()
            return

        instance = serializer.save()
        lang = instance.preferred_language or "en"
        if instance.admin_reply and lang != "en":
            translated = TranslationService().translate(instance.admin_reply, "en", lang)
            instance.admin_reply_translated = translated
            instance.translated_at = timezone.now()
            instance.save(update_fields=["admin_reply_translated", "translated_at"])


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
