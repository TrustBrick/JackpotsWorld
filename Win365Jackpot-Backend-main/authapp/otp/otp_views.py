"""
authapp/otp/otp_views.py
─────────────────────────────────────────────────────────────────────────────
OTP-based authentication views.

Flow:
  POST /api/auth/send-otp/   { email, mode: "login"|"register" }
  POST /api/auth/verify-otp/ { email, otp, mode, name?, phone?, referral_code? }
"""

import logging
from datetime import timedelta
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from authapp.models import User, OTPRecord, ActivityLog
from authapp.serializers import UserProfileSerializer
from authapp.serializers.user_serializers import validate_strong_password, clean_full_phone
from authapp.throttles import OTPSendRateThrottle, OTPVerifyRateThrottle
from authapp.utils.turnstile import verify_turnstile
from authapp.views.auth_views import get_client_ip
from .otp_utils import generate_otp, send_otp_email

logger = logging.getLogger(__name__)

# Safe, generic message returned to API clients on any email delivery
# failure — the real exception (including any SMTP provider details) is
# logged server-side by otp_utils.send_otp_email, never sent to the client.
EMAIL_DELIVERY_ERROR = "We couldn't send the verification email right now. Please try again in a few minutes or contact support."


def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


# ─── Send OTP ────────────────────────────────────────────────────────────────

class SendOTPView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [OTPSendRateThrottle]

    def post(self, request):
        email = request.data.get("email", "").strip()
        mode  = request.data.get("mode", "login")

        if not email or "@" not in email:
            return Response({"error": "Valid email is required"}, status=400)

        # Cloudflare Turnstile verification — this is the signup form's
        # submit action, so bot-check it here rather than at verify-otp
        # (login-mode OTP requests are left untouched, protected upstream).
        if mode == "register":
            cf_token = request.data.get("cf_turnstile_response")
            if not verify_turnstile(cf_token, get_client_ip(request)):
                return Response({"error": "Human verification failed. Please try again."}, status=400)

        if mode == "login":
            if not User.objects.filter(email=email).exists():
                return Response({"error": "No account found with this email"}, status=400)
        else:   # register
            if User.objects.filter(email=email).exists():
                return Response({"error": "Email already registered"}, status=400)

        otp = generate_otp()

        # Delete any stale OTPs for this email + mode
        OTPRecord.objects.filter(email=email, mode=mode).delete()
        record = OTPRecord.objects.create(
            email=email,
            phone="",
            otp=otp,
            mode=mode,
            expires_at=timezone.now() + timedelta(minutes=10),
        )

        try:
            send_otp_email(email, otp)
        except Exception:
            # Full exception detail is already logged inside send_otp_email —
            # don't leak SMTP provider internals to the client, and don't
            # leave a valid-but-never-delivered OTP record usable.
            record.delete()
            return Response({"success": False, "error": EMAIL_DELIVERY_ERROR}, status=500)
        return Response({"message": "OTP sent successfully"})


# ─── Verify OTP ──────────────────────────────────────────────────────────────

class VerifyOTPView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [OTPVerifyRateThrottle]

    def post(self, request):
        email = request.data.get("email", "").strip()
        otp   = request.data.get("otp",   "").strip()
        mode  = request.data.get("mode",  "login")
        name  = request.data.get("name",  "").strip()
        phone = request.data.get("phone", "").strip()
        ref   = request.data.get("referral_code", "").strip().upper()

        if not email or not otp:
            return Response({"error": "Email and OTP required"}, status=400)

        try:
            record = OTPRecord.objects.filter(
                email=email, otp=otp, mode=mode
            ).latest("created_at")
        except OTPRecord.DoesNotExist:
            return Response({"error": "Invalid or expired OTP"}, status=400)

        if record.expires_at < timezone.now():
            record.delete()
            return Response({"error": "OTP has expired. Please request a new one."}, status=400)

        record.delete()  # consumed

        if mode == "login":
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                return Response({"error": "Account not found"}, status=404)

        else:   # register
            if User.objects.filter(email=email).exists():
                return Response({"error": "Account already exists"}, status=409)

            # register
            password = request.data.get("password", "")
            try:
                validate_strong_password(password)
            except Exception as exc:
                detail = exc.detail if hasattr(exc, "detail") else str(exc)
                return Response({"error": str(detail)}, status=400)

            country   = (request.data.get("country") or "IN").strip().upper()[:2]
            dial_code = (request.data.get("dial_code") or "+91").strip()

            full_phone = ""
            if phone:
                try:
                    full_phone = clean_full_phone(phone)
                except Exception as exc:
                    detail = exc.detail if hasattr(exc, "detail") else str(exc)
                    return Response({"error": str(detail)}, status=400)
                if User.objects.filter(phone=full_phone).exists():
                    return Response({"error": "This mobile number is already registered."}, status=400)

            user = User.objects.create_user(
                email=email,
                phone=full_phone,
                name=name,
                password=password,
                country=country,
                dial_code=dial_code,
            )

            # ✅ KYC FLOW
            user.kyc_status = "pending"
            user.is_active  = True
            user.save(update_fields=["kyc_status", "is_active"])

            if ref:
                try:
                    referrer = User.objects.get(referral_code=ref)
                    user.referred_by = referrer
                    user.save(update_fields=["referred_by"])
                    referrer.referral_count    += 1
                    referrer.referral_earnings += 50
                    referrer.wallet_balance    += 50
                    referrer.save(update_fields=["referral_count", "referral_earnings", "wallet_balance"])
                except User.DoesNotExist:
                    pass

        tokens  = get_tokens(user)
        profile = UserProfileSerializer(user, context={"request": request}).data
        return Response({"user": profile, "tokens": tokens}, status=200)


# ─── Forgot Password ─────────────────────────────────────────────────────────
# POST /api/auth/forgot-password/  { email }
# POST /api/auth/reset-password/   { email, otp, new_password }

class ForgotPasswordRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [OTPSendRateThrottle]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email or "@" not in email:
            return Response({"error": "Valid email is required"}, status=400)

        generic_response = Response(
            {"message": "If an account exists for this email, a reset code has been sent."}
        )

        user = User.objects.filter(email=email).first()
        if not user:
            # Don't reveal whether the account exists.
            return generic_response

        otp = generate_otp()
        OTPRecord.objects.filter(email=email, mode="reset").delete()
        OTPRecord.objects.create(
            email=email,
            phone="",
            otp=otp,
            mode="reset",
            expires_at=timezone.now() + timedelta(minutes=10),
        )

        try:
            send_otp_email(email, otp)
        except Exception:
            # Full exception detail is already logged inside send_otp_email.
            # Still return the generic response — never reveal to the client
            # whether the account exists or whether delivery succeeded.
            logger.warning("Password reset email could not be delivered for %s", email)

        return generic_response


class ResetPasswordConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [OTPVerifyRateThrottle]

    def post(self, request):
        email        = request.data.get("email", "").strip().lower()
        otp          = request.data.get("otp", "").strip()
        new_password = request.data.get("new_password", "")

        if not email or not otp or not new_password:
            return Response({"error": "Email, OTP and new password are required"}, status=400)

        try:
            record = OTPRecord.objects.filter(
                email=email, otp=otp, mode="reset"
            ).latest("created_at")
        except OTPRecord.DoesNotExist:
            return Response({"error": "Invalid or expired code"}, status=400)

        if record.expires_at < timezone.now():
            record.delete()
            return Response({"error": "Code has expired. Please request a new one."}, status=400)

        try:
            validate_strong_password(new_password)
        except Exception as exc:
            detail = exc.detail if hasattr(exc, "detail") else str(exc)
            return Response({"error": str(detail)}, status=400)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            record.delete()
            return Response({"error": "Account not found"}, status=404)

        record.delete()  # consumed

        user.set_password(new_password)
        user.save(update_fields=["password"])

        # Force re-login everywhere: blacklist every outstanding refresh
        # token issued to this user before the reset.
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                OutstandingToken, BlacklistedToken,
            )
            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)
        except Exception:
            pass

        ActivityLog.log(
            action="password_change",
            actor=user,
            target_user=user,
            description="Password reset via forgot-password flow",
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        return Response({"message": "Password reset successfully. Please log in with your new password."})