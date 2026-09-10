"""Public and Back Office endpoints for the VIP destination pillars."""
from django.db.models import Q
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.experience_models import (
    CATEGORY_VALUES,
    Experience,
    ExperienceEnquiry,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.experience_serializers import (
    ExperienceAdminSerializer,
    ExperienceEnquiryAdminSerializer,
    ExperienceEnquiryCreateSerializer,
    ExperienceSerializer,
    category_vocabulary,
)
from authapp.throttles import ExperienceEnquiryThrottle


class ExperienceListView(APIView):
    """GET /api/experiences/ — every active pillar card, grouped by category.

    ONE REQUEST FOR THE WHOLE STORY. These are four sections of a single
    landing page whose parts are meaningless apart, and the page already makes
    a handful of requests for its existing sections. Four more — one per
    pillar — would show the page assembling itself in stages on a slow
    connection, which is the opposite of the cinematic read this is for.

    The `categories` list ships alongside so the frontend renders its sections
    from the server's own vocabulary rather than a second hardcoded list that
    can drift.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        rows = (
            Experience.objects
            .filter(is_active=True)
            .select_related("destination")
            .order_by("display_order", "id")
        )
        serialized = ExperienceSerializer(
            rows, many=True, context={"request": request},
        ).data

        grouped = {slug: [] for slug in CATEGORY_VALUES}
        for row in serialized:
            # A row whose category is no longer in CHOICES (a slug retired in
            # code before its rows were migrated) is skipped rather than
            # crashing the whole page on a KeyError.
            grouped.setdefault(row["category"], []).append(row)

        return Response({
            "categories": category_vocabulary(),
            "experiences": grouped,
        })


class ExperienceEnquiryCreateView(generics.CreateAPIView):
    """POST /api/experiences/enquiries/ — a visitor asking about a service.

    ANONYMOUS ON PURPOSE, and throttled for exactly that reason. The visitor
    is still handed off to WhatsApp by the frontend afterwards; this call is
    what makes the enquiry survive whether or not that message is ever sent.

    Everything that could be forged is derived here rather than accepted:
    `category` and `experience_title` are copied from the Experience actually
    referenced, `user` comes from the request's own authentication if any, and
    `status` is always the default. The serializer does not expose those
    fields at all, so this is belt and braces rather than the only guard.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ExperienceEnquiryThrottle]
    serializer_class = ExperienceEnquiryCreateSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        experience = serializer.validated_data["experience"]

        enquiry = serializer.save(
            category=experience.category,
            experience_title=experience.title,
            user=request.user if request.user and request.user.is_authenticated else None,
            submitted_ip=self._client_ip(request),
        )

        # Deliberately thin: an id and the enquiry key the frontend needs to
        # compose the WhatsApp handoff. Nothing about other enquiries, and no
        # echo of stored staff fields.
        return Response(
            {
                "id": enquiry.id,
                "enquiry_key": experience.enquiry_key,
                "message": "Thank you — a VIP host will be in touch shortly.",
            },
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _client_ip(request):
        """Best-effort client address, for throttling only.

        Trusts the left-most X-Forwarded-For entry because this runs behind an
        ALB that appends the real client address; the value is never displayed,
        never used to identify anyone, and never returned by any endpoint.
        """
        forwarded = (request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")
        candidate = forwarded[0].strip() if forwarded and forwarded[0].strip() else None
        return candidate or request.META.get("REMOTE_ADDR")


# ── Back Office ──────────────────────────────────────────────────────────────

class AdminExperienceListCreateView(generics.ListCreateAPIView):
    """Back Office CRUD over the pillar cards. Filterable by category so each
    admin sub-view shows only its own pillar."""

    serializer_class = ExperienceAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = Experience.objects.select_related("destination")
        category = (self.request.query_params.get("category") or "").strip()
        if category:
            qs = qs.filter(category=category)
        return qs.order_by("display_order", "id")

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)


class AdminExperienceDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Full CRUD including DELETE — unlike enquiries, a pillar card is content
    an admin authored and may legitimately remove."""

    queryset = Experience.objects.select_related("destination")
    serializer_class = ExperienceAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class AdminExperienceEnquiryListView(generics.ListAPIView):
    """The lead list, filterable by category and status and searchable, so a
    host can work through the new ones."""

    serializer_class = ExperienceEnquiryAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = ExperienceEnquiry.objects.select_related("experience", "user")
        params = self.request.query_params

        category = (params.get("category") or "").strip()
        if category:
            qs = qs.filter(category=category)

        status_ = (params.get("status") or "").strip()
        if status_:
            qs = qs.filter(status=status_)

        q = (params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(email__icontains=q)
                | Q(phone__icontains=q)
                | Q(destination__icontains=q)
                | Q(experience_title__icontains=q),
            )
        return qs


class AdminExperienceEnquiryDetailView(generics.RetrieveUpdateAPIView):
    """RetrieveUpdate, with no DELETE.

    An enquiry is a record of a real person asking for something. Working it
    means moving it to `contacted` or `closed`, not erasing it — so there is
    no destroy path, and the serializer allows only those two fields to change.
    """

    queryset = ExperienceEnquiry.objects.select_related("experience", "user")
    serializer_class = ExperienceEnquiryAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]
