from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from authapp.models.landing_models import (
    EnquiryMessage,
    LandingSettings, HeroStat, WhyChooseUsFeature, TrustBadge,
    GiftItem, GiftStep, VipTier, VipTierBenefit, Testimonial,
    Destination, DestinationMedia, VipServiceImage, TourPackage,
    PremiumPartner, SectionMedia, FeaturedDestinationShowcase,
)
from authapp.serializers.landing_serializers import (
    EnquiryMessageSerializer, PublicEnquiryMessageSerializer,
    LandingSettingsSerializer, HeroStatSerializer, WhyChooseUsFeatureSerializer,
    TrustBadgeSerializer, GiftItemSerializer, GiftStepSerializer,
    VipTierSerializer, VipTierBenefitSerializer, TestimonialSerializer,
    DestinationSerializer, DestinationMediaSerializer, VipServiceImageSerializer,
    PremiumPartnerSerializer, SectionMediaSerializer,
    TourPackageSerializer,
    FeaturedDestinationShowcaseSerializer,
    PublicFeaturedDestinationShowcaseSerializer,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin


# ─────────────────────────────────────────────────────────────────────────────
# Public (AllowAny, active-only) — power the landing page + User Panel
# ─────────────────────────────────────────────────────────────────────────────

class LandingSettingsPublicView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        obj = LandingSettings.load()
        return Response(LandingSettingsSerializer(obj, context={"request": request}).data)


class HeroStatListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = HeroStat.objects.filter(is_active=True)
        return Response(HeroStatSerializer(qs, many=True, context={"request": request}).data)


class WhyChooseUsFeatureListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = WhyChooseUsFeature.objects.filter(is_active=True)
        return Response(WhyChooseUsFeatureSerializer(qs, many=True, context={"request": request}).data)


class TrustBadgeListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = TrustBadge.objects.filter(is_active=True)
        return Response(TrustBadgeSerializer(qs, many=True, context={"request": request}).data)


class EnquiryMessageListView(APIView):
    """GET /api/enquiry-messages/ — the text behind every enquiry button.

    Unauthenticated on purpose: these are the words a visitor is about to see
    in their own WhatsApp composer, so there is nothing here to protect. The
    serializer is the narrow public one, so the response carries the key and
    the text and nothing else -- no ids, no timestamps, no admin identity, and
    no phone number (the destination is still resolved client-side per visitor,
    exactly as before).

    Inactive rows are omitted rather than returned with a flag, so a message an
    admin has switched off falls back to the site's built-in default instead of
    opening WhatsApp with an empty composer.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        qs = EnquiryMessage.objects.filter(is_active=True)
        return Response(PublicEnquiryMessageSerializer(qs, many=True).data)


class GiftItemListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = GiftItem.objects.filter(is_active=True)
        return Response(GiftItemSerializer(qs, many=True, context={"request": request}).data)


class GiftStepListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = GiftStep.objects.filter(is_active=True)
        return Response(GiftStepSerializer(qs, many=True, context={"request": request}).data)


class VipTierListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = VipTier.objects.filter(is_active=True).prefetch_related("benefits")
        return Response(VipTierSerializer(qs, many=True, context={"request": request}).data)


class TestimonialListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = Testimonial.objects.filter(is_active=True)
        return Response(TestimonialSerializer(qs, many=True, context={"request": request}).data)


class DestinationListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = Destination.objects.filter(is_active=True).prefetch_related("images")
        return Response(DestinationSerializer(qs, many=True, context={"request": request}).data)


class FeaturedDestinationShowcaseListView(APIView):
    """GET /api/featured-destination-showcases/ — the landing page's
    promotional destination blocks.

    Active rows only, in display order. Inactive rows are never exposed
    publicly, and when nothing is active this returns [] so the frontend
    renders no section at all rather than an empty container.

    select_related("destination") because the serializer reads the
    destination's name and accent colour on every row — without it this is
    one extra query per showcase.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        qs = (
            FeaturedDestinationShowcase.objects
            .filter(is_active=True)
            .select_related("destination")
            .order_by("display_order", "id")
        )
        return Response(
            PublicFeaturedDestinationShowcaseSerializer(
                qs, many=True, context={"request": request},
            ).data
        )


class PremiumPartnerListView(APIView):
    """GET /api/premium-partners/ — the hero showcase's only data source.

    Eligibility is decided here, not on the client: a partner reaches the
    hero only when it is active, explicitly featured, and typed as a top
    premium partner. Un-featuring one therefore removes it from the API
    response outright rather than relying on the frontend to filter
    correctly.

    Reads nothing from Destination — the hero and the destinations section
    are independent by construction.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        qs = PremiumPartner.objects.filter(
            is_active=True,
            is_featured_in_hero=True,
            partner_type=PremiumPartner.HERO_PARTNER_TYPE,
        )
        return Response(
            PremiumPartnerSerializer(qs, many=True, context={"request": request}).data
        )


class SectionMediaListView(APIView):
    """GET /api/section-media/?section=teen_patti|poker — the cinematic side
    cards and background watermark for one page's hero. Returns only active
    rows; a slot with nothing configured is simply absent from the response,
    and the frontend renders nothing for it rather than a placeholder.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        section = (request.query_params.get("section") or "").strip()
        if section not in dict(SectionMedia.SECTION_CHOICES):
            return Response([])
        qs = SectionMedia.objects.filter(section=section, is_active=True)
        return Response(SectionMediaSerializer(qs, many=True, context={"request": request}).data)


class VipServiceImageListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = VipServiceImage.objects.filter(is_active=True)
        return Response(VipServiceImageSerializer(qs, many=True, context={"request": request}).data)


class TourPackageListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = TourPackage.objects.filter(is_active=True)
        return Response(TourPackageSerializer(qs, many=True, context={"request": request}).data)


# ─────────────────────────────────────────────────────────────────────────────
# Admin-managed CRUD (Admin Panel "Landing Page")
# ─────────────────────────────────────────────────────────────────────────────

class AdminLandingSettingsView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        obj = LandingSettings.load()
        return Response(LandingSettingsSerializer(obj, context={"request": request}).data)

    def patch(self, request):
        obj = LandingSettings.load()
        serializer = LandingSettingsSerializer(obj, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


def _admin_crud_views(_model, _serializer_cls, prefetch=None):
    """Build (ListCreateView, DetailView) classes for a model — every landing
    content type follows the exact same admin CRUD shape, so this avoids
    repeating the same two-class boilerplate 12 times.

    `prefetch` — optional list of related-manager names to prefetch on the
    list queryset, for models whose serializer nests a related set (e.g.
    Destination -> images, VipTier -> benefits). Without it, listing N rows
    issues one extra query per row (N+1) instead of one. Not applied to the
    detail queryset — a single-object retrieve already only pays for the one
    nested query either way, so there's no N+1 there to fix."""
    list_queryset = _model.objects.all().prefetch_related(*prefetch) if prefetch else _model.objects.all()

    class ListCreateView(generics.ListCreateAPIView):
        queryset = list_queryset
        serializer_class = _serializer_cls
        permission_classes = [IsAdminOrSuperAdmin]

    class DetailView(generics.RetrieveUpdateDestroyAPIView):
        queryset = _model.objects.all()
        serializer_class = _serializer_cls
        permission_classes = [IsAdminOrSuperAdmin]

    return ListCreateView, DetailView


AdminHeroStatListCreateView, AdminHeroStatDetailView = _admin_crud_views(HeroStat, HeroStatSerializer)
AdminWhyChooseUsFeatureListCreateView, AdminWhyChooseUsFeatureDetailView = _admin_crud_views(WhyChooseUsFeature, WhyChooseUsFeatureSerializer)
AdminTrustBadgeListCreateView, AdminTrustBadgeDetailView = _admin_crud_views(TrustBadge, TrustBadgeSerializer)
# Enquiry button messages. The factory supplies the queryset, serializer and
# permission exactly as it does for every other landing resource; these two
# subclasses add one thing on top -- stamping the admin who saved the row, so
# the Back Office table's "Last Updated" column can say who as well as when.
#
# Subclassed rather than folded into _admin_crud_views because that factory is
# shared by a dozen content types, none of which have an updated_by column.
_EnquiryListCreate, _EnquiryDetail = _admin_crud_views(EnquiryMessage, EnquiryMessageSerializer)


class AdminEnquiryMessageListCreateView(_EnquiryListCreate):
    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)


class AdminEnquiryMessageDetailView(_EnquiryDetail):
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
AdminGiftItemListCreateView, AdminGiftItemDetailView = _admin_crud_views(GiftItem, GiftItemSerializer)
AdminGiftStepListCreateView, AdminGiftStepDetailView = _admin_crud_views(GiftStep, GiftStepSerializer)
AdminVipTierListCreateView, AdminVipTierDetailView = _admin_crud_views(VipTier, VipTierSerializer, prefetch=["benefits"])
AdminVipTierBenefitListCreateView, AdminVipTierBenefitDetailView = _admin_crud_views(VipTierBenefit, VipTierBenefitSerializer)
AdminTestimonialListCreateView, AdminTestimonialDetailView = _admin_crud_views(Testimonial, TestimonialSerializer)
AdminDestinationListCreateView, AdminDestinationDetailView = _admin_crud_views(Destination, DestinationSerializer, prefetch=["images"])
AdminDestinationMediaListCreateView, AdminDestinationMediaDetailView = _admin_crud_views(DestinationMedia, DestinationMediaSerializer)
AdminVipServiceImageListCreateView, AdminVipServiceImageDetailView = _admin_crud_views(VipServiceImage, VipServiceImageSerializer)
AdminTourPackageListCreateView, AdminTourPackageDetailView = _admin_crud_views(TourPackage, TourPackageSerializer)
AdminPremiumPartnerListCreateView, AdminPremiumPartnerDetailView = _admin_crud_views(PremiumPartner, PremiumPartnerSerializer)
AdminFeaturedDestinationShowcaseListCreateView, AdminFeaturedDestinationShowcaseDetailView = _admin_crud_views(FeaturedDestinationShowcase, FeaturedDestinationShowcaseSerializer)


class _SectionMediaAdminListCreateBase(generics.ListCreateAPIView):
    serializer_class = SectionMediaSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    section = None  # set by subclass

    def get_queryset(self):
        return SectionMedia.objects.filter(section=self.section)

    def perform_create(self, serializer):
        if SectionMedia.objects.filter(section=self.section, slot=serializer.validated_data.get("slot")).exists():
            from rest_framework.exceptions import ValidationError
            # Wrapped in a list explicitly: a bare string here does not get
            # auto-normalized into a one-item list the way a serializer-level
            # validate() error does, so res.data["slot"][0] would otherwise
            # index into the string's first character instead of the message.
            raise ValidationError({"slot": ["This slot already has media — edit or delete the existing entry instead of creating a new one."]})
        serializer.save(section=self.section, updated_by=self.request.user)


class _SectionMediaAdminDetailBase(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SectionMediaSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    section = None  # set by subclass

    def get_queryset(self):
        # Scoped to this section, so the Teen Patti tab can never edit or
        # delete a Poker row (or vice versa) even by guessing an id.
        return SectionMedia.objects.filter(section=self.section)

    def perform_update(self, serializer):
        serializer.save(section=self.section, updated_by=self.request.user)


class TeenPattiMediaListCreateView(_SectionMediaAdminListCreateBase):
    section = "teen_patti"


class TeenPattiMediaDetailView(_SectionMediaAdminDetailBase):
    section = "teen_patti"


class PokerMediaListCreateView(_SectionMediaAdminListCreateBase):
    section = "poker"


class PokerMediaDetailView(_SectionMediaAdminDetailBase):
    section = "poker"
