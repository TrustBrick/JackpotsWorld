"""
authapp/models/wheel_models.py
─────────────────────────────────────────────────────────────────────────────
Two independent wheel systems, replacing the retired "Daily Login Spin"
(see spin_models.py — kept only as frozen historical data, no longer live):

  Signup Wheel — automatic, one-time. Every new user gets up to
    SignupWheelSettings.max_lifetime_spins spins (default 5), usable only
    within eligibility_window_days of registration (default 30), from a
    fixed, admin-editable set of SignupWheelReward tiers. See
    services/wheel_service.py for the weighted-probability + no-repeat
    qualification logic.

  Bonus Wheel — never self-service. An admin creates a named BonusWheel
    with its own reward tiers, then explicitly assigns spins on it to a
    target audience (BonusWheelAssignment), which materializes one
    BonusWheelGrant per matching player — the actual spendable "N spins on
    this wheel" unit a player consumes from.

Both systems reuse the same reward-type vocabulary (WHEEL_REWARD_TYPE_CHOICES)
and, for the types that map onto real money/points/gifts, the exact same
crediting helpers the platform already uses elsewhere (wallet_service,
casino_wallet_service, UserGift) — see services/wheel_service.py's dispatch,
not duplicated here in the model layer.
"""
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

WHEEL_REWARD_TYPE_CHOICES = [
    ("cash_bonus", "Cash Bonus"),
    ("cashback", "Cashback"),
    ("rolling_points", "Rolling Points"),
    ("vip_points", "VIP Points"),
    ("gift_voucher", "Gift Voucher"),
    ("merchandise", "Merchandise"),
    ("hotel_stay", "Hotel Stay"),
    ("event_ticket", "Event Ticket"),
    ("casino_coupon", "Casino Coupon"),
    ("free_travel", "Free Travel"),
    ("discount", "Discount"),
    ("free_spins", "Free Spins"),
    ("physical_gift", "Physical Gift"),
    ("mystery_reward", "Mystery Reward"),
    ("no_reward", "Try Again"),
]


# ─── Signup Wheel ───────────────────────────────────────────────────────────

class SignupWheelSettings(models.Model):
    """Singleton (pk=1) — admin-configurable, platform-wide."""
    is_enabled = models.BooleanField(default=True)
    max_lifetime_spins = models.PositiveIntegerField(default=5)
    # Eligibility window is measured from User.date_joined, not from this
    # row's own timestamp — see services/wheel_service.signup_wheel_status().
    eligibility_window_days = models.PositiveIntegerField(default=30)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"SignupWheelSettings | enabled={self.is_enabled} max={self.max_lifetime_spins} window={self.eligibility_window_days}d"


class SignupWheelReward(models.Model):
    """One row per wheel tier. probability_pct is a literal percentage (not
    a relative weight like BonusWheelReward.weight) since the spec gives
    admins exact percentages to author directly — see
    services/wheel_service.resolve_signup_wheel_spin() for how these are
    used (and how excluding an already-won no_repeat tier automatically,
    proportionally rescales everyone else's odds)."""
    label = models.CharField(max_length=100)
    reward_type = models.CharField(max_length=20, choices=WHEEL_REWARD_TYPE_CHOICES, default="cash_bonus")
    value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    probability_pct = models.DecimalField(max_digits=6, decimal_places=3)
    # Set on the high-value tiers ($150/$250/$500 in the default seed) — once
    # a player wins a tier with this flag, it's permanently excluded from
    # their remaining spins.
    no_repeat_for_player = models.BooleanField(default=False)
    icon = models.CharField(max_length=40, blank=True)
    color = models.CharField(max_length=9, blank=True)
    image = models.ImageField(upload_to="wheel/signup_rewards/", null=True, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"{self.label} ({self.probability_pct}%)"


class SignupWheelSpin(models.Model):
    """One row per spin — doubles as the per-player history log AND the
    lifetime-cap ledger (COUNT() against SignupWheelSettings.max_lifetime_spins,
    same pattern SpinHistory's month_key count already used for the retired
    monthly wheel). Snapshots the reward so history stays correct even if
    the SignupWheelReward row is later edited."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="signup_wheel_spins")
    reward = models.ForeignKey(SignupWheelReward, on_delete=models.SET_NULL, null=True, related_name="+")

    reward_label_snapshot = models.CharField(max_length=100)
    reward_type_snapshot = models.CharField(max_length=20)
    value_snapshot = models.DecimalField(max_digits=12, decimal_places=2)

    spin_number = models.PositiveSmallIntegerField()  # this player's Nth signup-wheel spin (1..max_lifetime_spins)
    spun_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-spun_at"]
        indexes = [models.Index(fields=["user", "spun_at"])]

    def __str__(self):
        return f"{self.user_id} | spin #{self.spin_number} | {self.reward_label_snapshot}"


# ─── Bonus Wheel ────────────────────────────────────────────────────────────

class BonusWheel(models.Model):
    """A named, admin-created wheel — never spun automatically. Players only
    ever get access via an explicit BonusWheelAssignment → BonusWheelGrant."""
    name = models.CharField(max_length=120)
    # Free-text organizational label (e.g. "Diwali 2026 Promo") — not a
    # targeting mechanism; there's no generic "marketing campaign" concept
    # anywhere else in this codebase to hook into (AffiliateCampaign is a
    # different thing — an affiliate's own referral-link tracking bucket).
    campaign_tag = models.CharField(max_length=80, blank=True, db_index=True)
    # Context/labeling only (e.g. "this wheel is themed around Event X") —
    # NOT what makes "assign to Event" work; that's
    # BonusWheelAssignment.target_type="event_registrants", which queries
    # EventTicketRequest directly and doesn't depend on this FK at all.
    related_event = models.ForeignKey(
        "authapp.CasinoEvent", null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    active_from = models.DateTimeField(null=True, blank=True)
    active_until = models.DateTimeField(null=True, blank=True)
    # Named visual preset — extensible without a schema change if more than
    # one premium theme is ever wanted; only "gold_black" exists today.
    theme = models.CharField(max_length=20, default="gold_black")

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="bonus_wheels_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    @property
    def is_currently_active(self) -> bool:
        """Checked live on every request — this backend has no scheduler to
        sweep active_until on a timer, so nothing flips is_active
        automatically; a wheel past its window just stops being eligible
        the next time anyone checks."""
        if not self.is_active:
            return False
        now = timezone.now()
        if self.active_from and now < self.active_from:
            return False
        if self.active_until and now > self.active_until:
            return False
        return True


class BonusWheelReward(models.Model):
    wheel = models.ForeignKey(BonusWheel, on_delete=models.CASCADE, related_name="rewards")
    label = models.CharField(max_length=100)
    reward_type = models.CharField(max_length=20, choices=WHEEL_REWARD_TYPE_CHOICES, default="cash_bonus")
    value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    # Only used when reward_type == "casino_coupon".
    casino_name = models.CharField(max_length=150, blank=True)
    # Only used when reward_type == "event_ticket" — which event winning
    # this tier auto-registers the player for (see wheel_service dispatch).
    event = models.ForeignKey(
        "authapp.CasinoEvent", null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    icon = models.CharField(max_length=40, blank=True)
    color = models.CharField(max_length=9, blank=True)
    image = models.ImageField(upload_to="wheel/bonus_rewards/", null=True, blank=True)
    # Wheel face shows a "?" and the win popup reveals this tier's real
    # label/reward as normal — a display flag, not a second hidden draw.
    is_mystery = models.BooleanField(default=False)

    # Relative odds among this wheel's active tiers (mirrors SpinConfig.weight
    # exactly) — unlike Signup Wheel's literal percentages, Bonus Wheel tiers
    # are admin-invented per wheel, so relative weights are the natural
    # authoring unit here.
    weight = models.PositiveIntegerField(default=10)
    allow_repeat = models.BooleanField(default=True)
    # Platform-wide lifetime cap on how many times this exact tier can ever
    # be won (null = unlimited) — enforced against BonusWheelSpin counts.
    max_winners = models.PositiveIntegerField(null=True, blank=True)
    daily_limit = models.PositiveIntegerField(null=True, blank=True)
    monthly_limit = models.PositiveIntegerField(null=True, blank=True)

    is_active = models.BooleanField(default=True, db_index=True)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "id"]

    def __str__(self):
        return f"{self.label} ({self.wheel.name})"


class BonusWheelAssignment(models.Model):
    """One row per admin 'Assign' action — the targeting criteria snapshot
    at the moment it was created. Materializes matching BonusWheelGrant rows
    synchronously (see services/wheel_service or bonus_wheel_views) rather
    than being re-evaluated live later — a player who newly qualifies (e.g.
    levels up to the targeted VIP tier next month) isn't retroactively
    included; the admin creates a new assignment to reach them. This backend
    has no scheduler to keep a "live" rule in sync, and a precise,
    auditable, one-time "assign to whoever qualifies right now" action is
    the more defensible behavior anyway."""
    TARGET_TYPE_CHOICES = [
        ("individual", "Individual Player(s)"),
        ("vip_level", "VIP Level"),
        ("country", "Country"),
        ("event_registrants", "Event Registrants"),
    ]
    GRANT_REASON_CHOICES = [
        ("vip_levelup", "VIP Level-Up"),
        ("birthday", "Birthday"),
        ("loyalty", "Loyalty Reward"),
        ("promotional", "Promotional Event"),
        ("compensation", "Compensation"),
        ("special_campaign", "Special Campaign"),
        ("losing_streak", "Losing-Streak Reward"),
        ("winning_milestone", "Winning Milestone"),
        ("other", "Other"),
    ]

    wheel = models.ForeignKey(BonusWheel, on_delete=models.CASCADE, related_name="assignments")
    target_type = models.CharField(max_length=20, choices=TARGET_TYPE_CHOICES)
    # target_type="individual" — one row covers both "one player" and
    # "multiple players" (same mechanism, just a different-sized set).
    target_users = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="+")
    # target_type="vip_level" — matches User.vip_level (1-10) exactly.
    target_vip_level = models.PositiveSmallIntegerField(null=True, blank=True)
    # target_type="country" — ISO alpha-2, matches User.country's own
    # format exactly (NOT the full-name convention Promotion/CasinoEvent use).
    target_country = models.CharField(max_length=2, blank=True)
    # target_type="event_registrants" — everyone with an EventTicketRequest
    # for this event at assignment time.
    target_event = models.ForeignKey(
        "authapp.CasinoEvent", null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )

    spins_granted = models.PositiveIntegerField(default=1)
    grant_reason = models.CharField(max_length=20, choices=GRANT_REASON_CHOICES, default="other")
    expires_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="bonus_wheel_assignments_made",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Snapshot of how many players this assignment actually reached, for
    # admin visibility without re-querying the (possibly since-changed)
    # target criteria.
    recipient_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["wheel", "created_at"])]

    def __str__(self):
        return f"{self.wheel.name} → {self.get_target_type_display()} ({self.recipient_count})"


class BonusWheelGrant(models.Model):
    """The spendable unit: 'this player has N spins on this wheel, usable
    until E.' One row per (assignment × recipient)."""
    wheel = models.ForeignKey(BonusWheel, on_delete=models.CASCADE, related_name="grants")
    assignment = models.ForeignKey(BonusWheelAssignment, on_delete=models.CASCADE, related_name="grants")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bonus_wheel_grants")

    spins_total = models.PositiveIntegerField()
    spins_used = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "wheel"]),
            models.Index(fields=["user", "expires_at"]),
        ]

    def __str__(self):
        return f"{self.user_id} | {self.wheel.name} | {self.spins_used}/{self.spins_total}"

    @property
    def spins_remaining(self) -> int:
        return max(0, self.spins_total - self.spins_used)

    @property
    def is_usable(self) -> bool:
        if self.spins_remaining <= 0:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        if not self.wheel.is_currently_active:
            return False
        return True


class BonusWheelSpin(models.Model):
    """One row per spin. wheel is denormalized (not just grant→wheel) so
    history survives even if the grant/wheel is later deleted — mirrors why
    SpinHistory snapshots instead of only relying on its config FK."""
    grant = models.ForeignKey(BonusWheelGrant, on_delete=models.CASCADE, related_name="spins")
    wheel = models.ForeignKey(BonusWheel, on_delete=models.SET_NULL, null=True, related_name="+")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bonus_wheel_spins")
    reward = models.ForeignKey(BonusWheelReward, on_delete=models.SET_NULL, null=True, related_name="+")

    reward_label_snapshot = models.CharField(max_length=100)
    reward_type_snapshot = models.CharField(max_length=20)
    value_snapshot = models.DecimalField(max_digits=12, decimal_places=2)

    spun_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-spun_at"]
        indexes = [
            models.Index(fields=["user", "spun_at"]),
            # What max_winners/daily_limit/monthly_limit enforcement counts against.
            models.Index(fields=["reward", "spun_at"]),
        ]

    def __str__(self):
        return f"{self.user_id} | {self.reward_label_snapshot} | {self.spun_at:%Y-%m-%d}"
