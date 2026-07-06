# authapp/urls.py
from django.urls import path, include

urlpatterns = [
    path("", include("authapp.url_patterns.auth_urls")),
    path("", include("authapp.url_patterns.user_urls")),
    path("admin-panel/", include("authapp.url_patterns.admin_urls")),
    path("", include("authapp.url_patterns.wallet_urls")),
    path("", include("authapp.url_patterns.reward_urls")),
    path("", include("authapp.url_patterns.register_urls")),
    path("admin-panel/", include("authapp.url_patterns.gift_level_urls")),

    path("super-admin/", include("authapp.url_patterns.super_admin_urls")),
]