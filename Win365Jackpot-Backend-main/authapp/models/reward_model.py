"""
authapp/models/reward_model.py
─────────────────────────────────────────────────────────────────────────────
Reward table — claimable bonuses issued to users by the system or admin.
"""

from django.db import models
from django.conf import settings


class Reward(models.Model):
    REWARD_TYPES = [
        ("daily_spin",    "Daily Spin"),
        ("welcome_bonus", "Welcome Bonus"),
        ("vip_upgrade",   "VIP Upgrade Bonus"),
        ("referral",      "Referral Reward"),
        ("cashback",      "Cashback"),
        ("tournament",    "Tournament Prize"),
    ]

    user       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, related_name="rewards", db_index=True,
    )
    type       = models.CharField(max_length=30, choices=REWARD_TYPES)
    amount     = models.DecimalField(max_digits=12, decimal_places=2)
    is_claimed = models.BooleanField(default=False, db_index=True)
    is_locked  = models.BooleanField(default=False)
    lock_reason= models.CharField(max_length=255, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    claimed_at = models.DateTimeField(null=True, blank=True)
    description= models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes  = [models.Index(fields=["user", "is_claimed"])]

    def __str__(self):
        return f"{self.user} | {self.type} | ${self.amount} | claimed={self.is_claimed}"