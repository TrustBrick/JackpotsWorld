"""
authapp/views/reward_views.py
─────────────────────────────────────────────────────────────────────────────
User-facing reward and notification endpoints:
  • RewardListView
  • ClaimRewardView
  • NotificationListView
  • MarkNotificationsReadView
  • NotificationReadView
"""

from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models import Reward, Notification, User, ActivityLog
from authapp.serializers.reward_serializers import (
    RewardSerializer,
    NotificationSerializer,
)

def _get_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


# ─── Rewards ─────────────────────────────────────────────────────────────────

class RewardListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = RewardSerializer

    def get_queryset(self):
        return Reward.objects.filter(user=self.request.user).order_by("-created_at")


class ClaimRewardView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        with db_transaction.atomic():
            try:
                reward = Reward.objects.select_for_update().get(
                    pk=pk, user=request.user, is_claimed=False
                )
            except Reward.DoesNotExist:
                return Response({"error": "Reward not found or already claimed"}, status=404)

            if reward.expires_at and reward.expires_at < timezone.now():
                return Response({"error": "Reward has expired"}, status=400)

            reward.is_claimed = True
            reward.claimed_at = timezone.now()
            reward.save()

            user = User.objects.select_for_update().get(pk=request.user.pk)
            user.wallet_balance += reward.amount
            user.save(update_fields=["wallet_balance"])

        ActivityLog.log(
            action="reward_claimed", actor=request.user,
            description=f"Reward ${reward.amount} ({reward.type}) claimed",
            ip_address=_get_ip(request), endpoint=request.path,
            meta={"reward_id": reward.id, "amount": float(reward.amount)},
        )
        return Response({
            "message":     f"Reward of ${reward.amount} claimed!",
            "new_balance": float(user.wallet_balance),
        })


# ─── Notifications ───────────────────────────────────────────────────────────

class NotificationListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class   = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by("-created_at")


class MarkNotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(
            user=request.user, is_read=False
        ).update(is_read=True)
        return Response({"detail": f"{updated} notifications marked as read"})


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            n = Notification.objects.get(pk=pk, user=request.user)
            n.is_read = True
            n.save(update_fields=["is_read"])
            return Response({"message": "Marked as read"})
        except Notification.DoesNotExist:
            return Response({"error": "Not found"}, status=404)