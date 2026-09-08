"""
authapp/views/andhar_bahar_views.py
─────────────────────────────────────────────────────────────────────────────
Public endpoints (api/andhar-bahar/…)
  AndharBaharPageView            GET  /api/andhar-bahar/content/    (public)
  AndharBaharEventListView       GET  /api/andhar-bahar/events/     (public)
  AndharBaharFilterOptionsView   GET  /api/andhar-bahar/filters/    (public)
  AndharBaharEventDetailView     GET  /api/andhar-bahar/events/<id>/ (public)
  AndharBaharRegisterView        POST /api/andhar-bahar/events/<id>/register/ (auth)
  AndharBaharMyRegistrationsView GET  /api/andhar-bahar/my-registrations/     (auth)

Back Office (api/admin-panel/andhar-bahar/…) — all IsAdminOrSuperAdmin
  AdminAndharBaharContentView               GET/PATCH  .../content/
  AdminAndharBaharHighlight{ListCreate,Detail}View     .../highlights/[<id>/]
  AdminAndharBaharStep{ListCreate,Detail}View          .../steps/[<id>/]
  AdminAndharBaharEvent{ListCreate,Detail}View         .../events/[<id>/]
  AndharBaharMedia{ListCreate,Detail}View              .../media/[<id>/]

Registration is INTEREST CAPTURE, matching Poker rather than Teen Patti. An
AndharBaharEvent has no seat accounting, so there is no capacity to hold under
a row lock and no confirmation ID that would confirm anything. What a
registration records is that this member wants to be told about this event —
which is exactly what PokerRegistration records, and what the Back Office
registrations table exists to work through.
"""
from django.db.models import Q
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.andhar_bahar_models import (
    PUBLIC_EVENT_STATUSES,
    AndharBaharContent,
    AndharBaharEvent,
    AndharBaharHighlight,
    AndharBaharRegistration,
    AndharBaharStep,
)
from authapp.models.faq_models import CATEGORY_ANDHAR_BAHAR, FAQ
from authapp.models.landing_models import SectionMedia
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.andhar_bahar_serializers import (
    AndharBaharContentSerializer,
    AndharBaharEventAdminSerializer,
    AndharBaharEventPublicSerializer,
    AndharBaharHighlightSerializer,
    AndharBaharRegistrationAdminSerializer,
    AndharBaharRegistrationSerializer,
    AndharBaharStepSerializer,
)
from authapp.serializers.faq_serializers import FAQPublicSerializer
from authapp.serializers.landing_serializers import SectionMediaSerializer
from authapp.views.landing_views import (
    _SectionMediaAdminDetailBase,
    _SectionMediaAdminListCreateBase,
)

SECTION = "andhar_bahar"


def _public_event_queryset():
    return AndharBaharEvent.objects.filter(
        is_active=True, status__in=PUBLIC_EVENT_STATUSES,
    ).select_related("casino")


def _my_registration_event_ids(user):
    """Event ids this member has already registered for.

    One query for a whole page of cards, handed to the serializer through
    context — the same prefetch shape the Teen Patti list uses, rather than a
    per-card lookup. Empty for an anonymous visitor without touching the
    database.
    """
    if not (user and getattr(user, "is_authenticated", False)):
        return set()
    return set(
        AndharBaharRegistration.objects
        .filter(user=user)
        .values_list("event_id", flat=True)
    )


def _apply_public_filters(qs, params):
    """Every filter is optional, and an unknown value narrows to nothing
    rather than erroring — same contract as the Teen Patti list."""
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
        # "published" is the state an admin sets on save, before any
        # date-promotion has happened. A visitor asking for Upcoming means both.
        qs = qs.filter(status__in=("published", "upcoming"))
    elif status_ in PUBLIC_EVENT_STATUSES:
        qs = qs.filter(status=status_)

    if (params.get("featured") or "").strip().lower() in ("1", "true", "yes"):
        qs = qs.filter(is_featured=True)

    date_from = (params.get("date_from") or "").strip()
    if date_from:
        qs = qs.filter(start_date__gte=date_from)
    date_to = (params.get("date_to") or "").strip()
    if date_to:
        qs = qs.filter(start_date__lte=date_to)
    return qs


# ── Public ──────────────────────────────────────────────────────────────────
class AndharBaharPageView(APIView):
    """The whole page in one payload — see the serializer module docstring for
    why this is one request rather than five.

    Returns 200 with `is_published: false` and no content when the page is
    switched off, rather than 404: the frontend then renders an explanation on
    a route that was live yesterday, which is what a visitor following an old
    link needs.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        content = AndharBaharContent.load()
        ctx = {"request": request}

        if not content.is_published:
            return Response({
                "is_published": False,
                "content": None,
                "highlights": [],
                "steps": [],
                "events": [],
                "faqs": [],
                "media": {},
            })

        ctx["my_registration_event_ids"] = _my_registration_event_ids(request.user)

        events = []
        if content.show_events_section:
            events = AndharBaharEventPublicSerializer(
                _public_event_queryset()[:24], many=True, context=ctx,
            ).data

        highlights = []
        if content.show_highlights_section:
            highlights = AndharBaharHighlightSerializer(
                AndharBaharHighlight.objects.filter(is_active=True), many=True, context=ctx,
            ).data

        steps = []
        if content.show_how_to_play_section:
            steps = AndharBaharStepSerializer(
                AndharBaharStep.objects.filter(is_active=True), many=True, context=ctx,
            ).data

        # Keyed by slot so the page can ask for "background"/"hero_card"
        # directly instead of scanning a list — the same two slots the Teen
        # Patti and Poker pages already render.
        media = {
            row.slot: SectionMediaSerializer(row, context=ctx).data
            for row in SectionMedia.objects.filter(section=SECTION, is_active=True)
        }

        return Response({
            "is_published": True,
            "content": AndharBaharContentSerializer(content, context=ctx).data,
            "highlights": highlights,
            "steps": steps,
            "events": events,
            "faqs": FAQPublicSerializer(
                FAQ.objects.filter(category=CATEGORY_ANDHAR_BAHAR, is_active=True),
                many=True,
            ).data,
            "media": media,
        })


class _PublicEventContextMixin:
    """Adds the requesting member's registered-event ids to serializer context,
    so a card can render "Registered" without a second request."""

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["my_registration_event_ids"] = _my_registration_event_ids(self.request.user)
        return ctx


class AndharBaharEventListView(_PublicEventContextMixin, generics.ListAPIView):
    """Filterable event list, for the page's own filters. The page payload
    above already embeds the first batch, so this is only hit once a visitor
    actually filters."""

    serializer_class = AndharBaharEventPublicSerializer
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        return _apply_public_filters(_public_event_queryset(), self.request.query_params)


class AndharBaharEventDetailView(_PublicEventContextMixin, generics.RetrieveAPIView):
    serializer_class = AndharBaharEventPublicSerializer
    permission_classes = [AllowAny]
    queryset = _public_event_queryset()


class AndharBaharRegisterView(APIView):
    """POST /api/andhar-bahar/events/<id>/register/ — records interest.

    No payment, no seat, no confirmation ID: an AndharBaharEvent has no
    capacity, so this is the Poker flow, not the Teen Patti one. A host follows
    up; the Back Office registrations table is where that work happens.

    get_or_create on top of the model's unique_together, so a double-submit or
    an impatient second tap is a friendly no-op rather than an error or a
    duplicate row.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        event = _public_event_queryset().filter(pk=pk).first()
        if event is None:
            # 404 rather than 403 for a draft or deactivated event: whether a
            # non-public event exists is not a visitor's business.
            return Response({"error": "Event not found."}, status=404)

        # Registering interest in something already over helps nobody, and a
        # host contacting them about it would be worse than not writing the row.
        if event.computed_status == "completed":
            return Response(
                {"error": "This event has finished.", "code": "event_completed"},
                status=409,
            )

        obj, created = AndharBaharRegistration.objects.get_or_create(
            event=event, user=request.user,
        )
        return Response(
            {
                "message": (
                    "Registration received — a VIP host will be in touch."
                    if created else
                    "You have already registered for this event."
                ),
                "created": created,
                "registration": AndharBaharRegistrationSerializer(obj).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AndharBaharMyRegistrationsView(generics.ListAPIView):
    """The member's own registrations. Scoped to request.user, so a forged id
    in a query param resolves to nothing rather than somebody else's list."""

    serializer_class = AndharBaharRegistrationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return (
            AndharBaharRegistration.objects
            .filter(user=self.request.user)
            .select_related("event", "event__casino")
        )


class AndharBaharFilterOptionsView(APIView):
    """Distinct countries/cities/casinos that actually have public events, so
    a filter dropdown never offers a value that returns nothing."""

    permission_classes = [AllowAny]

    def get(self, request):
        qs = _public_event_queryset()
        return Response({
            "countries": sorted({c for c in qs.values_list("country", flat=True) if c}),
            "cities": sorted({c for c in qs.values_list("city", flat=True) if c}),
            "casinos": [
                {"id": cid, "name": name}
                for cid, name in sorted(
                    {
                        (cid, name)
                        for cid, name in qs.exclude(casino__isnull=True)
                        .values_list("casino_id", "casino__name")
                    },
                    key=lambda row: row[1] or "",
                )
            ],
        })


# ── Back Office ─────────────────────────────────────────────────────────────
class AdminAndharBaharContentView(APIView):
    """Singleton read/patch — same shape as AdminLandingSettingsView."""

    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        obj = AndharBaharContent.load()
        return Response(AndharBaharContentSerializer(obj, context={"request": request}).data)

    def patch(self, request):
        obj = AndharBaharContent.load()
        serializer = AndharBaharContentSerializer(
            obj, data=request.data, partial=True, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data)


class AdminAndharBaharHighlightListCreateView(generics.ListCreateAPIView):
    queryset = AndharBaharHighlight.objects.all()
    serializer_class = AndharBaharHighlightSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminAndharBaharHighlightDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = AndharBaharHighlight.objects.all()
    serializer_class = AndharBaharHighlightSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminAndharBaharStepListCreateView(generics.ListCreateAPIView):
    queryset = AndharBaharStep.objects.all()
    serializer_class = AndharBaharStepSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminAndharBaharStepDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = AndharBaharStep.objects.all()
    serializer_class = AndharBaharStepSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminAndharBaharEventListCreateView(generics.ListCreateAPIView):
    """Back Office list — every event, including drafts and inactive rows, so
    an admin can find what a visitor cannot see."""

    serializer_class = AndharBaharEventAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    pagination_class = None

    def get_queryset(self):
        qs = AndharBaharEvent.objects.all().select_related("casino")
        params = self.request.query_params
        q = (params.get("q") or "").strip()
        if q:
            qs = qs.filter(name__icontains=q)
        status_ = (params.get("status") or "").strip()
        if status_:
            qs = qs.filter(status=status_)
        country = (params.get("country") or "").strip()
        if country:
            qs = qs.filter(country__iexact=country)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class AdminAndharBaharEventDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = AndharBaharEvent.objects.all().select_related("casino")
    serializer_class = AndharBaharEventAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminAndharBaharRegistrationListView(generics.ListAPIView):
    """Back Office registrations table — every member who registered interest,
    filterable by event and status so a host can work through the new ones."""

    serializer_class = AndharBaharRegistrationAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = (
            AndharBaharRegistration.objects
            .select_related("event", "event__casino", "user")
        )
        params = self.request.query_params
        event = (params.get("event") or "").strip()
        if event.isdigit():
            qs = qs.filter(event_id=int(event))
        status_ = (params.get("status") or "").strip()
        if status_:
            qs = qs.filter(status=status_)
        q = (params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(user__name__icontains=q)
                | Q(user__email__icontains=q)
                | Q(user__user_uid__icontains=q)
                | Q(event__name__icontains=q)
            )
        return qs


class AdminAndharBaharRegistrationDetailView(generics.RetrieveUpdateAPIView):
    """Status and host notes only — the serializer marks everything else
    read-only, so who registered for what can never be edited after the fact.

    No DELETE: a registration is a record that somebody asked, and removing it
    would lose that. Closing it is what `status` is for.
    """

    queryset = AndharBaharRegistration.objects.select_related("event", "user")
    serializer_class = AndharBaharRegistrationAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AndharBaharMediaListCreateView(_SectionMediaAdminListCreateBase):
    """Reuses the Teen Patti / Poker media admin base verbatim. `section` is
    forced on every write by the base class, so an Andhar Bahar row can never
    be moved to another page through this endpoint."""

    section = SECTION


class AndharBaharMediaDetailView(_SectionMediaAdminDetailBase):
    section = SECTION
