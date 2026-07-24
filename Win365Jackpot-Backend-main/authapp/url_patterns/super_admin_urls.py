# authapp/url_patterns/super_admin_urls.py
from django.urls import path
from authapp.views.super_admin_views import (
    AdminWalletBalanceView,
    AdminWalletCreditView,
    AdminWalletDebitView,
    AdminTransferToUserView,
    SuperAdminTransactionListView,
    SuperAdminStatsView,
    SuperAdminCreateAdminView,
    SuperAdminListAdminsView,
    SuperAdminDeleteAdminView,
    SuperAdminReactivateAdminView,
)
from authapp.views.two_factor_views import (
    TwoFactorStatusView,
    TwoFactorSetupView,
    TwoFactorConfirmView,
    TwoFactorDisableView,
    TwoFactorRegenerateBackupCodesView,
)

urlpatterns = [
    # ── Wallet ────────────────────────────────────────────────
    path("wallet/balance/",  AdminWalletBalanceView.as_view()),
    path("wallet/credit/",   AdminWalletCreditView.as_view()),
    path("wallet/debit/",    AdminWalletDebitView.as_view()),
    path("wallet/transfer/", AdminTransferToUserView.as_view()),
    path("wallet/history/",  SuperAdminTransactionListView.as_view()),

    # ── Dashboard ─────────────────────────────────────────────
    path("stats/",           SuperAdminStatsView.as_view()),

    # ── Admin management ──────────────────────────────────────
    path("admins/",                          SuperAdminListAdminsView.as_view()),
    path("admins/create/",                   SuperAdminCreateAdminView.as_view()),
    path("admins/<int:pk>/",                 SuperAdminDeleteAdminView.as_view()),
    path("admins/<int:pk>/reactivate/",      SuperAdminReactivateAdminView.as_view()),

    # ── Two-Factor Authentication ─────────────────────────────
    path("2fa/status/",                      TwoFactorStatusView.as_view()),
    path("2fa/setup/",                       TwoFactorSetupView.as_view()),
    path("2fa/confirm/",                     TwoFactorConfirmView.as_view()),
    path("2fa/disable/",                     TwoFactorDisableView.as_view()),
    path("2fa/regenerate-backup-codes/",     TwoFactorRegenerateBackupCodesView.as_view()),
]