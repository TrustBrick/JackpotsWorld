# authapp/views/admin_wallet_views.py
# ─── UPDATED SECTIONS ONLY — merge these into your existing file ───────────────
#
# CHANGES:
#  1. AdminUserWalletAccountsView  → reads AdminWallet balance + user's wallet
#  2. AdminWalletUpdateView        → debits AdminWallet before crediting user
#  3. New AdminWalletBalanceView   → returns AdminWallet singleton (used by
#                                    the admin panel header balance cards)
#
# Everything else (AdminWalletTransactionListView, AdminWalletValidationListView,
# AdminBonusConfigView) stays exactly the same.

from decimal import Decimal
from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser, IsAuthenticated

import re
from django.db.models import Q

from authapp.models.wallet_models import (
    WalletTransaction, BonusConfig, WalletAccount,
    WalletValidationLog, TXN_WALLET_MAP, VALIDATED_TXN_TYPES,
    TRANSACTION_TYPES,
)
from authapp.models.user_model import ActivityLog
from authapp.models.super_admin_models import AdminWallet  # ← NEW import
from authapp.permissions.admin_role_permissions import HasFinanceAccess

from authapp.serializers.wallet_serializers import (
    WalletTransactionSerializer,
    WalletValidationSerializer,
    BonusConfigSerializer,
    WalletAccountSerializer,
)

import logging
logger = logging.getLogger(__name__)


def get_client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


# ─── Wallet-type helpers ──────────────────────────────────────────────────────

WALLET_TYPE_LABELS = {
    "C":  "cash",
    "NC": "non_cash",
    "O":  "otp",
}

WALLET_META_MAP = {
    "C":  {"label": "Cash",     "abbr": "CASH", "color": "#34d399"},
    "NC": {"label": "Non-Cash", "abbr": "NC",   "color": "#a78bfa"},
    "O":  {"label": "OTP",      "abbr": "OTP",  "color": "#38bdf8"},
    "RP": {"label": "Rolling Points", "abbr": "RP", "color": "#f59e0b"},
}

WALLET_ORDER = {"C": 0, "NC": 1, "O": 2, "RP": 3}

TX_LABELS = {
    "DAC":   "Deposit at Casino",
    "WAC":   "Withdrawal at Casino",
    "TAC":   "Transfer to Casino",
    "LAC":   "Loss at Casino",
    "WIN":   "Winnings",
    "LUB":   "Level Up Bonus",
    "WBA":   "Weekly Bonus",
    "MBA":   "Monthly Bonus",
    "RMB":   "Reimbursement",
    "GBE":   "Gift Encashment",
    "CBG":   "Cashback Gift",
    "CBGNC": "NC Cashback",
    "LUBNC": "NC Bonus",
    "CBGOT": "OTP Cashback",
    "LUBOT": "OTP Bonus",
    "ROP":   "Rolling Points",
    "MAN":   "Manual Override",
    "DEP":   "Deposit to JW",
    "WDL":   "Withdrawal from JW",
}

DEBIT_TYPES = {"WAC", "TAC", "LAC", "WDL"}
WALLET_LABELS = {"C": "Cash", "NC": "Non-Cash", "O": "OTP", "RP": "Rolling Points"}
_CASINO_RE = re.compile(r"\[CASINO:([^\]]+)\]")
_WALLET_RE = re.compile(r"\[([CNC|O|RP]{1,2})\]")


def _parse_casino_note(note: str):
    c = _CASINO_RE.search(note or "")
    w = _WALLET_RE.search(note or "")
    return (c.group(1) if c else None, w.group(1) if w else None)


# ═════════════════════════════════════════════════════════════════════════════
# NEW ▶  AdminWalletBalanceView
# Returns the single AdminWallet row so admin panel header can show balances.
# ═════════════════════════════════════════════════════════════════════════════

class AdminWalletBalanceView(APIView):
    """
    GET /api/admin-panel/wallet/admin-balance/
    Returns the current AdminWallet balances.
    Visible to all staff (admin + superadmin).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({"error": "Forbidden"}, status=403)

        wallet = AdminWallet.get()  # get_or_create singleton
        return Response({
            "cash_balance":     float(wallet.cash_balance),
            "non_cash_balance": float(wallet.non_cash_balance),
            "otp_balance":      float(wallet.otp_balance),
            "updated_at":       wallet.updated_at,
            "updated_by_uid":   wallet.updated_by.user_uid if wallet.updated_by else None,
        })


# ═════════════════════════════════════════════════════════════════════════════
# UPDATED ▶  AdminUserWalletAccountsView
# Now also returns AdminWallet balances so the admin panel can show
# "source wallet" context alongside the user's individual wallet.
# ═════════════════════════════════════════════════════════════════════════════

class AdminUserWalletAccountsView(APIView):
    """
    GET /api/admin-panel/wallet/accounts/user/<user_id>/
    Returns:
      - The user's 4 individual WalletAccount balances
      - The AdminWallet balances (so admin knows what's available to transfer)
    """
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request, user_id):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        # User wallets
        accounts = WalletAccount.objects.filter(user=user)
        accounts = sorted(accounts, key=lambda w: WALLET_ORDER.get(w.wallet_type, 9))

        account_data = []
        for w in accounts:
            meta = WALLET_META_MAP.get(w.wallet_type, {})
            account_data.append({
                "id":             str(w.id),
                "wallet_type":    w.wallet_type,
                "account_number": w.wallet_account_number,
                "label":          meta.get("label", w.wallet_type),
                "abbr":           meta.get("abbr", w.wallet_type),
                "color":          meta.get("color", "#888"),
                "balance":        float(w.balance),
                "last_reason":    w.last_reason,
                "updated_at":     w.updated_at,
                "updated_by_uid": w.updated_by.user_uid if w.updated_by else None,
            })

        # AdminWallet (source of truth)
        admin_wallet = AdminWallet.get()

        return Response({
            "user_uid":    user.user_uid,
            "email":       user.email,
            "accounts":    account_data,
            # ── NEW: admin wallet context ──
            "admin_wallet": {
                "cash_balance":     float(admin_wallet.cash_balance),
                "non_cash_balance": float(admin_wallet.non_cash_balance),
                "otp_balance":      float(admin_wallet.otp_balance),
            },
        })


# ═════════════════════════════════════════════════════════════════════════════
# UPDATED ▶  AdminWalletUpdateView
# Now DEBITS AdminWallet before crediting the user's wallet.
# Rolling Points (RP) are NOT deducted from AdminWallet — they are
# generated internally (no fund source).
# ═════════════════════════════════════════════════════════════════════════════

# Transaction types that come FROM the AdminWallet (deduct before crediting user)
ADMIN_WALLET_SOURCED_TYPES = {
    "LUB", "WBA", "MBA", "RMB", "WIN", "GBE", "CBG",   # Cash
    "CBGNC", "LUBNC",                                    # Non-Cash
    "CBGOT", "LUBOT",                                    # OTP
}

# Transaction types that do NOT deduct from AdminWallet
# (casino-only, RP, or direct JW ops handled elsewhere)
NON_ADMIN_WALLET_TYPES = {
    "DAC", "WAC", "LAC", "TAC",  # handled by casino_wallet_service
    "ROP",                        # rolling points — no fund source
    "DEP", "WDL",                 # direct JW ops (offline deposit view)
}


class AdminWalletUpdateView(APIView):
    """
    POST /api/admin-panel/wallet/update/
    For ADMIN_WALLET_SOURCED_TYPES: atomically debits AdminWallet
    then credits the user's wallet.
    For other types: existing behaviour (direct user wallet update only).
    """
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def post(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        user_id  = request.data.get("user_id")
        txn_type = request.data.get("transaction_type", "").upper()
        note     = request.data.get("note", "")

        try:
            amount = Decimal(str(request.data.get("amount", 0)))
        except Exception:
            return Response({"error": "Invalid amount."}, status=400)

        if amount <= 0:
            return Response({"error": "Amount must be > 0."}, status=400)

        if txn_type not in TXN_WALLET_MAP:
            return Response({"error": f"Unknown transaction type: {txn_type}"}, status=400)

        wallet_type = TXN_WALLET_MAP[txn_type]

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        # ── Bonus validation (LUB / WBA / MBA / LUBNC / LUBOT) ───────────────
        validation_log = None
        if txn_type in VALIDATED_TXN_TYPES:
            try:
                config   = BonusConfig.objects.get(vip_level=user.vip_level, bonus_type=txn_type)
                expected = config.amount
            except BonusConfig.DoesNotExist:
                expected = None

            is_valid      = expected is not None and amount == expected
            rejection     = "" if is_valid else (
                f"Expected ${expected}, got ${amount}." if expected else "No bonus config found."
            )
            validation_log = WalletValidationLog.objects.create(
                user=user,
                transaction_type=txn_type,
                entered_amount=amount,
                expected_amount=expected or 0,
                is_valid=is_valid,
                rejection_reason=rejection,
                validated_by=request.user,
            )
            if not is_valid:
                return Response({"error": rejection}, status=400)

        # ── Atomic: debit AdminWallet (if sourced) + credit user wallet ───────
        with db_transaction.atomic():

            # 1. Debit AdminWallet if this txn type draws from it
            if txn_type in ADMIN_WALLET_SOURCED_TYPES and wallet_type != "RP":
                admin_wallet = AdminWallet.objects.select_for_update().get(pk=1)
                try:
                    admin_wallet.debit(wallet_type, amount)
                except ValueError as exc:
                    return Response({"error": f"AdminWallet insufficient: {exc}"}, status=400)
                admin_wallet.updated_by = request.user
                admin_wallet.save()

            # 2. Credit user wallet
            try:
                wallet = WalletAccount.objects.select_for_update().get(
                    user=user, wallet_type=wallet_type
                )
            except WalletAccount.DoesNotExist:
                return Response({"error": f"{wallet_type} wallet not found for user."}, status=404)

            before         = wallet.balance
            wallet.balance += amount
            wallet.last_reason = txn_type
            wallet.updated_by  = request.user
            wallet.save(update_fields=["balance", "last_reason", "updated_by", "updated_at"])

            # 3. Write WalletTransaction ledger entry
            txn = WalletTransaction.objects.create(
                user=user,
                wallet=wallet,
                transaction_type=txn_type,
                amount=amount,
                balance_before=before,
                balance_after=wallet.balance,
                performed_by=request.user,
                note=note,
                validation_status="approved",
            )

            # 4. Link validation log
            if validation_log:
                validation_log.transaction = txn
                validation_log.save(update_fields=["transaction"])

        # ── Activity log ─────────────────────────────────────────────────────
        admin_wallet_note = (
            f" | AdminWallet debited" if txn_type in ADMIN_WALLET_SOURCED_TYPES else ""
        )
        ActivityLog.log(
            action="wallet_adjusted",
            actor=request.user,
            target_user=user,
            description=f"{txn_type} ${amount} on {wallet_type} wallet.{admin_wallet_note}",
            ip_address=get_client_ip(request),
            meta={"txn_ref": txn.transaction_reference},
        )

        # ── Notify user ───────────────────────────────────────────────────────
        try:
            from authapp.services.notification_service import notify_transaction
            notify_transaction(
                user=user,
                txn_type=txn_type,
                amount=amount,
                wallet_type=wallet_type,
                balance_after=float(wallet.balance),
                casino_name=None,
                extra_note=note,
            )
        except Exception as exc:
            logger.warning("notify failed AdminWalletUpdateView: %s", exc)

        return Response({
            "message":       "Wallet updated.",
            "txn_reference": txn.transaction_reference,
            "new_balance":   float(wallet.balance),
        })


# ═════════════════════════════════════════════════════════════════════════════
# UNCHANGED — kept here for completeness
# ═════════════════════════════════════════════════════════════════════════════

def _serialize_txn(tx) -> dict:
    txn_type  = (tx.transaction_type or "").upper()
    is_debit  = txn_type in DEBIT_TYPES
    casino_name, note_wallet_type = _parse_casino_note(tx.note)
    raw_wtype = note_wallet_type or (tx.wallet.wallet_type if tx.wallet else "C")
    return {
        "id":                    str(tx.id),
        "created_at":            tx.created_at.isoformat(),
        "transaction_reference": tx.transaction_reference,
        "user_name":  tx.user.get_full_name() if hasattr(tx.user, "get_full_name") else str(tx.user),
        "user_uid":   getattr(tx.user, "user_uid", str(tx.user_id)),
        "user_email": tx.user.email if hasattr(tx.user, "email") else None,
        "transaction_type":       txn_type,
        "transaction_type_label": TX_LABELS.get(txn_type, txn_type),
        "cr_dr":                  "DR" if is_debit else "CR",
        "amount":                 abs(float(tx.amount)),
        "wallet_type":  raw_wtype,
        "wallet_label": WALLET_LABELS.get(raw_wtype, raw_wtype),
        "balance_before": float(tx.balance_before),
        "balance_after":  float(tx.balance_after),
        "casino_name":     casino_name,
        "note":            tx.note or "",
        "validation_status": tx.validation_status or "approved",
        "performed_by_name": (
            tx.performed_by.user_uid if tx.performed_by else "System"
        ),
    }


class AdminWalletTransactionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (request.user.is_authenticated and request.user.is_staff):
            return Response({"error": "Forbidden"}, status=403)

        q          = request.query_params.get("q", "").strip()
        txn_type   = request.query_params.get("transaction_type", "").strip().upper()
        wallet_f   = request.query_params.get("wallet_type", "").strip().upper()
        user_id    = request.query_params.get("user_id", "").strip()
        page       = max(int(request.query_params.get("page",      1)), 1)
        per        = max(int(request.query_params.get("page_size", 20)), 1)

        qs = (
            WalletTransaction.objects
            .select_related("user", "wallet", "performed_by")
            .order_by("-created_at")
        )

        if user_id:  qs = qs.filter(user_id=user_id)
        if txn_type: qs = qs.filter(transaction_type__iexact=txn_type)
        if wallet_f:
            qs = qs.filter(
                Q(wallet__wallet_type=wallet_f) |
                Q(note__icontains=f"[{wallet_f}]")
            )
        if q:
            qs = qs.filter(
                Q(transaction_reference__icontains=q) |
                Q(user__email__icontains=q) |
                Q(user__user_uid__icontains=q) |
                Q(note__icontains=q)
            )

        total  = qs.count()
        offset = (page - 1) * per
        items  = qs[offset: offset + per]

        return Response({
            "count":     total,
            "page":      page,
            "page_size": per,
            "results":   [_serialize_txn(tx) for tx in items],
        })


class AdminWalletValidationListView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request):
        qs = WalletValidationLog.objects.select_related(
            "user", "validated_by", "transaction"
        ).order_by("-validated_at")[:100]
        return Response(WalletValidationSerializer(qs, many=True).data)


class AdminBonusConfigView(APIView):
    permission_classes = [IsAdminUser, HasFinanceAccess]

    def get(self, request):
        configs = BonusConfig.objects.all().order_by("vip_level", "bonus_type")
        return Response(BonusConfigSerializer(configs, many=True).data)

    def post(self, request):
        serializer = BonusConfigSerializer(data=request.data)
        if serializer.is_valid():
            obj, created = BonusConfig.objects.update_or_create(
                vip_level=serializer.validated_data["vip_level"],
                bonus_type=serializer.validated_data["bonus_type"],
                defaults={
                    "amount":     serializer.validated_data["amount"],
                    "updated_by": request.user,
                },
            )
            ActivityLog.log(
                action="settings_changed",
                actor=request.user,
                description=(
                    f"{'Created' if created else 'Updated'} BonusConfig "
                    f"VIP {obj.vip_level} / {obj.bonus_type} = ${obj.amount}"
                ),
                ip_address=get_client_ip(request),
                meta={"vip_level": obj.vip_level, "bonus_type": obj.bonus_type, "amount": str(obj.amount)},
            )
            return Response(BonusConfigSerializer(obj).data)
        return Response(serializer.errors, status=400)