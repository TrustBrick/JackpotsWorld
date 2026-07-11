from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from authapp.models.events_models import CasinoEvent, EventTicketRequest
from authapp.serializers.events_serializers import (
    CasinoEventSerializer, EventTicketRequestAdminSerializer,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin


class EventListView(generics.ListAPIView):
    """
    GET /api/events/?country=&category=&status=&date=&time=&page=
    Public, paginated via DRF's default PageNumberPagination (PAGE_SIZE=20),
    latest events first — `page`/`next`/`previous` map directly onto the
    left/right arrow pagination in the UI.
    """
    serializer_class = CasinoEventSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = CasinoEvent.objects.filter(is_active=True)
        params = self.request.query_params
        country  = params.get("country", "").strip()
        category = params.get("category", "").strip()
        status_  = params.get("status", "").strip()
        date     = params.get("date", "").strip()
        time_    = params.get("time", "").strip()
        if country:
            qs = qs.filter(country__iexact=country)
        if category:
            qs = qs.filter(category__iexact=category)
        if status_:
            qs = qs.filter(status=status_)
        if date:
            qs = qs.filter(event_date=date)
        if time_:
            qs = qs.filter(event_time=time_)
        return qs


class EventDetailView(generics.RetrieveAPIView):
    queryset = CasinoEvent.objects.filter(is_active=True)
    serializer_class = CasinoEventSerializer
    permission_classes = [AllowAny]


class EventTicketRequestView(APIView):
    """POST /api/events/<id>/ticket/ — records interest, no payment involved."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            event = CasinoEvent.objects.get(pk=pk, is_active=True)
        except CasinoEvent.DoesNotExist:
            return Response({"error": "Event not found."}, status=404)

        obj, created = EventTicketRequest.objects.get_or_create(event=event, user=request.user)
        return Response(
            {
                "message": "Ticket request received." if created else "You've already requested a ticket for this event.",
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Admin-managed CRUD (Admin Panel "Manage Events")
# ─────────────────────────────────────────────────────────────────────────────

class AdminEventListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/admin-panel/events/  -> list all (incl. inactive) for the admin table
    POST /api/admin-panel/events/  -> create (multipart, image upload)
    """
    queryset = CasinoEvent.objects.all()
    serializer_class = CasinoEventSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class AdminEventDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/admin-panel/events/<id>/"""
    queryset = CasinoEvent.objects.all()
    serializer_class = CasinoEventSerializer
    permission_classes = [IsAdminOrSuperAdmin]


# ─────────────────────────────────────────────────────────────────────────────
# Admin — Back Office lead capture ("who clicked Get Ticket")
# ─────────────────────────────────────────────────────────────────────────────

class AdminEventTicketRequestListView(generics.ListAPIView):
    """GET /api/admin-panel/events/tickets/"""
    queryset = EventTicketRequest.objects.select_related("user", "event").order_by("-created_at")
    serializer_class = EventTicketRequestAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminEventTicketRequestUpdateView(generics.UpdateAPIView):
    """PATCH /api/admin-panel/events/tickets/<id>/ — update status/admin_note."""
    queryset = EventTicketRequest.objects.all()
    serializer_class = EventTicketRequestAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    http_method_names = ["patch"]
