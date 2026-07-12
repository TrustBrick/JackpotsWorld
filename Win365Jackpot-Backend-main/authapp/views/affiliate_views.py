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

from django.db.models import Q, Sum, Count
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from authapp.models import User
from authapp.models.affiliate_models import (
    AffiliateProfile, ReferralCommission, AffiliateClickLog, AffiliateLoginLog,
)
from authapp.models.gift_level_models import UserLevel
from authapp.permissions.affiliate_permissions import IsAffiliate
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.utils.geolocation import resolve_geo_location
from authapp.serializers.affiliate_serializers import (
    AffiliateProfileSerializer, ReferredUserSerializer, ReferralCommissionSerializer,
    AffiliateClickLogSerializer, AffiliateLoginLogSerializer,
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
            # approved_by is only ever set once an admin has acted on this
            # profile (see AdminGrantAffiliateView) — null means it's a fresh
            # application still awaiting its first review, not a revocation.
            if profile.approved_by is None:
                return Response({"error": "Your affiliate application is pending review. We'll notify you once it's approved."}, status=403)
            return Response({"error": "Your affiliate account has been deactivated. Contact support for details."}, status=403)

        user.last_login = timezone.now()
        user.last_login_ip = _get_client_ip(request)
        user.save(update_fields=["last_login", "last_login_ip"])
        geo = resolve_geo_location(user.last_login_ip)
        if geo:
            user.last_login_city = geo.get("city", "")
            user.last_login_region = geo.get("region", "")
            user.last_login_country_name = geo.get("country_name", "")
            user.save(update_fields=["last_login_city", "last_login_region", "last_login_country_name"])
        AffiliateLoginLog.objects.create(affiliate=user, ip_address=user.last_login_ip)

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


# ─── Referral link click tracking ───────────────────────────────────────────
# Fired from the public landing page the moment a ?ref= link is visited
# (see AuthModal.jsx), independent of whether the visitor ever signs up —
# lets "Total Clicks" reflect real traffic, not just conversions.

class AffiliateTrackClickView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        referral_code = (request.data.get("referral_code") or "").strip()
        if not referral_code:
            return Response({"error": "referral_code is required"}, status=400)

        affiliate = User.objects.filter(referral_code=referral_code).first()
        if not affiliate or not AffiliateProfile.objects.filter(user=affiliate, is_active=True).exists():
            # Unknown/inactive referral code — silently no-op rather than
            # error, since this is a best-effort background call the
            # frontend fires on every landing-page visit.
            return Response({"tracked": False}, status=200)

        AffiliateClickLog.objects.create(
            affiliate=affiliate,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
            landing_path=(request.data.get("landing_path") or "")[:255],
        )
        return Response({"tracked": True}, status=201)


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
        commissions_qs = ReferralCommission.objects.filter(affiliate=request.user)

        pending = commissions_qs.filter(status="pending").aggregate(total=Sum("amount"))["total"] or Decimal("0")
        paid = commissions_qs.filter(status="paid").aggregate(total=Sum("amount"))["total"] or Decimal("0")
        total_deposits = commissions_qs.aggregate(total=Sum("deposit_amount"))["total"] or Decimal("0")
        qualified_players = commissions_qs.values("referred_user").distinct().count()
        total_clicks = AffiliateClickLog.objects.filter(affiliate=request.user).count()

        monthly = (
            commissions_qs.annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(total=Sum("amount"))
            .order_by("-month")[:12]
        )

        level_counts = (
            UserLevel.objects.filter(user__in=referred_qs)
            .values("level")
            .annotate(count=Count("level"))
            .order_by("-count")
        )
        distribution = {str(row["level"]): row["count"] for row in level_counts}
        total_leveled = sum(distribution.values())
        most_common_level = int(max(distribution, key=distribution.get)) if distribution else 1

        return Response({
            "affiliate_profile": AffiliateProfileSerializer(profile).data,
            "referral_code": request.user.referral_code,
            "stats": {
                "total_clicks": total_clicks,
                "total_referred": referred_qs.count(),
                "active_referred": referred_qs.filter(is_active=True).count(),
                "total_qualified_players": qualified_players,
                "total_deposits": float(total_deposits),
                "qualified_deposits_count": commissions_qs.count(),
                "commission_earned": float(pending + paid),
                "commission_pending": float(pending),
                "commission_paid": float(paid),
                "available_balance": float(profile.total_pending),
            },
            "monthly_earnings": [
                {"month": m["month"].strftime("%Y-%m"), "total": float(m["total"])}
                for m in monthly
            ],
            "player_level": {
                "most_common_level": most_common_level,
                "distribution": distribution,
                "total_leveled_players": total_leveled,
            },
        })


class AffiliateCommissionsListView(APIView):
    """GET /api/affiliate/commissions/?status=&page= — serves both Commission
    History (no status filter) and Withdrawal History (status=paid) from the
    same ReferralCommission table, since a "withdrawal" is simply a commission
    that's been marked paid (see AdminMarkCommissionPaidView)."""
    permission_classes = [IsAffiliate]

    def get(self, request):
        status_filter = request.GET.get("status", "").strip()
        user_id = request.GET.get("user_id", "").strip()
        page = max(1, int(request.GET.get("page", 1) or 1))

        # Viewing a specific referred player's transaction detail (as opposed
        # to the affiliate's own overall Commission/Withdrawal History, which
        # is always visible) requires admin-granted permission.
        if user_id:
            profile = getattr(request.user, "affiliate_profile", None)
            if not profile or not profile.can_view_player_transactions:
                return Response(
                    {"error": "Transaction visibility is not enabled for your account. Contact your account manager."},
                    status=403,
                )

        qs = ReferralCommission.objects.filter(affiliate=request.user).select_related("referred_user")
        if status_filter in ("pending", "paid"):
            qs = qs.filter(status=status_filter)
        if user_id:
            qs = qs.filter(referred_user_id=user_id)

        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]

        return Response({
            "count": count,
            "page": page,
            "page_size": PAGE_SIZE,
            "results": ReferralCommissionSerializer(page_items, many=True).data,
        })


class AffiliateClickLogListView(APIView):
    permission_classes = [IsAffiliate]

    def get(self, request):
        page = max(1, int(request.GET.get("page", 1) or 1))
        qs = AffiliateClickLog.objects.filter(affiliate=request.user)
        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]
        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": AffiliateClickLogSerializer(page_items, many=True).data,
        })


class AffiliateLoginHistoryListView(APIView):
    permission_classes = [IsAffiliate]

    def get(self, request):
        page = max(1, int(request.GET.get("page", 1) or 1))
        qs = AffiliateLoginLog.objects.filter(affiliate=request.user)
        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]
        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": AffiliateLoginLogSerializer(page_items, many=True).data,
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

        level_map = {
            ul.user_id: ul.level
            for ul in UserLevel.objects.filter(user__in=page_users)
        }

        results = [
            {
                "id": u.id,
                "user_level": level_map.get(u.id, 1),
                "country": u.country,
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
        can_view_txns = request.data.get("can_view_player_transactions")

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
                "can_view_player_transactions": bool(can_view_txns) if can_view_txns is not None else False,
            },
        )
        if not created:
            profile.commission_rate = commission_rate
            profile.is_active = is_active
            profile.approved_by = request.user
            update_fields = ["commission_rate", "is_active", "approved_by", "updated_at"]
            if can_view_txns is not None:
                profile.can_view_player_transactions = bool(can_view_txns)
                update_fields.append("can_view_player_transactions")
            profile.save(update_fields=update_fields)

        return Response({
            "message": f"{user.email} is now {'an active' if is_active else 'an inactive'} affiliate.",
            "affiliate_profile": AffiliateProfileSerializer(profile).data,
        }, status=201 if created else 200)


class AdminAffiliateListView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        profiles = AffiliateProfile.objects.select_related("user").order_by("-created_at")

        status_filter = (request.GET.get("status") or "").strip().lower()
        if status_filter == "pending":
            profiles = profiles.filter(approved_by__isnull=True)
        elif status_filter == "active":
            profiles = profiles.filter(is_active=True, approved_by__isnull=False)
        elif status_filter == "inactive":
            profiles = profiles.filter(is_active=False, approved_by__isnull=False)

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
