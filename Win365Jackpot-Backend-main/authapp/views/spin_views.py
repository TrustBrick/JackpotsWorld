"""
authapp/views/spin_views.py
─────────────────────────────────────────────────────────────────────────────
Daily Login Spin Wheel — RETIRED. Replaced by the Signup Wheel and Bonus
Wheel (authapp/views/signup_wheel_views.py, authapp/views/bonus_wheel_views.py
— see authapp/models/wheel_models.py's module docstring for the full
rationale). The 3 previously-live user endpoints now return 410 Gone instead
of running their old logic — a minimal, fully-reversible diff that avoids a
confusing bare 404 for any stale cached frontend build still pointed at
these routes:
  • SpinStatusView          — GET  /api/spin/status/   → 410
  • SpinWheelSegmentsView   — GET  /api/spin/wheel/     → 410
  • SpinPlayView            — POST /api/spin/play/      → 410

Left working, untouched:
  • SpinHistoryListView     — GET  /api/spin/history/   the user's own spin
                               log — read-only, permanently accurate, no
                               reason to retire it.
  • AdminSpinConfigListCreateView / AdminSpinConfigDetailView / AdminSpinSettingsView
                               — admin CRUD over now-historical config, kept
                               working for reference.

SpinConfig/SpinSettings/SpinGlobalCounter/SpinHistory are NOT deleted —
SpinHistory is permanent historical data (real rewards already given to real
users), and authapp/management/commands/reset_platform_data.py still
references all four models by name.
"""
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models import ActivityLog
from authapp.models.spin_models import SpinConfig, SpinSettings, SpinHistory
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.spin_serializers import (
    SpinConfigSerializer, SpinHistorySerializer, SpinSettingsSerializer,
)

_RETIRED_MESSAGE = "This spin wheel has been retired. Check your Rewards tab for the new wheels."


class SpinStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"error": _RETIRED_MESSAGE}, status=410)


class SpinWheelSegmentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"error": _RETIRED_MESSAGE}, status=410)


class SpinPlayView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({"error": _RETIRED_MESSAGE}, status=410)


class SpinHistoryListView(generics.ListAPIView):
    serializer_class = SpinHistorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SpinHistory.objects.filter(user=self.request.user)


# ─────────────────────────────────────────────────────────────────────────────
# Admin — SpinConfig CRUD + SpinSettings (now-historical config, kept working
# for reference; the "Rewards & Spin" admin tab that used to render this has
# been replaced by the new Wheels admin tab).
# ─────────────────────────────────────────────────────────────────────────────

def _get_client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


class AdminSpinConfigListCreateView(generics.ListCreateAPIView):
    queryset = SpinConfig.objects.all()
    serializer_class = SpinConfigSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_create(self, serializer):
        obj = serializer.save()
        ActivityLog.log(
            action="settings_changed",
            actor=self.request.user,
            description=f"Created spin reward tier: {obj.label}",
            ip_address=_get_client_ip(self.request),
            meta={"spin_config_id": obj.id},
        )


class AdminSpinConfigDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = SpinConfig.objects.all()
    serializer_class = SpinConfigSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_update(self, serializer):
        obj = serializer.save()
        ActivityLog.log(
            action="settings_changed",
            actor=self.request.user,
            description=f"Updated spin reward tier: {obj.label}",
            ip_address=_get_client_ip(self.request),
            meta={"spin_config_id": obj.id},
        )

    def perform_destroy(self, instance):
        ActivityLog.log(
            action="settings_changed",
            actor=self.request.user,
            description=f"Deleted spin reward tier: {instance.label}",
            ip_address=_get_client_ip(self.request),
            meta={"spin_config_id": instance.id},
        )
        instance.delete()


class AdminSpinSettingsView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        return Response(SpinSettingsSerializer(SpinSettings.get()).data)

    def patch(self, request):
        obj = SpinSettings.get()
        serializer = SpinSettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        ActivityLog.log(
            action="settings_changed",
            actor=request.user,
            description="Updated Daily Spin settings",
            ip_address=_get_client_ip(request),
            meta={"fields": list(request.data.keys())},
        )
        return Response(serializer.data)
