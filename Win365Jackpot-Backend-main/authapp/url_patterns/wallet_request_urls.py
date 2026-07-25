# authapp/url_patterns/wallet_request_urls.py
# WALLET-REQUESTS: new module — safe to delete this file (and its two-line
# include in authapp/urls.py) to remove the feature.
from django.urls import path
from authapp.views.wallet_request_views import (
    WalletRequestSummaryView,
    DepositMethodListView,
    DepositCasinoListView,
    DepositRequestCreateView,
    DepositRequestListView,
    DepositRequestCancelView,
    WithdrawalCasinoBalanceView,
    WithdrawalRequestCreateView,
    WithdrawalRequestListView,
    WithdrawalRequestCancelView,
    AdminDepositRequestSummaryView,
    AdminDepositRequestListView,
    AdminDepositRequestDetailView,
    AdminDepositRequestApproveView,
    AdminDepositRequestProcessingView,
    AdminDepositRequestRejectView,
    AdminDepositRequestCancelView,
    AdminDepositRequestExportView,
    AdminWithdrawalRequestSummaryView,
    AdminWithdrawalRequestListView,
    AdminWithdrawalRequestDetailView,
    AdminWithdrawalRequestApproveView,
    AdminWithdrawalRequestProcessingView,
    AdminWithdrawalRequestRejectView,
    AdminWithdrawalRequestPaidView,
    AdminWithdrawalRequestCancelView,
    AdminWithdrawalRequestExportView,
)

# Public/user — mounted at api/
public_urlpatterns = [
    path("wallet/requests/summary/", WalletRequestSummaryView.as_view()),
    path("wallet/deposit-requests/methods/", DepositMethodListView.as_view()),
    path("wallet/deposit-requests/casinos/", DepositCasinoListView.as_view()),
    path("wallet/deposit-requests/create/", DepositRequestCreateView.as_view()),
    path("wallet/deposit-requests/", DepositRequestListView.as_view()),
    path("wallet/deposit-requests/<int:pk>/cancel/", DepositRequestCancelView.as_view()),
    path("wallet/withdrawal-requests/casino-balance/", WithdrawalCasinoBalanceView.as_view()),
    path("wallet/withdrawal-requests/create/", WithdrawalRequestCreateView.as_view()),
    path("wallet/withdrawal-requests/", WithdrawalRequestListView.as_view()),
    path("wallet/withdrawal-requests/<int:pk>/cancel/", WithdrawalRequestCancelView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/
admin_urlpatterns = [
    path("deposit-requests/summary/", AdminDepositRequestSummaryView.as_view()),
    path("deposit-requests/export/", AdminDepositRequestExportView.as_view()),
    path("deposit-requests/", AdminDepositRequestListView.as_view()),
    path("deposit-requests/<int:pk>/", AdminDepositRequestDetailView.as_view()),
    path("deposit-requests/<int:pk>/approve/", AdminDepositRequestApproveView.as_view()),
    path("deposit-requests/<int:pk>/processing/", AdminDepositRequestProcessingView.as_view()),
    path("deposit-requests/<int:pk>/reject/", AdminDepositRequestRejectView.as_view()),
    path("deposit-requests/<int:pk>/cancel/", AdminDepositRequestCancelView.as_view()),
    path("withdrawal-requests/summary/", AdminWithdrawalRequestSummaryView.as_view()),
    path("withdrawal-requests/export/", AdminWithdrawalRequestExportView.as_view()),
    path("withdrawal-requests/", AdminWithdrawalRequestListView.as_view()),
    path("withdrawal-requests/<int:pk>/", AdminWithdrawalRequestDetailView.as_view()),
    path("withdrawal-requests/<int:pk>/approve/", AdminWithdrawalRequestApproveView.as_view()),
    path("withdrawal-requests/<int:pk>/processing/", AdminWithdrawalRequestProcessingView.as_view()),
    path("withdrawal-requests/<int:pk>/reject/", AdminWithdrawalRequestRejectView.as_view()),
    path("withdrawal-requests/<int:pk>/paid/", AdminWithdrawalRequestPaidView.as_view()),
    path("withdrawal-requests/<int:pk>/cancel/", AdminWithdrawalRequestCancelView.as_view()),
]
