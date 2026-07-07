"""
authapp/views/affiliate_views.py
─────────────────────────────────────────────────────────────────────────────
Affiliate role — a genuinely separate login/dashboard on top of the same
User model, mirroring the AdminProfile / AdminLoginView pattern.

  • AffiliateLoginView          — POST /api/affiliate/login/            (public)
  • AffiliateApplyView          — POST /api/affiliate/apply/            (authenticated — self-service application)
  • AffiliateDashboardView      — GET  /api/affiliate/dashboard/        (affiliate)
  • AffiliateReferralsListView  — GET  /api/affiliate/referrals/        (affiliate)
  • AdminGrantAffiliateView     — POST /api/admin-panel/affiliates/grant/        (admin)
  • AdminAffiliateListView      — GET  /api/admin-panel/affiliates/              (admin)
  • AdminMarkCommissionPaidView — POST /api/admin-panel/affiliates/commissions/<id>/mark-paid/  (admin)
"""
from decimal import Decimal, InvalidOperation

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from authapp.models import User
from authapp.models.affiliate_models import AffiliateProfile, ReferralCommission
from authapp.permissions.affiliate_permissions import IsAffiliate
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.affiliate_serializers import (
    AffiliateProfileSerializer, ReferredUserSerializer, ReferralCommissionSerializer,
)

PAGE_SIZE = 20


def _get_client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


def _get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


# ─── Affiliate login ─────────────────────────────────────────────────────────

class AffiliateLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        password = request.data.get("password", "")

        if not email or not password:
            return Response({"error": "Email and password required"}, status=400)

        user = User.objects.filter(email__iexact=email).first()
        if not user or not user.check_password(password):
            return Response({"error": "Invalid credentials"}, status=400)

        if not user.is_active:
            return Response({"error": "This account has been disabled."}, status=403)

        profile = AffiliateProfile.objects.filter(user=user).first()
        if not profile:
            return Response({"error": "This account is not registered as an affiliate."}, status=403)
        if not profile.is_active:
            return Response({"error": "Your affiliate account has been deactivated."}, status=403)

        user.last_login = timezone.now()
        user.last_login_ip = _get_client_ip(request)
        user.save(update_fields=["last_login", "last_login_ip"])

        tokens = _get_tokens(user)
        return Response({
            "user": {
                "id": user.id,
                "user_uid": user.user_uid,
                "email": user.email,
                "name": user.name,
            },
            "affiliate_profile": AffiliateProfileSerializer(profile).data,
            "tokens": tokens,
        })


# ─── Affiliate self-service application ─────────────────────────────────────
# Public registration (see AffiliateRegister.jsx) creates the underlying User
# account via the existing OTP-verified /api/auth/verify-otp/ flow, then
# calls this endpoint (now authenticated with that user's fresh token) to
# raise a pending AffiliateProfile — inactive until an admin approves it via
# the existing AdminGrantAffiliateView, exactly like every other affiliate.

class AffiliateApplyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        existing = AffiliateProfile.objects.filter(user=user).first()
        if existing:
            return Response({
                "message": "You have already applied to the affiliate program.",
                "affiliate_profile": AffiliateProfileSerializer(existing).data,
            }, status=200)

        profile = AffiliateProfile.objects.create(user=user, is_active=False)
        return Response({
            "message": "Application submitted. Our team will review it and activate your affiliate account.",
            "affiliate_profile": AffiliateProfileSerializer(profile).data,
        }, status=201)


# ─── Affiliate dashboard ─────────────────────────────────────────────────────

class AffiliateDashboardView(APIView):
    permission_classes = [IsAffiliate]

    def get(self, request):
        profile = request.user.affiliate_profile
        referred_qs = User.objects.filter(referred_by=request.user)

        pending = ReferralCommission.objects.filter(affiliate=request.user, status="pending").aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0")
        paid = ReferralCommission.objects.filter(affiliate=request.user, status="paid").aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0")

        return Response({
            "affiliate_profile": AffiliateProfileSerializer(profile).data,
            "stats": {
                "total_referred": referred_qs.count(),
                "active_referred": referred_qs.filter(is_active=True).count(),
                "commission_earned": float(pending + paid),
                "commission_pending": float(pending),
                "commission_paid": float(paid),
            },
        })


class AffiliateReferralsListView(APIView):
    permission_classes = [IsAffiliate]

    def get(self, request):
        q = request.GET.get("q", "").strip()
        status_filter = request.GET.get("status", "").strip()  # active | inactive
        page = max(1, int(request.GET.get("page", 1) or 1))

        referred_qs = User.objects.filter(referred_by=request.user).order_by("-date_joined")
        if q:
            referred_qs = referred_qs.filter(Q(name__icontains=q) | Q(email__icontains=q) | Q(user_uid__icontains=q))
        if status_filter == "active":
            referred_qs = referred_qs.filter(is_active=True)
        elif status_filter == "inactive":
            referred_qs = referred_qs.filter(is_active=False)

        count = referred_qs.count()
        start = (page - 1) * PAGE_SIZE
        page_users = list(referred_qs[start:start + PAGE_SIZE])

        commissions = ReferralCommission.objects.filter(
            affiliate=request.user, referred_user__in=page_users,
        )
        earned_map, pending_map, paid_map = {}, {}, {}
        for c in commissions:
            earned_map[c.referred_user_id] = earned_map.get(c.referred_user_id, Decimal("0")) + c.amount
            if c.status == "pending":
                pending_map[c.referred_user_id] = pending_map.get(c.referred_user_id, Decimal("0")) + c.amount
            else:
                paid_map[c.referred_user_id] = paid_map.get(c.referred_user_id, Decimal("0")) + c.amount

        results = [
            {
                "id": u.id,
                "user_uid": u.user_uid,
                "name": u.name,
                "email": u.email,
                "date_joined": u.date_joined,
                "is_active": u.is_active,
                "kyc_status": u.kyc_status,
                "commission_earned": earned_map.get(u.id, Decimal("0")),
                "commission_pending": pending_map.get(u.id, Decimal("0")),
                "commission_paid": paid_map.get(u.id, Decimal("0")),
            }
            for u in page_users
        ]

        return Response({
            "count": count,
            "page": page,
            "page_size": PAGE_SIZE,
            "results": ReferredUserSerializer(results, many=True).data,
        })


# ─── Admin: grant affiliate status ───────────────────────────────────────────

class AdminGrantAffiliateView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request):
        user_id = request.data.get("user_id")
        commission_rate = request.data.get("commission_rate", "10.00")
        is_active = request.data.get("is_active", True)

        if not user_id:
            return Response({"error": "user_id is required"}, status=400)

        try:
            commission_rate = Decimal(str(commission_rate))
        except InvalidOperation:
            return Response({"error": "Invalid commission_rate"}, status=400)

        user = User.objects.filter(id=user_id).first()
        if not user:
            return Response({"error": "User not found"}, status=404)

        profile, created = AffiliateProfile.objects.get_or_create(
            user=user,
            defaults={
                "commission_rate": commission_rate,
                "is_active": is_active,
                "approved_by": request.user,
            },
        )
        if not created:
            profile.commission_rate = commission_rate
            profile.is_active = is_active
            profile.approved_by = request.user
            profile.save(update_fields=["commission_rate", "is_active", "approved_by", "updated_at"])

        return Response({
            "message": f"{user.email} is now {'an active' if is_active else 'an inactive'} affiliate.",
            "affiliate_profile": AffiliateProfileSerializer(profile).data,
        }, status=201 if created else 200)


class AdminAffiliateListView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        profiles = AffiliateProfile.objects.select_related("user").order_by("-created_at")
        results = [
            {
                "user_id": p.user_id,
                "user_uid": p.user.user_uid,
                "email": p.user.email,
                "name": p.user.name,
                **AffiliateProfileSerializer(p).data,
            }
            for p in profiles
        ]
        return Response({"results": results, "count": len(results)})


class AdminPendingCommissionsListView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        commissions = ReferralCommission.objects.filter(status="pending").select_related("affiliate", "referred_user")
        return Response({
            "results": ReferralCommissionSerializer(commissions, many=True).data,
            "count": commissions.count(),
        })


class AdminMarkCommissionPaidView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, pk):
        commission = ReferralCommission.objects.filter(pk=pk).first()
        if not commission:
            return Response({"error": "Commission not found"}, status=404)
        if commission.status == "paid":
            return Response({"error": "Commission already paid"}, status=400)

        from authapp.services.super_admin_service import admin_transfer_to_user

        try:
            transfer = admin_transfer_to_user(
                actor=request.user,
                target_user=commission.affiliate,
                wallet_type="NC",
                amount=commission.amount,
                txn_type="CBGNC",
                note=f"Referral commission payout (commission #{commission.id})",
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)

        commission.status = "paid"
        commission.paid_at = timezone.now()
        commission.save(update_fields=["status", "paid_at"])

        profile = AffiliateProfile.objects.filter(user=commission.affiliate).first()
        if profile:
            profile.total_paid += commission.amount
            profile.save(update_fields=["total_paid"])

        return Response({
            "message": f"Commission #{commission.id} marked as paid.",
            "transfer": transfer,
            "commission": ReferralCommissionSerializer(commission).data,
        })
