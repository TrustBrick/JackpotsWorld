# authapp/url_patterns/promotion_urls.py
from django.urls import path
from authapp.views.promotion_views import (
    PromotionListView,
    PromotionDetailView,
    AdminPromotionListCreateView,
    AdminPromotionDetailView,
    AdminPromotionGalleryImageDeleteView,
)

# Public — mounted at api/promotions/
public_urlpatterns = [
    path("promotions/", PromotionListView.as_view()),
    path("promotions/<int:pk>/", PromotionDetailView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/promotions/
admin_urlpatterns = [
    path("promotions/", AdminPromotionListCreateView.as_view()),
    path("promotions/<int:pk>/", AdminPromotionDetailView.as_view()),
    path("promotions/<int:pk>/gallery/<int:image_id>/", AdminPromotionGalleryImageDeleteView.as_view()),
]
