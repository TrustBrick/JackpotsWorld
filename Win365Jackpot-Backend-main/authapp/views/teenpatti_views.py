"""
authapp/views/teenpatti_views.py
─────────────────────────────────────────────────────────────────────────────
Public endpoints (api/teen-patti/…)
  TeenPattiListView              GET    /api/teen-patti/                    (public)
  TeenPattiFilterOptionsView     GET    /api/teen-patti/filters/            (public)
  TeenPattiDetailView            GET    /api/teen-patti/<id>/               (public)
  TeenPattiRegisterView          POST   /api/teen-patti/<id>/register/      (auth)
  TeenPattiCancelRegistrationView DELETE /api/teen-patti/<id>/register/     (auth)
  TeenPattiMyRegistrationsView   GET    /api/teen-patti/my-registrations/   (auth)

Back Office endpoints (api/admin-panel/teen-patti/…) — all IsAdminOrSuperAdmin
  AdminTeenPattiStatsView        GET    .../teen-patti/stats/
  AdminTeenPattiListCreateView   GET/POST   .../teen-patti/
  AdminTeenPattiDetailView       GET/PATCH/DELETE .../teen-patti/<id>/
  AdminTeenPattiRegistrationListView   GET   .../teen-patti/registrations/
  AdminTeenPattiRegistrationUpdateView PATCH .../teen-patti/registrations/<id>/

No commission or seat arithmetic happens here — every state change goes
through services/teenpatti_service.py.
"""
from django.db.models import Count, F, Q
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.teenpatti_models import (
    PUBLIC_EVENT_STATUSES,
    SEAT_HOLDING_STATUSES,
    TeenPattiEvent,
    TeenPattiRegistration,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.teenpatti_serializers import (
    TeenPattiEventAdminSerializer,
    TeenPattiEventPublicSerializer,
    TeenPattiRegistrationAdminSerializer,
    TeenPattiRegistrationSerializer,
)
from authapp.services import teenpatti_service
from authapp.services.teenpatti_service import RegistrationError


def _public_queryset():
    return TeenPattiEvent.objects.filter(
        is_active=True, status__in=PUBLIC_EVENT_STATUSES,
    ).select_related("casino")


def _apply_public_filters(qs, params):
    """Part 25's filter set. Every filter is optional and unknown values
    simply narrow to nothing rather than erroring."""
    country = (params.get("country") or "").strip()
    if country:
        qs = qs.filter(country__iexact=country)

    city = (params.get("city") or "").strip()
    if city:
        qs = qs.filter(city__iexact=city)

    casino = (params.get("casino") or "").strip()
    if casino.isdigit():
        qs = qs.filter(casino_id=int(casino))

    status_ = (params.get("status") or "").strip()
    if status_ == "upcoming":
        # "published" is the state an admin sets on save, before the scheduler
        # has date-promoted it. A visitor asking for Upcoming means both.
        qs = qs.filter(status__in=("published", "upcoming"))
    elif status_ in PUBLIC_EVENT_STATUSES:
        qs = qs.filter(status=status_)

    date_from = (params.get("date_from") or "").strip()
    if date_from:
        qs = qs.filter(start_date__gte=date_from)
    date_to = (params.get("date_to") or "").strip()
    if date_to:
        qs = qs.filter(start_date__lte=date_to)

    for param, lookup in (("min_entry_fee", "entry_fee__gte"), ("max_entry_fee", "entry_fee__lte"),
                          ("min_prize_pool", "prize_pool__gte")):
        raw = (params.get(param) or "").strip()
        if raw:
            try:
                qs = qs.filter(**{lookup: raw})
            except (ValueError, TypeError):
                pass

    if (params.get("featured") or "").strip().lower() in ("1", "true", "yes"):
        qs = qs.filter(is_featured=True)

    return qs


class TeenPattiListView(generics.ListAPIView):
    """GET /api/teen-patti/ — paginated (PAGE_SIZE=20), filterable."""
    serializer_class = TeenPattiEventPublicSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return _apply_public_filters(_public_queryset(), self.request.query_params)

    def get_serializer_context(self):
        """Resolves the requesting user's registrations for the events on this
        page in a single query, so the serializer's is_registered/can_register
        fields don't fire one query per card."""
        context = super().get_serializer_context()
        context["my_registrations"] = _my_registration_map(self.request, self.get_queryset())
        return context


def _my_registration_map(request, events_qs):
    user = getattr(request, "user", None)
    if not (user and user.is_authenticated):
        return {}
    rows = TeenPattiRegistration.objects.filter(
        user=user, event__in=events_qs, status__in=SEAT_HOLDING_STATUSES,
    )
    return {r.event_id: r for r in rows}


class TeenPattiDetailView(generics.RetrieveAPIView):
    serializer_class = TeenPattiEventPublicSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return _public_queryset()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["my_registrations"] = _my_registration_map(self.request, self.get_queryset())
        return context


class TeenPattiFilterOptionsView(APIView):
    """GET /api/teen-patti/filters/ — the distinct countries/cities/casinos
    that actually have public events, so the filter bar never offers an option
    that returns nothing."""
    permission_classes = [AllowAny]

    def get(self, request):
        qs = _public_queryset()
        casinos = (
            qs.exclude(casino__isnull=True)
            .values("casino_id", "casino__name", "casino__country")
            .distinct().order_by("casino__name")
        )
        return Response({
            "countries": sorted({c for c in qs.values_list("country", flat=True) if c}),
            "cities": sorted({c for c in qs.values_list("city", flat=True) if c}),
            "casinos": [
                {"id": c["casino_id"], "name": c["casino__name"], "country": c["casino__country"]}
                for c in casinos
            ],
            "counts": {
                "live": qs.filter(status="live").count(),
                "upcoming": qs.filter(status__in=("published", "upcoming")).count(),
                "completed": qs.filter(status="completed").count(),
            },
        })


class TeenPattiRegisterView(APIView):
    """POST   /api/teen-patti/<id>/register/ — claim a seat.
       DELETE /api/teen-patti/<id>/register/ — release it."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            registration, _ = teenpatti_service.register_user(request.user, pk)
        except RegistrationError as exc:
            return Response({"error": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "message": "Registration confirmed.",
                "registration": TeenPattiRegistrationSerializer(registration).data,
            },
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request, pk):
        try:
            registration = teenpatti_service.cancel_registration(request.user, pk)
        except RegistrationError as exc:
            return Response({"error": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            "message": "Registration cancelled.",
            "registration": TeenPattiRegistrationSerializer(registration).data,
        })


class TeenPattiMyRegistrationsView(generics.ListAPIView):
    """GET /api/teen-patti/my-registrations/ — always scoped to request.user;
    there is no way to ask for anyone else's."""
    serializer_class = TeenPattiRegistrationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TeenPattiRegistration.objects.filter(
            user=self.request.user,
        ).select_related("event", "event__casino")


# ─────────────────────────────────────────────────────────────────────────────
# Back Office
# ─────────────────────────────────────────────────────────────────────────────

class AdminTeenPattiStatsView(APIView):
    """GET /api/admin-panel/teen-patti/stats/ — the Part 22 dashboard tiles,
    computed with aggregates rather than by loading rows."""
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        events = TeenPattiEvent.objects.all()
        by_status = {row["status"]: row["n"] for row in events.values("status").annotate(n=Count("id"))}
        registrations = TeenPattiRegistration.objects.all()

        fully_booked = events.filter(
            is_active=True, max_participants__isnull=False,
            current_participants__gte=F("max_participants"),
        ).count()

        return Response({
            "total_events": events.count(),
            "draft_events": by_status.get("draft", 0),
            "published_events": by_status.get("published", 0),
            "live_events": by_status.get("live", 0),
            "upcoming_events": by_status.get("upcoming", 0),
            "completed_events": by_status.get("completed", 0),
            "cancelled_events": by_status.get("cancelled", 0),
            "featured_events": events.filter(is_featured=True).count(),
            "total_registrations": registrations.count(),
            "confirmed_registrations": registrations.filter(status="confirmed").count(),
            "cancelled_registrations": registrations.filter(status="cancelled").count(),
            "upcoming_registrations": registrations.filter(
                status__in=SEAT_HOLDING_STATUSES, event__status__in=("published", "upcoming"),
            ).count(),
            "fully_booked_events": fully_booked,
        })


class AdminTeenPattiListCreateView(generics.ListCreateAPIView):
    serializer_class = TeenPattiEventAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = TeenPattiEvent.objects.select_related("casino").annotate(
            registration_count=Count("registrations", filter=Q(registrations__status__in=SEAT_HOLDING_STATUSES)),
        )
        status_ = (self.request.query_params.get("status") or "").strip()
        if status_:
            qs = qs.filter(status=status_)
        country = (self.request.query_params.get("country") or "").strip()
        if country:
            qs = qs.filter(country__iexact=country)
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(city__icontains=search) | Q(venue__icontains=search))
        return qs.order_by("-start_date", "-start_time")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class AdminTeenPattiDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = TeenPattiEvent.objects.select_related("casino")
    serializer_class = TeenPattiEventAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        event = serializer.save()
        # Cancelling is the one status change registrants must hear about
        # (Part 24) — fired here rather than in the serializer so a plain
        # field edit never triggers it.
        if previous_status != "cancelled" and event.status == "cancelled":
            teenpatti_service.notify_event_cancelled(event)


class AdminTeenPattiRegistrationListView(generics.ListAPIView):
    """GET /api/admin-panel/teen-patti/registrations/?event=<id>"""
    serializer_class = TeenPattiRegistrationAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = TeenPattiRegistration.objects.select_related("user", "event")
        event_id = (self.request.query_params.get("event") or "").strip()
        if event_id.isdigit():
            qs = qs.filter(event_id=int(event_id))
        status_ = (self.request.query_params.get("status") or "").strip()
        if status_:
            qs = qs.filter(status=status_)
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(confirmation_id__icontains=search)
                | Q(user__name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__user_uid__icontains=search)
            )
        return qs.order_by("-created_at")


class AdminTeenPattiRegistrationUpdateView(generics.UpdateAPIView):
    """PATCH /api/admin-panel/teen-patti/registrations/<id>/ — status/admin_note
    only (the serializer marks everything else read-only). Seat counts are
    recomputed from the rows afterwards, since a status change can move a
    registration in or out of the seat-holding set."""
    queryset = TeenPattiRegistration.objects.select_related("event")
    serializer_class = TeenPattiRegistrationAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    http_method_names = ["patch"]

    def perform_update(self, serializer):
        registration = serializer.save()
        teenpatti_service.recount_seats(registration.event)
