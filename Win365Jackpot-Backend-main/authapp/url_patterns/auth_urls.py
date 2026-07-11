# authapp/url_patterns/auth_urls.py
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from authapp.views.auth_views import (
    RegisterView, LoginView, LogoutView,
    AdminLoginView, CheckUserView,
    CountryListView,  # ← add this
)
from authapp.otp.otp_views import (
    SendOTPView, VerifyOTPView,
    ForgotPasswordRequestView, ResetPasswordConfirmView,
)
from authapp.views.auth_views import SuperAdminLoginView

urlpatterns = [
    path("auth/register/",      RegisterView.as_view()),
    path("auth/login/",         LoginView.as_view()),
    path("auth/logout/",        LogoutView.as_view()),
    
    path("auth/send-otp/",      SendOTPView.as_view()),
    path("auth/verify-otp/",    VerifyOTPView.as_view()),
    path("auth/forgot-password/", ForgotPasswordRequestView.as_view()),
    path("auth/reset-password/",  ResetPasswordConfirmView.as_view()),
    path("auth/token/refresh/", TokenRefreshView.as_view()),
    path("auth/check-user/",    CheckUserView.as_view()),
    path("auth/countries/",     CountryListView.as_view()),  # ← add this
    path("auth/admin-login/",        AdminLoginView.as_view()),
    path("auth/super-admin-login/",  SuperAdminLoginView.as_view()),
]