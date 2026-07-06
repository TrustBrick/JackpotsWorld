from django.urls import path
from authapp.views.user_views import (
    ProfileView,
    AvatarUpdateView,
    ChangePasswordView,
    UserWalletView,
    UserActivityLogView,
    UserDashboardView,
    UserNotificationListView,
    MarkNotificationReadView,
    MarkAllNotificationsReadView,
    UserTravelHistoryView,
    UserReferralView,
)
from authapp.views.user_kyc_views import UserKYCSubmitView, UserKYCStatusView

urlpatterns = [
    path("user/dashboard/",       UserDashboardView.as_view()),
    path("user/profile/",         ProfileView.as_view()),
    path("user/avatar/",          AvatarUpdateView.as_view()),
    path("user/change-password/", ChangePasswordView.as_view()),
    path("user/wallet/",          UserWalletView.as_view()),
    path("user/activity/",        UserActivityLogView.as_view()),
    path("kyc/submit/",           UserKYCSubmitView.as_view()),
    path("kyc/status/",           UserKYCStatusView.as_view()),
    path("user/notifications/", UserNotificationListView.as_view()),
    path("user/notifications/<int:pk>/read/", MarkNotificationReadView.as_view()),
    path("user/notifications/read-all/", MarkAllNotificationsReadView.as_view()),
    path("user/travel-history/", UserTravelHistoryView.as_view()),
    path("user/referral/", UserReferralView.as_view()),
]