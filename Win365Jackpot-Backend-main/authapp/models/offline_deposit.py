"""
authapp/models/offline_deposit.py
────────────────────────────────────────────────────────────────────────────
OfflineDepositLog model — records every back-office session entry.
"""
from django.db import models
from django.conf import settings


class OfflineDepositLog(models.Model):
    ENTRY_TYPES = [("cash", "Cash"), ("rolling_points", "Rolling Points")]

    user              = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="offline_deposit_logs")
    entry_type        = models.CharField(max_length=20, choices=ENTRY_TYPES, default="cash", db_index=True)
    casino_name       = models.CharField(max_length=120, blank=True)
    vip_level_at_time = models.IntegerField(default=1)

    # ✅ NEW FIELDS (ADD THESE)
    slip_number  = models.CharField(max_length=100, null=True, blank=True, unique=True)
    betting_date = models.DateField(null=True, blank=True)

    # Cash fields
    total_deposited   = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_won         = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_withdrawn   = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    available_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Rolling points fields
    total_bets        = models.IntegerField(default=0)
    total_bet_amount  = models.DecimalField(max_digits=10, decimal_places=2, default=100)
    rp_rate               = models.FloatField(default=1.0)
    rolling_pct           = models.FloatField(default=1.0)
    rolling_points_added  = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    rolling_points_total  = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    levelup_points_needed = models.IntegerField(default=5000)
    level_up_triggered    = models.BooleanField(default=False, db_index=True)

    note        = models.TextField(blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="deposit_logs_recorded")
    created_at  = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes  = [models.Index(fields=["user", "entry_type", "created_at"])]


# ────────────────────────────────────────────────────────────────────────────
# authapp/views/admin_wallet_accounts_view.py
# GET /admin-panel/wallet/accounts/user/<user_id>/
# Returns all 4 wallet accounts with real account numbers
# ────────────────────────────────────────────────────────────────────────────
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from authapp.models.wallet_models import WalletAccount
from django.contrib.auth import get_user_model

User = get_user_model()

WALLET_ORDER = {"C": 0, "NC": 1, "O": 2, "RP": 3}
WALLET_META  = {
    "C":  {"label": "Cash",          "abbr": "CASH", "color": "#34d399"},
    "NC": {"label": "Non-Cash",      "abbr": "NC",   "color": "#60a5fa"},
    "O":  {"label": "OTP",           "abbr": "OTP",  "color": "#a78bfa"},
    "RP": {"label": "Rolling Points", "abbr": "RP",  "color": "#f59e0b"},
}

class AdminUserWalletAccountsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        if not (request.user.is_authenticated and request.user.is_staff):
            return Response({"error": "Forbidden"}, status=403)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        wallets = WalletAccount.objects.filter(user=user).select_related("updated_by")
        wallets = sorted(wallets, key=lambda w: WALLET_ORDER.get(w.wallet_type, 9))

        accounts = []
        for w in wallets:
            meta = WALLET_META.get(w.wallet_type, {})
            accounts.append({
                "id":             str(w.id),
                "wallet_type":    w.wallet_type,
                "account_number": w.wallet_account_number,
                "label":          meta.get("label", w.wallet_type),
                "abbr":           meta.get("abbr",  w.wallet_type),
                "color":          meta.get("color",  "#888"),
                "balance":        float(w.balance),
                "last_reason":    w.last_reason,
                "updated_at":     w.updated_at,
                "updated_by":     w.updated_by.user_uid if w.updated_by else None,
            })

        return Response({
            "user_uid": user.user_uid,
            "email":    user.email,
            "accounts": accounts,
        })
"""