# ─── authapp/url_patterns/wallet_urls.py ─────────────────────────────────────
# User-facing wallet endpoints (authenticated user only)

from django.urls import path
from authapp.views.wallet_views import (
    UserWalletBalancesView,
    UserWalletTransactionListView,
    UserCasinoWalletBalancesView,
)

urlpatterns = [
    path("wallet/balances/",     UserWalletBalancesView.as_view()),
    path("wallet/transactions/", UserWalletTransactionListView.as_view()),
    path("wallet/casino-balances/", UserCasinoWalletBalancesView.as_view()),
]


