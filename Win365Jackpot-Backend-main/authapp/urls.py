# authapp/urls.py
from django.urls import path, include

from authapp.url_patterns import events_urls, poker_urls, promotion_urls, location_urls, affiliate_urls, affiliate_wallet_urls, wallet_request_urls, admin_gift_urls, support_urls, spin_urls, chat_urls, landing_urls, wheel_urls, live_chat_urls, teenpatti_urls, commission_rule_urls, voice_call_urls

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

    # ── Teen Patti (public discovery + registration, admin-managed CRUD) ──────
    path("", include(teenpatti_urls.public_urlpatterns)),
    path("admin-panel/", include(teenpatti_urls.admin_urlpatterns)),

    # ── Affiliate role (separate login + dashboard) ────────────────────────────
    path("", include(affiliate_urls.public_urlpatterns)),
    path("admin-panel/", include(affiliate_urls.admin_urlpatterns)),

    # ── Country+Casino+Tier commission rules (layered on top of the existing
    #    CommissionPlan engine — see commission_rule_models' docstring) ───────
    path("", include(commission_rule_urls.public_urlpatterns)),
    path("admin-panel/", include(commission_rule_urls.admin_urlpatterns)),

    # ── Affiliate Wallet & Withdrawals (AFFILIATE-WITHDRAWALS — safe to
    #    delete this block + affiliate_wallet_urls.py to remove the feature) ──
    path("", include(affiliate_wallet_urls.public_urlpatterns)),
    path("admin-panel/", include(affiliate_wallet_urls.admin_urlpatterns)),

    # ── Main Wallet Deposit/Withdrawal Requests (WALLET-REQUESTS — safe to
    #    delete this block + wallet_request_urls.py to remove the feature) ──
    path("", include(wallet_request_urls.public_urlpatterns)),
    path("admin-panel/", include(wallet_request_urls.admin_urlpatterns)),

    # ── Gifts & Rewards admin management (GIFTS-REWARDS — safe to delete
    #    this block + admin_gift_urls.py to remove the feature) ──────────────
    path("admin-panel/", include(admin_gift_urls.admin_urlpatterns)),

    # ── Live Support / Responsible Gambling ─────────────────────────────────────
    path("", include(support_urls.public_urlpatterns)),
    path("admin-panel/", include(support_urls.admin_urlpatterns)),

    # ── Daily Login Spin Wheel — RETIRED (see spin_views.py: the 3 live
    #    endpoints now return 410 Gone). Admin CRUD endpoints are left
    #    working for reference; SpinHistory is frozen, permanent historical
    #    data. Replaced by the two wheels below. ──────────────────────────────
    path("", include(spin_urls.public_urlpatterns)),
    path("admin-panel/", include(spin_urls.admin_urlpatterns)),

    # ── Signup Wheel + Bonus Wheel ───────────────────────────────────────────────
    path("", include(wheel_urls.public_urlpatterns)),
    path("admin-panel/", include(wheel_urls.admin_urlpatterns)),

    # ── AI Live Chat (rule-based today, provider-swappable later) ──────────────
    path("", include(chat_urls.public_urlpatterns)),

    # ── Live Support Chat (real-time, human-agent — see authapp/consumers/) ────
    path("", include(live_chat_urls.public_urlpatterns)),
    path("admin-panel/", include(live_chat_urls.admin_urlpatterns)),

    # ── VOICE-CALL: in-app WebRTC support calling, layered on the live-chat
    #    session above (safe to delete this block + voice_call_urls.py to
    #    remove the feature; chat is unaffected either way) ──────────────────
    path("", include(voice_call_urls.public_urlpatterns)),
    path("admin-panel/", include(voice_call_urls.admin_urlpatterns)),
]