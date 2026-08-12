"""
authapp/views/affiliate_views.py
─────────────────────────────────────────────────────────────────────────────
Affiliate role — a genuinely separate login/dashboard on top of the same
User model, mirroring the AdminProfile / AdminLoginView pattern.

  • AffiliateLoginView          — POST /api/affiliate/login/            (public)
  • AffiliateApplyView          — POST /api/affiliate/apply/            (authenticated — self-service application)
  • AffiliateDashboardView      — GET  /api/affiliate/dashboard/        (affiliate)
  • AffiliateReferralsListView  — GET  /api/affiliate/referrals/        (affiliate)
  • AffiliateCampaignListCreateView   — GET/POST /api/affiliate/campaigns/                (affiliate)
  • AffiliateCampaignDetailView       — GET/PATCH /api/affiliate/campaigns/<id>/          (affiliate)
  • AffiliateCampaignVisitorsListView — GET  /api/affiliate/campaigns/<id>/visitors/      (affiliate)
  • AffiliateCampaignQRCodeView       — GET  /api/affiliate/campaigns/<id>/qr/            (affiliate)
  • AdminGrantAffiliateView     — POST /api/admin-panel/affiliates/grant/        (admin)
  • AdminAffiliateListView      — GET  /api/admin-panel/affiliates/              (admin)
  • AdminMarkCommissionPaidView — POST /api/admin-panel/affiliates/commissions/<id>/mark-paid/  (admin)
"""
import io
import re
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal, InvalidOperation

import qrcode
from django.db.models import Q, Sum, Count
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from authapp.models import User
from authapp.models.affiliate_commission_models import (
    AffiliateCommissionAssignment, AffiliatePlayerCommissionStatus, CommissionPlan,
)
from authapp.models.affiliate_models import (
    AffiliateProfile, ReferralCommission, AffiliateClickLog, AffiliateLoginLog, AffiliateCampaign,
)
from authapp.models.gift_level_models import UserLevel
from authapp.permissions.affiliate_permissions import IsAffiliate
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.services.affiliate_commission_service import commission_display_status
from authapp.services.affiliate_stats_service import split_deposit_and_qualified
from authapp.utils.geolocation import resolve_geo_location
from authapp.utils.user_agent import parse_user_agent
from authapp.serializers.affiliate_serializers import (
    AffiliateProfileSerializer, ReferredUserSerializer, ReferralCommissionSerializer,
    AffiliateClickLogSerializer, AffiliateLoginLogSerializer,
    AffiliateCampaignSerializer, AffiliateCampaignDetailSerializer, CampaignVisitorSerializer,
    CommissionPlanSerializer, AffiliateCommissionAssignmentSerializer,
    AffiliatePlayerCommissionStatusSerializer,
)
from authapp.utils.client_ip import get_client_ip as _resolve_client_ip

PAGE_SIZE = 20
CAMPAIGN_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,60}$")
CAMPAIGN_STATUSES = ("active", "paused", "expired")


def _attach_campaign_stats(affiliate, campaigns):
    """Batches click/visitor/funnel aggregation for a list of campaigns into
    a handful of queries total (not one set of queries per campaign), then
    attaches the result as `.stats` on each campaign instance for
    AffiliateCampaignSerializer to read."""
    campaigns = list(campaigns)
    campaign_ids = [c.id for c in campaigns]
    if not campaign_ids:
        return campaigns

    click_rows = (
        AffiliateClickLog.objects.filter(campaign_id__in=campaign_ids)
        .values("campaign_id", "ip_address", "registered_user_id")
    )
    clicks_by_campaign = defaultdict(int)
    visitors_by_campaign = defaultdict(set)
    users_by_campaign = defaultdict(set)
    all_user_ids = set()
    for row in click_rows:
        cid = row["campaign_id"]
        clicks_by_campaign[cid] += 1
        if row["ip_address"]:
            visitors_by_campaign[cid].add(row["ip_address"])
        if row["registered_user_id"]:
            users_by_campaign[cid].add(row["registered_user_id"])
            all_user_ids.add(row["registered_user_id"])

    funnel = split_deposit_and_qualified(affiliate, all_user_ids)

    for c in campaigns:
        users = users_by_campaign.get(c.id, set())
        deposits_generated = sum(
            (funnel["deposit_totals"].get(u, Decimal("0")) for u in users), Decimal("0"),
        )
        c.stats = {
            "total_clicks": clicks_by_campaign.get(c.id, 0),
            "total_visitors": len(visitors_by_campaign.get(c.id, set())),
            "registered_players": len(users),
            "deposit_players": len(users & funnel["deposit_player_ids"]),
            "qualified_players": len(users & funnel["qualified_ids"]),
            "deposits_generated": float(deposits_generated),
        }
    return campaigns


def _get_client_ip(request):
    return _resolve_client_ip(request)


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

        campaign = None
        campaign_id = (request.data.get("campaign_id") or "").strip()
        if campaign_id:
            campaign = AffiliateCampaign.objects.filter(affiliate=affiliate, campaign_id=campaign_id).first()

        ip = _get_client_ip(request)
        user_agent = request.META.get("HTTP_USER_AGENT", "")[:255]
        geo = resolve_geo_location(ip) or {}
        device, browser = parse_user_agent(user_agent)

        click = AffiliateClickLog.objects.create(
            affiliate=affiliate,
            campaign=campaign,
            ip_address=ip,
            user_agent=user_agent,
            landing_path=(request.data.get("landing_path") or "")[:255],
            country=(geo.get("country_name") or "")[:100],
            city=(geo.get("city") or "")[:100],
            device=device,
            browser=browser,
        )
        return Response({"tracked": True, "click_id": click.id}, status=201)


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

        # Admin alert (in-app notification + support email) — only reachable
        # on the true first application for this user, since the `existing`
        # branch above returns before ever reaching here on a repeat call, so
        # this can't double-notify/double-email one registration. Both
        # helpers are best-effort (catch and log internally, never raise),
        # so a notification or SMTP hiccup never blocks the response below.
        from authapp.services.notification_service import notify_generic
        from authapp.utils.email_utils import send_affiliate_registration_alert
        registered_at = profile.created_at.strftime("%b %d, %Y %I:%M %p")
        for staff in User.objects.filter(is_staff=True, is_active=True):
            notify_generic(
                staff,
                title="New Affiliate Registration – Approval Required",
                # One field per line — rendered as-is (white-space: pre-line)
                # by the admin popup and Notifications tab, so keep this in
                # sync with what SharedUI.NotificationPopup expects to show.
                message=(
                    f"Name: {user.name or user.email}\n"
                    f"Email: {user.email}\n"
                    f"Affiliate ID: {user.user_uid}\n"
                    f"Registered: {registered_at}\n"
                    f"Status: Pending Approval"
                ),
                icon="affiliate_registration",
            )
        send_affiliate_registration_alert(user, profile)

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
        total_clicks = AffiliateClickLog.objects.filter(affiliate=request.user).count()

        # Deposit Players / Qualified Players / Total Deposits — see
        # authapp/services/affiliate_stats_service.py for the funnel math.
        funnel = split_deposit_and_qualified(request.user, referred_qs.values_list("id", flat=True))

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
                # Deposit Players: deposited, hasn't placed a bet yet.
                "deposit_players": funnel["deposit_players_count"],
                # Qualified Players: has placed >=1 bet. Kept under both the
                # legacy key (total_qualified_players) and a shorter alias
                # so nothing else that already reads the old key breaks.
                "total_qualified_players": funnel["qualified_players_count"],
                "qualified_players": funnel["qualified_players_count"],
                # Total Deposits = Deposit Players' deposits + Qualified
                # Players' deposits (the two cohorts are disjoint, so this
                # is just "deposits from every referred user who ever
                # deposited" — see affiliate_stats_service for the full
                # reasoning).
                "total_deposits": float(funnel["total_deposits"]),
                "deposit_players_total": float(funnel["deposit_players_total"]),
                "qualified_players_total": float(funnel["qualified_players_total"]),
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


# ─── Campaigns ────────────────────────────────────────────────────────────────
# Campaign Click → Visitor → Registration → Deposit → Bet → Qualified Player →
# Commission — every stage after "Click" reuses the same signals the plain
# dashboard already uses (AffiliateClickLog for clicks/visitors,
# affiliate_stats_service for deposit/qualified), scoped down to one
# campaign's click logs. Nothing here is cached/denormalized, so campaign
# numbers are always live — no manual refresh is ever needed.

class AffiliateCampaignListCreateView(APIView):
    permission_classes = [IsAffiliate]

    def get(self, request):
        q = (request.GET.get("q") or "").strip()
        status_filter = (request.GET.get("status") or "").strip().lower()
        sort = (request.GET.get("sort") or "new").strip().lower()  # new | old

        campaigns = AffiliateCampaign.objects.filter(affiliate=request.user)
        if q:
            campaigns = campaigns.filter(Q(name__icontains=q) | Q(campaign_id__icontains=q))
        if status_filter in CAMPAIGN_STATUSES:
            campaigns = campaigns.filter(status=status_filter)
        campaigns = campaigns.order_by("created_at" if sort == "old" else "-created_at")

        campaigns = _attach_campaign_stats(request.user, campaigns)
        return Response({
            "count": len(campaigns),
            "results": AffiliateCampaignSerializer(campaigns, many=True).data,
        })

    def post(self, request):
        name = (request.data.get("name") or "").strip()
        campaign_id = (request.data.get("campaign_id") or "").strip()

        if not name:
            return Response({"error": "Campaign name is required"}, status=400)
        if not campaign_id:
            return Response({"error": "Campaign ID is required"}, status=400)
        if not CAMPAIGN_ID_RE.match(campaign_id):
            return Response(
                {"error": "Campaign ID may only contain letters, numbers, hyphens and underscores (max 60 characters)"},
                status=400,
            )
        if AffiliateCampaign.objects.filter(affiliate=request.user, campaign_id=campaign_id).exists():
            return Response({"error": f"You already have a campaign with ID '{campaign_id}'"}, status=400)

        campaign = AffiliateCampaign.objects.create(
            affiliate=request.user, name=name, campaign_id=campaign_id,
        )
        campaigns = _attach_campaign_stats(request.user, [campaign])
        return Response(AffiliateCampaignSerializer(campaigns[0]).data, status=201)


class AffiliateCampaignDetailView(APIView):
    permission_classes = [IsAffiliate]

    def _get_campaign(self, request, pk):
        return AffiliateCampaign.objects.filter(pk=pk, affiliate=request.user).first()

    def get(self, request, pk):
        campaign = self._get_campaign(request, pk)
        if not campaign:
            return Response({"error": "Campaign not found"}, status=404)
        campaigns = _attach_campaign_stats(request.user, [campaign])
        return Response(AffiliateCampaignDetailSerializer(campaigns[0]).data)

    def patch(self, request, pk):
        campaign = self._get_campaign(request, pk)
        if not campaign:
            return Response({"error": "Campaign not found"}, status=404)

        update_fields = []
        if "name" in request.data:
            name = (request.data.get("name") or "").strip()
            if not name:
                return Response({"error": "Campaign name cannot be empty"}, status=400)
            campaign.name = name
            update_fields.append("name")
        if "status" in request.data:
            status_value = (request.data.get("status") or "").strip().lower()
            if status_value not in CAMPAIGN_STATUSES:
                return Response({"error": "status must be one of: active, paused, expired"}, status=400)
            campaign.status = status_value
            update_fields.append("status")
        if "notes" in request.data:
            campaign.notes = request.data.get("notes") or ""
            update_fields.append("notes")

        if update_fields:
            update_fields.append("updated_at")
            campaign.save(update_fields=update_fields)

        campaigns = _attach_campaign_stats(request.user, [campaign])
        return Response(AffiliateCampaignDetailSerializer(campaigns[0]).data)


class AffiliateCampaignVisitorsListView(APIView):
    permission_classes = [IsAffiliate]

    def get(self, request, pk):
        campaign = AffiliateCampaign.objects.filter(pk=pk, affiliate=request.user).first()
        if not campaign:
            return Response({"error": "Campaign not found"}, status=404)

        page = max(1, int(request.GET.get("page", 1) or 1))
        qs = AffiliateClickLog.objects.filter(campaign=campaign).select_related("registered_user")
        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = list(qs[start:start + PAGE_SIZE])

        user_ids = [c.registered_user_id for c in page_items if c.registered_user_id]
        funnel = split_deposit_and_qualified(request.user, user_ids)

        rows = []
        for c in page_items:
            if c.registered_user_id:
                visitor = c.registered_user.name or c.registered_user.email
                registration_status = "Registered"
                if c.registered_user_id in funnel["qualified_ids"]:
                    deposit_status, bet_status = "Deposited", "Qualified"
                elif c.registered_user_id in funnel["deposit_totals"]:
                    deposit_status, bet_status = "Deposited", "Not Yet"
                else:
                    deposit_status, bet_status = "Not Yet", "Not Yet"
            else:
                visitor = c.ip_address or "Unknown"
                registration_status, deposit_status, bet_status = "Not Registered", "—", "—"
            rows.append({
                "id": c.id, "visitor": visitor, "country": c.country, "city": c.city,
                "device": c.device, "browser": c.browser, "created_at": c.created_at,
                "registration_status": registration_status,
                "deposit_status": deposit_status,
                "bet_status": bet_status,
            })

        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": CampaignVisitorSerializer(rows, many=True).data,
        })


class AffiliateCampaignQRCodeView(APIView):
    permission_classes = [IsAffiliate]

    def get(self, request, pk):
        campaign = AffiliateCampaign.objects.filter(pk=pk, affiliate=request.user).first()
        if not campaign:
            return Response({"error": "Campaign not found"}, status=404)

        # The referral link is a FRONTEND url, which the API can't infer
        # from its own host — the frontend passes window.location.origin;
        # this fallback only matters for direct/manual API calls.
        origin = (request.GET.get("origin") or "").strip().rstrip("/") or "https://jackpotsworld.vip"
        link = f"{origin}?ref={request.user.referral_code}&campaign={campaign.campaign_id}"

        img = qrcode.make(link)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        response = HttpResponse(buf.getvalue(), content_type="image/png")
        response["Content-Disposition"] = f'attachment; filename="campaign-{campaign.campaign_id}-qr.png"'
        return response


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
        # Capture the pre-update state before mutating — approved_by only
        # ever transitions null → set once, so "was it already approved"
        # is a reliable one-time signal for the onboarding email below.
        was_already_approved = (not created) and profile.is_active and profile.approved_by is not None
        if not created:
            profile.commission_rate = commission_rate
            profile.is_active = is_active
            profile.approved_by = request.user
            update_fields = ["commission_rate", "is_active", "approved_by", "updated_at"]
            if can_view_txns is not None:
                profile.can_view_player_transactions = bool(can_view_txns)
                update_fields.append("can_view_player_transactions")
            profile.save(update_fields=update_fields)

        # Fire the "Affiliate Onboarding Completed Successfully" email exactly
        # once — the moment this profile first becomes active+approved.
        # Not sent for pending applications, rejections/deactivations, or
        # any later edit (commission-rate change, etc.) once already approved.
        if is_active and not was_already_approved:
            from authapp.utils.email_utils import send_affiliate_approval_email
            send_affiliate_approval_email(user)

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

        profiles = list(profiles)
        # Batched (not one query per row) — attaches each affiliate's current
        # Commission Engine plan, if any, for the Affiliate Commissions admin
        # tab's assignment column. Purely additive: absent for any consumer
        # that doesn't read the new key.
        assignments = {
            a.affiliate_id: a
            for a in AffiliateCommissionAssignment.objects.select_related("plan")
            .filter(affiliate_id__in=[p.user_id for p in profiles])
        }

        results = [
            {
                "user_id": p.user_id,
                "user_uid": p.user.user_uid,
                "email": p.user.email,
                "name": p.user.name,
                "country": p.user.country,
                "commission_plan": (
                    CommissionPlanSerializer(assignments[p.user_id].plan).data
                    if p.user_id in assignments else None
                ),
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


# ─── Commission Engine ──────────────────────────────────────────────────────
# The configurable Deposit / Losing / Rolling commission types — see
# authapp/services/affiliate_commission_service.py for the qualification
# engine and authapp/models/affiliate_commission_models.py for the model
# layer. Entirely additive: an affiliate with no AffiliateCommissionAssignment
# is untouched by any of this and keeps showing up only in the pre-existing
# AffiliateDashboardView / AffiliateCommissionsListView (commission_type
# defaults to "legacy" there).

def _apply_commission_slip_filters(qs, params):
    """Shared DB-level filters for both the affiliate Commission Slip and
    the admin Back Office reporting table, so the two surfaces can never
    disagree about what a filter means. Status is handled separately by
    _apply_status_filter since it spans two tables."""
    commission_type = (params.get("type") or "").strip().lower()
    if commission_type in ("deposit", "losing", "rolling"):
        qs = qs.filter(commission_type=commission_type)

    q = (params.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(referred_user__name__icontains=q) | Q(referred_user__email__icontains=q) |
            Q(referred_user__user_uid__icontains=q)
        )

    date_range = (params.get("date_range") or "").strip().lower()  # today | week | month
    date_from = (params.get("date_from") or "").strip()
    date_to = (params.get("date_to") or "").strip()
    today = timezone.now().date()
    if date_range == "today":
        date_from = today.isoformat()
    elif date_range == "week":
        date_from = (today - timedelta(days=7)).isoformat()
    elif date_range == "month":
        date_from = (today - timedelta(days=30)).isoformat()
    if date_from:
        qs = qs.filter(last_evaluated_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(last_evaluated_at__date__lte=date_to)

    return qs


def _apply_status_filter(qs, status_filter):
    """Mirrors commission_display_status()'s mapping as DB filters (kept in
    sync with that function by hand — both are short and change rarely)."""
    status_filter = (status_filter or "").strip().lower().replace(" ", "_")
    if status_filter == "pending":
        return qs.filter(qualification_status="pending")
    if status_filter == "not_qualified":
        return qs.filter(qualification_status__in=["in_progress", "not_qualified"])
    if status_filter == "payable":
        return qs.filter(qualification_status="qualified", commission__status="pending")
    if status_filter == "paid":
        return qs.filter(qualification_status="qualified", commission__status="paid")
    if status_filter == "rejected":
        return qs.filter(commission__status="rejected")
    return qs


# ── Admin: Commission Plan management ──────────────────────────────────────

class AdminCommissionPlanListCreateView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        plans = CommissionPlan.objects.all()
        commission_type = (request.GET.get("type") or "").strip().lower()
        if commission_type in ("deposit", "losing", "rolling"):
            plans = plans.filter(commission_type=commission_type)
        return Response({
            "results": CommissionPlanSerializer(plans, many=True).data,
            "count": plans.count(),
        })

    def post(self, request):
        serializer = CommissionPlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        return Response(CommissionPlanSerializer(plan).data, status=201)


class AdminCommissionPlanDetailView(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request, pk):
        plan = CommissionPlan.objects.filter(pk=pk).first()
        if not plan:
            return Response({"error": "Plan not found"}, status=404)
        return Response(CommissionPlanSerializer(plan).data)

    def patch(self, request, pk):
        plan = CommissionPlan.objects.filter(pk=pk).first()
        if not plan:
            return Response({"error": "Plan not found"}, status=404)

        new_type = request.data.get("commission_type")
        if new_type and new_type != plan.commission_type and AffiliateCommissionAssignment.objects.filter(plan=plan).exists():
            # Changing type on an in-use plan would silently orphan the
            # AffiliatePlayerCommissionStatus rows already tracked under its
            # old type (evaluate_player_commission keys them off
            # plan.commission_type) — rate/min_deposit/wagering_multiplier
            # edits stay unrestricted (see Scenario 5: they apply going
            # forward without disturbing history).
            return Response(
                {"error": "Cannot change the commission type of a plan that is already assigned to an affiliate. Create a new plan instead."},
                status=400,
            )

        serializer = CommissionPlanSerializer(plan, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AdminAffiliateCommissionAssignmentView(APIView):
    """GET/POST /api/admin-panel/affiliates/<user_id>/commission-assignment/
    — view or set which CommissionPlan an affiliate is opted into. Absence
    of an assignment (GET returns assignment: null) means the affiliate is
    still earning under the legacy flat-rate flow."""
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request, user_id):
        assignment = (
            AffiliateCommissionAssignment.objects
            .select_related("plan", "assigned_by")
            .filter(affiliate_id=user_id).first()
        )
        if not assignment:
            return Response({"assignment": None})
        return Response({"assignment": AffiliateCommissionAssignmentSerializer(assignment).data})

    def post(self, request, user_id):
        plan_id = request.data.get("plan_id")
        if not plan_id:
            return Response({"error": "plan_id is required"}, status=400)

        affiliate = User.objects.filter(id=user_id).first()
        if not affiliate:
            return Response({"error": "User not found"}, status=404)
        if not AffiliateProfile.objects.filter(user=affiliate).exists():
            return Response({"error": "This user is not an affiliate."}, status=400)

        plan = CommissionPlan.objects.filter(pk=plan_id).first()
        if not plan:
            return Response({"error": "Commission plan not found"}, status=404)

        existing = AffiliateCommissionAssignment.objects.filter(affiliate=affiliate).first()
        # Changing the assigned plan means new terms — the affiliate needs
        # to agree again. A no-op re-POST of the same plan leaves an
        # existing agreement untouched.
        plan_changed = existing is None or existing.plan_id != plan.id
        defaults = {"plan": plan, "assigned_by": request.user}
        if plan_changed:
            defaults["agreed_at"] = None
        assignment, created = AffiliateCommissionAssignment.objects.update_or_create(
            affiliate=affiliate, defaults=defaults,
        )
        return Response(
            {"assignment": AffiliateCommissionAssignmentSerializer(assignment).data},
            status=201 if created else 200,
        )


# ── Admin: Back Office reporting ────────────────────────────────────────────

class AdminAffiliateCommissionsReportView(APIView):
    """GET /api/admin-panel/affiliate-commissions/?type=&status=&affiliate_id=&q=&date_range=
    — the Commission Slip for every affiliate/player pair at once."""
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        qs = AffiliatePlayerCommissionStatus.objects.select_related(
            "affiliate", "referred_user", "plan", "commission",
        )
        affiliate_id = (request.GET.get("affiliate_id") or "").strip()
        if affiliate_id:
            qs = qs.filter(affiliate_id=affiliate_id)
        qs = _apply_commission_slip_filters(qs, request.GET)
        qs = _apply_status_filter(qs, request.GET.get("status"))

        page = max(1, int(request.GET.get("page", 1) or 1))
        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]

        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": AffiliatePlayerCommissionStatusSerializer(page_items, many=True).data,
        })


class AdminAffiliateCommissionDetailView(APIView):
    """One Commission Slip row's full calculation breakdown for the Back
    Office drill-down."""
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request, pk):
        row = (
            AffiliatePlayerCommissionStatus.objects
            .select_related("affiliate", "referred_user", "plan", "commission")
            .filter(pk=pk).first()
        )
        if not row:
            return Response({"error": "Commission record not found"}, status=404)

        data = AffiliatePlayerCommissionStatusSerializer(row).data
        # Losing Commission can top up across more than one ReferralCommission
        # row over time (see affiliate_commission_service._evaluate_losing) —
        # show the complete history, not just the most recently linked row.
        history = ReferralCommission.objects.filter(
            affiliate_id=row.affiliate_id, referred_user_id=row.referred_user_id,
            commission_type=row.commission_type,
        ).order_by("-created_at")
        data["commission_history"] = ReferralCommissionSerializer(history, many=True).data
        return Response(data)


# ── Affiliate: current plan + agreement ─────────────────────────────────────

class AffiliateCommissionPlanView(APIView):
    permission_classes = [IsAffiliate]

    def get(self, request):
        assignment = (
            AffiliateCommissionAssignment.objects
            .select_related("plan").filter(affiliate=request.user).first()
        )
        if not assignment:
            return Response({"assignment": None, "on_legacy_flow": True})
        return Response({
            "assignment": AffiliateCommissionAssignmentSerializer(assignment).data,
            "on_legacy_flow": False,
        })


class AffiliateCommissionPlanAgreeView(APIView):
    permission_classes = [IsAffiliate]

    def post(self, request):
        assignment = AffiliateCommissionAssignment.objects.filter(affiliate=request.user).first()
        if not assignment:
            return Response({"error": "No commission plan is currently assigned to you."}, status=404)
        if assignment.agreed_at is None:
            assignment.agreed_at = timezone.now()
            assignment.save(update_fields=["agreed_at", "updated_at"])
        return Response({"assignment": AffiliateCommissionAssignmentSerializer(assignment).data})


# ── Affiliate: Commission Slip + summary ────────────────────────────────────

class AffiliateCommissionSlipListView(APIView):
    """GET /api/affiliate/commission-slip/?type=&status=&date_range=&q=&page="""
    permission_classes = [IsAffiliate]

    def get(self, request):
        qs = AffiliatePlayerCommissionStatus.objects.select_related(
            "referred_user", "plan", "commission",
        ).filter(affiliate=request.user)
        qs = _apply_commission_slip_filters(qs, request.GET)
        qs = _apply_status_filter(qs, request.GET.get("status"))

        page = max(1, int(request.GET.get("page", 1) or 1))
        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]

        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": AffiliatePlayerCommissionStatusSerializer(page_items, many=True).data,
        })


class AffiliateCommissionSummaryView(APIView):
    """GET /api/affiliate/commission-summary/ — dashboard cards for the
    affiliate's Commission Engine activity. Affiliates with no assignment
    (still on the legacy flow) get on_legacy_flow: true and current_plan:
    null; their totals continue to show on the pre-existing
    AffiliateDashboardView exactly as before.

    Totals cover every non-legacy commission_type this affiliate has ever
    earned under, not just their *currently* assigned type — if an admin
    reassigns someone from Deposit to Rolling, their earlier Deposit
    commissions don't vanish from the Commission Slip table below, so the
    summary cards above it must keep counting them too; scoping just to the
    current type would show "$0 Total Earned" above a table with a real
    paid/payable row still in it, which is confusing in exactly the way the
    spec says not to be."""
    permission_classes = [IsAffiliate]

    def get(self, request):
        assignment = (
            AffiliateCommissionAssignment.objects.select_related("plan")
            .filter(affiliate=request.user).first()
        )
        if not assignment:
            return Response({
                "current_plan": None, "agreed_at": None, "on_legacy_flow": True,
                "total_earned": Decimal("0"), "total_pending": Decimal("0"),
                "total_paid": Decimal("0"), "total_rejected": Decimal("0"),
            })

        commissions_qs = ReferralCommission.objects.filter(
            affiliate=request.user,
        ).exclude(commission_type="legacy")
        totals = commissions_qs.aggregate(
            pending=Sum("amount", filter=Q(status="pending")),
            paid=Sum("amount", filter=Q(status="paid")),
            rejected=Sum("amount", filter=Q(status="rejected")),
        )
        pending = totals["pending"] or Decimal("0")
        paid = totals["paid"] or Decimal("0")
        rejected = totals["rejected"] or Decimal("0")

        return Response({
            "current_plan": CommissionPlanSerializer(assignment.plan).data,
            "agreed_at": assignment.agreed_at,
            "on_legacy_flow": False,
            # Mirrors AffiliateDashboardView's own commission_earned = pending
            # + paid convention (rejected is shown separately, not folded in).
            "total_earned": pending + paid,
            "total_pending": pending,
            "total_paid": paid,
            "total_rejected": rejected,
        })
