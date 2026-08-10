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
    AffiliateCampaignListCreateView,
    AffiliateCampaignDetailView,
    AffiliateCampaignVisitorsListView,
    AffiliateCampaignQRCodeView,
    AffiliateCommissionPlanView,
    AffiliateCommissionPlanAgreeView,
    AffiliateCommissionSlipListView,
    AffiliateCommissionSummaryView,
    AdminGrantAffiliateView,
    AdminAffiliateListView,
    AdminPendingCommissionsListView,
    AdminMarkCommissionPaidView,
    AdminCommissionPlanListCreateView,
    AdminCommissionPlanDetailView,
    AdminAffiliateCommissionAssignmentView,
    AdminAffiliateCommissionsReportView,
    AdminAffiliateCommissionDetailView,
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
    path("affiliate/campaigns/", AffiliateCampaignListCreateView.as_view()),
    path("affiliate/campaigns/<int:pk>/", AffiliateCampaignDetailView.as_view()),
    path("affiliate/campaigns/<int:pk>/visitors/", AffiliateCampaignVisitorsListView.as_view()),
    path("affiliate/campaigns/<int:pk>/qr/", AffiliateCampaignQRCodeView.as_view()),
    # Commission Engine (Deposit / Losing / Rolling) — affiliate-facing
    path("affiliate/commission-plan/", AffiliateCommissionPlanView.as_view()),
    path("affiliate/commission-plan/agree/", AffiliateCommissionPlanAgreeView.as_view()),
    path("affiliate/commission-slip/", AffiliateCommissionSlipListView.as_view()),
    path("affiliate/commission-summary/", AffiliateCommissionSummaryView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/affiliates/
admin_urlpatterns = [
    path("affiliates/", AdminAffiliateListView.as_view()),
    path("affiliates/grant/", AdminGrantAffiliateView.as_view()),
    path("affiliates/commissions/pending/", AdminPendingCommissionsListView.as_view()),
    path("affiliates/commissions/<int:pk>/mark-paid/", AdminMarkCommissionPaidView.as_view()),
    # Commission Engine (Deposit / Losing / Rolling) — Back Office
    path("affiliate-commissions/plans/", AdminCommissionPlanListCreateView.as_view()),
    path("affiliate-commissions/plans/<int:pk>/", AdminCommissionPlanDetailView.as_view()),
    path("affiliates/<int:user_id>/commission-assignment/", AdminAffiliateCommissionAssignmentView.as_view()),
    path("affiliate-commissions/", AdminAffiliateCommissionsReportView.as_view()),
    path("affiliate-commissions/<int:pk>/", AdminAffiliateCommissionDetailView.as_view()),
]
