# authapp/url_patterns/affiliate_urls.py
from django.urls import path
from authapp.views.affiliate_views import (
    AffiliateLoginView,
    AffiliateApplyView,
    AffiliateDashboardView,
    AffiliateReferralsListView,
    AffiliateTrackClickView,
    AffiliateCommissionsListView,
    AffiliateClickLogListView,
    AffiliateLoginHistoryListView,
    AdminGrantAffiliateView,
    AdminAffiliateListView,
    AdminPendingCommissionsListView,
    AdminMarkCommissionPaidView,
)

# Public/affiliate — mounted at api/affiliate/
public_urlpatterns = [
    path("affiliate/login/", AffiliateLoginView.as_view()),
    path("affiliate/apply/", AffiliateApplyView.as_view()),
    path("affiliate/track-click/", AffiliateTrackClickView.as_view()),
    path("affiliate/dashboard/", AffiliateDashboardView.as_view()),
    path("affiliate/referrals/", AffiliateReferralsListView.as_view()),
    path("affiliate/commissions/", AffiliateCommissionsListView.as_view()),
    path("affiliate/clicks/", AffiliateClickLogListView.as_view()),
    path("affiliate/login-history/", AffiliateLoginHistoryListView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/affiliates/
admin_urlpatterns = [
    path("affiliates/", AdminAffiliateListView.as_view()),
    path("affiliates/grant/", AdminGrantAffiliateView.as_view()),
    path("affiliates/commissions/pending/", AdminPendingCommissionsListView.as_view()),
    path("affiliates/commissions/<int:pk>/mark-paid/", AdminMarkCommissionPaidView.as_view()),
]
