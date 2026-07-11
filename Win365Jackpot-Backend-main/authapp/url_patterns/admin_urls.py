# authapp/url_patterns/admin_urls.py
# ─── ADD this one new path to your existing admin_urls.py ────────────────────

from django.urls import path

from ..views.admin_views import (
    AdminStatsView,
    AdminUserListView,
    AdminUserDetailView,
    AdminAddWalletView,
    AdminAddBonusView,
    AdminSetVIPView,
    AdminCreateRewardView,
    AdminSendNotificationView,
    AdminTransactionListView,
    AdminApproveTransactionView,
    AdminActivityLogView,
    AdminStaffListView,
    AdminStaffDetailView,
    AdminStaffConfirmView,
    AdminStaffRequestDeleteView,
    AdminStaffDeleteView,
    AdminCasinoVisitView,
    AdminCasinoVisitDeleteView,
    AdminThemePreferenceView,
)

from ..views.admin_wallet_views import (
    AdminWalletUpdateView,
    AdminWalletTransactionListView,
    AdminWalletValidationListView,
    AdminBonusConfigView,
    AdminUserWalletAccountsView,
    AdminWalletBalanceView,    
)

from ..views.admin_kyc_views import (
    AdminKYCListView,
    AdminKYCUpdateView
)

from authapp.views.admin_offline_deposit_views import (
    AdminCasinoListView,
    AdminOfflineDepositsView,
    AdminDepositHistoryView,
    AdminCheckSlipView,
)

from authapp.views.casino_wallet_views import CasinoWalletBalanceView
from authapp.views.gift_level_views import AdminUserLevelView

from authapp.views.wallet_views import (
    AdminUserWalletAccountsView,        # already imported elsewhere, check
    AdminUserCasinoWalletBalancesView,  # ← ADD
    AdminUserTransactionListView,       # ← ADD
    AdminUserTravelHistoryView,
)

urlpatterns = [

    # ── Dashboard ─────────────────────────────────────
    path("stats/", AdminStatsView.as_view()),

    # ── Admin self ────────────────────────────────────
    path("me/theme/", AdminThemePreferenceView.as_view()),

    # ── Users ─────────────────────────────────────────
    path("users/", AdminUserListView.as_view()),
    path("users/<int:pk>/", AdminUserDetailView.as_view()),
    path("users/<int:pk>/add-wallet/", AdminAddWalletView.as_view()),
    path("users/<int:pk>/add-bonus/", AdminAddBonusView.as_view()),
    path("users/<int:pk>/set-vip/", AdminSetVIPView.as_view()),

    # ── Rewards ───────────────────────────────────────
    path("rewards/create/", AdminCreateRewardView.as_view()),

    # ── Notifications ─────────────────────────────────
    path("notifications/send/", AdminSendNotificationView.as_view()),

    # ── Transactions ──────────────────────────────────
    path("transactions/", AdminTransactionListView.as_view()),
    path("transactions/<int:pk>/approve/", AdminApproveTransactionView.as_view()),

    # ── KYC ───────────────────────────────────────────
    path("kyc/", AdminKYCListView.as_view()),
    path("kyc/<int:pk>/update/", AdminKYCUpdateView.as_view()),

    # ── Activity Logs ─────────────────────────────────
    path("logs/", AdminActivityLogView.as_view()),
    path("activity-logs/", AdminActivityLogView.as_view()),

    # ── Staff ─────────────────────────────────────────
    path("staff/", AdminStaffListView.as_view()),
    path("staff/confirm/", AdminStaffConfirmView.as_view()),
    path("staff/<int:pk>/", AdminStaffDetailView.as_view()),
    path("staff/<int:pk>/request-delete/", AdminStaffRequestDeleteView.as_view()),
    path("staff/<int:pk>/delete/", AdminStaffDeleteView.as_view()),

    # ── Deposits ──────────────────────────────────────
    path("deposits/offline/", AdminOfflineDepositsView.as_view()),
    path("deposits/history/", AdminDepositHistoryView.as_view()),
    path("deposits/casinos/", AdminCasinoListView.as_view()),
    path("deposits/check-slip/", AdminCheckSlipView.as_view()),

    # ── Casino Visits ─────────────────────────────────
    path("casino-visits/", AdminCasinoVisitView.as_view()),
    path("casino-visits/<int:pk>/delete/", AdminCasinoVisitDeleteView.as_view()),

    # ── Wallet ────────────────────────────────────────
    path("wallet/update/", AdminWalletUpdateView.as_view()),
    path("wallet/transactions/", AdminWalletTransactionListView.as_view()),
    path("wallet/validations/", AdminWalletValidationListView.as_view()),
    path("wallet/admin-balance/", AdminWalletBalanceView.as_view()),   # ← NEW
    path("bonus-config/", AdminBonusConfigView.as_view()),
    path("wallet/accounts/user/<int:user_id>/", AdminUserWalletAccountsView.as_view()),
    path("wallet/casino-wallets/", CasinoWalletBalanceView.as_view()),

    path("users/<int:user_id>/level/", AdminUserLevelView.as_view()),
    
    # ── Per-user admin views ───────────────────────────────
    path("wallet/casino-balances/user/<int:user_id>/", AdminUserCasinoWalletBalancesView.as_view()),
    path("wallet/transactions/user/<int:user_id>/",    AdminUserTransactionListView.as_view()),

# ── Travel history for a user (used by UsersTab detail panel) ──
    path("users/<int:user_id>/travel-history/",        AdminUserTravelHistoryView.as_view()),
]