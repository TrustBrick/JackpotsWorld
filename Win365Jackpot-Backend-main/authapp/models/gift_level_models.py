"""
authapp/models/gift_level_models.py
────────────────────────────────────────────────────────────────────────────
Models for:
  - UserGift     : Bonus / Non-Cash gifts (admin creates, user claims)
  - UserLevel    : Point-based level system
  - LevelConfig  : Level thresholds (seeded via migration / management cmd)
"""

from django.db import models
from django.conf import settings
from django.utils import timezone


# ─── Level Thresholds (static config, editable by superadmin) ────────────────

LEVEL_THRESHOLDS = [
    (1,  0),
    (2,  5000),
    (3,  15000),
    (4,  30000),
    (5,  75000),
    (6,  150000),
    (7,  350000),
    (8,  750000),
    (9,  1500000),
]


def points_to_level(points: int) -> int:
    """Return the highest level the user qualifies for given their point total."""
    level = 1
    for lvl, threshold in LEVEL_THRESHOLDS:
        if points >= threshold:
            level = lvl
        else:
            break
    return level


def next_level_threshold(current_level: int):
    """Return (next_level, points_needed) or None if already at max."""
    for lvl, threshold in LEVEL_THRESHOLDS:
        if lvl == current_level + 1:
            return lvl, threshold
    return None, None


# ─── UserGift ────────────────────────────────────────────────────────────────

class UserGift(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("claimed", "Claimed"),
        ("expired", "Expired"),
        ("revoked", "Revoked"),
    ]

    GIFT_TYPE_CHOICES = [
        ("bonus",        "Bonus"),
        ("cashback",     "Cashback"),
        ("referral",     "Referral Bonus"),
        ("vip_upgrade",  "VIP Upgrade Gift"),
        ("tournament",   "Tournament Prize"),
        ("welcome",      "Welcome Bonus"),
        ("manual",       "Manual Gift"),
    ]

    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="gifts"
    )
    amount      = models.DecimalField(max_digits=14, decimal_places=2)
    gift_type   = models.CharField(max_length=30, choices=GIFT_TYPE_CHOICES, default="manual")
    status      = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending", db_index=True)
    description = models.TextField(blank=True)
    note        = models.TextField(blank=True)        # internal admin note
    expires_at  = models.DateTimeField(null=True, blank=True)

    # Audit
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="gifts_created"
    )
    created_at  = models.DateTimeField(auto_now_add=True, db_index=True)
    claimed_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["user", "status", "created_at"]),
        ]

    def __str__(self):
        return f"Gift #{self.id} | {self.user} | ${self.amount} | {self.status}"

    @property
    def is_expired(self):
        if self.expires_at and timezone.now() > self.expires_at:
            return True
        return False

    @property
    def is_claimable(self):
        return self.status == "pending" and not self.is_expired


# ─── UserLevel ───────────────────────────────────────────────────────────────

class UserLevel(models.Model):
    user         = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="user_level"
    )
    level        = models.PositiveIntegerField(default=1, db_index=True)
    points       = models.PositiveBigIntegerField(default=0)
    updated_at   = models.DateTimeField(auto_now=True)
    updated_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="level_updates_made"
    )

    class Meta:
        ordering = ["-points"]

    def __str__(self):
        return f"{self.user} | Lvl {self.level} | {self.points} pts"

    def recalculate_level(self):
        """Recalculate and save level based on current points. Returns True if level changed."""
        new_level = points_to_level(self.points)
        if new_level != self.level:
            self.level = new_level
            return True
        return False


# ─── PointsLog ───────────────────────────────────────────────────────────────

class PointsLog(models.Model):
    """Audit trail for every admin points addition."""

    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="points_logs"
    )
    points_added   = models.IntegerField()           # can be negative for deductions
    points_before  = models.PositiveBigIntegerField()
    points_after   = models.PositiveBigIntegerField()
    level_before   = models.PositiveIntegerField()
    level_after    = models.PositiveIntegerField()
    leveled_up     = models.BooleanField(default=False)
    reason         = models.TextField(blank=True)
    recorded_by    = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="points_logs_recorded"
    )
    created_at     = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} | +{self.points_added} pts | Lvl {self.level_before}→{self.level_after}"