# authapp/url_patterns/faq_urls.py
#
# FAQ: public read + Back Office CRUD. Mounted from authapp/urls.py (public at
# api/, admin at api/admin-panel/).
from django.urls import path

from authapp.views.faq_views import (
    AdminFAQDetailView,
    AdminFAQListCreateView,
    AdminFAQReorderView,
    FAQListView,
)

# Public — mounted at api/
public_urlpatterns = [
    path("faqs/", FAQListView.as_view()),
]

# Admin-only — mounted at api/admin-panel/ (IsAdminOrSuperAdmin)
admin_urlpatterns = [
    # Declared before the <int:pk> detail route so "reorder" is not captured
    # as an id.
    path("faqs/reorder/", AdminFAQReorderView.as_view()),
    path("faqs/", AdminFAQListCreateView.as_view()),
    path("faqs/<int:pk>/", AdminFAQDetailView.as_view()),
]
