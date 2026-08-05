"""
authapp/views/wallet_request_views.py
─────────────────────────────────────────────────────────────────────────────
WALLET-REQUESTS: new module — safe to delete entirely to remove the feature.

  • WalletRequestSummaryView          GET  /api/wallet/requests/summary/            (user)
  • DepositMethodListView              GET  /api/wallet/deposit-requests/methods/    (user)
  • DepositCasinoListView              GET  /api/wallet/deposit-requests/casinos/    (user)
  • DepositRequestCreateView           POST /api/wallet/deposit-requests/create/     (user)
  • DepositRequestListView             GET  /api/wallet/deposit-requests/            (user)
  • DepositRequestCancelView           POST /api/wallet/deposit-requests/<id>/cancel/ (user)
  • WithdrawalRequestCreateView        POST /api/wallet/withdrawal-requests/create/  (user)
  • WithdrawalRequestListView          GET  /api/wallet/withdrawal-requests/         (user)
  • WithdrawalRequestCancelView        POST /api/wallet/withdrawal-requests/<id>/cancel/ (user)

  • AdminDepositRequestSummaryView     GET  /api/admin-panel/deposit-requests/summary/        (admin+finance)
  • AdminDepositRequestListView        GET  /api/admin-panel/deposit-requests/                (admin+finance)
  • AdminDepositRequestDetailView      GET  /api/admin-panel/deposit-requests/<id>/            (admin+finance)
  • AdminDepositRequestApproveView     POST /api/admin-panel/deposit-requests/<id>/approve/    (admin+finance)
  • AdminDepositRequestProcessingView  POST /api/admin-panel/deposit-requests/<id>/processing/ (admin+finance)
  • AdminDepositRequestRejectView      POST /api/admin-panel/deposit-requests/<id>/reject/     (admin+finance)
  • AdminDepositRequestCancelView      POST /api/admin-panel/deposit-requests/<id>/cancel/     (admin+finance)
  • AdminDepositRequestExportView      GET  /api/admin-panel/deposit-requests/export/          (admin+finance)

  • AdminWithdrawalRequestSummaryView     GET  /api/admin-panel/withdrawal-requests/summary/        (admin+finance)
  • AdminWithdrawalRequestListView        GET  /api/admin-panel/withdrawal-requests/                (admin+finance)
  • AdminWithdrawalRequestDetailView      GET  /api/admin-panel/withdrawal-requests/<id>/            (admin+finance)
  • AdminWithdrawalRequestApproveView     POST /api/admin-panel/withdrawal-requests/<id>/approve/    (admin+finance)
  • AdminWithdrawalRequestProcessingView  POST /api/admin-panel/withdrawal-requests/<id>/processing/ (admin+finance)
  • AdminWithdrawalRequestRejectView      POST /api/admin-panel/withdrawal-requests/<id>/reject/     (admin+finance)
  • AdminWithdrawalRequestPaidView        POST /api/admin-panel/withdrawal-requests/<id>/paid/       (admin+finance)
  • AdminWithdrawalRequestCancelView      POST /api/admin-panel/withdrawal-requests/<id>/cancel/     (admin+finance)
  • AdminWithdrawalRequestExportView      GET  /api/admin-panel/withdrawal-requests/export/          (admin+finance)
"""
import csv
from decimal import Decimal

from django.db.models import Q, Sum
from django.http import HttpResponse
from rest_framework import permissions
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.casino_models import Casino
from authapp.models.wallet_request_models import (
    DepositRequest,
    WalletRequestMethodConfig,
    WithdrawalRequest,
)
from authapp.permissions.admin_role_permissions import HasFinanceAccess
from authapp.serializers.wallet_request_serializers import (
    DepositRequestAdminListSerializer,
    DepositRequestDetailSerializer,
    DepositRequestListSerializer,
    WalletRequestMethodConfigSerializer,
    WithdrawalRequestAdminListSerializer,
    WithdrawalRequestDetailSerializer,
    WithdrawalRequestListSerializer,
)
from authapp.services import wallet_request_service as svc
from authapp.services.wallet_request_service import WalletRequestError
from authapp.utils.client_ip import get_client_ip as _resolve_client_ip

PAGE_SIZE = 20


def _client_ip(request):
    return _resolve_client_ip(request)


# ─── User-facing ──────────────────────────────────────────────────────────────

class WalletRequestSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        summary = svc.get_wallet_request_summary(request.user)
        return Response({
            "cash_balance": summary["cash_balance"],
            "locked_for_withdrawal": summary["locked_for_withdrawal"],
            "available_for_withdrawal": summary["available_for_withdrawal"],
            "enabled_deposit_methods": WalletRequestMethodConfigSerializer(summary["enabled_deposit_methods"], many=True).data,
        })


class DepositMethodListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        methods = WalletRequestMethodConfig.objects.filter(is_enabled=True)
        return Response({"results": WalletRequestMethodConfigSerializer(methods, many=True).data})


class DepositCasinoListView(APIView):
    """Read-only active-casino list for the deposit request modal's optional
    Casino field. Distinct from AdminCasinoListView (admin-panel-only,
    scoped to a specific player's existing casino wallets) — this is a
    plain public catalog list, same source data (Casino model), just
    exposed to authenticated users for a form dropdown."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        casinos = Casino.objects.filter(is_active=True).order_by("country", "name")
        return Response({"results": [
            {"id": c.id, "name": c.name, "country": c.country} for c in casinos
        ]})


class DepositRequestCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        amount = request.data.get("amount")
        casino_id = request.data.get("casino_id")
        method_code = (request.data.get("method_code") or "").strip().upper()
        notes = request.data.get("notes") or ""

        if amount is None:
            return Response({"error": "amount is required"}, status=400)
        if not method_code:
            return Response({"error": "method_code is required"}, status=400)

        casino = None
        if casino_id:
            casino = Casino.objects.filter(pk=casino_id, is_active=True).first()
            if not casino:
                return Response({"error": "Selected casino was not found."}, status=400)

        try:
            req = svc.create_deposit_request(
                user=request.user, amount=amount, casino=casino, method_code=method_code,
                payment_reference="", notes=notes, ip_address=_client_ip(request),
            )
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)

        return Response({
            "message": f"Deposit request {req.request_reference} submitted.",
            "request": DepositRequestListSerializer(req).data,
        }, status=201)


class DepositRequestListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        status_filter = (request.GET.get("status") or "").strip().lower()
        page = max(1, int(request.GET.get("page", 1) or 1))

        qs = DepositRequest.objects.filter(user=request.user).select_related("casino", "method", "wallet_transaction")
        if status_filter:
            qs = qs.filter(status=status_filter)

        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]

        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": DepositRequestListSerializer(page_items, many=True).data,
        })


class DepositRequestCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        req = DepositRequest.objects.filter(pk=pk, user=request.user).first()
        if not req:
            return Response({"error": "Deposit request not found."}, status=404)
        try:
            req = svc.cancel_deposit_request(request_obj=req, actor=request.user, ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({
            "message": f"Deposit request {req.request_reference} cancelled.",
            "request": DepositRequestListSerializer(req).data,
        })


class WithdrawalCasinoBalanceView(APIView):
    """Read-only lookup for the withdrawal request modal's Casino Wallet
    Available Balance display — same casino catalog as DepositCasinoListView,
    resolved against the user's CasinoWalletAccount(wallet_type=Cash)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        casino_id = request.GET.get("casino_id")
        casino = Casino.objects.filter(pk=casino_id, is_active=True).first() if casino_id else None
        if not casino:
            return Response({"error": "Selected casino was not found."}, status=400)
        balance = svc.get_casino_cash_balance(request.user, casino)
        locked = svc.get_casino_locked_withdrawal_amount(request.user, casino)
        return Response({
            "casino_id": casino.id, "casino_name": casino.name,
            "balance": balance, "locked": locked, "available": balance - locked,
        })


class WithdrawalRequestCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        amount = request.data.get("amount")
        notes = request.data.get("notes") or ""
        casino_id = request.data.get("casino_id")
        method_code = (request.data.get("method_code") or "").strip().upper()

        if amount is None:
            return Response({"error": "amount is required"}, status=400)
        if not casino_id:
            return Response({"error": "casino_id is required"}, status=400)
        if not method_code:
            return Response({"error": "method_code is required"}, status=400)

        casino = Casino.objects.filter(pk=casino_id, is_active=True).first()
        if not casino:
            return Response({"error": "Selected casino was not found."}, status=400)

        try:
            req = svc.create_withdrawal_request(
                user=request.user, amount=amount, casino=casino, method_code=method_code,
                notes=notes, ip_address=_client_ip(request),
            )
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({
            "message": f"Withdrawal request {req.request_reference} submitted.",
            "request": WithdrawalRequestListSerializer(req).data,
        }, status=201)


class WithdrawalRequestListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        status_filter = (request.GET.get("status") or "").strip().lower()
        page = max(1, int(request.GET.get("page", 1) or 1))

        qs = WithdrawalRequest.objects.filter(user=request.user).select_related("wallet_transaction")
        if status_filter:
            qs = qs.filter(status=status_filter)

        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]

        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": WithdrawalRequestListSerializer(page_items, many=True).data,
        })


class WithdrawalRequestCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        req = WithdrawalRequest.objects.filter(pk=pk, user=request.user).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        try:
            req = svc.cancel_withdrawal_request(request_obj=req, actor=request.user, ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({
            "message": f"Withdrawal request {req.request_reference} cancelled.",
            "request": WithdrawalRequestListSerializer(req).data,
        })


# ─── Admin-facing (Back Office) ──────────────────────────────────────────────

class _AdminWalletRequestBase(APIView):
    """All views here move real money or reveal financial data, so staff
    must also hold the finance capability — same contract as
    admin_wallet_views.py, admin_offline_deposit_views.py, and the
    affiliate withdrawal admin views."""
    permission_classes = [IsAdminUser, HasFinanceAccess]


def _apply_common_filters(qs, request, name_field_prefix="user"):
    q = (request.GET.get("q") or "").strip()
    status_filter = (request.GET.get("status") or "").strip().lower()
    if status_filter:
        qs = qs.filter(status=status_filter)
    if q:
        qs = qs.filter(
            Q(request_reference__icontains=q)
            | Q(**{f"{name_field_prefix}__name__icontains": q})
            | Q(**{f"{name_field_prefix}__email__icontains": q})
            | Q(**{f"{name_field_prefix}__user_uid__icontains": q})
        )
    return qs


# ── Deposit requests (admin) ──

class AdminDepositRequestSummaryView(_AdminWalletRequestBase):
    def get(self, request):
        qs = DepositRequest.objects.all()

        def _agg(status_val):
            sub = qs.filter(status=status_val)
            return {"total": sub.aggregate(t=Sum("amount"))["t"] or Decimal("0"), "count": sub.count()}

        import datetime
        today = datetime.date.today()
        approved_today = qs.filter(status="approved", processed_at__date=today)

        return Response({
            "pending": _agg("pending"),
            "processing": _agg("processing"),
            "approved": _agg("approved"),
            "rejected": _agg("rejected"),
            "cancelled": _agg("cancelled"),
            "approved_today": {
                "total": approved_today.aggregate(t=Sum("amount"))["t"] or Decimal("0"),
                "count": approved_today.count(),
            },
            "total_requested": qs.aggregate(t=Sum("amount"))["t"] or Decimal("0"),
            "total_approved": qs.filter(status="approved").aggregate(t=Sum("amount"))["t"] or Decimal("0"),
            "total_outstanding": qs.filter(status__in=DepositRequest.OPEN_STATUSES).aggregate(t=Sum("amount"))["t"] or Decimal("0"),
            "total_requests": qs.count(),
        })


class AdminDepositRequestListView(_AdminWalletRequestBase):
    def get(self, request):
        qs = DepositRequest.objects.select_related("user", "casino", "method", "reviewed_by").order_by("-requested_at")
        qs = _apply_common_filters(qs, request)
        page = max(1, int(request.GET.get("page", 1) or 1))
        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]
        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": DepositRequestAdminListSerializer(page_items, many=True).data,
        })


class AdminDepositRequestDetailView(_AdminWalletRequestBase):
    def get(self, request, pk):
        req = DepositRequest.objects.select_related(
            "user", "casino", "method", "reviewed_by", "wallet_transaction",
        ).prefetch_related("status_history", "status_history__changed_by").filter(pk=pk).first()
        if not req:
            return Response({"error": "Deposit request not found."}, status=404)
        return Response(DepositRequestDetailSerializer(req).data)


class AdminDepositRequestApproveView(_AdminWalletRequestBase):
    def post(self, request, pk):
        req = DepositRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Deposit request not found."}, status=404)
        try:
            req = svc.admin_approve_deposit(request_obj=req, actor=request.user,
                                             note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Deposit approved.", "request": DepositRequestAdminListSerializer(req).data})


class AdminDepositRequestProcessingView(_AdminWalletRequestBase):
    def post(self, request, pk):
        req = DepositRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Deposit request not found."}, status=404)
        try:
            req = svc.admin_move_deposit_processing(request_obj=req, actor=request.user,
                                                      note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Deposit moved to processing.", "request": DepositRequestAdminListSerializer(req).data})


class AdminDepositRequestRejectView(_AdminWalletRequestBase):
    def post(self, request, pk):
        req = DepositRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Deposit request not found."}, status=404)
        reason = (request.data.get("reason") or "").strip()
        try:
            req = svc.admin_reject_deposit(request_obj=req, actor=request.user, reason=reason, ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Deposit rejected.", "request": DepositRequestAdminListSerializer(req).data})


class AdminDepositRequestCancelView(_AdminWalletRequestBase):
    def post(self, request, pk):
        req = DepositRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Deposit request not found."}, status=404)
        try:
            req = svc.admin_cancel_deposit(request_obj=req, actor=request.user,
                                            note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Deposit request cancelled.", "request": DepositRequestAdminListSerializer(req).data})


class AdminDepositRequestExportView(_AdminWalletRequestBase):
    def get(self, request):
        qs = DepositRequest.objects.select_related("user", "casino", "method").order_by("-requested_at")
        qs = _apply_common_filters(qs, request)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = "attachment; filename=deposit_requests.csv"
        writer = csv.writer(response)
        writer.writerow(["Reference", "User", "User ID", "Amount", "Casino", "Payment Method", "Status", "Requested At", "Notes"])
        for r in qs:
            writer.writerow([
                r.request_reference, r.user.email, r.user.user_uid, r.amount,
                r.casino.name if r.casino else "", r.method.label if r.method else "",
                r.status, r.requested_at, r.notes,
            ])
        return response


# ── Withdrawal requests (admin) ──

class AdminWithdrawalRequestSummaryView(_AdminWalletRequestBase):
    def get(self, request):
        qs = WithdrawalRequest.objects.all()

        def _agg(status_val):
            sub = qs.filter(status=status_val)
            return {"total": sub.aggregate(t=Sum("amount"))["t"] or Decimal("0"), "count": sub.count()}

        import datetime
        today = datetime.date.today()
        paid_today = qs.filter(status="paid", processed_at__date=today)

        return Response({
            "pending": _agg("pending"),
            "processing": _agg("processing"),
            "approved": _agg("approved"),
            "rejected": _agg("rejected"),
            "paid": _agg("paid"),
            "cancelled": _agg("cancelled"),
            "paid_today": {
                "total": paid_today.aggregate(t=Sum("amount"))["t"] or Decimal("0"),
                "count": paid_today.count(),
            },
            "total_requested": qs.aggregate(t=Sum("amount"))["t"] or Decimal("0"),
            "total_approved": qs.filter(status__in=("approved", "paid")).aggregate(t=Sum("amount"))["t"] or Decimal("0"),
            "total_outstanding": qs.filter(status__in=WithdrawalRequest.OPEN_STATUSES).aggregate(t=Sum("amount"))["t"] or Decimal("0"),
            "total_requests": qs.count(),
        })


class AdminWithdrawalRequestListView(_AdminWalletRequestBase):
    def get(self, request):
        qs = WithdrawalRequest.objects.select_related("user", "reviewed_by").order_by("-requested_at")
        qs = _apply_common_filters(qs, request)
        page = max(1, int(request.GET.get("page", 1) or 1))
        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]
        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": WithdrawalRequestAdminListSerializer(page_items, many=True).data,
        })


class AdminWithdrawalRequestDetailView(_AdminWalletRequestBase):
    def get(self, request, pk):
        req = WithdrawalRequest.objects.select_related(
            "user", "reviewed_by", "wallet_transaction",
        ).prefetch_related("status_history", "status_history__changed_by").filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        return Response(WithdrawalRequestDetailSerializer(req).data)


class AdminWithdrawalRequestApproveView(_AdminWalletRequestBase):
    def post(self, request, pk):
        req = WithdrawalRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        try:
            req = svc.admin_approve_withdrawal(request_obj=req, actor=request.user,
                                                note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Withdrawal approved.", "request": WithdrawalRequestAdminListSerializer(req).data})


class AdminWithdrawalRequestProcessingView(_AdminWalletRequestBase):
    def post(self, request, pk):
        req = WithdrawalRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        try:
            req = svc.admin_move_withdrawal_processing(request_obj=req, actor=request.user,
                                                         note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Withdrawal moved to processing.", "request": WithdrawalRequestAdminListSerializer(req).data})


class AdminWithdrawalRequestRejectView(_AdminWalletRequestBase):
    def post(self, request, pk):
        req = WithdrawalRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        reason = (request.data.get("reason") or "").strip()
        try:
            req = svc.admin_reject_withdrawal(request_obj=req, actor=request.user, reason=reason, ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Withdrawal rejected.", "request": WithdrawalRequestAdminListSerializer(req).data})


class AdminWithdrawalRequestPaidView(_AdminWalletRequestBase):
    def post(self, request, pk):
        req = WithdrawalRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        try:
            req = svc.admin_mark_withdrawal_paid(request_obj=req, actor=request.user,
                                                  note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Withdrawal marked as paid.", "request": WithdrawalRequestAdminListSerializer(req).data})


class AdminWithdrawalRequestCancelView(_AdminWalletRequestBase):
    def post(self, request, pk):
        req = WithdrawalRequest.objects.filter(pk=pk).first()
        if not req:
            return Response({"error": "Withdrawal request not found."}, status=404)
        try:
            req = svc.admin_cancel_withdrawal(request_obj=req, actor=request.user,
                                               note=(request.data.get("note") or "").strip(), ip_address=_client_ip(request))
        except WalletRequestError as exc:
            return Response({"error": str(exc)}, status=400)
        return Response({"message": "Withdrawal request cancelled.", "request": WithdrawalRequestAdminListSerializer(req).data})


class AdminWithdrawalRequestExportView(_AdminWalletRequestBase):
    def get(self, request):
        qs = WithdrawalRequest.objects.select_related("user").order_by("-requested_at")
        qs = _apply_common_filters(qs, request)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = "attachment; filename=withdrawal_requests.csv"
        writer = csv.writer(response)
        writer.writerow(["Reference", "User", "User ID", "Wallet", "Amount", "Status", "Requested At", "Notes"])
        for r in qs:
            writer.writerow([
                r.request_reference, r.user.email, r.user.user_uid, r.wallet_type,
                r.amount, r.status, r.requested_at, r.notes,
            ])
        return response
