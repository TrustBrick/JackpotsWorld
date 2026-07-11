"""
authapp/models/spin_models.py
─────────────────────────────────────────────────────────────────────────────
Daily Login Spin Wheel:
  • SpinConfig         — admin-configurable reward tiers
  • SpinSettings       — singleton (pk=1) holding the admin-configurable
                          monthly spin cap, jackpot cadence, and sound toggle.
  • SpinGlobalCounter  — singleton row (pk=1) tracking distinct users who
                          have ever spun, so the jackpot tier can be awarded
                          deterministically to every Nth *distinct user's*
                          first spin (see SpinSettings.jackpot_every_n_users).
                          select_for_update() is called explicitly at the
                          call site inside an atomic() block, same
                          convention as AdminWallet.
  • SpinHistory        — one row per spin, snapshotting the reward actually
                          given so history stays correct even if SpinConfig
                          changes later.
"""
from django.db import models
from django.conf import settings

REWARD_TYPE_CHOICES = [
    ("cash_wallet_bonus",   "Cash Wallet Bonus"),
    ("casino_wallet_bonus", "Casino Wallet Bonus"),
    ("rolling_points",      "Free Rolling Points"),
    ("cashback",            "Cashback"),
    ("bonus_credits",       "Bonus Credits (Non-Cash)"),
    ("merch",               "Merchandise"),
    ("gift_voucher",        "Gift Voucher"),
    ("discount_coupon",     "Discount Voucher"),
    ("event_pass",          "Event Pass"),
    ("tournament_entry",    "Free Tournament Entry"),
    ("jackpot_bonus",       "Jackpot Bonus"),
    ("vip_upgrade",         "VIP Upgrade"),
    ("no_reward",           "No Reward"),
]

# Reward types with no automated processing path — every type used to fall
# back to manual Back Office fulfillment; now only truly unhandled/unknown
# types would land here (kept as a safety net, not the common path).
MANUAL_FULFILLMENT_TYPES = set()


class SpinConfig(models.Model):
    label       = models.CharField(max_length=100)
    reward_type = models.CharField(max_length=25, choices=REWARD_TYPE_CHOICES)
    value       = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Only used when reward_type == "casino_wallet_bonus" — which specific
    # casino's wallet to credit.
    casino_name = models.CharField(max_length=150, blank=True)
    # Only used when reward_type == "tournament_entry" / "event_pass" — which
    # specific tournament/event winning this tier auto-registers the user for.
    tournament  = models.ForeignKey(
        "authapp.PokerTournament", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    event       = models.ForeignKey(
        "authapp.CasinoEvent", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # Optional icon/image shown on the wheel segment and win popup.
    image_url   = models.URLField(blank=True)
    # Relative odds among non-jackpot tiers (weighted random). Ignored for
    # jackpot tiers, which are awarded deterministically (see SpinPlayView).
    weight      = models.PositiveIntegerField(default=10)
    is_jackpot  = models.BooleanField(default=False, db_index=True)
    is_active   = models.BooleanField(default=True, db_index=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_jackpot", "-weight"]

    def __str__(self):
        return f"{self.label} ({self.reward_type})"


class SpinSettings(models.Model):
    """Singleton (pk=1) — admin-configurable spin-wheel-wide settings."""
    max_spins_per_month    = models.PositiveIntegerField(default=5)
    jackpot_every_n_users   = models.PositiveIntegerField(default=50)
    sound_enabled          = models.BooleanField(default=True)
    updated_at             = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"SpinSettings | max/mo={self.max_spins_per_month} jackpot/N={self.jackpot_every_n_users}"


class SpinGlobalCounter(models.Model):
    """Singleton (pk=1) tracking the count of *distinct users* who have ever
    spun. Incremented only on a user's very first-ever spin; when that count
    hits a multiple of SpinSettings.jackpot_every_n_users, that first spin is
    jackpot-eligible."""
    eligible_user_count = models.PositiveBigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"SpinGlobalCounter | count={self.eligible_user_count}"


class SpinHistory(models.Model):
    user   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="spin_history")
    config = models.ForeignKey(SpinConfig, on_delete=models.SET_NULL, null=True, related_name="+")

    # Snapshot fields — kept even if the SpinConfig row is edited/deleted later.
    reward_type_snapshot  = models.CharField(max_length=25)
    reward_label_snapshot = models.CharField(max_length=100)
    value_snapshot        = models.DecimalField(max_digits=12, decimal_places=2)

    is_jackpot_win      = models.BooleanField(default=False)
    global_counter_value = models.PositiveBigIntegerField()  # eligible_user_count value at time of spin, for audit
    month_key           = models.CharField(max_length=7, db_index=True)  # "YYYY-MM", for the monthly cap query

    # Manual-fulfillment safety net for any reward type without an automated
    # processing path (should be rare/never in normal operation).
    needs_manual_fulfillment = models.BooleanField(default=False, db_index=True)
    fulfilled_at             = models.DateTimeField(null=True, blank=True)

    spun_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-spun_at"]
        indexes = [models.Index(fields=["user", "month_key"])]

    def __str__(self):
        return f"{self.user} | {self.reward_label_snapshot} | {self.spun_at:%Y-%m-%d}"
