"""
authapp/views/wallet_views.py
────────────────────────────────────────────────────────────────────────────
User-facing wallet endpoints (accessed by the logged-in user, not admin).

GET /wallet/balances/      → returns all 4 wallet accounts with real account numbers
GET /wallet/transactions/  → paginated transaction history for current user
GET /wallet/validations/   → validation log for current user
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model

from authapp.models.wallet_models import WalletAccount, WalletTransaction, WalletValidationLog
from authapp.utils.account_number import generate_account_number
from django.db.models import Sum
from authapp.models.casino_wallet_models import CasinoWalletAccount

User = get_user_model()

WALLET_ORDER = {"C": 0, "NC": 1, "O": 2, "RP": 3}
WALLET_META  = {
    "C":  {"wallet_type_key": "cash",           "label": "Cash",           "abbr": "CASH", "color": "#34d399", "desc": "Casino deposits & winnings"},
    "NC": {"wallet_type_key": "non_cash",        "label": "Non-Cash",       "abbr": "NC",   "color": "#60a5fa", "desc": "Bonuses & rewards"},
    "O":  {"wallet_type_key": "otp",             "label": "OTP",            "abbr": "OTP",  "color": "#a78bfa", "desc": "OTP promotional credits"},
    "RP": {"wallet_type_key": "rolling_points",  "label": "Rolling Points", "abbr": "RP",   "color": "#f59e0b", "desc": "Non-redeemable loyalty points"},
}

# Map from wallet_type DB value to metadata
WALLET_TYPE_MAP = {
    "C":  "cash",
    "NC": "non_cash",
    "O":  "otp",
    "RP": "rolling_points",
}


class UserWalletBalancesView(APIView):
    """
    GET /wallet/balances/
    Returns all 4 wallet accounts for the authenticated user.
    Creates any missing accounts on the fly (safety net if signals didn't fire).
    Account numbers use the real format: {PREFIX}{DDMMYY}{SS}{ms+offset}
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        # Ensure all 4 wallets exist
        for wtype in ["C", "NC", "O", "RP"]:
            WalletAccount.objects.get_or_create(
                user=user,
                wallet_type=wtype,
                defaults={"wallet_account_number": generate_account_number(wtype), "balance": 0}
            )

        wallets = WalletAccount.objects.filter(user=user).select_related("updated_by")
        wallets = sorted(wallets, key=lambda w: WALLET_ORDER.get(w.wallet_type, 9))

        accounts = []
        for w in wallets:
            meta = WALLET_META.get(w.wallet_type, {})
            accounts.append({
                "id":             str(w.id),
                "wallet_type":    WALLET_TYPE_MAP.get(w.wallet_type, w.wallet_type.lower()),
                "wallet_type_raw":w.wallet_type,
                "account_number": w.wallet_account_number,
                "label":          meta.get("label", w.wallet_type),
                "abbr":           meta.get("abbr",  w.wallet_type),
                "color":          meta.get("color", "#888"),
                "desc":           meta.get("desc",  ""),
                "balance":        float(w.balance),
                "last_reason":    w.last_reason,
                "updated_at":     w.updated_at.isoformat() if w.updated_at else None,
                "updated_by":     w.updated_by.user_uid if w.updated_by else None,
            })
            # ─── MAIN BALANCE CALCULATION ─────────────────────────────

            # Cash wallet (main account)
            cash_acct = next((w for w in wallets if w.wallet_type == "C"), None)
            main_balance = float(cash_acct.balance) if cash_acct else 0.0

            # Sum all casino cash wallets
            casino_cash_total = (
                CasinoWalletAccount.objects
                .filter(user=user, wallet_type="C")
                .aggregate(total=Sum("balance"))["total"] or 0
            )

            total_main_balance = main_balance + float(casino_cash_total)

        return Response({
            "user_uid":             user.user_uid,
            "vip_level":            getattr(user, "vip_level", 1),
            "rolling_points_total": float(getattr(user, "rolling_points_total", 0) or 0),
            "accounts":             accounts,
            "main_balance": main_balance,
            "total_main_balance": total_main_balance,
        })
# Casino wallets
class UserCasinoWalletBalancesView(APIView):
    """
    GET /wallet/casino-balances/
    Returns only casino wallets that have a non-zero balance for the
    authenticated user, grouped by casino name.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from authapp.models.casino_wallet_models import CasinoWalletAccount

        user = request.user
        # Only fetch wallets with balance > 0
        qs = (
            CasinoWalletAccount.objects
            .filter(user=user, balance__gt=0)
            .order_by("casino_name", "wallet_type")
        )

        # Group by casino name
        grouped = {}
        for acct in qs:
            if acct.casino_name not in grouped:
                grouped[acct.casino_name] = {
                    "casino_name": acct.casino_name,
                    "wallets": [],
                }
            meta = WALLET_META.get(acct.wallet_type, {})
            grouped[acct.casino_name]["wallets"].append({
                "wallet_type":     acct.wallet_type,
                "wallet_type_key": WALLET_TYPE_MAP.get(acct.wallet_type, acct.wallet_type.lower()),
                "label":           meta.get("label", acct.wallet_type),
                "color":           meta.get("color", "#888"),
                "balance":         float(acct.balance),
                "updated_at":      acct.updated_at.isoformat() if acct.updated_at else None,
            })

        return Response({
            "casinos": list(grouped.values()),
            "has_casino_balances": len(grouped) > 0,
        })


class UserWalletTransactionListView(APIView):
    """
    GET /wallet/transactions/?page=1&page_size=15&wallet_type=cash&type=DAC&q=search
    """
    permission_classes = [IsAuthenticated]

    TX_CR_DR = {
        "DAC":   "CR",
        "WIN":   "CR",
        "LUB":   "CR",
        "WBA":   "CR",
        "MBA":   "CR",
        "RMB":   "CR",
        "GBE":   "CR",
        "CBG":   "CR",
        "CBGNC": "CR",
        "LUBNC": "CR",
        "CBGOT": "CR",
        "LUBOT": "CR",
        "ROP":   "CR",
        "WAC":   "DR",
        "TAC":   "DR",
        "LAC":   "DR",
    }

    TX_LABELS = {
        "DAC":   "Deposit at Casino",
        "WAC":   "Withdrawal at Casino",
        "TAC":   "Transfer to Casino",
        "LAC":   "Loss at Casino",
        "LUB":   "Level Up Bonus",
        "WBA":   "Weekly Bonus",
        "MBA":   "Monthly Bonus",
        "RMB":   "Reimbursement",
        "WIN":   "Winnings",
        "GBE":   "Gift Encashment",
        "CBG":   "Cashback Gift",
        "CBGNC": "Non-Cash Cashback",
        "LUBNC": "Non-Cash Bonus",
        "CBGOT": "OTP Cashback",
        "LUBOT": "OTP Bonus",
        "ROP":   "Rolling Points",
    }

    def get(self, request):
        user = request.user

        page     = max(int(request.query_params.get("page",      1)),  1)
        per      = max(int(request.query_params.get("page_size", 15)), 1)
        wtype    = request.query_params.get("wallet_type", "")
        txn_type = request.query_params.get("type", "")
        search   = request.query_params.get("q", "")

        qs = (
            WalletTransaction.objects
            .filter(user=user)
            .select_related("wallet", "performed_by")
            .order_by("-created_at")
        )

        if wtype and wtype.lower() != "all":
            # Frontend sends "cash"/"non_cash"/"otp"/"rolling_points"
            # DB stores "C"/"NC"/"O"/"RP" — reverse-map it
            REVERSE_MAP = {
                "cash":           "C",
                "non_cash":       "NC",
                "otp":            "O",
                "rolling_points": "RP",
            }
            db_wtype = REVERSE_MAP.get(wtype, wtype.upper())
            qs = qs.filter(wallet__wallet_type=db_wtype)

        if txn_type and txn_type.lower() != "all":
            qs = qs.filter(transaction_type__iexact=txn_type)

        if search:
            qs = qs.filter(transaction_reference__icontains=search)

        total  = qs.count()
        offset = (page - 1) * per
        items  = qs[offset: offset + per]

        results = []
        for tx in items:
            raw_wtype = tx.wallet.wallet_type if tx.wallet else "C"
            cr_dr     = self.TX_CR_DR.get(tx.transaction_type, "CR")

            note_lower = (tx.note or "").lower()
            if "loss" in note_lower or "withdrawn" in note_lower:
                cr_dr = "DR"

            results.append({
                "id":                     str(tx.id),
                "transaction_reference":  tx.transaction_reference,

                "transaction_type":       tx.transaction_type,
                "transaction_type_label": self.TX_LABELS.get(tx.transaction_type, tx.transaction_type),

                # Frontend expects long-form wallet_type: "cash", "non_cash" etc.
                "wallet_type":            WALLET_TYPE_MAP.get(raw_wtype, raw_wtype.lower()),
                "wallet_label":           WALLET_META.get(raw_wtype, {}).get("label", raw_wtype),

                "cr_dr":                  cr_dr,
                "direction":              "credit" if cr_dr == "CR" else "debit",

                "amount":                 abs(float(tx.amount)),
                "balance_before":         float(tx.balance_before),
                "balance_after":          float(tx.balance_after),

                "note":                   tx.note or "",
                "casino_name":            _extract_casino(tx.note),

                "performed_by_name":      tx.performed_by.user_uid if tx.performed_by else "System",
                "status":                 getattr(tx, "validation_status", "approved"),
                "created_at":             tx.created_at.isoformat(),
            })

        return Response({
            "count":     total,
            "page":      page,
            "page_size": per,
            "results":   results,
        })


def _extract_casino(note):
    """Pull casino name from the note field if present."""
    if not note:
        return None
    # Notes are formatted: "Casino Name | details"
    parts = note.split("|")
    return parts[0].strip() if parts else None


# ─── Admin: wallet accounts for a specific user ───────────────────────────────

class AdminUserWalletAccountsView(APIView):
    """
    GET /admin-panel/wallet/accounts/user/<user_id>/
    Returns all 4 wallet accounts for any user (admin only).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        if not (request.user.is_authenticated and request.user.is_staff):
            return Response({"error": "Forbidden"}, status=403)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        # Ensure all 4 wallets exist
        for wtype in ["C", "NC", "O", "RP"]:
            WalletAccount.objects.get_or_create(
                user=user,
                wallet_type=wtype,
                defaults={"wallet_account_number": generate_account_number(wtype), "balance": 0}
            )

        wallets = WalletAccount.objects.filter(user=user).select_related("updated_by")
        wallets = sorted(wallets, key=lambda w: WALLET_ORDER.get(w.wallet_type, 9))

        accounts = []
        for w in wallets:
            meta = WALLET_META.get(w.wallet_type, {})
            accounts.append({
                "id":             str(w.id),
                "wallet_type":    WALLET_TYPE_MAP.get(w.wallet_type, w.wallet_type.lower()),
                "account_number": w.wallet_account_number,
                "label":          meta.get("label", w.wallet_type),
                "abbr":           meta.get("abbr",  w.wallet_type),
                "color":          meta.get("color", "#888"),
                "balance":        float(w.balance),
                "last_reason":    w.last_reason,
                "updated_at":     w.updated_at.isoformat() if w.updated_at else None,
                "updated_by":     w.updated_by.user_uid if w.updated_by else None,
            })

        return Response({
            "user_uid":             user.user_uid,
            "email":                user.email,
            "vip_level":            getattr(user, "vip_level", 1),
            "rolling_points_total": float(getattr(user, "rolling_points_total", 0) or 0),
            "accounts":             accounts,
        })

# ─── Admin: casino wallets for a specific user ────────────────────────────────

class AdminUserCasinoWalletBalancesView(APIView):
    """
    GET /api/admin-panel/wallet/casino-balances/user/<user_id>/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        if not (request.user.is_authenticated and request.user.is_staff):
            return Response({"error": "Forbidden"}, status=403)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        from authapp.models.casino_wallet_models import CasinoWalletAccount

        qs = (
            CasinoWalletAccount.objects
            .filter(user=user, balance__gt=0)
            .order_by("casino_name", "wallet_type")
        )

        grouped = {}
        for acct in qs:
            if acct.casino_name not in grouped:
                grouped[acct.casino_name] = {
                    "casino_name": acct.casino_name,
                    "wallets":     [],
                }
            meta = WALLET_META.get(acct.wallet_type, {})
            grouped[acct.casino_name]["wallets"].append({
                "wallet_type": acct.wallet_type,
                "label":       meta.get("label", acct.wallet_type),
                "color":       meta.get("color", "#888"),
                "balance":     float(acct.balance),
                "updated_at":  acct.updated_at.isoformat() if acct.updated_at else None,
            })

        return Response({
            "casinos":             list(grouped.values()),
            "has_casino_balances": len(grouped) > 0,
        })


# ─── Admin: all transactions for a specific user ──────────────────────────────

class AdminUserTransactionListView(APIView):
    """
    GET /api/admin-panel/wallet/transactions/user/<user_id>/
    Returns every WalletTransaction for a user — all types, all wallets.
    Supports: ?page=1&page_size=10&wallet_type=C&type=DAC
    """
    permission_classes = [IsAuthenticated]

    TX_CR_DR = {
        "DAC":"CR","WIN":"CR","LUB":"CR","WBA":"CR","MBA":"CR",
        "RMB":"CR","GBE":"CR","CBG":"CR","CBGNC":"CR","LUBNC":"CR",
        "CBGOT":"CR","LUBOT":"CR","ROP":"CR","DMA":"CR","MAN":"CR",
        "WAC":"DR","TAC":"DR","LAC":"DR","WMA":"DR",
    }

    TX_LABELS = {
        "DAC":"Deposit at Casino","WAC":"Withdrawal","TAC":"Transfer",
        "LAC":"Lost at Casino","LUB":"Level Up Bonus","WBA":"Weekly Bonus",
        "MBA":"Monthly Bonus","RMB":"Reimbursement","WIN":"Winnings",
        "GBE":"Gift Encashment","CBG":"Cashback","CBGNC":"NC Cashback",
        "LUBNC":"NC Bonus","CBGOT":"OTP Cashback","LUBOT":"OTP Bonus",
        "ROP":"Rolling Points","DMA":"Admin Deposit","WMA":"Admin Withdrawal",
        "MAN":"Manual Override",
    }

    # Normalize long-form wallet keys to raw DB keys
    WALLET_NORM = {
        "cash":"C","non_cash":"NC","otp":"O","rolling_points":"RP",
        "c":"C","nc":"NC","o":"O","rp":"RP",
    }

    def get(self, request, user_id):
        if not (request.user.is_authenticated and request.user.is_staff):
            return Response({"error": "Forbidden"}, status=403)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        from django.core.paginator import Paginator

        page      = max(int(request.query_params.get("page",      1)), 1)
        per       = max(int(request.query_params.get("page_size", 10)), 1)
        wraw      = request.query_params.get("wallet_type", "").strip()
        txn_type  = request.query_params.get("type", "").strip().upper()

        # Normalize wallet filter
        wtype = self.WALLET_NORM.get(wraw.lower(), wraw.upper()) if wraw else ""

        qs = (
            WalletTransaction.objects
            .filter(user=user)
            .select_related("wallet", "performed_by")
            .order_by("-created_at")
        )

        if wtype:
            qs = qs.filter(wallet__wallet_type=wtype)
        if txn_type and txn_type != "ALL":
            qs = qs.filter(transaction_type=txn_type)

        paginator = Paginator(qs, per)
        page_obj  = paginator.get_page(page)

        results = []
        for tx in page_obj.object_list:
            raw_wtype = tx.wallet.wallet_type if tx.wallet else "C"
            cr_dr     = self.TX_CR_DR.get(tx.transaction_type, "CR")
            meta      = WALLET_META.get(raw_wtype, {})

            # Try to get linked casino txn for casino_name
            casino_name = None
            try:
                from authapp.models.casino_models import CasinoWalletTransaction
                ct = CasinoWalletTransaction.objects.filter(
                    unified_ref=tx.transaction_reference
                ).first()
                if ct:
                    casino_name = ct.casino_name
            except Exception:
                pass

            # Also extract from note as fallback
            if not casino_name and tx.note:
                parts = tx.note.split("|")
                casino_name = parts[0].strip() if len(parts) > 1 else None

            results.append({
                "id":                    str(tx.id),
                "transaction_reference": tx.transaction_reference or str(tx.id),
                "transaction_type":      tx.transaction_type,
                "transaction_type_label":self.TX_LABELS.get(tx.transaction_type, tx.transaction_type),
                "wallet_type":           raw_wtype,          # raw: "C","NC","O","RP"
                "wallet_label":          meta.get("label", raw_wtype),
                "wallet_color":          meta.get("color", "#888"),
                "direction":             "credit" if cr_dr == "CR" else "debit",
                "amount":                float(abs(tx.amount)),
                "balance_before":        float(tx.balance_before),
                "balance_after":         float(tx.balance_after),
                "note":                  tx.note or "",
                "casino_name":           casino_name,
                "performed_by_name":     tx.performed_by.user_uid if tx.performed_by else "System",
                "validation_status":     getattr(tx, "validation_status", "approved"),
                "created_at":            tx.created_at.isoformat(),
            })

        return Response({
            "count":   paginator.count,
            "page":    page,
            "results": results,
        })

class AdminUserTravelHistoryView(APIView):
    """
    GET /api/admin-panel/users/<user_id>/travel-history/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        if not (request.user.is_authenticated and request.user.is_staff):
            return Response({"error": "Forbidden"}, status=403)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        from authapp.models.offline_deposit import OfflineDepositLog
        from django.core.paginator import Paginator

        page = int(request.query_params.get("page", 1))
        per  = int(request.query_params.get("page_size", 5))

        qs = (
            OfflineDepositLog.objects
            .filter(user=user, entry_type="rolling_points")
            .order_by("-created_at")
        )

        paginator = Paginator(qs, per)
        page_obj  = paginator.get_page(page)

        results = []
        for log in page_obj.object_list:
            results.append({
                "id":                   log.id,
                "casino_name":          log.casino_name,
                "slip_number":          getattr(log, "slip_number", None),
                "betting_date":         getattr(log, "betting_date", None),
                "total_bets":           log.total_bets or 0,
                "total_bet_amount":     float(log.total_bet_amount or 0),
                "rolling_points_added": float(log.rolling_points_added or 0),
                "rolling_points_total": float(log.rolling_points_total or 0),
                "vip_level_at_time":    log.vip_level_at_time,
                "level_up_triggered":   log.level_up_triggered,
                "note":                 log.note,
                "created_at":           log.created_at.isoformat(),
            })

        return Response({
            "count":   paginator.count,
            "results": results,
        })