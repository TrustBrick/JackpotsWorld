from django.urls import path
from authapp.views.gift_level_views import (
    AdminCreateBonusView,
    AdminAddOTPView,
    AdminAddPointsView,
    AdminPointsLogView,
    UserGiftListView,
    UserClaimGiftView,
    UserLevelView,
    AdminUserLevelView,
)

# ───────── ADMIN ROUTES ─────────
admin_urlpatterns = [
    path("wallet/bonus/", AdminCreateBonusView.as_view()),
    path("wallet/otp/", AdminAddOTPView.as_view()),
    path("users/add-points/", AdminAddPointsView.as_view()),
    path("users/<int:user_id>/points-log/", AdminPointsLogView.as_view()),
]

# ───────── USER ROUTES ─────────
user_urlpatterns = [
    path("gifts/", UserGiftListView.as_view()),
    path("gifts/<int:gift_id>/claim/", UserClaimGiftView.as_view()),
    path("level/", UserLevelView.as_view()),
]   

# Add this — Django requires it if the module is ever included directly
urlpatterns = admin_urlpatterns + user_urlpatterns