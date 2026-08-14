"""
authapp/views/poker_views.py
─────────────────────────────────────────────────────────────────────────────
Public (api/poker/…)
  PokerListView            GET  /api/poker/               filters: Part 12
  PokerFilterOptionsView   GET  /api/poker/filters/
  PokerDetailView          GET  /api/poker/<id>/
  PokerRegisterView        POST /api/poker/<id>/register/ (auth)

Back Office (api/admin-panel/poker/…) — all IsAdminOrSuperAdmin
  AdminPokerListCreateView        GET/POST   .../poker/
  AdminPokerDetailView            GET/PATCH/DELETE .../poker/<id>/
  AdminPokerReviewView            POST  .../poker/<id>/review/
  AdminPokerChangeLogView         GET   .../poker/<id>/history/
  AdminPokerChangeHistoryView     GET   .../poker/history/
  AdminPokerRegistration*         (unchanged)
  AdminPokerSource*               CRUD  .../poker/sources/
  AdminPokerSourceSyncView        POST  .../poker/sources/<id>/sync/
  AdminPokerSyncLogListView       GET   .../poker/sync-logs/

Public visibility is gated on review_status="published" — an unreviewed or
rejected event is never returned by a public endpoint (Part 8).
"""
from django.db.models import Count, Q
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.poker_models import (
    PUBLIC_REVIEW_STATUS, PokerEventChangeLog, PokerRegistration,
    PokerSource, PokerSyncLog, PokerTournament,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.poker_serializers import (
    PokerEventChangeLogSerializer, PokerRegistrationAdminSerializer,
    PokerSourceSerializer, PokerSyncLogSerializer, PokerTournamentSerializer,
)
from authapp.services import poker_review_service, poker_sync_service
from authapp.services.poker_review_service import ReviewError


def _public_queryset():
    return PokerTournament.objects.filter(
        is_active=True, review_status=PUBLIC_REVIEW_STATUS,
    ).select_related("source")


def _apply_public_filters(qs, params):
    """Part 12's filter set. Every filter is optional."""
    if (country := (params.get("country") or "").strip()):
        qs = qs.filter(country__iexact=country)
    if (city := (params.get("city") or "").strip()):
        qs = qs.filter(city__iexact=city)
    if (series := (params.get("series") or "").strip()):
        qs = qs.filter(series__iexact=series)
    if (game_type := (params.get("game_type") or "").strip()):
        qs = qs.filter(game_type__iexact=game_type)

    status_ = (params.get("status") or "").strip()
    if status_ in ("upcoming", "live", "completed"):
        qs = qs.filter(status=status_)

    if (date_from := (params.get("date_from") or "").strip()):
        qs = qs.filter(event_date__gte=date_from)
    if (date_to := (params.get("date_to") or "").strip()):
        qs = qs.filter(event_date__lte=date_to)

    for param, lookup in (("min_buy_in", "buy_in__gte"), ("max_buy_in", "buy_in__lte")):
        raw = (params.get(param) or "").strip()
        if raw:
            try:
                qs = qs.filter(**{lookup: raw})
            except (ValueError, TypeError):
                pass

    if (search := (params.get("search") or "").strip()):
        qs = qs.filter(
            Q(name__icontains=search) | Q(casino_name__icontains=search) | Q(series__icontains=search)
        )
    return qs


class PokerListView(generics.ListAPIView):
    """GET /api/poker/?status=&country=&… — public, paginated (PAGE_SIZE=20)."""
    serializer_class = PokerTournamentSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return _apply_public_filters(_public_queryset(), self.request.query_params)


class PokerDetailView(generics.RetrieveAPIView):
    serializer_class = PokerTournamentSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return _public_queryset()


class PokerFilterOptionsView(APIView):
    """GET /api/poker/filters/ — only values that actually have published
    events, so the filter bar never offers a dead option."""
    permission_classes = [AllowAny]

    def get(self, request):
        qs = _public_queryset()

        def distinct(field):
            return sorted({v for v in qs.values_list(field, flat=True) if v})

        return Response({
            "countries": distinct("country"),
            "cities": distinct("city"),
            "series": distinct("series"),
            "game_types": distinct("game_type"),
            "counts": {
                "live": qs.filter(status="live").count(),
                "upcoming": qs.filter(status="upcoming").count(),
                "completed": qs.filter(status="completed").count(),
            },
        })


class PokerRegisterView(APIView):
    """POST /api/poker/<id>/register/ — records interest, no payment involved."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            tournament = _public_queryset().get(pk=pk)
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
    serializer_class = PokerTournamentSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = PokerTournament.objects.select_related("source", "duplicate_of")
        params = self.request.query_params
        if (review := (params.get("review_status") or "").strip()):
            qs = qs.filter(review_status=review)
        if (country := (params.get("country") or "").strip()):
            qs = qs.filter(country__iexact=country)
        if (source := (params.get("source") or "").strip()).isdigit():
            qs = qs.filter(source_id=int(source))
        if (search := (params.get("search") or "").strip()):
            qs = qs.filter(Q(name__icontains=search) | Q(casino_name__icontains=search))
        return qs.order_by("-event_date", "-event_time")

    def perform_create(self, serializer):
        # Part 14 manual creation: an admin-authored event is published
        # immediately — it has by definition already been reviewed by the
        # person entering it, and there is no source to verify it against.
        tournament = serializer.save(created_by=self.request.user, review_status="published")
        PokerEventChangeLog.objects.create(
            tournament=tournament, action="created_manually",
            to_status="published", actor=self.request.user,
            note="Created manually in the Back Office.",
        )


class AdminPokerDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = PokerTournament.objects.select_related("source", "duplicate_of")
    serializer_class = PokerTournamentSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_update(self, serializer):
        tracked = [
            "name", "casino_name", "location", "event_date", "end_date", "event_time",
            "buy_in", "prize_pool", "currency", "series", "country", "city",
            "game_type", "organizer", "official_url", "status", "is_active",
        ]
        before = {f: getattr(serializer.instance, f) for f in tracked}
        tournament = serializer.save()
        poker_review_service.record_edit(tournament, before, actor=self.request.user)


class AdminPokerReviewView(APIView):
    """POST /api/admin-panel/poker/<id>/review/
    {"action": "approved"|"published"|"rejected"|"duplicate"|"archived"|"pending_review",
     "note": "...", "duplicate_of": <id>}

    The only route that changes review_status. Validates the lifecycle and
    writes a change-history row for every transition.
    """
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, pk):
        try:
            tournament = PokerTournament.objects.get(pk=pk)
        except PokerTournament.DoesNotExist:
            return Response({"error": "Tournament not found."}, status=404)

        action = (request.data.get("action") or "").strip()
        try:
            tournament = poker_review_service.transition(
                tournament, action,
                actor=request.user,
                note=(request.data.get("note") or "").strip(),
                duplicate_of_id=request.data.get("duplicate_of"),
            )
        except ReviewError as exc:
            return Response({"error": str(exc)}, status=400)

        return Response(PokerTournamentSerializer(tournament).data)


class AdminPokerChangeLogView(generics.ListAPIView):
    """GET /api/admin-panel/poker/<id>/history/ — one event's change history."""
    serializer_class = PokerEventChangeLogSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        return PokerEventChangeLog.objects.filter(
            tournament_id=self.kwargs["pk"],
        ).select_related("actor", "tournament")


class AdminPokerChangeHistoryView(generics.ListAPIView):
    """GET /api/admin-panel/poker/history/ — the Part 45 "Change History" view
    across every event."""
    serializer_class = PokerEventChangeLogSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = PokerEventChangeLog.objects.select_related("actor", "tournament")
        if (action := (self.request.query_params.get("action") or "").strip()):
            qs = qs.filter(action=action)
        return qs


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


# ─────────────────────────────────────────────────────────────────────────────
# Admin — sources & sync logs
# ─────────────────────────────────────────────────────────────────────────────

class AdminPokerSourceListCreateView(generics.ListCreateAPIView):
    serializer_class = PokerSourceSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        return PokerSource.objects.annotate(tournament_count=Count("tournaments")).order_by("name")


class AdminPokerSourceDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = PokerSource.objects.all()
    serializer_class = PokerSourceSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminPokerSourceSyncView(APIView):
    """POST /api/admin-panel/poker/sources/<id>/sync/ — run one source now.

    Synchronous by design: there is no Celery worker in this deployment, and a
    single feed fetch is a ~10s bounded operation (the connectors set request
    timeouts). Scheduled runs go through the sync_poker management command.
    """
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, pk):
        try:
            source = PokerSource.objects.get(pk=pk)
        except PokerSource.DoesNotExist:
            return Response({"error": "Source not found."}, status=404)

        log = poker_sync_service.sync_source(source)
        return Response({
            "message": f"Sync finished with status '{log.status}'.",
            "log": PokerSyncLogSerializer(log).data,
            "source": PokerSourceSerializer(source).data,
        })


class AdminPokerSyncAllView(APIView):
    """POST /api/admin-panel/poker/sources/sync-all/ — run every enabled source."""
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request):
        totals = poker_sync_service.sync_poker_from_sources()
        return Response({"message": "Sync completed.", "totals": totals})


class AdminPokerSyncLogListView(generics.ListAPIView):
    serializer_class = PokerSyncLogSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = PokerSyncLog.objects.select_related("source")
        if (source := (self.request.query_params.get("source") or "").strip()).isdigit():
            qs = qs.filter(source_id=int(source))
        if (status_ := (self.request.query_params.get("status") or "").strip()):
            qs = qs.filter(status=status_)
        return qs


class AdminPokerStatsView(APIView):
    """GET /api/admin-panel/poker/stats/ — review-queue counts for the tab header."""
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        by_review = {
            row["review_status"]: row["n"]
            for row in PokerTournament.objects.values("review_status").annotate(n=Count("id"))
        }
        return Response({
            "total": PokerTournament.objects.count(),
            "pending_review": by_review.get("pending_review", 0),
            "published": by_review.get("published", 0),
            "approved": by_review.get("approved", 0),
            "rejected": by_review.get("rejected", 0),
            "duplicate": by_review.get("duplicate", 0),
            "archived": by_review.get("archived", 0),
            "sources": PokerSource.objects.count(),
            "sources_enabled": PokerSource.objects.filter(is_enabled=True).count(),
            "sources_failing": PokerSource.objects.filter(sync_status="failed").count(),
        })
