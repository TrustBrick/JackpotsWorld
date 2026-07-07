from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from authapp.models.promotion_models import Promotion
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

class AdminPromotionListCreateView(generics.ListCreateAPIView):
    queryset = Promotion.objects.all()
    serializer_class = PromotionSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class AdminPromotionDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Promotion.objects.all()
    serializer_class = PromotionSerializer
    permission_classes = [IsAdminOrSuperAdmin]
