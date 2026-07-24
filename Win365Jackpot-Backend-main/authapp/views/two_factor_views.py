"""
authapp/views/two_factor_views.py
─────────────────────────────────────────────────────────────────────────────
Two-Factor Authentication (TOTP) management for Super Admin accounts:
  • TwoFactorStatusView  — GET  /api/super-admin/2fa/status/
  • TwoFactorSetupView   — POST /api/super-admin/2fa/setup/                generates a pending secret + QR code
  • TwoFactorConfirmView — POST /api/super-admin/2fa/confirm/              verifies the first code, turns 2FA on, issues backup codes
  • TwoFactorDisableView — POST /api/super-admin/2fa/disable/              requires password + current code
  • TwoFactorRegenerateBackupCodesView — POST /api/super-admin/2fa/regenerate-backup-codes/  requires password + current code

The login-time verification step (second factor at sign-in) lives in
auth_views.SuperAdminVerify2FAView, not here — these are all
"already logged in, managing my own 2FA" endpoints.
"""
import base64
import io

import pyotp
import qrcode
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models import ActivityLog
from authapp.models.two_factor_models import TwoFactorAuth, TwoFactorBackupCode
from authapp.permissions.super_admin_permissions import IsSuperAdmin
from authapp.utils.two_factor import verify_totp_or_backup_code

ISSUER = "JackpotsWorld"


def _get_client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


def _qr_data_uri(otpauth_uri):
    img = qrcode.make(otpauth_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


class TwoFactorStatusView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        tfa = TwoFactorAuth.objects.filter(user=request.user).first()
        return Response({
            "is_enabled": bool(tfa and tfa.is_enabled),
            "confirmed_at": tfa.confirmed_at if tfa else None,
            "backup_codes_remaining": (
                tfa.backup_codes.filter(used_at__isnull=True).count() if tfa and tfa.is_enabled else 0
            ),
        })


class TwoFactorSetupView(APIView):
    """Step 1 of enrollment: generate a fresh secret + QR code. Does NOT
    enable 2FA yet — that only happens once the user proves they scanned it
    correctly via TwoFactorConfirmView."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request):
        existing = TwoFactorAuth.objects.filter(user=request.user).first()
        if existing and existing.is_enabled:
            return Response(
                {"error": "2FA is already enabled. Disable it first if you want to re-enroll."},
                status=400,
            )

        secret = pyotp.random_base32()
        TwoFactorAuth.objects.update_or_create(
            user=request.user,
            defaults={"secret": secret, "is_enabled": False, "confirmed_at": None},
        )

        otpauth_uri = pyotp.TOTP(secret).provisioning_uri(name=request.user.email, issuer_name=ISSUER)
        return Response({
            "secret": secret,
            "otpauth_uri": otpauth_uri,
            "qr_code": _qr_data_uri(otpauth_uri),
        })


class TwoFactorConfirmView(APIView):
    """Step 2 of enrollment: verify the user actually scanned the QR code
    and can produce a valid code, then turn 2FA on and issue backup codes
    (shown once, in this response only)."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request):
        code = request.data.get("code", "")
        tfa = TwoFactorAuth.objects.filter(user=request.user).first()
        if not tfa:
            return Response({"error": "Run setup first."}, status=400)
        if tfa.is_enabled:
            return Response({"error": "2FA is already enabled."}, status=400)

        totp = pyotp.TOTP(tfa.secret)
        if not totp.verify((code or "").strip(), valid_window=1):
            return Response({"error": "Invalid code. Check your authenticator app and try again."}, status=400)

        tfa.is_enabled = True
        tfa.confirmed_at = timezone.now()
        tfa.save(update_fields=["is_enabled", "confirmed_at"])
        backup_codes = TwoFactorBackupCode.generate_set(tfa)

        ActivityLog.log(
            action="two_factor_enabled",
            actor=request.user,
            description="Super Admin enabled two-factor authentication",
            ip_address=_get_client_ip(request),
        )
        return Response({"enabled": True, "backup_codes": backup_codes})


class TwoFactorDisableView(APIView):
    """Requires the current password AND a valid code (TOTP or backup) —
    a stolen/leaked JWT alone can't turn 2FA off."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request):
        password = request.data.get("password", "")
        code     = request.data.get("code", "")

        if not request.user.check_password(password):
            return Response({"error": "Incorrect password."}, status=400)

        tfa = TwoFactorAuth.objects.filter(user=request.user, is_enabled=True).first()
        if not tfa:
            return Response({"error": "2FA is not enabled."}, status=400)

        if not verify_totp_or_backup_code(tfa, code):
            return Response({"error": "Invalid code."}, status=400)

        tfa.delete()
        ActivityLog.log(
            action="two_factor_disabled",
            actor=request.user,
            description="Super Admin disabled two-factor authentication",
            ip_address=_get_client_ip(request),
        )
        return Response({"disabled": True})


class TwoFactorRegenerateBackupCodesView(APIView):
    """Same re-auth requirement as disabling — invalidates every existing
    backup code and issues a fresh set (shown once, in this response)."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request):
        password = request.data.get("password", "")
        code     = request.data.get("code", "")

        if not request.user.check_password(password):
            return Response({"error": "Incorrect password."}, status=400)

        tfa = TwoFactorAuth.objects.filter(user=request.user, is_enabled=True).first()
        if not tfa:
            return Response({"error": "2FA is not enabled."}, status=400)

        if not verify_totp_or_backup_code(tfa, code):
            return Response({"error": "Invalid code."}, status=400)

        backup_codes = TwoFactorBackupCode.generate_set(tfa)
        ActivityLog.log(
            action="settings_changed",
            actor=request.user,
            description="Super Admin regenerated 2FA backup codes",
            ip_address=_get_client_ip(request),
        )
        return Response({"backup_codes": backup_codes})
