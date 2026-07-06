"""
authapp/views/gift_level_views.py
────────────────────────────────────────────────────────────────────────────
Endpoints:

ADMIN
  POST /admin/wallet/bonus/          → create gift for user (NC)
  POST /admin/wallet/otp/            → directly credit OTP wallet
  POST /admin/users/add-points/      → add level points
  GET  /admin/users/<id>/points-log/ → points history

USER
  GET  /user/gifts/                  → list own gifts
  POST /user/gifts/<id>/claim/       → claim a pending gift → credit NC wallet
  GET  /user/level/                  → current level + progress
"""

from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from authapp.models.super_admin_models import AdminWallet

from authapp.models.gift_level_models import UserGift, UserLevel, PointsLog, points_to_level, next_level_threshold
from authapp.models import ActivityLog
from authapp.models.wallet_models import WalletAccount, WalletTransaction
from authapp.serializers.gift_level_serializers import (
    UserGiftSerializer, UserLevelSerializer, PointsLogSerializer,
    AdminCreateGiftSerializer, AdminAddPointsSerializer, AdminAddOTPSerializer,
)
from authapp.utils.account_number import generate_account_number

import logging
logger = logging.getLogger(__name__)

User = get_user_model()


# ─── Shared wallet helper (mirrors existing _write_txn) ──────────────────────

def _get_or_create_wallet(user, wallet_type):
    acct, _ = WalletAccount.objects.get_or_create(
        user=user, wallet_type=wallet_type,
        defaults={
            "wallet_account_number": generate_account_number(wallet_type),
            "balance": 0,
        }
    )
    return acct


def _credit_wallet(user, wallet_type, amount, txn_type, note, actor):
    """Atomically credit a wallet and write a transaction record. Returns new balance."""
    amount = Decimal(str(amount))
    acct   = _get_or_create_wallet(user, wallet_type)

    acct.balance    += amount
    acct.last_reason = txn_type
    acct.updated_by  = actor
    acct.save(update_fields=["balance", "last_reason", "updated_by", "updated_at"])

    now = timezone.now()
    ref = f"{now.strftime('%Y%m%d')}-{txn_type}-{now.strftime('%H%M%S%f')[:9]}"
    WalletTransaction.objects.create(
        user=user, wallet=acct, transaction_type=txn_type,
        amount=amount,
        balance_before=acct.balance - amount,
        balance_after=acct.balance,
        transaction_reference=ref,
        performed_by=actor,
        note=note,
    )

    from authapp.services.notification_service import notify_transaction
    notify_transaction(
        user=user,
        txn_type=txn_type,
        amount=amount,
        wallet_type=wallet_type,
        balance_after=acct.balance,
        casino_name=None,
        extra_note=note,
    )

    return float(acct.balance)


def _is_admin(user):
    return user.is_authenticated and user.is_staff


# ─── ADMIN: Add OTP Wallet Points ────────────────────────────────────────────

class AdminAddOTPView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)

        ser = AdminAddOTPSerializer(data=request.data)
        if not ser.is_valid():
            return Response({"error": ser.errors}, status=400)

        d = ser.validated_data

        try:
            user = User.objects.get(pk=d["user_id"])
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        amount = Decimal(str(d["amount"]))

        # Credit OTP wallet
        new_balance = _credit_wallet(
            user,
            "O",
            amount,
            d["otp_type"],
            d.get("note") or "OTP added by admin",
            request.user
        )

        ActivityLog.log(
            action="wallet_credit",
            actor=request.user,
            target_user=user,
            description=f"OTP +${amount} → {user.email}",
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        return Response({
            "message": f"${amount} added to OTP wallet",
            "otp_balance": new_balance
        })
    

User = get_user_model()


def _is_admin(user):
    return user.is_authenticated and user.is_staff

class AdminCreateBonusView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        # ── 1. Permission check ─────────────────────────────
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)

        # ── 2. Validate request ─────────────────────────────
        ser = AdminCreateGiftSerializer(data=request.data)
        if not ser.is_valid():
            return Response({"error": ser.errors}, status=400)

        d = ser.validated_data

        # ── 3. Get user ─────────────────────────────────────
        try:
            user = User.objects.get(pk=d["user_id"])
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        amount = Decimal(str(d["amount"]))

        # ── 4. Lock Admin Wallet ────────────────────────────
        try:
            admin_wallet = AdminWallet.objects.select_for_update().get(pk=1)
        except AdminWallet.DoesNotExist:
            return Response({"error": "Admin wallet not initialized"}, status=500)

        # ── 5. Check balance ────────────────────────────────
        if admin_wallet.non_cash_balance < amount:
            return Response({
                "error": (
                    f"Insufficient Admin Bonus Wallet.\n"
                    f"Available: ${admin_wallet.non_cash_balance:,.2f} | "
                    f"Required: ${amount:,.2f}\n"
                    f"Ask Super Admin to top up."
                )
            }, status=400)

        # ── 6. Deduct Admin Wallet ──────────────────────────
        before_balance = admin_wallet.non_cash_balance
        admin_wallet.non_cash_balance -= amount
        admin_wallet.updated_by = request.user
        admin_wallet.save(update_fields=["non_cash_balance", "updated_by", "updated_at"])

        after_balance = admin_wallet.non_cash_balance

        # ── 7. Create Gift (PENDING) ────────────────────────
        gift = UserGift.objects.create(
            user=user,
            amount=amount,
            gift_type=d["gift_type"],
            description=d["description"],
            note=d.get("note"),
            expires_at=d.get("expires_at"),
            status="pending",
            created_by=request.user,
        )

        # ── 8. Activity Log ─────────────────────────────────
        ActivityLog.log(
            action="bonus_added",
            actor=request.user,
            target_user=user,
            description=(
                f"Bonus #{gift.id} | ${amount:,.2f} ({d['gift_type']}) → {user.email} | "
                f"Admin Wallet NC: ${before_balance:,.2f} → ${after_balance:,.2f}"
            ),
            ip_address=request.META.get("REMOTE_ADDR"),
            amount=amount,
            wallet_type="NC",
            cr_dr="DR",  # deducted from admin wallet
        )

        # ── 9. Response ─────────────────────────────────────
        return Response({
            "message": (
                f"✅ Bonus created successfully.\n"
                f"${amount:,.2f} reserved from Admin Bonus Wallet.\n"
                f"User must claim the gift."
            ),
            "gift": UserGiftSerializer(gift).data,
            "admin_wallet": {
                "before": float(before_balance),
                "after": float(after_balance),
            }
        }, status=201)
    




# ─── ADMIN: Add Level Points ──────────────────────────────────────────────────

class AdminAddPointsView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)

        ser = AdminAddPointsSerializer(data=request.data)
        if not ser.is_valid():
            return Response({"error": ser.errors}, status=400)

        d = ser.validated_data
        try:
            user = User.objects.get(pk=d["user_id"])
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        # Get or create UserLevel
        user_level, _ = UserLevel.objects.get_or_create(
            user=user,
            defaults={"level": 1, "points": 0}
        )

        pts_before   = user_level.points
        lvl_before   = user_level.level
        new_points   = max(int(pts_before) + d["points"], 0)   # floor at 0

        user_level.points     = new_points
        user_level.updated_by = request.user
        leveled_up = user_level.recalculate_level()
        user_level.save()

        # Write audit log
        log = PointsLog.objects.create(
            user=user,
            points_added=d["points"],
            points_before=pts_before,
            points_after=new_points,
            level_before=lvl_before,
            level_after=user_level.level,
            leveled_up=leveled_up,
            reason=d["reason"],
            recorded_by=request.user,
        )

        ActivityLog.log(
            action="vip_xp_updated", actor=request.user,
            target_user=user,
            description=(
                f"+{d['points']} pts → {new_points} | "
                f"Lvl {lvl_before}→{user_level.level}"
            ),
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        msg = f"+{d['points']} points added. Total: {new_points}, Level: {user_level.level}"
        if leveled_up:
            msg += f" 🎉 Level up! {lvl_before} → {user_level.level}"

        return Response({
            "message":    msg,
            "points":     new_points,
            "level":      user_level.level,
            "leveled_up": leveled_up,
            "log_id":     log.id,
            "level_data": UserLevelSerializer(user_level).data,
        })


# ─── ADMIN: Points History ────────────────────────────────────────────────────

class AdminPointsLogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)
        logs = PointsLog.objects.filter(user_id=user_id).select_related("recorded_by")[:50]
        return Response({"results": PointsLogSerializer(logs, many=True).data})


# ─── USER: List Own Gifts ─────────────────────────────────────────────────────

class UserGiftListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        status_filter = request.query_params.get("status")  # pending | claimed | all
        qs = UserGift.objects.filter(user=request.user)

        if status_filter and status_filter != "all":
            qs = qs.filter(status=status_filter)

        # Auto-expire
        now = timezone.now()
        expired_ids = [g.id for g in qs if g.status == "pending" and g.expires_at and now > g.expires_at]
        if expired_ids:
            UserGift.objects.filter(id__in=expired_ids).update(status="expired")
            qs = UserGift.objects.filter(user=request.user)
            if status_filter and status_filter != "all":
                qs = qs.filter(status=status_filter)

        return Response({
            "results": UserGiftSerializer(qs, many=True).data,
            "counts": {
                "pending": qs.filter(status="pending").count(),
                "claimed": qs.filter(status="claimed").count(),
                "expired": qs.filter(status="expired").count(),
            }
        })


# ─── USER: Claim Gift ─────────────────────────────────────────────────────────

class UserClaimGiftView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, gift_id):
        try:
            gift = UserGift.objects.select_for_update().get(id=gift_id, user=request.user)
        except UserGift.DoesNotExist:
            return Response({"error": "Gift not found"}, status=404)

        if not gift.is_claimable:
            if gift.status == "claimed":
                return Response({"error": "Gift already claimed"}, status=400)
            if gift.status == "expired" or gift.is_expired:
                return Response({"error": "Gift has expired"}, status=400)
            return Response({"error": f"Gift cannot be claimed (status: {gift.status})"}, status=400)

        # Credit Non-Cash wallet
        new_balance = _credit_wallet(
            request.user, "NC", gift.amount,
            "GIFT_CLAIM",
            f"Gift #{gift.id} claimed | {gift.gift_type}",
            request.user,
        )

        gift.status     = "claimed"
        gift.claimed_at = timezone.now()
        gift.save(update_fields=["status", "claimed_at"])

        ActivityLog.log(
            action="reward_claimed", actor=request.user,
            target_user=request.user,
            description=f"Gift #{gift.id} | ${gift.amount} → NC wallet",
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        return Response({
            "message":    f"${gift.amount} credited to your Non-Cash wallet!",
            "nc_balance": new_balance,
            "gift":       UserGiftSerializer(gift).data,
        })


# ─── USER: Level Info ────────────────────────────────────────────────────────

class UserLevelView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_level, _ = UserLevel.objects.get_or_create(
            user=request.user,
            defaults={"level": 1, "points": 0}
        )
        return Response(UserLevelSerializer(user_level).data)   
    
class AdminUserLevelView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        user_level, _ = UserLevel.objects.get_or_create(
            user=user,
            defaults={"level": 1, "points": 0}
        )
        return Response(UserLevelSerializer(user_level).data)