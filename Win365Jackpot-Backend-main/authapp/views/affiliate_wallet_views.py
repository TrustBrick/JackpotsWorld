"""
authapp/views/affiliate_wallet_views.py
─────────────────────────────────────────────────────────────────────────────
AFFILIATE-WITHDRAWALS: new module — safe to delete entirely to remove the
feature (paired with affiliate_wallet_models.py / _service.py / _urls.py /
_serializers.py and the small hooks in affiliate_service.py).

  • AffiliateWalletSummaryView          GET  /api/affiliate/wallet/                       (affiliate)
  • AffiliateWithdrawalMethodListView   GET  /api/affiliate/wallet/methods/                (affiliate)
  • AffiliateWithdrawalCreateView       POST /api/affiliate/wallet/withdrawals/            (affiliate)
  • AffiliateWithdrawalListView         GET  /api/affiliate/wallet/withdrawals/            (affiliate)
  • AffiliateWithdrawalCancelView       POST /api/affiliate/wallet/withdrawals/<id>/cancel/ (affiliate)

  • AdminWithdrawalSummaryView          GET  /api/admin-panel/affiliate-withdrawals/summary/        (admin+finance)
  • AdminWithdrawalListView             GET  /api/admin-panel/affiliate-withdrawals/                (admin+finance)
  • AdminWithdrawalDetailView           GET  /api/admin-panel/affiliate-withdrawals/<id>/            (admin+finance)
  • AdminWithdrawalApproveView          POST /api/admin-panel/affiliate-withdrawals/<id>/approve/    (admin+finance)
  • AdminWithdrawalProcessingView       POST /api/admin-panel/affiliate-withdrawals/<id>/processing/ (admin+finance)
  • AdminWithdrawalRejectView           POST /api/admin-panel/affiliate-withdrawals/<id>/reject/     (admin+finance)
  • AdminWithdrawalMarkPaidView         POST /api/admin-panel/affiliate-withdrawals/<id>/mark-paid/  (admin+finance)
  • AdminWithdrawalCancelView           POST /api/admin-panel/affiliate-withdrawals/<id>/cancel/     (admin+finance)
"""
from decimal import Decimal, InvalidOperation

from django.db.models import Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.affiliate_wallet_models import (
    AffiliateWithdrawalMethodConfig,
    AffiliateWithdrawalRequest,
)
from authapp.permissions.admin_role_permissions import HasFinanceAccess
from authapp.permissions.affiliate_permissions import IsAffiliate
from authapp.serializers.affiliate_wallet_serializers import (
    AffiliateWithdrawalMethodConfigSerializer,
    AffiliateWithdrawalRequestListSerializer,
    AffiliateWithdrawalAdminListSerializer,
    AffiliateWithdrawalRequestDetailSerializer,
)
from authapp.services import affiliate_wallet_service as svc
from authapp.services.affiliate_wallet_service import WithdrawalError
from authapp.utils.client_ip import get_client_ip as _resolve_client_ip

PAGE_SIZE = 20


def _client_ip(request):
    return _resolve_client_ip(request)


def _client_ua(request):
    return request.META.get("HTTP_USER_AGENT", "")[:255]


# ─── Affiliate-facing ─────────────────────────────────────────────────────────

class AffiliateWalletSummaryView(APIView):
    permission_classes = [IsAffiliate]

    def get(self, request):
        summary = svc.get_wallet_summary(request.user)
        last_withdrawal = summary["last_withdrawal"]
        return Response({
            "available_balance": summary["available_balance"],
            "locked_for_withdrawal": summary["locked_for_withdrawal"],
            "pending_withdrawals": summary["pending_withdrawals"],
            "processing_withdrawals": summary["processing_withdrawals"],
            "approved_withdrawals": summary["approved_withdrawals"],
            "paid_withdrawals": summary["paid_withdrawals"],
            "rejected_withdrawals": summary["rejected_withdrawals"],
            "cancelled_withdrawals": summary["cancelled_withdrawals"],
            "lifetime_earned": summary["lifetime_earned"],
            "lifetime_paid": summary["lifetime_paid"],
            "last_withdrawal": AffiliateWithdrawalRequestListSerializer(last_withdrawal).data if last_withdrawal else None,
            "minimum_withdrawal_amount": summary["minimum_withdrawal_amount"],
            "is_withdrawal_enabled": summary["is_withdrawal_enabled"],
            "estimated_processing_time_text": summary["estimated_processing_time_text"],
            "processing_notes": summary["processing_notes"],
            "enabled_methods": AffiliateWithdrawalMethodConfigSerializer(summary["enabled_methods"], many=True).data,
        })


class AffiliateWithdrawalMethodListView(APIView):
    """Standalone endpoint mirroring the `enabled_methods` list already
    embedded in the wallet summary — kept separate too since the request
    modal may want to fetch just this without the full summary."""
    permission_classes = [IsAffiliate]

    def get(self, request):
        methods = AffiliateWithdrawalMethodConfig.objects.filter(is_enabled=True)
        return Response({"results": AffiliateWithdrawalMethodConfigSerializer(methods, many=True).data})


class AffiliateWithdrawalCreateView(APIView):
    permission_classes = [IsAffiliate]

    def post(self, request):
        amount = request.data.get("amount")
        method_code = (request.data.get("method_code") or "").strip().upper()
        payment_details = request.data.get("payment_details") or {}

        if amount is None:
            return Response({"error": "amount is required"}, status=400)
        if not method_code:
            return Response({"error": "method_code is required"}, status=400)
        if not isinstance(payment_details, dict):
            return Response({"error": "payment_details must be an object"}, status=400)

        try:
            req = svc.create_withdrawal_request(
                affiliate=request.user, amount=amount, method_code=method_code,
                payment_details=payment_details, ip_address=_client_ip(request), user_agent=_client_ua(request),
            )
        except WithdrawalError as exc:
            return Response({"error": str(exc)}, status=400)

        return Response({
            "message": f"Withdrawal request {req.request_reference} submitted.",
            "request": AffiliateWithdrawalRequestListSerializer(req).data,
        }, status=201)


class AffiliateWithdrawalListView(APIView):
    permission_classes = [IsAffiliate]

    def get(self, request):
        status_filter = (request.GET.get("status") or "").strip().lower()
        page = max(1, int(request.GET.get("page", 1) or 1))

        qs = AffiliateWithdrawalRequest.objects.filter(affiliate=request.user).select_related("method")
        if status_filter:
            qs = qs.filter(status=status_filter)

        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]

        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": AffiliateWithdrawalRequestListSerializer(page_items, many=True).data,
        })


class AffiliateWithdrawalCancelView(APIView):
    permission_classes = [IsAffiliate]

    def post(self, request, pk):
        req = AffiliateWithdrawalRequest.objects.filter(pk=pk, affiliate=request.user).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)

        try:
            req = svc.cancel_withdrawal_request(request_obj=req, actor=request.user, ip_address=_client_ip(request))
        except WithdrawalError as exc:
            return Response({"error": str(exc)}, status=400)

        return Response({
            "message": f"Withdrawal request {req.request_reference} cancelled.",
            "request": AffiliateWithdrawalRequestListSerializer(req).data,
        })


# ─── Admin-facing (Back Office) ──────────────────────────────────────────────

class _AdminWithdrawalBase(APIView):
    """All views here move real money leaving the platform, so staff must
    also hold the finance capability — same contract as admin_wallet_views.py
    and admin_offline_deposit_views.py."""
    permission_classes = [IsAdminUser, HasFinanceAccess]


class AdminWithdrawalSummaryView(_AdminWithdrawalBase):
    def get(self, request):
        qs = AffiliateWithdrawalRequest.objects.all()

        def _agg(status_val):
            sub = qs.filter(status=status_val)
            return {"total": sub.aggregate(total=Sum("amount"))["total"] or Decimal("0"), "count": sub.count()}

        return Response({
            "pending": _agg("pending"),
            "processing": _agg("processing"),
            "approved": _agg("approved"),
            "paid": _agg("paid"),
            "rejected": _agg("rejected"),
            "cancelled": _agg("cancelled"),
            "total_requests": qs.count(),
        })


class AdminWithdrawalListView(_AdminWithdrawalBase):
    def get(self, request):
        q = (request.GET.get("q") or "").strip()
        status_filter = (request.GET.get("status") or "").strip().lower()
        method_filter = (request.GET.get("method") or "").strip().upper()
        date_from = request.GET.get("date_from")
        date_to = request.GET.get("date_to")
        page = max(1, int(request.GET.get("page", 1) or 1))

        qs = AffiliateWithdrawalRequest.objects.select_related("affiliate", "method", "reviewed_by").order_by("-requested_at")

        if status_filter:
            qs = qs.filter(status=status_filter)
        if method_filter:
            qs = qs.filter(method__code=method_filter)
        if q:
            qs = qs.filter(
                Q(request_reference__icontains=q)
                | Q(affiliate__name__icontains=q)
                | Q(affiliate__email__icontains=q)
                | Q(affiliate__user_uid__icontains=q)
                | Q(txn_hash__icontains=q)
            )
        if date_from:
            parsed = parse_datetime(date_from) or None
            if parsed:
                qs = qs.filter(requested_at__gte=parsed)
        if date_to:
            parsed = parse_datetime(date_to) or None
            if parsed:
                qs = qs.filter(requested_at__lte=parsed)

        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]

        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": AffiliateWithdrawalAdminListSerializer(page_items, many=True).data,
        })


class AdminWithdrawalDetailView(_AdminWithdrawalBase):
    def get(self, request, pk):
        req = AffiliateWithdrawalRequest.objects.select_related(
            "affiliate", "method", "reviewed_by",
        ).prefetch_related("status_history", "status_history__changed_by").filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        return Response(AffiliateWithdrawalRequestDetailSerializer(req).data)


class AdminWithdrawalApproveView(_AdminWithdrawalBase):
    def post(self, request, pk):
        req = AffiliateWithdrawalRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        try:
            req = svc.admin_approve(
                request_obj=req, actor=request.user,
                note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request),
            )
        except WithdrawalError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Request approved.", "request": AffiliateWithdrawalAdminListSerializer(req).data})


class AdminWithdrawalProcessingView(_AdminWithdrawalBase):
    def post(self, request, pk):
        req = AffiliateWithdrawalRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        try:
            req = svc.admin_move_to_processing(
                request_obj=req, actor=request.user,
                note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request),
            )
        except WithdrawalError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Request moved to processing.", "request": AffiliateWithdrawalAdminListSerializer(req).data})


class AdminWithdrawalRejectView(_AdminWithdrawalBase):
    def post(self, request, pk):
        req = AffiliateWithdrawalRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        reason = (request.data.get("reason") or "").strip()
        try:
            req = svc.admin_reject(request_obj=req, actor=request.user, reason=reason, ip_address=_client_ip(request))
        except WithdrawalError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Request rejected.", "request": AffiliateWithdrawalAdminListSerializer(req).data})


class AdminWithdrawalMarkPaidView(_AdminWithdrawalBase):
    def post(self, request, pk):
        req = AffiliateWithdrawalRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)

        txn_hash = (request.data.get("txn_hash") or "").strip()
        payment_date_raw = request.data.get("payment_date")
        payment_date = parse_datetime(payment_date_raw) if payment_date_raw else None

        try:
            req = svc.admin_mark_paid(
                request_obj=req, actor=request.user, txn_hash=txn_hash, payment_date=payment_date,
                note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request),
            )
        except WithdrawalError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Request marked as paid.", "request": AffiliateWithdrawalAdminListSerializer(req).data})


class AdminWithdrawalCancelView(_AdminWithdrawalBase):
    def post(self, request, pk):
        req = AffiliateWithdrawalRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        try:
            req = svc.admin_cancel(
                request_obj=req, actor=request.user,
                note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request),
            )
        except WithdrawalError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Request cancelled.", "request": AffiliateWithdrawalAdminListSerializer(req).data})
