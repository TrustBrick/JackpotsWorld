"""
authapp/views/auth_views.py
─────────────────────────────────────────────────────────────────────────────
Authentication endpoints:
  • CountryListView    — GET  /api/auth/countries/
  • RegisterView       — POST /api/auth/register/
  • LoginView          — POST /api/auth/login/
  • LogoutView         — POST /api/auth/logout/
  • AdminLoginView     — POST /api/auth/admin-login/
  • CheckUserView      — POST /api/auth/check-user/
"""

import re

from django.contrib.auth import authenticate
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from authapp.models import User, AdminProfile, ActivityLog
from authapp.models.affiliate_models import AffiliateProfile
from authapp.models.two_factor_models import TwoFactorAuth
from authapp.serializers import RegisterSerializer, LoginSerializer, UserProfileSerializer
from authapp.throttles import (
    LoginRateThrottle, AdminLoginRateThrottle, RegisterRateThrottle, CheckUserRateThrottle,
)
from authapp.utils.account_lockout import is_locked_out, record_failed_attempt, reset_attempts
from authapp.utils.geolocation import resolve_geo_location
from authapp.utils.turnstile import verify_turnstile
from authapp.utils.ip_allowlist import is_superadmin_ip_allowed
from authapp.utils.two_factor import make_2fa_pending_token, verify_2fa_pending_token, verify_totp_or_backup_code
from authapp.data.countries import COUNTRIES

def _handle_referral_on_signup(new_user, referral_code_used: str):
    if not referral_code_used:
        return

    from authapp.services.notification_service import notify_generic

    try:
        referrer = User.objects.get(referral_code=referral_code_used)
    except User.DoesNotExist:
        return  # invalid code, silently skip

    if referrer.id == new_user.id:
        return  # prevent self-referral

    # Update referrer stats
    referrer.referral_count += 1
    referrer.save(update_fields=["referral_count"])

    # Notify all active staff/admin users
    admins = User.objects.filter(is_staff=True, is_active=True)
    for admin in admins:
        notify_generic(
            user=admin,
            title="New Referral Registration 👥",
            message=(
                f"Referrer: {referrer.name or referrer.email} (UID: {referrer.user_uid})\n"
                f"New User: {new_user.name or new_user.email} (UID: {new_user.user_uid})\n\n"
                f"Please add the referral bonus to the referrer and "
                f"the welcome bonus to the new user manually via the admin panel."
            ),
            icon="users",
        )

    # Notify referrer that someone used their code (no bonus mention)
    notify_generic(
        user=referrer,
        title="Someone joined using your referral! 🎉",
        message=(
            f"{new_user.name or new_user.email} just signed up using your referral code. "
            f"Your bonus will be added by our team shortly."
        ),
        icon="gift",
    )

    # Notify new user (no bonus mention)
    notify_generic(
        user=new_user,
        title="Referral code applied! 🌟",
        message=(
            f"You signed up with a referral code. "
            f"Your welcome bonus will be added by our team shortly."
        ),
        icon="gift",
    )
# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


def get_client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


def get_ua(request):
    return request.META.get("HTTP_USER_AGENT", "")[:512]


def _apply_login_geo(user, ip, extra_update_fields=None):
    """Best-effort: resolve `ip` to a city/region/country and stamp it onto
    `user`, saving only the touched fields. Never raises — if the lookup
    fails, the user's existing location fields are left untouched."""
    geo = resolve_geo_location(ip)
    fields = list(extra_update_fields or [])
    if geo:
        user.last_login_city = geo.get("city", "")
        user.last_login_region = geo.get("region", "")
        user.last_login_country_name = geo.get("country_name", "")
        fields += ["last_login_city", "last_login_region", "last_login_country_name"]
    if fields:
        user.save(update_fields=fields)
    return geo


# ─── Country List ─────────────────────────────────────────────────────────────
#
# Previously this fetched restcountries.com's v3.1 "/all" endpoint at runtime.
# That API has since been deprecated (it now returns a 200 with an error body
# instead of country data), which silently broke every phone/country picker
# on the site down to a single hardcoded India fallback. Using a bundled,
# static dataset instead removes the dependency on a third-party API's
# availability/format entirely for a core part of the registration flow.

class CountryListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(COUNTRIES)


# ─── Register ────────────────────────────────────────────────────────────────

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegisterRateThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user   = serializer.save()
            ip = get_client_ip(request)
            user.last_login_ip = ip
            user.save(update_fields=["last_login_ip"])
            geo = _apply_login_geo(user, ip)
            tokens = get_tokens(user)
            profile = UserProfileSerializer(user, context={"request": request}).data

            # ── Referral handling ──────────────────────────────
            referral_code = request.data.get("referral_code", "").strip().upper()
            if referral_code:
                user.referral_code_used = referral_code
                user.save(update_fields=["referral_code_used"])
                _handle_referral_on_signup(user, referral_code)
            # ──────────────────────────────────────────────────

            ActivityLog.log(
                action="register",
                actor=user,
                target_user=user,
                description=f"New user registered: {user.email} | Country: {user.country}",
                ip_address=ip,
                user_agent=get_ua(request),
                meta={
                    "country":       user.country,
                    "dial_code":     user.dial_code,
                    "referral_used": referral_code or None,
                    **({"geo": geo} if geo else {}),
                },
            )
            return Response({"user": profile, "tokens": tokens}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# ─── Login ───────────────────────────────────────────────────────────────────

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        # Cloudflare Turnstile verification — rejects the request outright
        # if the token is missing or Cloudflare doesn't confirm it, before
        # any credential checking happens.
        cf_token = request.data.get("cf_turnstile_response")
        if not verify_turnstile(cf_token, get_client_ip(request)):
            return Response({"error": "Human verification failed. Please try again."}, status=400)

        email = request.data.get("email", "").strip().lower()
        ip    = get_client_ip(request)
        if email and is_locked_out(email):
            return Response(
                {"error": "Too many failed attempts. Please try again in 15 minutes."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data["user"]

            # Affiliates authenticate exclusively through AffiliateLoginView —
            # never mix Player and Affiliate sessions/dashboards.
            if AffiliateProfile.objects.filter(user=user).exists():
                return Response(
                    {"error": "This account is registered as an Affiliate. Please sign in via the Affiliate Login page.", "is_affiliate": True},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if email:
                reset_attempts(email)

            user.last_login_ip = ip
            user.last_login    = timezone.now()
            user.save(update_fields=["last_login_ip", "last_login"])
            geo = _apply_login_geo(user, ip)

            tokens  = get_tokens(user)
            profile = UserProfileSerializer(user, context={"request": request}).data

            ActivityLog.log(
                action="login",
                actor=user,
                target_user=user,
                description=f"User login from {ip}",
                ip_address=ip,
                user_agent=get_ua(request),
                meta={"country": user.country, **({"geo": geo} if geo else {})},
            )
            return Response({"user": profile, "tokens": tokens})
        if email:
            record_failed_attempt(email)
        ActivityLog.log(
            action="login",
            description=f"Failed login attempt: {email}",
            ip_address=ip,
            user_agent=get_ua(request),
            meta={"email": email, "success": False},
        )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── Logout ──────────────────────────────────────────────────────────────────

class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass
        ActivityLog.log(
            action="logout",
            actor=request.user,
            target_user=request.user,
            description="User logged out",
            ip_address=get_client_ip(request),
            user_agent=get_ua(request),
        )
        return Response({"message": "Logged out successfully"})


# ─── Check User ──────────────────────────────────────────────────────────────

class CheckUserView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [CheckUserRateThrottle]

    def post(self, request):
        identifier = request.data.get("identifier", "").strip()
        if not identifier:
            return Response({"error": "Identifier required"}, status=400)

        # Normalize phone: strip non-digits, add + prefix
        if identifier.startswith("+") or identifier.replace("-","").replace(" ","").isdigit():
            normalized = "+" + re.sub(r"\D", "", identifier)
            exists = User.objects.filter(phone=normalized).exists()
            # select 
        else:
            exists = User.objects.filter(email=identifier).exists()
            # 

        return Response({"exists": exists})


# ─── Admin Login ─────────────────────────────────────────────────────────────

def _finish_super_admin_login(user, ip, request):
    """Shared tail end of Super Admin login — reached directly from
    SuperAdminLoginView when 2FA isn't enabled, or from
    SuperAdminVerify2FAView once the code checks out."""
    profile, _ = AdminProfile.objects.get_or_create(
        user=user,
        defaults={"role": "superadmin"}
    )
    if profile.role != "superadmin":
        profile.role = "superadmin"
        profile.save(update_fields=["role"])

    profile.last_login_ip = ip
    profile.last_login    = timezone.now()
    profile.login_count  += 1
    profile.save(update_fields=["last_login_ip", "last_login", "login_count"])

    user.last_login    = timezone.now()
    user.last_login_ip = ip
    user.save(update_fields=["last_login", "last_login_ip"])
    geo = _apply_login_geo(user, ip)

    ActivityLog.log(
        action="admin_login",
        actor=user,
        description=f"Super Admin login from {ip}",
        ip_address=ip,
        user_agent=get_ua(request),
        meta={"success": True, "role": "superadmin", **({"geo": geo} if geo else {})},
    )

    tokens = get_tokens(user)
    return Response({
        "user": {
            "id":           user.id,
            "user_uid":     user.user_uid,
            "email":        user.email,
            "name":         user.name,
            "is_staff":     user.is_staff,
            "is_superuser": user.is_superuser,
            "role":         profile.role,
            "theme_preference": profile.theme_preference,
        },
        "tokens": tokens,
    })


class SuperAdminLoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AdminLoginRateThrottle]

    def post(self, request):
        email    = request.data.get("email", "").strip().lower()
        password = request.data.get("password", "")
        ip       = get_client_ip(request)

        if not is_superadmin_ip_allowed(ip):
            ActivityLog.log(
                action="admin_login",
                description=f"Blocked super admin login attempt from disallowed IP: {ip}",
                ip_address=ip,
                meta={"email": email, "success": False, "role": "superadmin", "reason": "ip_not_allowed"},
            )
            return Response({"error": "Access denied from this location."}, status=403)

        if not email or not password:
            return Response({"error": "Email and password required"}, status=400)

        if is_locked_out(email):
            return Response(
                {"error": "Too many failed attempts. Please try again in 15 minutes."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        user = User.objects.filter(email__iexact=email).first()

        if not user or not user.check_password(password):
            record_failed_attempt(email)
            ActivityLog.log(
                action="admin_login",
                description=f"Failed super admin login attempt: {email}",
                ip_address=ip,
                meta={"email": email, "success": False, "role": "superadmin"},
            )
            return Response({"error": "Invalid credentials"}, status=400)

        reset_attempts(email)

        # Super Admin = is_superuser=True AND is_staff=False
        # Super Admin = is_superuser=True AND is_staff=True
        if not user.is_superuser or not user.is_staff:
            return Response({"error": "Only Super Admin allowed."}, status=403)

        if not user.is_active:
            return Response({"error": "Account disabled."}, status=403)

        two_factor = TwoFactorAuth.objects.filter(user=user, is_enabled=True).first()
        if two_factor:
            return Response({
                "requires_2fa": True,
                "pending_token": make_2fa_pending_token(user),
            })

        return _finish_super_admin_login(user, ip, request)


class SuperAdminVerify2FAView(APIView):
    """Second step of Super Admin login when 2FA is enabled — accepts
    either a live TOTP code or a one-time backup code."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AdminLoginRateThrottle]

    def post(self, request):
        pending_token = request.data.get("pending_token", "")
        code          = request.data.get("code", "")
        ip            = get_client_ip(request)

        if not is_superadmin_ip_allowed(ip):
            return Response({"error": "Access denied from this location."}, status=403)

        user_id = verify_2fa_pending_token(pending_token)
        if not user_id:
            return Response({"error": "This login attempt has expired. Please log in again."}, status=400)

        user = User.objects.filter(pk=user_id, is_superuser=True, is_staff=True, is_active=True).first()
        if not user:
            return Response({"error": "This login attempt is no longer valid. Please log in again."}, status=400)

        two_factor = TwoFactorAuth.objects.filter(user=user, is_enabled=True).first()
        if not two_factor:
            # 2FA was disabled between step 1 and step 2 — treat as invalid,
            # force a fresh login rather than silently granting access.
            return Response({"error": "This login attempt is no longer valid. Please log in again."}, status=400)

        if not verify_totp_or_backup_code(two_factor, code):
            ActivityLog.log(
                action="admin_login",
                actor=user,
                description=f"Failed 2FA verification: {user.email}",
                ip_address=ip,
                meta={"email": user.email, "success": False, "role": "superadmin", "stage": "2fa"},
            )
            return Response({"error": "Invalid code."}, status=400)

        return _finish_super_admin_login(user, ip, request)


class AdminLoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AdminLoginRateThrottle]

    def post(self, request):
        email    = request.data.get("email", "").strip().lower()
        password = request.data.get("password", "")
        ip       = get_client_ip(request)

        if not email or not password:
            return Response({"error": "Email and password required"}, status=400)

        if is_locked_out(email):
            return Response(
                {"error": "Too many failed attempts. Please try again in 15 minutes."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        user = User.objects.filter(email__iexact=email).first()

        if not user or not user.check_password(password):
            record_failed_attempt(email)
            ActivityLog.log(
                action="admin_login",
                description=f"Failed admin login attempt: {email}",
                ip_address=ip,
                meta={"email": email, "success": False},
            )
            return Response({"error": "Invalid credentials"}, status=400)

        reset_attempts(email)

        # Admin login = is_staff=True (super admins also have is_staff=True, so this allows both)
        if not user.is_staff:
            return Response({"error": "Only admins are allowed to log in here."}, status=403)

        if not user.is_active:
            return Response({"error": "This account has been disabled."}, status=403)

        profile, _ = AdminProfile.objects.get_or_create(user=user)
        profile.last_login_ip = ip
        profile.last_login    = timezone.now()
        profile.login_count  += 1
        profile.save(update_fields=["last_login_ip", "last_login", "login_count"])

        user.last_login    = timezone.now()
        user.last_login_ip = ip
        user.save(update_fields=["last_login", "last_login_ip"])
        geo = _apply_login_geo(user, ip)

        ActivityLog.log(
            action="admin_login",
            actor=user,
            description=f"Admin login from {ip}",
            ip_address=ip,
            user_agent=get_ua(request),
            meta={"success": True, **({"geo": geo} if geo else {})},
        )

        tokens = get_tokens(user)
        return Response({
            "user": {
                "id":           user.id,
                "user_uid":     user.user_uid,
                "email":        user.email,
                "name":         user.name,
                "is_staff":     user.is_staff,
                "is_superuser": user.is_superuser,
                "role":         profile.role,
                "theme_preference": profile.theme_preference,
            },
            "tokens": tokens,
        })