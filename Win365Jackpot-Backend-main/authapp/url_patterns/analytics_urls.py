# authapp/url_patterns/analytics_urls.py
#
# ANALYTICS: public ingest + trackable redirect, and the admin dashboard reads.
# Mounted from authapp/urls.py (public at api/, admin at api/admin-panel/).
# Safe to delete this file + its import/include block in urls.py to remove the
# feature's routes.
from django.urls import path

from authapp.views.analytics_views import (
    AnalyticsEventIngestView,
    CampaignClickRedirectView,
    AdminAnalyticsOverviewView,
    AdminAnalyticsUrlsView,
    AdminAnalyticsVideosView,
    AdminAnalyticsVideoDetailView,
    AdminAnalyticsLocationsView,
    AdminAnalyticsCampaignsView,
    AdminAnalyticsMemberView,
    AdminCampaignListCreateView,
    AdminCampaignDetailView,
)

# Public (any visitor) — mounted at api/
public_urlpatterns = [
    path("analytics/event/", AnalyticsEventIngestView.as_view()),
    path("analytics/click/<str:tracking_id>/", CampaignClickRedirectView.as_view()),
]

# Admin-only — mounted at api/admin-panel/ (all IsAdminOrSuperAdmin)
admin_urlpatterns = [
    path("analytics/overview/", AdminAnalyticsOverviewView.as_view()),
    path("analytics/urls/", AdminAnalyticsUrlsView.as_view()),
    path("analytics/videos/", AdminAnalyticsVideosView.as_view()),
    path("analytics/videos/<str:content_id>/", AdminAnalyticsVideoDetailView.as_view()),
    path("analytics/locations/", AdminAnalyticsLocationsView.as_view()),
    path("analytics/campaigns/", AdminAnalyticsCampaignsView.as_view()),
    path("analytics/members/<int:user_id>/", AdminAnalyticsMemberView.as_view()),
    # Campaign management (create/list/edit/delete) — kept on a distinct path
    # from the read-only campaigns/ report above.
    path("analytics/campaign-manage/", AdminCampaignListCreateView.as_view()),
    path("analytics/campaign-manage/<int:pk>/", AdminCampaignDetailView.as_view()),
]
