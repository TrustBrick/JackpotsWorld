from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from authapp.models.landing_models import (
    LandingSettings, HeroStat, WhyChooseUsFeature, TrustBadge,
    GiftItem, GiftStep, VipTier, VipTierBenefit, Testimonial,
    Destination, DestinationMedia, VipServiceImage, TourPackage,
    PremiumPartner,
)
from authapp.serializers.landing_serializers import (
    LandingSettingsSerializer, HeroStatSerializer, WhyChooseUsFeatureSerializer,
    TrustBadgeSerializer, GiftItemSerializer, GiftStepSerializer,
    VipTierSerializer, VipTierBenefitSerializer, TestimonialSerializer,
    DestinationSerializer, DestinationMediaSerializer, VipServiceImageSerializer,
    PremiumPartnerSerializer,
    TourPackageSerializer,
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
