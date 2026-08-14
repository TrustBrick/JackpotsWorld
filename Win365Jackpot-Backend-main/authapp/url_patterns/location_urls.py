# authapp/url_patterns/location_urls.py
from django.urls import path
from authapp.views.location_views import (
    LocationListView,
    AdminLocationListCreateView,
    AdminLocationDetailView,
    AdminCasinoCatalogView,
)

# Public — mounted at api/locations/
public_urlpatterns = [
    path("locations/", LocationListView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/locations/
admin_urlpatterns = [
    path("locations/", AdminLocationListCreateView.as_view()),
    path("locations/<int:pk>/", AdminLocationDetailView.as_view()),
    # Shared country+casino dropdown source for Back Office forms (Teen Patti
    # events, commission rules) — see AdminCasinoCatalogView.
    path("casino-catalog/", AdminCasinoCatalogView.as_view()),
]
