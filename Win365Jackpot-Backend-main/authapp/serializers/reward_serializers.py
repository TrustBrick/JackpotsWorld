"""
authapp/serializers/reward_serializers.py
─────────────────────────────────────────────────────────────────────────────
Serializers for Reward and Notification.
"""

from rest_framework import serializers
from authapp.models import Reward, Notification

class RewardSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Reward
        fields = [
            "id", "type", "amount", "is_claimed", "is_locked",
            "lock_reason", "description", "expires_at", "created_at", "claimed_at",
        ]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Notification
        fields = ["id", "title", "message", "is_read", "icon", "created_at"]