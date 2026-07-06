"""
authapp/otp/otp_views.py
─────────────────────────────────────────────────────────────────────────────
OTP-based authentication views.

Flow:
  POST /api/auth/send-otp/   { email, mode: "login"|"register" }
  POST /api/auth/verify-otp/ { email, otp, mode, name?, phone?, referral_code? }
"""

from datetime import timedelta
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from authapp.models import User, OTPRecord
from authapp.serializers import UserProfileSerializer
from .otp_utils import generate_otp, send_otp_email


def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


# ─── Send OTP ────────────────────────────────────────────────────────────────

class SendOTPView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip()
        mode  = request.data.get("mode", "login")

        if not email or "@" not in email:
            return Response({"error": "Valid email is required"}, status=400)

        if mode == "login":
            if not User.objects.filter(email=email).exists():
                return Response({"error": "No account found with this email"}, status=400)
        else:   # register
            if User.objects.filter(email=email).exists():
                return Response({"error": "Email already registered"}, status=400)

        otp = generate_otp()

        # Delete any stale OTPs for this email + mode
        OTPRecord.objects.filter(email=email, mode=mode).delete()
        OTPRecord.objects.create(
            email=email,
            phone="",
            otp=otp,
            mode=mode,
            expires_at=timezone.now() + timedelta(minutes=10),
        )

        try:
            send_otp_email(email, otp)
        except Exception as e:
            return Response(
                {"success": False, "error": f"Failed to send OTP email: {e}"},
                status=500
            )
        return Response({"message": "OTP sent successfully"})


# ─── Verify OTP ──────────────────────────────────────────────────────────────

class VerifyOTPView(APIView):
    permission_classes = [permissions.AllowAny]

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
            user = User.objects.create_user(
                email=email,
                phone=phone or "",
                name=name,
                password=password,
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