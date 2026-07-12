from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from authapp.models.landing_models import (
    LandingSettings, HeroStat, WhyChooseUsFeature, TrustBadge,
    GiftItem, GiftStep, VipTier, VipTierBenefit, Testimonial,
    Destination, DestinationMedia, VipServiceImage, TourPackage,
)
from authapp.serializers.landing_serializers import (
    LandingSettingsSerializer, HeroStatSerializer, WhyChooseUsFeatureSerializer,
    TrustBadgeSerializer, GiftItemSerializer, GiftStepSerializer,
    VipTierSerializer, VipTierBenefitSerializer, TestimonialSerializer,
    DestinationSerializer, DestinationMediaSerializer, VipServiceImageSerializer,
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


def _admin_crud_views(_model, _serializer_cls):
    """Build (ListCreateView, DetailView) classes for a model — every landing
    content type follows the exact same admin CRUD shape, so this avoids
    repeating the same two-class boilerplate 12 times."""

    class ListCreateView(generics.ListCreateAPIView):
        queryset = _model.objects.all()
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
AdminVipTierListCreateView, AdminVipTierDetailView = _admin_crud_views(VipTier, VipTierSerializer)
AdminVipTierBenefitListCreateView, AdminVipTierBenefitDetailView = _admin_crud_views(VipTierBenefit, VipTierBenefitSerializer)
AdminTestimonialListCreateView, AdminTestimonialDetailView = _admin_crud_views(Testimonial, TestimonialSerializer)
AdminDestinationListCreateView, AdminDestinationDetailView = _admin_crud_views(Destination, DestinationSerializer)
AdminDestinationMediaListCreateView, AdminDestinationMediaDetailView = _admin_crud_views(DestinationMedia, DestinationMediaSerializer)
AdminVipServiceImageListCreateView, AdminVipServiceImageDetailView = _admin_crud_views(VipServiceImage, VipServiceImageSerializer)
AdminTourPackageListCreateView, AdminTourPackageDetailView = _admin_crud_views(TourPackage, TourPackageSerializer)
