"""
authapp/views/commission_rule_views.py
─────────────────────────────────────────────────────────────────────────────
Back Office (api/admin-panel/commissions/…) — all IsAdminOrSuperAdmin
  AdminCommissionDashboardView      GET   .../dashboard/
  AdminCommissionRuleListCreateView GET/POST   .../rules/
  AdminCommissionRuleDetailView     GET/PATCH/DELETE .../rules/<id>/
  AdminCommissionRuleDuplicateView  POST  .../rules/<id>/duplicate/
  AdminCommissionRuleResolveView    GET   .../rules/resolve/
  AdminCommissionTier*/Condition*   CRUD  .../tiers/ .../conditions/
  AdminManualCommissionCreateView   POST  .../manual/
  AdminCommissionLedgerListView     GET   .../ledger/
  AdminCommissionLedgerUpdateView   PATCH .../ledger/<id>/
  AdminCommissionLedgerTransitionView POST .../ledger/<id>/transition/

Affiliate-facing (api/affiliate/commissions/…) — IsAffiliate, always scoped
to request.user
  AffiliateCommissionSummaryView    GET   .../summary/
  AffiliateCommissionLedgerView     GET   .../ledger/

No commission amount is ever accepted from the client. The only thing an
admin can change about a calculated entry is its workflow status and notes;
the money itself is whatever the engine computed.
"""
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.casino_models import Casino
from authapp.models.commission_rule_models import (
    MANUAL_COMMISSION_TYPE,
    CommissionCondition, CommissionLedgerEntry, CommissionRule, CommissionTier,
)
from authapp.models.user_model import User
from authapp.permissions.affiliate_permissions import IsAffiliate
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.commission_rule_serializers import (
    AffiliateCommissionLedgerSerializer,
    CommissionConditionSerializer,
    CommissionLedgerEntrySerializer,
    CommissionRuleSerializer,
    CommissionTierSerializer,
    ManualCommissionCreateSerializer,
)
from authapp.models.affiliate_wallet_models import AffiliateWalletAccount
from authapp.services import commission_rule_service
from authapp.services.manual_commission_service import (
    ManualCommissionError, create_manual_commission,
)
from authapp.services.notification_service import notify_generic
from authapp.utils.client_ip import get_client_ip as _client_ip

# Which status a given transition is allowed to move to. Enforced server-side
# so no client can jump an entry straight to "paid".
ALLOWED_TRANSITIONS = {
    "pending": {"qualifying", "qualified", "rejected", "cancelled"},
    "qualifying": {"qualified", "rejected", "cancelled"},
    "qualified": {"approved", "rejected", "cancelled"},
    "approved": {"payable", "rejected", "cancelled"},
    "payable": {"paid", "rejected", "cancelled"},
    "paid": set(),
    "rejected": set(),
    "cancelled": set(),
}

_STATUS_NOTIFICATIONS = {
    "qualified": ("Commission qualified", "🎉 You've met the requirements for a commission of {amount}."),
    "approved": ("Commission approved", "✅ Your commission of {amount} has been approved."),
    "payable": ("Commission payable", "💰 Your commission of {amount} is now payable."),
    "paid": ("Commission paid", "💸 Your commission of {amount} has been paid."),
    "rejected": ("Commission rejected", "⚠️ A commission of {amount} was not approved."),
}


# ─────────────────────────────────────────────────────────────────────────────
# Back Office — rules
# ─────────────────────────────────────────────────────────────────────────────

class AdminCommissionRuleListCreateView(generics.ListCreateAPIView):
    serializer_class = CommissionRuleSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = (
            CommissionRule.objects
            .select_related("casino", "affiliate")
            .prefetch_related("tiers", "conditions")
            .annotate(usage_count=Count("ledger_entries", distinct=True))
        )
        params = self.request.query_params
        if (country := (params.get("country") or "").strip()):
            qs = qs.filter(country__iexact=country)
        if (casino := (params.get("casino") or "").strip()).isdigit():
            qs = qs.filter(casino_id=int(casino))
        if (affiliate := (params.get("affiliate") or "").strip()).isdigit():
            qs = qs.filter(affiliate_id=int(affiliate))
        if (ctype := (params.get("commission_type") or "").strip()):
            qs = qs.filter(commission_type=ctype)
        active = (params.get("is_active") or "").strip().lower()
        if active in ("true", "1"):
            qs = qs.filter(is_active=True)
        elif active in ("false", "0"):
            qs = qs.filter(is_active=False)
        if (search := (params.get("search") or "").strip()):
            qs = qs.filter(Q(name__icontains=search) | Q(country__icontains=search))
        return qs.order_by("-specificity", "-priority", "name")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class AdminCommissionRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = CommissionRule.objects.select_related("casino", "affiliate").prefetch_related("tiers", "conditions")
    serializer_class = CommissionRuleSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminCommissionRuleDuplicateView(APIView):
    """POST .../rules/<id>/duplicate/ — Part 39's "Duplicate rule". Copies the
    rule with its tiers and conditions, deactivated and renamed, so an admin
    can adapt a working configuration for another country without retyping it
    and without risking the copy going live half-configured."""
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, pk):
        try:
            source = CommissionRule.objects.prefetch_related("tiers", "conditions").get(pk=pk)
        except CommissionRule.DoesNotExist:
            return Response({"error": "Rule not found."}, status=404)

        tiers = list(source.tiers.all())
        conditions = list(source.conditions.all())

        source.pk = None
        source.name = f"{source.name} (copy)"
        source.is_active = False
        source.created_by = request.user
        source.save()

        for tier in tiers:
            tier.pk, tier.rule = None, source
            tier.save()
        for condition in conditions:
            condition.pk, condition.rule = None, source
            condition.save()

        return Response(CommissionRuleSerializer(source).data, status=status.HTTP_201_CREATED)


class AdminCommissionRuleResolveView(APIView):
    """GET .../rules/resolve/?affiliate=&country=&casino=&commission_type=
    Answers "which rule would apply here, and why did the others lose?" —
    the Part 34 precedence made inspectable instead of guessed at."""
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        params = request.query_params
        affiliate_id = (params.get("affiliate") or "").strip()
        affiliate = User.objects.filter(pk=affiliate_id).first() if affiliate_id.isdigit() else None
        if not affiliate:
            return Response({"error": "A valid affiliate id is required."}, status=400)

        casino_id = (params.get("casino") or "").strip()
        casino = Casino.objects.filter(pk=casino_id).first() if casino_id.isdigit() else None

        return Response(commission_rule_service.explain_resolution(
            affiliate,
            commission_type=(params.get("commission_type") or "rolling").strip(),
            country=params.get("country") or "",
            casino=casino,
        ))


# ─────────────────────────────────────────────────────────────────────────────
# Back Office — tiers & conditions
# ─────────────────────────────────────────────────────────────────────────────

class AdminCommissionTierListCreateView(generics.ListCreateAPIView):
    serializer_class = CommissionTierSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = CommissionTier.objects.all()
        rule = (self.request.query_params.get("rule") or "").strip()
        return qs.filter(rule_id=int(rule)) if rule.isdigit() else qs


class AdminCommissionTierDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = CommissionTier.objects.all()
    serializer_class = CommissionTierSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminCommissionConditionListCreateView(generics.ListCreateAPIView):
    serializer_class = CommissionConditionSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = CommissionCondition.objects.all()
        rule = (self.request.query_params.get("rule") or "").strip()
        return qs.filter(rule_id=int(rule)) if rule.isdigit() else qs


class AdminCommissionConditionDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = CommissionCondition.objects.all()
    serializer_class = CommissionConditionSerializer
    permission_classes = [IsAdminOrSuperAdmin]


# ─────────────────────────────────────────────────────────────────────────────
# Back Office — ledger & dashboard
# ─────────────────────────────────────────────────────────────────────────────

def _ledger_queryset():
    return CommissionLedgerEntry.objects.select_related(
        "affiliate", "referred_player", "casino", "rule", "tier",
    )


class AdminManualCommissionCreateView(APIView):
    """POST .../commissions/manual/ — grant a Manual / Bonus commission.

    The fourth commission type, and the only one an admin creates by hand.
    Everything financial is decided server-side by
    manual_commission_service.create_manual_commission(): the client states
    who, how much and why, and receives back what was actually committed.

    Admin-only through the same IsAdminOrSuperAdmin the rest of this module
    uses, so an affiliate or player calling it gets 403 from DRF before any
    code here runs.
    """
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request):
        serializer = ManualCommissionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        affiliate = User.objects.filter(pk=data["affiliate"]).first()

        try:
            entry, created = create_manual_commission(
                affiliate=affiliate,
                amount=data["amount"],
                currency=data.get("currency") or "USD",
                reason=data["reason"],
                note=data.get("note") or "",
                idempotency_key=data.get("idempotency_key") or "",
                actor=request.user,
                ip_address=_client_ip(request),
            )
        except ManualCommissionError as exc:
            return Response({"success": False, "error": str(exc)}, status=400)

        # Read the resulting balance back rather than computing it here, so
        # what the admin is shown is what the database actually holds.
        wallet = AffiliateWalletAccount.objects.filter(user=affiliate).first()

        return Response(
            {
                "success": True,
                "message": (
                    "Manual commission added successfully."
                    if created else
                    "This commission was already recorded — no duplicate was created."
                ),
                "created": created,
                "amount": str(entry.commission_amount),
                "currency": entry.currency,
                "available_commission": str(wallet.balance if wallet else Decimal("0")),
                "entry": CommissionLedgerEntrySerializer(entry).data,
            },
            # 201 only when this request is what created it; a de-duplicated
            # repeat is a successful 200, never an error -- the outcome the
            # admin asked for is in place either way.
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AdminCommissionLedgerListView(generics.ListAPIView):
    serializer_class = CommissionLedgerEntrySerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = _ledger_queryset()
        params = self.request.query_params
        if (status_ := (params.get("status") or "").strip()):
            qs = qs.filter(status=status_)
        if (country := (params.get("country") or "").strip()):
            qs = qs.filter(country__iexact=country)
        if (casino := (params.get("casino") or "").strip()).isdigit():
            qs = qs.filter(casino_id=int(casino))
        if (affiliate := (params.get("affiliate") or "").strip()).isdigit():
            qs = qs.filter(affiliate_id=int(affiliate))
        if (ctype := (params.get("commission_type") or "").strip()):
            qs = qs.filter(commission_type=ctype)
        if (search := (params.get("search") or "").strip()):
            qs = qs.filter(
                Q(affiliate__email__icontains=search)
                | Q(affiliate__user_uid__icontains=search)
                | Q(rule_name__icontains=search)
                | Q(reference_id__icontains=search)
            )
        return qs.order_by("-created_at")


class AdminCommissionLedgerUpdateView(generics.UpdateAPIView):
    """PATCH .../ledger/<id>/ — admin_notes only in practice; the serializer
    marks every financial field read-only so a commission amount can never be
    edited after the fact."""
    queryset = _ledger_queryset()
    serializer_class = CommissionLedgerEntrySerializer
    permission_classes = [IsAdminOrSuperAdmin]
    http_method_names = ["patch"]


class AdminCommissionLedgerTransitionView(APIView):
    """POST .../ledger/<id>/transition/ {"status": "approved"}

    The only way an entry's status changes. Enforces ALLOWED_TRANSITIONS, so
    an entry cannot skip from "qualifying" straight to "paid", and keeps the
    linked ReferralCommission money row in step when it reaches paid/rejected.
    """
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, pk):
        try:
            entry = _ledger_queryset().get(pk=pk)
        except CommissionLedgerEntry.DoesNotExist:
            return Response({"error": "Ledger entry not found."}, status=404)

        if entry.commission_type == MANUAL_COMMISSION_TYPE:
            # A manual commission is credited to the affiliate's withdrawable
            # wallet the instant it is granted, so its ledger row records a
            # completed credit rather than a step in the approval flow. Moving
            # it to "rejected" here would change the paperwork while leaving
            # the money where it is -- and the affiliate may already have
            # withdrawn it. Reversals belong to the withdrawal screens, which
            # move real balance.
            return Response(
                {
                    "error": "A manual / bonus commission cannot be moved through the approval flow — "
                             "it was credited to the affiliate's balance when it was created.",
                },
                status=400,
            )

        target = (request.data.get("status") or "").strip()
        if target not in dict(CommissionLedgerEntry._meta.get_field("status").choices):
            return Response({"error": f"Unknown status '{target}'."}, status=400)

        allowed = ALLOWED_TRANSITIONS.get(entry.status, set())
        if target not in allowed:
            return Response(
                {
                    "error": f"Cannot move a '{entry.status}' commission to '{target}'.",
                    "allowed": sorted(allowed),
                },
                status=400,
            )

        now = timezone.now()
        entry.status = target
        entry.reviewed_by = request.user
        if note := (request.data.get("admin_notes") or "").strip():
            entry.admin_notes = note
        if target == "approved":
            entry.approved_at = now
        elif target == "paid":
            entry.paid_at = now
        entry.save()

        # Keep the money row consistent with the audit row.
        commission = entry.referral_commission
        if commission:
            if target == "paid":
                commission.status = "paid"
                commission.paid_at = now
                commission.save(update_fields=["status", "paid_at"])
            elif target in ("rejected", "cancelled"):
                commission.status = "rejected"
                commission.save(update_fields=["status"])

        _notify_status_change(entry, target)

        return Response(CommissionLedgerEntrySerializer(entry).data)


def _notify_status_change(entry, target):
    """Part 41's affiliate notifications, through the existing infrastructure.
    Best-effort — notify_generic already swallows and logs its own failures,
    so a notification problem never rolls back an approved commission."""
    meta = _STATUS_NOTIFICATIONS.get(target)
    if not meta:
        return
    title, template = meta
    amount = f"{entry.currency} {entry.commission_amount:,.2f}"
    lines = [template.format(amount=amount)]
    where = " / ".join(p for p in (entry.country, entry.casino.name if entry.casino else "") if p)
    if where:
        lines.append(f"📍 {where}")
    if entry.qualification_reason and target in ("qualified", "rejected"):
        lines.append(f"📝 {entry.qualification_reason}")
    notify_generic(entry.affiliate, title, "\n".join(lines), icon="commission")


class AdminCommissionDashboardView(APIView):
    """GET .../dashboard/ — the Part 38 tiles plus the country and casino
    breakdowns, all computed with aggregates rather than by loading rows."""
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        from authapp.models.affiliate_models import AffiliateProfile

        entries = CommissionLedgerEntry.objects.all()
        by_status = {
            row["status"]: {"count": row["n"], "amount": row["total"] or Decimal("0")}
            for row in entries.values("status").annotate(n=Count("id"), total=Sum("commission_amount"))
        }

        def bucket(name):
            return by_status.get(name, {"count": 0, "amount": Decimal("0")})

        country_rows = (
            entries.exclude(country="")
            .values("country")
            .annotate(count=Count("id"), amount=Sum("commission_amount"))
            .order_by("-amount")[:25]
        )
        casino_rows = (
            entries.exclude(casino__isnull=True)
            .values("casino__name", "casino__country")
            .annotate(count=Count("id"), amount=Sum("commission_amount"))
            .order_by("-amount")[:25]
        )

        return Response({
            "affiliates": {
                "total": AffiliateProfile.objects.count(),
                "active": AffiliateProfile.objects.filter(is_active=True).count(),
            },
            "rules": {
                "total": CommissionRule.objects.count(),
                "active": CommissionRule.objects.filter(is_active=True).count(),
            },
            "statuses": {name: bucket(name) for name, _ in
                         CommissionLedgerEntry._meta.get_field("status").choices},
            "total_commission_amount": entries.aggregate(t=Sum("commission_amount"))["t"] or Decimal("0"),
            "country_breakdown": [
                {"country": r["country"], "count": r["count"], "amount": r["amount"] or Decimal("0")}
                for r in country_rows
            ],
            "casino_breakdown": [
                {
                    "casino": r["casino__name"], "country": r["casino__country"],
                    "count": r["count"], "amount": r["amount"] or Decimal("0"),
                }
                for r in casino_rows
            ],
        })


# ─────────────────────────────────────────────────────────────────────────────
# Affiliate-facing — always scoped to request.user
# ─────────────────────────────────────────────────────────────────────────────

class AffiliateCommissionSummaryView(APIView):
    """GET /api/affiliate/commissions/summary/ — the Part 40 overview.
    Every query is filtered by request.user; there is no parameter that could
    widen it to another affiliate."""
    permission_classes = [IsAuthenticated, IsAffiliate]

    def get(self, request):
        entries = CommissionLedgerEntry.objects.filter(affiliate=request.user)

        by_status = {
            row["status"]: {"count": row["n"], "amount": row["total"] or Decimal("0")}
            for row in entries.values("status").annotate(n=Count("id"), total=Sum("commission_amount"))
        }

        breakdown = (
            entries.values("country", "casino__name")
            .annotate(count=Count("id"), amount=Sum("commission_amount"))
            .order_by("-amount")[:50]
        )

        referred = User.objects.filter(referred_by=request.user)
        from authapp.services.affiliate_stats_service import get_qualified_user_ids

        return Response({
            "statuses": by_status,
            "total_earned": entries.filter(status__in=("qualified", "approved", "payable", "paid"))
                                   .aggregate(t=Sum("commission_amount"))["t"] or Decimal("0"),
            "total_paid": entries.filter(status="paid").aggregate(t=Sum("commission_amount"))["t"] or Decimal("0"),
            "performance": {
                "referred_players": referred.count(),
                "qualified_players": len(get_qualified_user_ids(request.user)),
            },
            "breakdown": [
                {
                    "country": r["country"] or "—",
                    "casino": r["casino__name"] or "—",
                    "count": r["count"],
                    "amount": r["amount"] or Decimal("0"),
                }
                for r in breakdown
            ],
        })


class AffiliateCommissionLedgerView(generics.ListAPIView):
    """GET /api/affiliate/commissions/ledger/ — this affiliate's own entries."""
    serializer_class = AffiliateCommissionLedgerSerializer
    permission_classes = [IsAuthenticated, IsAffiliate]

    def get_queryset(self):
        qs = CommissionLedgerEntry.objects.filter(
            affiliate=self.request.user,
        ).select_related("casino", "referred_player")
        if (status_ := (self.request.query_params.get("status") or "").strip()):
            qs = qs.filter(status=status_)
        if (country := (self.request.query_params.get("country") or "").strip()):
            qs = qs.filter(country__iexact=country)
        return qs.order_by("-created_at")
