from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from authapp.models.promotion_models import Promotion, PromotionGalleryImage
from authapp.serializers.promotion_serializers import PromotionSerializer
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin


class PromotionListView(APIView):
    """
    GET /api/promotions/?country=
    Public. Returns promotions grouped by country (one entry per country,
    each holding its promotions) so the frontend can render one country
    card with a horizontally-scrolling strip of promotions inside it,
    without needing to do the grouping itself. Not paginated — a country
    can hold any number of promotions ("unlimited countries and promotions").
    """
    permission_classes = [AllowAny]

    def get(self, request):
        qs = Promotion.objects.filter(is_active=True)
        country = request.query_params.get("country", "").strip()
        if country:
            qs = qs.filter(country__iexact=country)

        data = PromotionSerializer(qs, many=True, context={"request": request}).data

        grouped = {}
        order = []
        for item in data:
            c = item["country"]
            if c not in grouped:
                grouped[c] = []
                order.append(c)
            grouped[c].append(item)

        countries = [{"country": c, "promotions": grouped[c]} for c in order]
        return Response({"countries": countries})


class PromotionDetailView(generics.RetrieveAPIView):
    queryset = Promotion.objects.filter(is_active=True)
    serializer_class = PromotionSerializer
    permission_classes = [AllowAny]


# ─────────────────────────────────────────────────────────────────────────────
# Admin-managed CRUD (Admin Panel "Manage Promotions")
# ─────────────────────────────────────────────────────────────────────────────

def _save_gallery_images(promotion, request):
    """Any files posted under the repeated "gallery" form-data key (same
    name the serializer reads it back out under) become additional
    PromotionGalleryImage rows, appended after whatever gallery images
    already exist (edits add to the gallery, they don't replace it —
    individual images are removed via the dedicated delete endpoint below)."""
    files = request.FILES.getlist("gallery")
    if not files:
        return
    start = promotion.gallery.count()
    PromotionGalleryImage.objects.bulk_create([
        PromotionGalleryImage(promotion=promotion, image=f, order=start + i)
        for i, f in enumerate(files)
    ])


class AdminPromotionListCreateView(generics.ListCreateAPIView):
    queryset = Promotion.objects.all()
    serializer_class = PromotionSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_create(self, serializer):
        promotion = serializer.save(created_by=self.request.user)
        _save_gallery_images(promotion, self.request)


class AdminPromotionDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Promotion.objects.all()
    serializer_class = PromotionSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_update(self, serializer):
        promotion = serializer.save()
        _save_gallery_images(promotion, self.request)


class AdminPromotionGalleryImageDeleteView(APIView):
    """DELETE /admin-panel/promotions/<pk>/gallery/<image_id>/"""
    permission_classes = [IsAdminOrSuperAdmin]

    def delete(self, request, pk, image_id):
        try:
            img = PromotionGalleryImage.objects.get(pk=image_id, promotion_id=pk)
        except PromotionGalleryImage.DoesNotExist:
            return Response({"error": "Gallery image not found"}, status=status.HTTP_404_NOT_FOUND)
        img.delete()
        return Response({"message": "Gallery image deleted"})
