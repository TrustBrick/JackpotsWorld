"""
authapp/views/support_views.py
─────────────────────────────────────────────────────────────────────────────
Live Support / Responsible Gambling backend:
  • ResponsibleGamblingSettingsView — GET/PATCH /api/user/responsible-gambling/
  • SupportTicketListCreateView     — GET/POST  /api/support/tickets/
  • AdminSupportTicketListView      — GET       /api/admin-panel/support/tickets/
  • AdminSupportTicketUpdateView    — PATCH     /api/admin-panel/support/tickets/<id>/
"""
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
)


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
        serializer.save(user=self.request.user)


class AdminSupportTicketListView(generics.ListAPIView):
    queryset = SupportTicket.objects.select_related("user").order_by("-created_at")
    serializer_class = AdminSupportTicketSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminSupportTicketUpdateView(generics.UpdateAPIView):
    queryset = SupportTicket.objects.all()
    serializer_class = AdminSupportTicketSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    http_method_names = ["patch"]
