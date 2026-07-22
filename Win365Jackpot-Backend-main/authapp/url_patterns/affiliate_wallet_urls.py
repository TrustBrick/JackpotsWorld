# authapp/url_patterns/affiliate_wallet_urls.py
# AFFILIATE-WITHDRAWALS: new module — safe to delete this file (and its
# two-line include in authapp/urls.py) to remove the feature. Kept in its
# own file, separate from affiliate_urls.py, so removal never touches the
# existing affiliate URLs.
from django.urls import path
from authapp.views.affiliate_wallet_views import (
    AffiliateWalletSummaryView,
    AffiliateWithdrawalMethodListView,
    AffiliateWithdrawalCreateView,
    AffiliateWithdrawalListView,
    AffiliateWithdrawalCancelView,
    AdminWithdrawalSummaryView,
    AdminWithdrawalListView,
    AdminWithdrawalDetailView,
    AdminWithdrawalApproveView,
    AdminWithdrawalProcessingView,
    AdminWithdrawalRejectView,
    AdminWithdrawalMarkPaidView,
    AdminWithdrawalCancelView,
)

# Public/affiliate — mounted at api/affiliate/
public_urlpatterns = [
    path("affiliate/wallet/", AffiliateWalletSummaryView.as_view()),
    path("affiliate/wallet/methods/", AffiliateWithdrawalMethodListView.as_view()),
    path("affiliate/wallet/withdrawals/", AffiliateWithdrawalListView.as_view(), name="affiliate-withdrawal-list"),
    path("affiliate/wallet/withdrawals/create/", AffiliateWithdrawalCreateView.as_view()),
    path("affiliate/wallet/withdrawals/<int:pk>/cancel/", AffiliateWithdrawalCancelView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/
admin_urlpatterns = [
    path("affiliate-withdrawals/summary/", AdminWithdrawalSummaryView.as_view()),
    path("affiliate-withdrawals/", AdminWithdrawalListView.as_view()),
    path("affiliate-withdrawals/<int:pk>/", AdminWithdrawalDetailView.as_view()),
    path("affiliate-withdrawals/<int:pk>/approve/", AdminWithdrawalApproveView.as_view()),
    path("affiliate-withdrawals/<int:pk>/processing/", AdminWithdrawalProcessingView.as_view()),
    path("affiliate-withdrawals/<int:pk>/reject/", AdminWithdrawalRejectView.as_view()),
    path("affiliate-withdrawals/<int:pk>/mark-paid/", AdminWithdrawalMarkPaidView.as_view()),
    path("affiliate-withdrawals/<int:pk>/cancel/", AdminWithdrawalCancelView.as_view()),
]
