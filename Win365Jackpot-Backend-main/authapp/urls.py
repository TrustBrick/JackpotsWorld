# authapp/urls.py
from django.urls import path, include

from authapp.url_patterns import events_urls, poker_urls, promotion_urls, affiliate_urls

urlpatterns = [
    path("", include("authapp.url_patterns.auth_urls")),
    path("", include("authapp.url_patterns.user_urls")),
    path("admin-panel/", include("authapp.url_patterns.admin_urls")),
    path("", include("authapp.url_patterns.wallet_urls")),
    path("", include("authapp.url_patterns.reward_urls")),
    path("", include("authapp.url_patterns.register_urls")),
    path("admin-panel/", include("authapp.url_patterns.gift_level_urls")),

    path("super-admin/", include("authapp.url_patterns.super_admin_urls")),

    # ── Events / Poker / Promotions (public read + admin-managed CRUD) ────────
    path("", include(events_urls.public_urlpatterns)),
    path("", include(poker_urls.public_urlpatterns)),
    path("", include(promotion_urls.public_urlpatterns)),
    path("admin-panel/", include(events_urls.admin_urlpatterns)),
    path("admin-panel/", include(poker_urls.admin_urlpatterns)),
    path("admin-panel/", include(promotion_urls.admin_urlpatterns)),

    # ── Affiliate role (separate login + dashboard) ────────────────────────────
    path("", include(affiliate_urls.public_urlpatterns)),
    path("admin-panel/", include(affiliate_urls.admin_urlpatterns)),
]