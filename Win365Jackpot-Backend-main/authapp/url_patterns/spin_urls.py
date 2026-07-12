# authapp/url_patterns/spin_urls.py
from django.urls import path
from authapp.views.spin_views import (
    SpinStatusView,
    SpinWheelSegmentsView,
    SpinPlayView,
    SpinHistoryListView,
    AdminSpinConfigListCreateView,
    AdminSpinConfigDetailView,
    AdminSpinSettingsView,
)

# Public (authenticated user) — mounted at api/
public_urlpatterns = [
    path("spin/status/", SpinStatusView.as_view()),
    path("spin/wheel/", SpinWheelSegmentsView.as_view()),
    path("spin/play/", SpinPlayView.as_view()),
    path("spin/history/", SpinHistoryListView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/
admin_urlpatterns = [
    path("spin-config/", AdminSpinConfigListCreateView.as_view()),
    path("spin-config/<int:pk>/", AdminSpinConfigDetailView.as_view()),
    path("spin-settings/", AdminSpinSettingsView.as_view()),
]
