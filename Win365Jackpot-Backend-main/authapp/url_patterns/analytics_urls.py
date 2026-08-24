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
    AdminAnalyticsVisitorsOverviewView,
    AdminAnalyticsVisitorsView,
    AdminAnalyticsVisitorDetailView,
    AdminAnalyticsVisitorLocationsView,
    AdminAnalyticsClicksView,
    AdminAnalyticsVideoViewersView,
    AdminAnalyticsDiagnosticView,
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
    # VISITOR-ANALYTICS: the more specific /viewers/ route MUST come before
    # the <content_id> catch-all — Django resolves in order, and a content_id
    # pattern of <str:...> would otherwise swallow "…/viewers/" first.
    path("analytics/videos/<str:content_id>/viewers/", AdminAnalyticsVideoViewersView.as_view()),
    path("analytics/videos/<str:content_id>/", AdminAnalyticsVideoDetailView.as_view()),
    path("analytics/locations/", AdminAnalyticsLocationsView.as_view()),

    # VISITOR-ANALYTICS. Note the ordering constraint again: "visitors/overview/"
    # is declared before "visitors/<visitor_id>/", or the literal would be
    # captured as a visitor id and always 404.
    path("analytics/visitors/overview/", AdminAnalyticsVisitorsOverviewView.as_view()),
    path("analytics/visitors/", AdminAnalyticsVisitorsView.as_view()),
    path("analytics/visitors/<str:visitor_id>/", AdminAnalyticsVisitorDetailView.as_view()),
    path("analytics/visitor-locations/", AdminAnalyticsVisitorLocationsView.as_view()),
    path("analytics/clicks/", AdminAnalyticsClicksView.as_view()),
    # Admin-only wiring test — see AdminAnalyticsDiagnosticView.
    path("analytics/diagnostic/", AdminAnalyticsDiagnosticView.as_view()),
    path("analytics/campaigns/", AdminAnalyticsCampaignsView.as_view()),
    path("analytics/members/<int:user_id>/", AdminAnalyticsMemberView.as_view()),
    # Campaign management (create/list/edit/delete) — kept on a distinct path
    # from the read-only campaigns/ report above.
    path("analytics/campaign-manage/", AdminCampaignListCreateView.as_view()),
    path("analytics/campaign-manage/<int:pk>/", AdminCampaignDetailView.as_view()),
]
