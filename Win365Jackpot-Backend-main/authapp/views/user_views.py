# authapp/views/user_views.py


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from authapp.models import ActivityLog
from authapp.models.offline_deposit import OfflineDepositLog

from authapp.models.wallet_models import WalletTransaction
from authapp.serializers.wallet_serializers import WalletTransactionSerializer
from django.core.paginator import Paginator

from authapp.models import WalletAccount, ActivityLog
from authapp.serializers import (
    UserProfileSerializer,
    UpdateProfileSerializer,
    ChangePasswordSerializer,
    ActivityLogSerializer,
)
from authapp.serializers.wallet_serializers import WalletAccountSerializer

from authapp.models.notification_model import Notification


# Notification View
class UserNotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = Notification.objects.filter(user=request.user)[:50]

        return Response([
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "is_read": n.is_read,
                "created_at": n.created_at,
            }
            for n in notifications
        ])


class MarkNotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        Notification.objects.filter(id=pk, user=request.user).update(is_read=True)
        return Response({"success": True})
    
class MarkAllNotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(
            user=request.user,
            is_read=False
        ).update(is_read=True)

        return Response({"success": True})
    

# ─────────────────────────────────────────────────────────────────────────────
# Profile
# ─────────────────────────────────────────────────────────────────────────────
class UserDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    # REPLACE the existing UserDashboardView.get() with this:

    def get(self, request):
        user = request.user
    
        from authapp.models.gift_level_models import UserGift
    
        return Response({
            "user_uid": user.user_uid,
            "email": user.email,
            "wallet_balance": user.wallet_balance,
            "bonus_balance": user.bonus_balance,
            "vip_level": user.vip_level,
    
            # Stats for sidebar badges
            "total_notifications": Notification.objects.filter(user=user).count(),
            "unread_notifications": Notification.objects.filter(user=user, is_read=False).count(),
            "total_gifts": UserGift.objects.filter(user=user).count(),
            "unclaimed_rewards_count": UserGift.objects.filter(user=user, status="pending").count(),
        })
    

class ProfileView(APIView):
    permission_classes = [IsAuthenticated]
 
    def get(self, request):
        user = request.user
 
        # ── BANNED CHECK ──────────────────────────────────────────────────────
        # is_active=False means the admin has banned this account.
        # Return 403 with a structured payload the frontend can detect.
        if not user.is_active:
            return Response(
                {
                    "banned": True,
                    "message": "Your account is on hold. Please contact support for more information.",
                    "support_email": "support@win365.com",   # adjust to your real support email
                },
                status=status.HTTP_403_FORBIDDEN,
            )
 
        serializer = UserProfileSerializer(user)
        return Response(serializer.data)
 
    def patch(self, request):
        serializer = UpdateProfileSerializer(
            request.user, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            ActivityLog.log(
                action="profile_updated",
                actor=request.user,
                actor_type="user",
                target_user=request.user,
                ip_address=request.META.get("REMOTE_ADDR"),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
            return Response(UserProfileSerializer(request.user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 


# ─────────────────────────────────────────────────────────────────────────────
# Avatar
# ─────────────────────────────────────────────────────────────────────────────

class AvatarUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        user = request.user
        avatar = request.FILES.get("avatar")
        avatar_url = request.data.get("avatar_url")

        if not avatar and not avatar_url:
            return Response(
                {"detail": "Provide either an avatar file or avatar_url."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if avatar:
            user.avatar = avatar
        if avatar_url:
            user.avatar_url = avatar_url

        user.save(update_fields=["avatar", "avatar_url"])

        ActivityLog.log(
            action="avatar_changed",
            actor=user,
            actor_type="user",
            target_user=user,
            ip_address=request.META.get("REMOTE_ADDR"),
        )
        return Response(UserProfileSerializer(user).data)


# ─────────────────────────────────────────────────────────────────────────────
# Change Password
# ─────────────────────────────────────────────────────────────────────────────

class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        if serializer.is_valid():
            serializer.save()
            ActivityLog.log(
                action="password_change",
                actor=request.user,
                actor_type="user",
                target_user=request.user,
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            return Response({"detail": "Password updated successfully."})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────────────────────────────────────
# Wallet
# ─────────────────────────────────────────────────────────────────────────────

class UserWalletView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallets = WalletAccount.objects.filter(user=request.user)
        serializer = WalletAccountSerializer(wallets, many=True)
        return Response(serializer.data)


# ─────────────────────────────────────────────────────────────────────────────
# Activity Log
# ─────────────────────────────────────────────────────────────────────────────

class UserActivityLogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        logs = ActivityLog.objects.filter(
            actor=request.user
        ).order_by("-created_at")[:50]
        serializer = ActivityLogSerializer(logs, many=True)
        return Response(serializer.data)

from authapp.models.wallet_models import WalletTransaction
from authapp.serializers.wallet_serializers import WalletTransactionSerializer
from django.core.paginator import Paginator

class UserWalletTransactionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from authapp.models.casino_models import CasinoWalletTransaction  # adjust import to your actual model
    
        qs = WalletTransaction.objects.filter(
            user=request.user
        ).select_related("wallet", "performed_by").order_by("-created_at")
    
        wallet_type = request.query_params.get("wallet_type")
        if wallet_type and wallet_type != "all":
            qs = qs.filter(wallet__wallet_type=wallet_type)
    
        page_size = int(request.query_params.get("page_size", 15))
        page_num  = int(request.query_params.get("page", 1))
    
        paginator = Paginator(qs, page_size)
        page = paginator.get_page(page_num)
    
        results = []
        for tx in page.object_list:
            results.append({
                "id":                    str(tx.id),
                "transaction_reference": getattr(tx, "transaction_reference", str(tx.id)),
                "note":                  tx.note,
                "wallet_type":           tx.wallet.wallet_type,
                "direction":             "credit" if tx.balance_after > tx.balance_before else "debit",
                "amount":                float(tx.amount),
                "balance_before":        float(tx.balance_before),
                "balance_after":         float(tx.balance_after),
                "performed_by_name":     tx.performed_by.user_uid if tx.performed_by else "System",
                "status":                getattr(tx, "validation_status", "approved"),
                "created_at":            tx.created_at.strftime("%Y-%m-%d %H:%M"),
                "casino_name":           None,  # main wallet has no casino
            })
    
        # ── Append casino wallet transactions (if no wallet_type filter or not a main wallet type)
        if not wallet_type or wallet_type == "all":
            try:
                casino_txns = CasinoWalletTransaction.objects.filter(
                    user=request.user
                ).select_related("performed_by").order_by("-created_at")[:50]
    
                for tx in casino_txns:
                    results.append({
                        "id":                    f"casino-{tx.id}",
                        "transaction_reference": getattr(tx, "unified_ref", str(tx.id)),
                        "note":                  tx.note,
                        "wallet_type":           tx.wallet_type,
                        "direction":             "credit" if tx.transaction_type in ("WIN","LUB","WBA","MBA","RMB","GBE","CBG","DAC") else "debit",
                        "amount":                float(tx.amount),
                        "balance_before":        float(tx.balance_before),
                        "balance_after":         float(tx.balance_after),
                        "performed_by_name":     tx.performed_by.user_uid if tx.performed_by else "System",
                        "status":                "approved",
                        "created_at":            tx.created_at.strftime("%Y-%m-%d %H:%M"),
                        "casino_name":           tx.casino_name,
                    })
            except Exception:
                pass  # casino model may not exist yet, skip silently
            
            # re-sort combined list by date
            results.sort(key=lambda x: x["created_at"], reverse=True)
    
        return Response({"count": paginator.count + len([r for r in results if r.get("casino_name")]), "results": results})





class UserTravelHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        logs = (
            OfflineDepositLog.objects
            .filter(user=request.user, entry_type="rolling_points")
            .order_by("-created_at")
        )
        results = []
        for log in logs:
            results.append({
                "id":                   log.id,
                "casino_name":          log.casino_name,
                "slip_number":          log.slip_number,
                "betting_date":         log.betting_date,
                "total_bets":           log.total_bets,
                "total_bet_amount":     float(log.total_bet_amount or 0),
                "rolling_points_added": float(log.rolling_points_added or 0),
                "rolling_points_total": float(log.rolling_points_total or 0),
                "vip_level_at_time":    log.vip_level_at_time,
                "level_up_triggered":   log.level_up_triggered,
                "note":                 log.note,
                "created_at":           log.created_at,
            })
        return Response({"results": results, "count": len(results)})


from django.contrib.auth import get_user_model
User = get_user_model()


class UserReferralView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        referrals = User.objects.filter(referred_by=user)

        return Response({
            "referrals": [
                {"id": r.id, "name": r.name, "email": r.email, "date_joined": r.date_joined}
                for r in referrals
            ],
            "count": referrals.count(),
            "referred_by_uid":  user.referred_by.user_uid if user.referred_by else None,
            "referred_by_name": user.referred_by.name if user.referred_by else None,
            "referral_code":    user.referral_code,
            "referral_count":   user.referral_count,
        })