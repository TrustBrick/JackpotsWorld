"""
authapp/views/admin_profile_views.py
─────────────────────────────────────────────────────────────────────────────
ADMIN-PROFILE: the signed-in admin's own account — the Back Office "Profile"
tab.

Admin accounts are created by the super admin (SuperAdminCreateAdminView),
who sets the first password and hands it over. From then on the admin can
change it themselves here, proven by an OTP sent to their registered email:

  GET  /api/admin-panel/me/profile/                         -> account details
  POST /api/admin-panel/me/change-password/request-otp/     { email }
  POST /api/admin-panel/me/change-password/                 { otp, new_password }

The email typed into request-otp must match the account's registered email,
and the code is always sent to the registered address — never to whatever
was typed. A stolen session therefore cannot redirect the code to an inbox
the attacker controls; changing the password still needs the admin's mailbox.
"""

import logging
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models import ActivityLog, OTPRecord
from authapp.models.email_log_models import TYPE_OTP_PASSWORD_RESET
from authapp.models.user_model import AdminProfile
from authapp.otp.otp_utils import OTP_TTL_MINUTES, generate_otp, send_otp_email_html
from authapp.otp.otp_views import EMAIL_DELIVERY_ERROR
from authapp.serializers.user_serializers import validate_strong_password
from authapp.throttles import OTPSendRateThrottle, OTPVerifyRateThrottle
from authapp.views.auth_views import get_client_ip

logger = logging.getLogger(__name__)

# OTPRecord.mode is max_length=10. Distinct from the player "reset" mode so a
# code issued by the public forgot-password flow can never be spent here, and
# vice versa.
OTP_MODE = "admin_pw"

# Wrong codes allowed against one issued OTP before it is burned. The per-IP
# otp-verify throttle alone would still allow ~100 guesses inside the 10-minute
# window; this makes it 5, per account, regardless of IP.
MAX_OTP_ATTEMPTS = 5


def _attempts_key(user):
    return f"admin_pw_otp_attempts:{user.pk}"


class AdminProfileView(APIView):
    """GET /api/admin-panel/me/profile/ — read-only; the super admin owns
    these details. Password is changed through the OTP flow below."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        user = request.user
        profile, _ = AdminProfile.objects.get_or_create(user=user)
        return Response({
            "user_uid":     user.user_uid,
            "name":         user.name,
            "email":        user.email,
            "phone":        user.phone or profile.mobile,
            "role":         profile.role,
            "role_label":   profile.get_role_display(),
            "department":   profile.department,
            "is_active":    user.is_active and profile.is_active,
            "date_joined":  user.date_joined,
            "last_login":   profile.last_login or user.last_login,
            "last_login_ip": profile.last_login_ip or user.last_login_ip,
            "login_count":  profile.login_count,
            "permissions": {
                "can_edit_users":     profile.can_edit_users,
                "can_manage_finance": profile.can_manage_finance,
                "can_approve_kyc":    profile.can_approve_kyc,
                "can_send_notifs":    profile.can_send_notifs,
                "can_manage_vip":     profile.can_manage_vip,
            },
        })


class AdminChangePasswordRequestOTPView(APIView):
    """POST /api/admin-panel/me/change-password/request-otp/ { email }"""
    permission_classes = [IsAdminUser]
    throttle_classes = [OTPSendRateThrottle]

    def post(self, request):
        user  = request.user
        typed = (request.data.get("email") or "").strip().lower()

        if not typed:
            return Response({"error": "Enter your registered email address."}, status=400)
        # Safe to say it doesn't match: the caller is already signed in as
        # this account, so nothing about account existence is revealed.
        if typed != (user.email or "").strip().lower():
            return Response(
                {"error": "This email does not match the email registered to your admin account."},
                status=400,
            )

        otp = generate_otp()
        OTPRecord.objects.filter(email=user.email, mode=OTP_MODE).delete()
        record = OTPRecord.objects.create(
            email=user.email,
            phone="",
            otp=otp,
            mode=OTP_MODE,
            expires_at=timezone.now() + timedelta(minutes=OTP_TTL_MINUTES),
        )
        cache.delete(_attempts_key(user))

        try:
            send_otp_email_html(user.email, otp, email_type=TYPE_OTP_PASSWORD_RESET)
        except Exception:
            # Detail is logged inside send_otp_email_html; don't leave a code
            # usable that was never delivered.
            record.delete()
            return Response({"error": EMAIL_DELIVERY_ERROR}, status=500)

        return Response({
            "message": f"A verification code has been sent to {user.email}.",
            "expires_in_minutes": OTP_TTL_MINUTES,
        })


class AdminChangePasswordView(APIView):
    """POST /api/admin-panel/me/change-password/ { otp, new_password }"""
    permission_classes = [IsAdminUser]
    throttle_classes = [OTPVerifyRateThrottle]

    def post(self, request):
        user         = request.user
        otp          = (request.data.get("otp") or "").strip()
        new_password = request.data.get("new_password") or ""

        if not otp or not new_password:
            return Response({"error": "Verification code and new password are required."}, status=400)

        record = (
            OTPRecord.objects.filter(email=user.email, mode=OTP_MODE)
            .order_by("-created_at").first()
        )
        if record is None:
            return Response({"error": "No active code. Request a new verification code."}, status=400)
        if record.expires_at < timezone.now():
            record.delete()
            return Response({"error": "Code has expired. Please request a new one."}, status=400)

        if record.otp != otp:
            key = _attempts_key(user)
            attempts = cache.get(key, 0) + 1
            cache.set(key, attempts, OTP_TTL_MINUTES * 60)
            if attempts >= MAX_OTP_ATTEMPTS:
                record.delete()
                cache.delete(key)
                return Response(
                    {"error": "Too many incorrect codes. Please request a new verification code."},
                    status=400,
                )
            return Response(
                {"error": f"Incorrect code. {MAX_OTP_ATTEMPTS - attempts} attempt(s) left."},
                status=400,
            )

        # Validate before consuming, so a weak password doesn't cost the code.
        try:
            validate_strong_password(new_password)
        except Exception as exc:
            detail = exc.detail if hasattr(exc, "detail") else str(exc)
            if isinstance(detail, list):
                detail = " ".join(str(d) for d in detail)
            return Response({"error": str(detail)}, status=400)
        if user.check_password(new_password):
            return Response({"error": "New password must be different from your current password."}, status=400)

        record.delete()  # consumed
        cache.delete(_attempts_key(user))

        user.set_password(new_password)
        user.save(update_fields=["password"])

        # Sign out every session, this one included — same as the player
        # reset flow. The client sends the admin back to the login screen.
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken, OutstandingToken,
            )
            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)
        except Exception:
            logger.warning("Could not blacklist refresh tokens after admin password change (user=%s)", user.pk)

        ActivityLog.log(
            action="password_change",
            actor=user,
            target_user=user,
            description="Admin changed own password from Profile (email OTP verified)",
            ip_address=get_client_ip(request),
        )

        return Response({"message": "Password changed. Please sign in again with your new password."})
