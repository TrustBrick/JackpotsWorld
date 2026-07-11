from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from authapp.models.poker_models import PokerTournament, PokerRegistration
from authapp.serializers.poker_serializers import (
    PokerTournamentSerializer, PokerRegistrationAdminSerializer,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin


class PokerListView(generics.ListAPIView):
    """GET /api/poker/?status=&page= — public, paginated (PAGE_SIZE=20)."""
    serializer_class = PokerTournamentSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = PokerTournament.objects.filter(is_active=True)
        status_ = self.request.query_params.get("status", "").strip()
        if status_:
            qs = qs.filter(status=status_)
        return qs


class PokerDetailView(generics.RetrieveAPIView):
    queryset = PokerTournament.objects.filter(is_active=True)
    serializer_class = PokerTournamentSerializer
    permission_classes = [AllowAny]


class PokerRegisterView(APIView):
    """POST /api/poker/<id>/register/ — records interest, no payment involved."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            tournament = PokerTournament.objects.get(pk=pk, is_active=True)
        except PokerTournament.DoesNotExist:
            return Response({"error": "Tournament not found."}, status=404)

        obj, created = PokerRegistration.objects.get_or_create(tournament=tournament, user=request.user)
        return Response(
            {
                "message": "Registration received." if created else "You've already registered for this tournament.",
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Admin-managed CRUD (Admin Panel "Manage Poker")
# ─────────────────────────────────────────────────────────────────────────────

class AdminPokerListCreateView(generics.ListCreateAPIView):
    queryset = PokerTournament.objects.all()
    serializer_class = PokerTournamentSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class AdminPokerDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = PokerTournament.objects.all()
    serializer_class = PokerTournamentSerializer
    permission_classes = [IsAdminOrSuperAdmin]


# ─────────────────────────────────────────────────────────────────────────────
# Admin — Back Office lead capture ("who clicked Get Ticket")
# ─────────────────────────────────────────────────────────────────────────────

class AdminPokerRegistrationListView(generics.ListAPIView):
    """GET /api/admin-panel/poker/registrations/"""
    queryset = PokerRegistration.objects.select_related("user", "tournament").order_by("-created_at")
    serializer_class = PokerRegistrationAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminPokerRegistrationUpdateView(generics.UpdateAPIView):
    """PATCH /api/admin-panel/poker/registrations/<id>/ — update status/admin_note."""
    queryset = PokerRegistration.objects.all()
    serializer_class = PokerRegistrationAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    http_method_names = ["patch"]
