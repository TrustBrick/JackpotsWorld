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

import requests
import re

from django.contrib.auth import authenticate
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from authapp.models import User, AdminProfile, ActivityLog
from authapp.serializers import RegisterSerializer, LoginSerializer, UserProfileSerializer

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


# ─── Country List ─────────────────────────────────────────────────────────────

# We fetch from restcountries.com and cache in memory for the lifetime of the process.
_COUNTRIES_CACHE = None

class CountryListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        global _COUNTRIES_CACHE
        if _COUNTRIES_CACHE is not None:
            return Response(_COUNTRIES_CACHE)

        try:
            resp = requests.get(
                "https://restcountries.com/v3.1/all"
                "?fields=name,cca2,idd,flag,population",
                timeout=10,
            )
            resp.raise_for_status()
            raw = resp.json()
        except Exception as e:
            return Response(
                {"error": f"Could not fetch country data: {str(e)}"},
                status=502,
            )

        countries = []
        for c in raw:
            idd      = c.get("idd", {})
            root     = idd.get("root", "")
            suffixes = idd.get("suffixes", [])

            if not root:
                continue  # skip countries with no dial code

            if len(suffixes) == 1:
                dial_code = root + suffixes[0]
            else:
                dial_code = root  # e.g. "+1" for US

            # Skip if dial_code is just "+" or empty
            if not dial_code or dial_code == "+":
                continue

            countries.append({
                "name":      c["name"]["common"],
                "code":      c.get("cca2", ""),
                "dial_code": dial_code,
                "flag":      c.get("flag", ""),
            })

        # Sort alphabetically — this gives all ~250 countries
        countries.sort(key=lambda x: x["name"])
        _COUNTRIES_CACHE = countries
        return Response(countries)


# ─── Register ────────────────────────────────────────────────────────────────

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user   = serializer.save()
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
                ip_address=get_client_ip(request),
                user_agent=get_ua(request),
                meta={
                    "country":       user.country,
                    "dial_code":     user.dial_code,
                    "referral_used": referral_code or None,
                },
            )
            return Response({"user": profile, "tokens": tokens}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# ─── Login ───────────────────────────────────────────────────────────────────

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # Cloudflare Turnstile verification (enable when ready):
        # cf_token = request.data.get("cf_turnstile_token")
        # if not verify_turnstile(cf_token):
        #     return Response({"error": "Verification failed. Please try again."}, status=400)

        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data["user"]
            ip   = get_client_ip(request)

            user.last_login_ip = ip
            user.last_login    = timezone.now()
            user.save(update_fields=["last_login_ip", "last_login"])

            tokens  = get_tokens(user)
            profile = UserProfileSerializer(user, context={"request": request}).data

            ActivityLog.log(
                action="login",
                actor=user,
                target_user=user,
                description=f"User login from {ip}",
                ip_address=ip,
                user_agent=get_ua(request),
                meta={"country": user.country},
            )
            return Response({"user": profile, "tokens": tokens})
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

class SuperAdminLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email    = request.data.get("email", "").strip().lower()
        password = request.data.get("password", "")
        ip       = get_client_ip(request)

        if not email or not password:
            return Response({"error": "Email and password required"}, status=400)

        user = User.objects.filter(email__iexact=email).first()

        if not user or not user.check_password(password):
            return Response({"error": "Invalid credentials"}, status=400)

        # Super Admin = is_superuser=True AND is_staff=False
        # Super Admin = is_superuser=True AND is_staff=True
        if not user.is_superuser or not user.is_staff:
            return Response({"error": "Only Super Admin allowed."}, status=403)

        if not user.is_active:
            return Response({"error": "Account disabled."}, status=403)

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

        ActivityLog.log(
            action="admin_login",
            actor=user,
            description=f"Super Admin login from {ip}",
            ip_address=ip,
            user_agent=get_ua(request),
            meta={"success": True, "role": "superadmin"},
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
            },
            "tokens": tokens,
        })


class AdminLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email    = request.data.get("email", "").strip().lower()
        password = request.data.get("password", "")
        ip       = get_client_ip(request)

        if not email or not password:
            return Response({"error": "Email and password required"}, status=400)

        user = User.objects.filter(email__iexact=email).first()

        if not user or not user.check_password(password):
            ActivityLog.log(
                action="admin_login",
                description=f"Failed admin login attempt: {email}",
                ip_address=ip,
                meta={"email": email, "success": False},
            )
            return Response({"error": "Invalid credentials"}, status=400)

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

        ActivityLog.log(
            action="admin_login",
            actor=user,
            description=f"Admin login from {ip}",
            ip_address=ip,
            user_agent=get_ua(request),
            meta={"success": True},
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
            },
            "tokens": tokens,
        })