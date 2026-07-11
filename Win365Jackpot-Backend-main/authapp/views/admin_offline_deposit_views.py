"""
authapp/views/admin_offline_deposit_views.py — CORRECT MONEY FLOW

CORRECT FLOW — ONE WRITE PER OPERATION, NO DOUBLE COUNTING:
════════════════════════════════════════════════════════════════════

MAIN ACCOUNT TAB (Admin Wallet ↔ User Main):
  DMA  → Admin Wallet ▼  +  User Main ▲         (admin tops up user)
  WMA  → User Main ▼  +  Admin Wallet ▲          (admin withdraws from user)

CASINO CREDIT TAB (NO admin wallet, NO main wallet double-write):
  DAC  → User Main ▼  +  Casino ▲               (user deposits to casino)
  WIN/LUB/WBA/MBA/RMB/GBE/CBG → Casino ▲ ONLY  (winnings/bonuses in casino only)
         [user gets funds to main wallet only when they WAC to withdraw]

CASINO DEBIT TAB:
  WAC  → Casino ▼  +  User Main ▲               (withdraw from casino to main)
  LAC  → Casino ▼ ONLY                           (lost — just deduct casino)

TRANSFER TAB:
  TAC  → Casino A ▼  +  Casino B ▲              (between casinos only)

WHAT WAS WRONG BEFORE:
  - WIN/LUB/etc were calling _credit_main() → double crediting main wallet
  - DAC was calling credit_casino AND credit_main → double counting
  - This caused the duplicate entries visible in transaction history
════════════════════════════════════════════════════════════════════
"""

from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction as db_transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from collections import defaultdict

from authapp.models import ActivityLog
from authapp.models.wallet_models import WalletAccount, WalletTransaction
from authapp.models.offline_deposit import OfflineDepositLog
from authapp.models.casino_models import Casino
from authapp.models.casino_wallet_models import CasinoWalletAccount
from authapp.utils.account_number import generate_account_number
from authapp.services.casino_wallet_service import (
    credit_casino_wallet,
    debit_casino_wallet,
)
from authapp.models.super_admin_models import AdminWallet

import logging
logger = logging.getLogger(__name__)
User = get_user_model()

# ── Admin Wallet field map ────────────────────────────────────────────────────
ADMIN_WALLET_FIELD = {
    "C":  "cash_balance",
    "NC": "non_cash_balance",
    "O":  "otp_balance",
}

# ── VIP CONFIG ────────────────────────────────────────────────────────────────
VIP_CONFIG = {
    1: {"label": "VIP",              "rp_rate": 1.00, "rolling_pct": 1.00, "lu_points": 5_000},
    2: {"label": "VIP Bronze",       "rp_rate": 1.05, "rolling_pct": 0.95, "lu_points": 15_000},
    3: {"label": "Silver",           "rp_rate": 1.11, "rolling_pct": 0.90, "lu_points": 30_000},
    4: {"label": "Gold",             "rp_rate": 1.18, "rolling_pct": 0.85, "lu_points": 75_000},
    5: {"label": "Jackpot I",        "rp_rate": 1.25, "rolling_pct": 0.80, "lu_points": 150_000},
    6: {"label": "Jackpot II",       "rp_rate": 1.33, "rolling_pct": 0.75, "lu_points": 350_000},
    7: {"label": "Jackpot III",      "rp_rate": 1.43, "rolling_pct": 0.70, "lu_points": 750_000},
    8: {"label": "Jackpot Platinum", "rp_rate": 1.50, "rolling_pct": 0.60, "lu_points": 1_500_000},
    9: {"label": "Jackpot Diamond",  "rp_rate": 1.50, "rolling_pct": 0.60, "lu_points": 9_999_999_999},
}
MAX_VIP = 9


def get_vip_from_rp(total_rp: Decimal) -> int:
    thresholds = [
        (Decimal("1500000"), 9), (Decimal("750000"), 8),
        (Decimal("350000"),  7), (Decimal("150000"), 6),
        (Decimal("75000"),   5), (Decimal("30000"),  4),
        (Decimal("15000"),   3), (Decimal("5000"),   2),
    ]
    for threshold, level in thresholds:
        if total_rp >= threshold:
            return level
    return 1


# ── Transaction type sets ─────────────────────────────────────────────────────
MAIN_ACCOUNT_CREDIT = {"DMA"}   # Admin Wallet ▼  →  User Main ▲
MAIN_ACCOUNT_DEBIT  = {"WMA"}   # User Main ▼  →  Admin Wallet ▲

CASINO_DEPOSIT      = {"DAC"}   # User Main ▼  →  Casino ▲  (move to casino)
# CASINO_CREDIT_ONLY  = {"WIN", "LUB", "WBA", "MBA", "RMB", "GBE", "CBG"} 
CASINO_CREDIT_ONLY  = {"WIN"}  # Casino ▲ ONLY
CASINO_WITHDRAW     = {"WAC"}   # Casino ▼  →  User Main ▲  (withdraw back)
CASINO_LOSS         = {"LAC"}   # Casino ▼ ONLY             (lost at casino)
TRANSFER_TYPES      = {"TAC"}   # Casino A ▼  →  Casino B ▲


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _is_admin(user) -> bool:
    """
    All views in this file move real money, so staff must also hold the
    finance capability (AdminProfile.can_manage_finance) — superusers
    always pass via HasFinanceAccess's own bypass.
    """
    from authapp.permissions.admin_role_permissions import _has_capability
    return user.is_authenticated and user.is_staff and _has_capability(user, "can_manage_finance")


def _get_or_create_wallet(user, wallet_type: str) -> WalletAccount:
    """
    Must be called inside a @transaction.atomic block (every caller in this
    file is). Locks the row after get_or_create so concurrent credit/debit
    requests against the same user's wallet serialize instead of losing an
    update.
    """
    acct, _ = WalletAccount.objects.get_or_create(
        user=user,
        wallet_type=wallet_type,
        defaults={
            "wallet_account_number": generate_account_number(wallet_type),
            "balance": Decimal("0"),
        },
    )
    return WalletAccount.objects.select_for_update().get(pk=acct.pk)


def _credit_main(user, wallet_type, amount, txn_type, note, actor) -> float:
    """Credit user's main wallet. Returns new balance."""
    acct   = _get_or_create_wallet(user, wallet_type)
    amount = Decimal(str(amount))
    before = acct.balance
    acct.balance += amount
    acct.last_reason = txn_type
    acct.updated_by  = actor
    acct.save(update_fields=["balance", "last_reason", "updated_by", "updated_at"])
    WalletTransaction.objects.create(
        user=user, wallet=acct, transaction_type=txn_type,
        amount=amount, balance_before=before, balance_after=acct.balance,
        performed_by=actor, note=note, validation_status="approved",
    )
    try:
        from authapp.services.notification_service import notify_transaction
        notify_transaction(
            user=user, txn_type=txn_type, amount=amount,
            wallet_type=wallet_type, balance_after=acct.balance,
            casino_name=None, extra_note=note,
        )
    except Exception as e:
        logger.warning("notify_transaction failed: %s", e)
    return float(acct.balance)


def _debit_main(user, wallet_type, amount, txn_type, note, actor) -> float:
    """Debit user's main wallet. Raises ValueError if insufficient."""
    acct   = _get_or_create_wallet(user, wallet_type)
    amount = Decimal(str(amount))
    if acct.balance < amount:
        raise ValueError(
            f"Insufficient main {wallet_type} balance "
            f"(available: ${acct.balance:,.2f}, required: ${amount:,.2f})"
        )
    before = acct.balance
    acct.balance -= amount
    acct.last_reason = txn_type
    acct.updated_by  = actor
    acct.save(update_fields=["balance", "last_reason", "updated_by", "updated_at"])
    WalletTransaction.objects.create(
        user=user, wallet=acct, transaction_type=txn_type,
        amount=amount, balance_before=before, balance_after=acct.balance,
        performed_by=actor, note=note, validation_status="approved",
    )
    try:
        from authapp.services.notification_service import notify_transaction
        if txn_type != "DAC":   # 🔥 prevent duplicate for deposit
            notify_transaction(
                user=user, txn_type=txn_type, amount=amount,
                wallet_type=wallet_type, balance_after=acct.balance,
                casino_name=None, extra_note=note,
            )
    except Exception as e:
        logger.warning("notify_transaction failed: %s", e)
    return float(acct.balance)


def _write_rp_txn(user, amount: Decimal, txn_type: str, note: str, actor) -> float:
    acct, _ = WalletAccount.objects.get_or_create(
        user=user, wallet_type="RP",
        defaults={
            "wallet_account_number": generate_account_number("RP"),
            "balance": Decimal("0"),
        },
    )
    acct = WalletAccount.objects.select_for_update().get(pk=acct.pk)
    before = acct.balance
    acct.balance += amount
    acct.last_reason = txn_type
    acct.updated_by  = actor
    acct.save(update_fields=["balance", "last_reason", "updated_by", "updated_at"])
    WalletTransaction.objects.create(
        user=user, wallet=acct, transaction_type=txn_type,
        amount=amount, balance_before=before, balance_after=acct.balance,
        performed_by=actor, note=note, validation_status="approved",
    )
    return float(acct.balance)


def _log_offline(user, txn_type, casino, wallet_type, amount, main_balance, actor, note="", transfer_to=None):
    try:
        tag = f"[{wallet_type}] {txn_type} ${amount}"
        if transfer_to:
            tag += f" → {transfer_to}"
        if note:
            tag += f" | {note}"
        OfflineDepositLog.objects.create(
            user=user,
            entry_type="cash",
            casino_name=casino or "",
            vip_level_at_time=getattr(user, "vip_level", 1) or 1,
            note=tag,
            available_balance=Decimal(str(main_balance)) if main_balance is not None else Decimal("0"),
            recorded_by=actor,
        )
    except Exception as exc:
        logger.warning("OfflineDepositLog write failed: %s", exc)


def _resolve_player_casino_wallet(user, casino_name: str, country: str):
    """
    Looks up the player's Cash (C) casino wallet for the given casino name.
    Returns (wallet, None) on success, or (None, error_message) on failure —
    distinguishing "never had this casino at all" from "has it, but for a
    different country" so the correct ❌ message can be shown.
    """
    wallet = CasinoWalletAccount.objects.filter(
        user=user, casino_name=casino_name, wallet_type="C",
    ).first()

    if not wallet:
        return None, "❌ This player is not registered for the selected casino."

    if wallet.country and wallet.country != country:
        return None, "❌ This player has never played in the selected country."

    return wallet, None


def _deduct_admin_wallet(wallet_type, amount, actor):
    """Deduct from AdminWallet. Raises ValueError if insufficient."""
    field = ADMIN_WALLET_FIELD.get(wallet_type)
    if not field:
        return
    aw     = AdminWallet.objects.select_for_update().get(pk=1)
    aw_bal = Decimal(str(getattr(aw, field, 0)))
    if aw_bal < amount:
        raise ValueError(
            f"Insufficient Admin Wallet {wallet_type} balance. "
            f"Available: ${aw_bal:,.2f}, Required: ${amount:,.2f}. "
            f"Ask Super Admin to top up."
        )
    setattr(aw, field, aw_bal - amount)
    aw.updated_by = actor
    aw.save(update_fields=[field, "updated_by", "updated_at"])


def _return_to_admin_wallet(wallet_type, amount, actor):
    """Return funds to AdminWallet."""
    field = ADMIN_WALLET_FIELD.get(wallet_type)
    if not field:
        return
    aw     = AdminWallet.objects.select_for_update().get(pk=1)
    aw_bal = Decimal(str(getattr(aw, field, 0)))
    setattr(aw, field, aw_bal + amount)
    aw.updated_by = actor
    aw.save(update_fields=[field, "updated_by", "updated_at"])


# ─── Main view ────────────────────────────────────────────────────────────────

class AdminOfflineDepositsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)

        user_id    = request.query_params.get("user_id")
        entry_type = request.query_params.get("type")
        page       = int(request.query_params.get("page", 1))
        per        = int(request.query_params.get("page_size", 20))

        qs = (
            OfflineDepositLog.objects
            .select_related("user", "recorded_by")
            .order_by("-created_at")
        )
        if user_id:    qs = qs.filter(user_id=user_id)
        if entry_type: qs = qs.filter(entry_type=entry_type)

        total = qs.count()
        items = qs[(page - 1) * per: page * per]
        return Response({"count": total, "results": [_serialize_log(d) for d in items]})

    @db_transaction.atomic
    def post(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)

        data       = request.data
        user_id    = data.get("user_id")
        entry_type = data.get("type", "cash")

        if not user_id:
            return Response({"error": "user_id required"}, status=400)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        actor = request.user

        # ══════════════════════════════════════════════════════════════════════
        #  CASH OPERATIONS
        # ══════════════════════════════════════════════════════════════════════
        if entry_type == "cash":
            casino      = (data.get("casino_name") or "").strip()
            wallet_type = (data.get("wallet_type") or "C").strip().upper()
            amount_raw  = data.get("amount", 0)
            txn_type    = (data.get("transaction_type") or "").strip().upper()
            transfer_to = (data.get("transfer_to_casino") or "").strip()
            note        = (data.get("note") or "").strip()
            country     = (data.get("country") or "").strip()
            to_country  = (data.get("transfer_to_country") or "").strip()



            if not txn_type:
                return Response({"error": "transaction_type required"}, status=400)
            if wallet_type not in ("C", "NC", "O"):
                return Response({"error": "wallet_type must be C, NC, or O"}, status=400)

            amount = Decimal(str(amount_raw))
            if amount <= 0:
                return Response({"error": "amount must be > 0"}, status=400)

            # ──────────────────────────────────────────────────────────────────
            # DMA — Admin Wallet ▼  →  User Main ▲
            # ──────────────────────────────────────────────────────────────────
            if txn_type in MAIN_ACCOUNT_CREDIT:
                try:
                    _deduct_admin_wallet(wallet_type, amount, actor)
                except ValueError as exc:
                    return Response({"error": str(exc)}, status=400)
                new_main_bal = _credit_main(user, wallet_type, amount, txn_type,
                                            note or "Admin deposit to main account", actor)
                _log_offline(user=user, txn_type=txn_type, casino="MainAccount",
                             wallet_type=wallet_type, amount=amount,
                             main_balance=new_main_bal, actor=actor, note=note)
                ActivityLog.log(
                    action="wallet_credit", actor=actor, target_user=user,
                    description=f"DMA ${amount:,.2f} {wallet_type} — Admin wallet ▼, User main ▲",
                    ip_address=request.META.get("REMOTE_ADDR"),
                    amount=amount, cr_dr="CR", wallet_type=wallet_type,
                )
                return Response({
                    "message":      f"✅ ${amount:,.2f} credited to user's main {wallet_type} wallet.",
                    "main_balance": new_main_bal,
                })

            # ──────────────────────────────────────────────────────────────────
            # WMA — User Main ▼  →  Admin Wallet ▲
            # ──────────────────────────────────────────────────────────────────
            if txn_type in MAIN_ACCOUNT_DEBIT:
                try:
                    new_main_bal = _debit_main(user, wallet_type, amount, txn_type,
                                               note or "Admin withdrawal from main account", actor)
                except ValueError as exc:
                    return Response({"error": str(exc)}, status=400)
                _return_to_admin_wallet(wallet_type, amount, actor)
                _log_offline(user=user, txn_type=txn_type, casino="MainAccount",
                             wallet_type=wallet_type, amount=amount,
                             main_balance=new_main_bal, actor=actor, note=note)
                ActivityLog.log(
                    action="wallet_debit", actor=actor, target_user=user,
                    description=f"WMA ${amount:,.2f} {wallet_type} — User main ▼, Admin wallet ▲",
                    ip_address=request.META.get("REMOTE_ADDR"),
                    amount=amount, cr_dr="DR", wallet_type=wallet_type,
                )
                return Response({
                    "message":      f"✅ ${amount:,.2f} debited from user's main {wallet_type} wallet.",
                    "main_balance": new_main_bal,
                })

            # All casino ops require casino_name
            if not casino:
                return Response({"error": "casino_name required for this transaction type"}, status=400)

            # ──────────────────────────────────────────────────────────────────
            # DAC — User Main ▼  →  Casino ▲
            # User deposits their main wallet funds into casino
            # ONE debit from main, ONE credit to casino — nothing else
            # ──────────────────────────────────────────────────────────────────
            if txn_type in CASINO_DEPOSIT:
                try:
                    new_main_bal = _debit_main(user, wallet_type, amount, txn_type,
                                               note or f"Deposit at {casino}", actor)
                except ValueError as exc:
                    return Response({"error": f"User main wallet: {exc}"}, status=400)
                casino_result = credit_casino_wallet(
                    user, casino, wallet_type, amount, actor, txn_type,
                    note=note or f"Deposit at {casino}",
                    country=country or None,
                )
                _log_offline(user=user, txn_type=txn_type, casino=casino,
                             wallet_type=wallet_type, amount=amount,
                             main_balance=new_main_bal, actor=actor, note=note)
                ActivityLog.log(
                    action="casino_transfer", actor=actor, target_user=user,
                    description=f"DAC ${amount:,.2f} {wallet_type}: User main ▼ → {casino} casino ▲",
                    ip_address=request.META.get("REMOTE_ADDR"),
                    amount=amount, cr_dr="DR", wallet_type=wallet_type, casino_name=casino,
                )
                return Response({
                    "message":        f"✅ DAC ${amount:,.2f} — User main ▼ → {casino} casino ▲.",
                    "main_balance":   new_main_bal,
                    "casino_balance": casino_result["casino_balance"],
                    "casino_txn_id":  casino_result["casino_txn_id"],
                    "unified_ref":    casino_result["unified_ref"],
                })

            # ──────────────────────────────────────────────────────────────────
            # WIN / LUB / WBA / MBA / RMB / GBE / CBG
            # Casino Wallet ▲ ONLY
            # Winnings and bonuses go into casino wallet ONLY
            # Main wallet is NOT touched — user withdraws via WAC when ready
            # ──────────────────────────────────────────────────────────────────
            if txn_type == "WIN":
                try:
                    _deduct_admin_wallet("C", amount, actor)  # 🔥 deduct admin wallet
                except ValueError as exc:
                    return Response({"error": str(exc)}, status=400)

                # Credit casino wallet ONLY
                wallet_type = "C"  # 🔥 force cash

                credit_casino_wallet(
                    user,
                    casino,
                    wallet_type,
                    amount,
                    actor,
                    txn_type,
                    note=note or "Casino winnings (admin cash funded)",
                    country=country or None,
                )

                ActivityLog.log(
                    action="casino_win_credit",
                    actor=actor,
                    target_user=user,
                    description=f"WIN ${amount:,.2f} → Casino {casino} (Admin Wallet deducted)",
                    ip_address=request.META.get("REMOTE_ADDR"),
                    amount=amount,
                    wallet_type="C",
                    cr_dr="DR",
                )

                return Response({
                    "message": f"✅ ${amount:,.2f} credited to casino wallet (Admin funded WIN)."
                })

            # ──────────────────────────────────────────────────────────────────
            # WAC — Casino ▼  →  User Main ▲
            # User withdraws from casino back to main wallet
            # ──────────────────────────────────────────────────────────────────
            if txn_type in CASINO_WITHDRAW:
                try:
                    casino_result = debit_casino_wallet(
                        user, casino, wallet_type, amount, actor, txn_type,
                        note=note or f"Withdrawal from {casino}",
                        country=country or None,
                    )
                except ValueError as exc:
                    return Response({"error": f"Casino wallet: {exc}"}, status=400)
                # Prefix with casino name so the user-facing transaction list
                # (which de-dupes this row against casino_wallet_service's
                # internal "[CASINO:...]" audit row) has it without needing
                # to parse tags: displays as "Casino Name | note".
                new_main_bal = _credit_main(user, wallet_type, amount, txn_type,
                                            f"{casino} | {note or f'Withdrawal from {casino}'}", actor)
                _log_offline(user=user, txn_type=txn_type, casino=casino,
                             wallet_type=wallet_type, amount=amount,
                             main_balance=new_main_bal, actor=actor, note=note)
                ActivityLog.log(
                    action="wallet_credit", actor=actor, target_user=user,
                    description=f"WAC ${amount:,.2f} {wallet_type}: {casino} casino ▼ → User main ▲",
                    ip_address=request.META.get("REMOTE_ADDR"),
                    amount=amount, cr_dr="CR", wallet_type=wallet_type, casino_name=casino,
                )
                return Response({
                    "message":        f"✅ WAC ${amount:,.2f} — {casino} casino ▼ → user main ▲.",
                    "main_balance":   new_main_bal,
                    "casino_balance": casino_result["casino_balance"],
                    "casino_txn_id":  casino_result["casino_txn_id"],
                    "unified_ref":    casino_result["unified_ref"],
                })

            # ──────────────────────────────────────────────────────────────────
            # LAC — Casino ▼ ONLY
            # Money lost at casino — only casino balance decreases
            # Main wallet is NOT touched
            # ──────────────────────────────────────────────────────────────────
            if txn_type in CASINO_LOSS:
                try:
                    casino_result = debit_casino_wallet(
                        user, casino, wallet_type, amount, actor, txn_type,
                        note=note or f"Lost at {casino}",
                        country=country or None,
                    )
                except ValueError as exc:
                    return Response({"error": f"Casino wallet: {exc}"}, status=400)
                _log_offline(user=user, txn_type=txn_type, casino=casino,
                             wallet_type=wallet_type, amount=amount,
                             main_balance=None, actor=actor, note=note)
                ActivityLog.log(
                    action="wallet_debit", actor=actor, target_user=user,
                    description=f"LAC ${amount:,.2f} {wallet_type}: {casino} casino ▼ (loss)",
                    ip_address=request.META.get("REMOTE_ADDR"),
                    amount=amount, cr_dr="DR", wallet_type=wallet_type, casino_name=casino,
                )
                return Response({
                    "message":        f"✅ LAC ${amount:,.2f} — {casino} casino ▼ (lost).",
                    "casino_balance": casino_result["casino_balance"],
                    "casino_txn_id":  casino_result["casino_txn_id"],
                    "unified_ref":    casino_result["unified_ref"],
                })

            # ──────────────────────────────────────────────────────────────────
            # TAC — Casino A ▼  →  Casino B ▲
            # Transfer between casinos only, nothing else changes
            # ──────────────────────────────────────────────────────────────────
            if txn_type in TRANSFER_TYPES:
                if not transfer_to:
                    return Response({"error": "transfer_to_casino required for TAC"}, status=400)
                if transfer_to == casino:
                    return Response({"error": "Source and destination casino must differ"}, status=400)
                try:
                    from_result = debit_casino_wallet(
                        user, casino, wallet_type, amount, actor, "TAC",
                        note=f"Transfer {casino} → {transfer_to}",
                        country=country or None,
                    )
                except ValueError as exc:
                    return Response({"error": f"Source casino: {exc}"}, status=400)
                to_result = credit_casino_wallet(
                    user, transfer_to, wallet_type, amount, actor, "TAC",
                    note=f"Transfer from {casino}",
                    country=to_country or None,
                )
                _log_offline(user=user, txn_type="TAC", casino=casino,
                             wallet_type=wallet_type, amount=amount, main_balance=None,
                             actor=actor, note=note or f"Transfer {casino} → {transfer_to}",
                             transfer_to=transfer_to)
                ActivityLog.log(
                    action="casino_transfer", actor=actor, target_user=user,
                    description=f"TAC ${amount:,.2f} {wallet_type}: {casino} → {transfer_to}",
                    ip_address=request.META.get("REMOTE_ADDR"),
                    amount=amount, cr_dr="DR", wallet_type=wallet_type, casino_name=casino,
                )
                return Response({
                    "message":             f"✅ TAC ${amount:,.2f} transferred {casino} → {transfer_to} ({wallet_type}).",
                    "from_casino_balance": from_result["casino_balance"],
                    "to_casino_balance":   to_result["casino_balance"],
                })

            return Response({"error": f"Unknown transaction_type: {txn_type}"}, status=400)

        # ══════════════════════════════════════════════════════════════════════
        #  ROLLING POINTS
        # ══════════════════════════════════════════════════════════════════════
        elif entry_type == "rolling_points":
            slip_number  = (data.get("slip_number") or "").strip()
            betting_date = data.get("betting_date") or None
            casino       = (data.get("casino_name") or "").strip()
            country      = (data.get("country") or "").strip()
            note         = (data.get("note") or "").strip()
            num_bets     = int(data.get("total_bets") or 0)
            bet_amount   = Decimal(str(data.get("total_bet_amount") or 0))

            ip = request.META.get("REMOTE_ADDR")

            def _reject(message):
                ActivityLog.log(
                    action="rolling_points_rejected", actor=actor, target_user=user,
                    description=(
                        f"Rejected rolling points entry — {message} "
                        f"(casino={casino!r}, country={country!r})"
                    ),
                    ip_address=ip, casino_name=casino or None,
                )
                return Response({"error": message}, status=400)

            # ── Business validation: only allow casinos the player has actually
            # deposited into, in the country that deposit was actually made in.
            # Backend-enforced regardless of what the frontend already filtered.
            if not casino or not country:
                return _reject("❌ This player is not registered for the selected casino.")

            # Betting date must be exactly today — no backdated or future entries.
            today = timezone.now().date()
            if betting_date and str(betting_date) != str(today):
                return _reject("❌ Only today's date is allowed for betting entries.")

            # Casino must actually belong to the selected country (reference catalog).
            if not Casino.objects.filter(country=country, name=casino, is_active=True).exists():
                return _reject(f"❌ {casino} does not belong to {country}.")

            wallet, wallet_err = _resolve_player_casino_wallet(user, casino, country)
            if wallet_err:
                return _reject(wallet_err)
            if not wallet.is_active:
                return _reject("❌ Casino wallet is inactive.")
            if wallet.balance <= 0:
                return _reject("❌ Player has insufficient casino wallet balance.")

            if bet_amount <= 0 and not data.get("rolling_points_manual"):
                return _reject("❌ Invalid betting amount.")

            current_vip_level = int(data.get("vip_level", getattr(user, "vip_level", 1) or 1))
            vip_cfg  = VIP_CONFIG.get(current_vip_level, VIP_CONFIG[1])
            rp_rate  = Decimal(str(vip_cfg["rp_rate"]))
            roll_pct = Decimal(str(vip_cfg["rolling_pct"]))

            if slip_number:
                if OfflineDepositLog.objects.filter(slip_number=slip_number).exists():
                    return _reject(f"❌ Slip number '{slip_number}' already exists")

            manual_override = data.get("rolling_points_manual")
            if manual_override:
                rp_added = Decimal(str(manual_override))
            elif bet_amount > 0:
                rp_added = (bet_amount / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            else:
                return _reject("❌ Invalid betting amount.")

            if rp_added <= 0:
                return _reject("❌ Invalid betting amount.")

            current_total      = Decimal(str(getattr(user, "rolling_points_total", 0) or 0))
            new_total          = current_total + rp_added
            rp_note            = f"{casino} | {num_bets} bets | ${bet_amount} bet amount | RP rate {rp_rate}"
            old_vip_level      = getattr(user, "vip_level", 1) or 1
            new_vip_level      = get_vip_from_rp(new_total)
            level_up_triggered = new_vip_level > old_vip_level

            rp_wallet_balance = _write_rp_txn(user, rp_added, "ROP", rp_note, actor)

            # Per-casino RP total — kept separate per casino/country wallet so
            # entries never mix across casinos (fix D.2).
            wallet.rolling_points = (wallet.rolling_points or Decimal("0")) + rp_added
            wallet.save(update_fields=["rolling_points"])

            try:
                from authapp.services.notification_service import notify_transaction
                notify_transaction(
                    user=user, txn_type="ROP", amount=rp_added,
                    wallet_type="rolling_points", balance_after=rp_wallet_balance,
                    casino_name=casino, extra_note=f"{num_bets} bets | ${bet_amount} wagered",
                )
            except Exception as e:
                logger.warning("RP notification failed: %s", e)

            user.rolling_points_total = new_total
            update_fields = ["rolling_points_total"]
            if level_up_triggered:
                user.vip_level = new_vip_level
                update_fields.append("vip_level")
            user.save(update_fields=update_fields)

            try:
                from authapp.models.gift_level_models import UserLevel, PointsLog
                user_level, _ = UserLevel.objects.get_or_create(
                    user=user, defaults={"level": 1, "points": 0}
                )
                pts_before = user_level.points
                user_level.points     = int(new_total)
                user_level.updated_by = actor
                lvl_changed = user_level.recalculate_level()
                user_level.save()
                PointsLog.objects.create(
                    user=user, points_added=int(rp_added),
                    points_before=pts_before, points_after=int(new_total),
                    level_before=old_vip_level, level_after=user_level.level,
                    leveled_up=lvl_changed,
                    reason=f"RP sync from casino slip {slip_number} at {casino}",
                    recorded_by=actor,
                )
            except Exception as e:
                logger.warning("UserLevel sync failed: %s", e)

            if level_up_triggered:
                _notify_level_up(user, new_vip_level, float(new_total), VIP_CONFIG[new_vip_level]["lu_points"])

            log = OfflineDepositLog.objects.create(
                user=user, entry_type="rolling_points", casino_name=casino,
                vip_level_at_time=old_vip_level,
                slip_number=slip_number or None, betting_date=betting_date or None,
                total_bets=num_bets, total_bet_amount=bet_amount,
                rp_rate=float(rp_rate), rolling_pct=float(roll_pct),
                rolling_points_added=float(rp_added), rolling_points_total=float(new_total),
                levelup_points_needed=VIP_CONFIG[new_vip_level]["lu_points"],
                level_up_triggered=level_up_triggered, note=note, recorded_by=actor,
            )

            ActivityLog.log(
                action="rolling_points_added", actor=actor, target_user=user,
                description=(
                    f"{casino} | slip={slip_number} | ${bet_amount} bet amt | "
                    f"+{rp_added} RP → total {new_total} | VIP {old_vip_level} → {new_vip_level}"
                ),
                ip_address=request.META.get("REMOTE_ADDR"),
            )

            msg = f"+{float(rp_added):,.2f} RP added. Total: {float(new_total):,.2f}"
            if level_up_triggered:
                msg += f" ✅ Auto-upgraded to {VIP_CONFIG[new_vip_level]['label']}!"

            return Response({
                "message":              msg,
                "log_id":               log.id,
                "rp_added":             float(rp_added),
                "rolling_points_total": float(new_total),
                "level_up_triggered":   level_up_triggered,
                "new_vip_level":        new_vip_level,
                "rp_wallet_balance":    rp_wallet_balance,
                "casino_rolling_points": float(wallet.rolling_points),
            })

        return Response({"error": f"Unknown entry type: {entry_type}"}, status=400)


# ─── Slip check endpoint ──────────────────────────────────────────────────────

class AdminCheckSlipView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)
        slip = (request.query_params.get("slip_number") or "").strip()
        if not slip:
            return Response({"error": "slip_number required"}, status=400)
        exists = OfflineDepositLog.objects.filter(slip_number=slip).exists()
        return Response({"exists": exists, "slip_number": slip})


# ─── Notification helpers ─────────────────────────────────────────────────────

def _notify_level_up(user, vip_level, current_rp, lu_points):
    try:
        from authapp.services.notification_service import notify_generic
        notify_generic(
            user=user, title="VIP Level Up 🎉",
            message=(
                f"🎉 Congratulations!\n"
                f"You reached {VIP_CONFIG[vip_level]['label']}\n"
                f"⭐ Total RP: {int(current_rp)}"
            ),
            icon="crown",
        )
    except Exception as e:
        logger.warning("Level up notification failed: %s", e)


def _serialize_log(d) -> dict:
    return {
        "id":                    d.id,
        "created_at":            d.created_at,
        "entry_type":            d.entry_type,
        "casino_name":           d.casino_name,
        "vip_level_at_time":     d.vip_level_at_time,
        "total_deposited":       float(d.total_deposited   or 0),
        "total_won":             float(d.total_won         or 0),
        "total_withdrawn":       float(d.total_withdrawn   or 0),
        "available_balance":     float(d.available_balance or 0),
        "total_bets":            d.total_bets or 0,
        "total_bet_amount":      float(d.total_bet_amount  or 0),
        "rp_rate":               float(d.rp_rate           or 1.0),
        "rolling_pct":           float(d.rolling_pct       or 1.0),
        "rolling_points_added":  float(d.rolling_points_added  or 0),
        "rolling_points_total":  float(d.rolling_points_total  or 0),
        "levelup_points_needed": d.levelup_points_needed or 5000,
        "level_up_triggered":    d.level_up_triggered,
        "slip_number":           getattr(d, "slip_number",  None),
        "betting_date":          getattr(d, "betting_date", None),
        "note":                  d.note,
        "recorded_by":           d.recorded_by.user_uid if d.recorded_by else None,
    }


# ─── Sub-views ────────────────────────────────────────────────────────────────

class AdminDepositHistoryView(AdminOfflineDepositsView):
    pass


class AdminCasinoListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)

        user_id = request.query_params.get("user_id")

        # Player-scoped mode (used by Rolling Points): only casinos where this
        # player actually has an active, funded Cash wallet — grouped by the
        # country that deposit was actually recorded in. Rows whose `country`
        # predates this field (blank, legacy) are omitted rather than guessed.
        if user_id:
            wallets = (
                CasinoWalletAccount.objects
                .filter(user_id=user_id, wallet_type="C", is_active=True, balance__gt=0)
                .exclude(country="")
                .order_by("casino_name")
            )
            grouped = defaultdict(list)
            seen = set()
            for w in wallets:
                key = (w.country, w.casino_name)
                if key in seen:
                    continue
                seen.add(key)
                grouped[w.country].append({
                    "name": w.casino_name,
                    "location": "",
                    "wallet_balance": float(w.balance),
                })
            return Response({"casinos": dict(grouped)})

        # Default (unfiltered) mode — unchanged, used by Cash Wallet tab.
        grouped = defaultdict(list)
        for c in Casino.objects.filter(is_active=True):
            grouped[c.country].append({"name": c.name, "location": c.location})
        return Response({"casinos": dict(grouped)})