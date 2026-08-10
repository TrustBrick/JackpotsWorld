# authapp/url_patterns/wheel_urls.py
# Signup Wheel + Bonus Wheel — see authapp/views/signup_wheel_views.py and
# authapp/views/bonus_wheel_views.py.
from django.urls import path

from authapp.views.signup_wheel_views import (
    SignupWheelStatusView, SignupWheelSegmentsView, SignupWheelPlayView, CombinedWheelHistoryView,
    AdminSignupWheelSettingsView, AdminSignupWheelRewardListCreateView, AdminSignupWheelRewardDetailView,
    AdminSignupWheelHistoryListView,
)
from authapp.views.bonus_wheel_views import (
    BonusWheelAvailableView, BonusWheelSegmentsView, BonusWheelPlayView,
    AdminBonusWheelListCreateView, AdminBonusWheelDetailView,
    AdminBonusWheelRewardListCreateView, AdminBonusWheelRewardDetailView,
    AdminBonusWheelAssignPreviewView, AdminBonusWheelAssignView, AdminBonusWheelAssignmentsListView,
    AdminBonusWheelGrantsListView, AdminBonusWheelHistoryListView,
)

# Public/user — mounted at api/wheel/
public_urlpatterns = [
    path("wheel/signup/status/", SignupWheelStatusView.as_view()),
    path("wheel/signup/segments/", SignupWheelSegmentsView.as_view()),
    path("wheel/signup/play/", SignupWheelPlayView.as_view()),
    path("wheel/bonus/available/", BonusWheelAvailableView.as_view()),
    path("wheel/bonus/<int:grant_id>/segments/", BonusWheelSegmentsView.as_view()),
    path("wheel/bonus/<int:grant_id>/play/", BonusWheelPlayView.as_view()),
    path("wheel/history/", CombinedWheelHistoryView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/wheel/
admin_urlpatterns = [
    path("wheel/signup/settings/", AdminSignupWheelSettingsView.as_view()),
    path("wheel/signup/rewards/", AdminSignupWheelRewardListCreateView.as_view()),
    path("wheel/signup/rewards/<int:pk>/", AdminSignupWheelRewardDetailView.as_view()),
    path("wheel/signup/history/", AdminSignupWheelHistoryListView.as_view()),

    path("wheel/bonus/", AdminBonusWheelListCreateView.as_view()),
    path("wheel/bonus/<int:pk>/", AdminBonusWheelDetailView.as_view()),
    path("wheel/bonus/<int:wheel_id>/rewards/", AdminBonusWheelRewardListCreateView.as_view()),
    path("wheel/bonus/<int:wheel_id>/rewards/<int:pk>/", AdminBonusWheelRewardDetailView.as_view()),
    path("wheel/bonus/<int:wheel_id>/assign/preview/", AdminBonusWheelAssignPreviewView.as_view()),
    path("wheel/bonus/<int:wheel_id>/assign/", AdminBonusWheelAssignView.as_view()),
    path("wheel/bonus/<int:wheel_id>/assignments/", AdminBonusWheelAssignmentsListView.as_view()),
    path("wheel/bonus/grants/", AdminBonusWheelGrantsListView.as_view()),
    path("wheel/bonus/history/", AdminBonusWheelHistoryListView.as_view()),
]
