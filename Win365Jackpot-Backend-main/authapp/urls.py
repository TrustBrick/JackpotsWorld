# authapp/urls.py
from django.urls import path, include

from authapp.url_patterns import events_urls, poker_urls, promotion_urls, location_urls, affiliate_urls, support_urls, spin_urls, chat_urls, landing_urls

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
    path("", include(location_urls.public_urlpatterns)),
    path("", include(landing_urls.public_urlpatterns)),
    path("admin-panel/", include(events_urls.admin_urlpatterns)),
    path("admin-panel/", include(poker_urls.admin_urlpatterns)),
    path("admin-panel/", include(promotion_urls.admin_urlpatterns)),
    path("admin-panel/", include(location_urls.admin_urlpatterns)),
    path("admin-panel/", include(landing_urls.admin_urlpatterns)),

    # ── Affiliate role (separate login + dashboard) ────────────────────────────
    path("", include(affiliate_urls.public_urlpatterns)),
    path("admin-panel/", include(affiliate_urls.admin_urlpatterns)),

    # ── Live Support / Responsible Gambling ─────────────────────────────────────
    path("", include(support_urls.public_urlpatterns)),
    path("admin-panel/", include(support_urls.admin_urlpatterns)),

    # ── Daily Login Spin Wheel ───────────────────────────────────────────────────
    path("", include(spin_urls.public_urlpatterns)),
    path("admin-panel/", include(spin_urls.admin_urlpatterns)),

    # ── AI Live Chat (rule-based today, provider-swappable later) ──────────────
    path("", include(chat_urls.public_urlpatterns)),
]