from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from authapp.models.location_models import SupportedLocation
from authapp.serializers.location_serializers import SupportedLocationSerializer
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin


class LocationListView(APIView):
    """GET /api/locations/ — public, active locations only, for the homepage ribbon."""
    permission_classes = [AllowAny]

    def get(self, request):
        qs = SupportedLocation.objects.filter(is_active=True)
        data = SupportedLocationSerializer(qs, many=True, context={"request": request}).data
        return Response(data)


# ─────────────────────────────────────────────────────────────────────────────
# Admin-managed CRUD (Admin Panel "Manage Locations")
# ─────────────────────────────────────────────────────────────────────────────

class AdminLocationListCreateView(generics.ListCreateAPIView):
    queryset = SupportedLocation.objects.all()
    serializer_class = SupportedLocationSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminLocationDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = SupportedLocation.objects.all()
    serializer_class = SupportedLocationSerializer
    permission_classes = [IsAdminOrSuperAdmin]
