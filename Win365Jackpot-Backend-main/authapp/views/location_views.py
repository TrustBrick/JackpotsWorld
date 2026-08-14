from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from authapp.models.casino_models import Casino
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


class AdminCasinoCatalogView(APIView):
    """GET /api/admin-panel/casino-catalog/ — the active Casino catalog, plus
    the distinct country list derived from it.

    Back Office forms that ask for a country and then a casino (Teen Patti
    events, commission rules) drive both dropdowns from this one response, so
    the casino list can be filtered client-side by the chosen country without
    a second request. Countries come from Casino.country rather than a
    separate country table — see the note in teenpatti_models.py.

    Countries are returned as {id, name} objects, not bare strings, so the
    Back Office's generic asyncSelect field can consume both lists with the
    same option shape (its `id` is the country name, since that is what the
    country columns actually store).
    """
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        casinos = Casino.objects.filter(is_active=True).order_by("country", "name")
        rows = [{"id": c.id, "name": c.name, "country": c.country, "location": c.location} for c in casinos]
        countries = sorted({r["country"] for r in rows if r["country"]})
        return Response({
            "countries": [{"id": c, "name": c} for c in countries],
            "results": rows,
        })
