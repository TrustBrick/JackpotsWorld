"""
authapp/views/faq_views.py
─────────────────────────────────────────────────────────────────────────────
  FAQListView            GET  /api/faqs/?category=landing        (public)
  AdminFAQListCreateView GET/POST         /api/admin-panel/faqs/
  AdminFAQDetailView     GET/PATCH/DELETE /api/admin-panel/faqs/<id>/
  AdminFAQReorderView    POST             /api/admin-panel/faqs/reorder/

The public list returns only active rows and only for a known category. An
unknown category returns an EMPTY LIST rather than 400: the frontend falls
back to its built-in copy when the list is empty (see faq_models.py), so an
empty response is a safe, well-defined outcome and an error response would
turn a typo into a broken section.
"""
from django.db import transaction
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.faq_models import PUBLIC_FAQ_CATEGORIES, FAQ
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.faq_serializers import FAQAdminSerializer, FAQPublicSerializer


class FAQListView(generics.ListAPIView):
    serializer_class = FAQPublicSerializer
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        category = (self.request.query_params.get("category") or "landing").strip()
        if category not in PUBLIC_FAQ_CATEGORIES:
            return FAQ.objects.none()
        return FAQ.objects.filter(category=category, is_active=True)


class AdminFAQListCreateView(generics.ListCreateAPIView):
    serializer_class = FAQAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    pagination_class = None

    def get_queryset(self):
        qs = FAQ.objects.all().select_related("updated_by")
        category = (self.request.query_params.get("category") or "").strip()
        if category:
            qs = qs.filter(category=category)
        return qs

    def perform_create(self, serializer):
        # A new row lands at the end of its category rather than sharing
        # order 0 with whatever is already there, so the admin list has a
        # stable, predictable sequence before anyone touches the reorder
        # control.
        category = serializer.validated_data.get("category", "landing")
        if not serializer.validated_data.get("order"):
            last = FAQ.objects.filter(category=category).order_by("-order").first()
            serializer.validated_data["order"] = (last.order + 1) if last else 0
        serializer.save(updated_by=self.request.user)


class AdminFAQDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = FAQ.objects.all().select_related("updated_by")
    serializer_class = FAQAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class AdminFAQReorderView(APIView):
    """POST {"order": [id, id, id, …]} — the ids in their new display order.

    One transaction, so a half-applied reorder can never leave two rows
    claiming the same position. Ids that do not exist are ignored rather than
    failing the whole request: the list the browser posted may be a moment
    stale if another admin deleted a row, and rejecting the entire reorder for
    that is worse than applying the part that still makes sense.
    """

    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request):
        ids = request.data.get("order")
        if not isinstance(ids, list):
            return Response(
                {"error": "Expected an 'order' list of FAQ ids."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clean = []
        for raw in ids:
            try:
                clean.append(int(raw))
            except (TypeError, ValueError):
                continue

        known = set(FAQ.objects.filter(id__in=clean).values_list("id", flat=True))
        with transaction.atomic():
            for position, faq_id in enumerate(clean):
                if faq_id in known:
                    FAQ.objects.filter(id=faq_id).update(order=position)
        return Response({"updated": len([i for i in clean if i in known])})
