from decimal import Decimal

from django.conf import settings
from django.db import models

from authapp.constants.games import GAME_FIELD_CHOICES, GAME_UNSPECIFIED


class AffiliateProfile(models.Model):
    """Marks a User as an affiliate — mirrors AdminProfile's pattern of
    layering a role-specific profile on top of the base User account."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="affiliate_profile",
    )
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("10.00"))
    is_active = models.BooleanField(default=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="affiliates_approved",
    )
    total_earned = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    can_view_player_transactions = models.BooleanField(default=False)

    # AFFILIATE-LEVELS: every affiliate joins at VIP and moves up in this
    # order. LEVEL_ORDER is the single source for "which is higher".
    # Moved up automatically when the admin-set AffiliateLevelCondition for a
    # higher level is met (services/affiliate_level_service); never moved
    # down automatically. Levels carry no perks yet.
    LEVEL_VIP = "vip"
    LEVEL_CHOICES = [
        (LEVEL_VIP, "VIP"),
        ("bronze",  "Bronze"),
        ("silver",  "Silver"),
        ("gold",    "Gold"),
        ("diamond", "Diamond"),
    ]
    LEVEL_ORDER = [value for value, _ in LEVEL_CHOICES]
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default=LEVEL_VIP, db_index=True)
    level_updated_at = models.DateTimeField(null=True, blank=True)
    # True once an admin sets the level by hand: automatic evaluation then
    # leaves this affiliate alone, so a manual downgrade is not undone by the
    # next deposit. Cleared by the admin choosing "Automatic" again.
    level_locked = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Affiliate: {self.user.email} ({self.commission_rate}%)"

    @property
    def total_pending(self):
        return self.total_earned - self.total_paid


class AffiliateLevelCondition(models.Model):
    """AFFILIATE-LEVELS: what an affiliate must reach to be moved up to a
    level. One row per level above VIP, edited by admins in the Back Office.

    Every filled-in minimum must be met (AND). A blank minimum is ignored.
    A level whose minimums are ALL blank is never awarded automatically --
    otherwise an unconfigured level would be handed to every affiliate the
    moment evaluation ran. Figures are lifetime totals and use the same
    definitions as the affiliate dashboard (services/affiliate_level_service).
    """

    level = models.CharField(
        max_length=10, unique=True,
        choices=[c for c in AffiliateProfile.LEVEL_CHOICES if c[0] != AffiliateProfile.LEVEL_VIP],
    )
    min_referred_players = models.PositiveIntegerField(null=True, blank=True)
    min_qualified_players = models.PositiveIntegerField(null=True, blank=True)
    min_deposit_volume = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    min_commission_earned = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )

    METRIC_FIELDS = {
        "min_referred_players": "referred_players",
        "min_qualified_players": "qualified_players",
        "min_deposit_volume": "deposit_volume",
        "min_commission_earned": "commission_earned",
    }

    def is_configured(self):
        return any(getattr(self, f) is not None for f in self.METRIC_FIELDS)

    def is_met_by(self, metrics):
        """True when every filled-in minimum is reached. False for an
        unconfigured row (see class docstring)."""
        if not self.is_configured():
            return False
        return all(
            metrics[metric] >= getattr(self, field)
            for field, metric in self.METRIC_FIELDS.items()
            if getattr(self, field) is not None
        )

    def __str__(self):
        return f"Conditions for {self.get_level_display()}"


class ReferralCommission(models.Model):
    STATUS_CHOICES = [("pending", "Pending"), ("paid", "Paid"), ("rejected", "Rejected")]

    # "legacy" = written by the original flat-rate-per-bet-slip flow
    # (services/affiliate_service.py record_referral_commission) — every
    # pre-existing row, and every future row for an affiliate who hasn't
    # been given an AffiliateCommissionAssignment, keeps this value. The
    # other three are written by services/affiliate_commission_service.py's
    # type-aware engine. See affiliate_commission_models.py's module
    # docstring for the full split.
    COMMISSION_TYPE_CHOICES = [
        ("legacy", "Legacy Flat Rate"),
        ("deposit", "Deposit Commission"),
        ("losing", "Losing Commission"),
        ("rolling", "Rolling Commission"),
    ]
    QUALIFICATION_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("in_progress", "In Progress"),
        ("qualified", "Qualified"),
        ("not_qualified", "Not Qualified"),
    ]

    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="referral_commissions",
    )
    referred_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="commissions_generated",
    )
    source_transaction_ref = models.CharField(max_length=100, blank=True)
    # Generic "eligible amount" this commission was calculated from — the
    # bet-slip's wagered amount for legacy/rolling rows, the player's
    # deposit total for deposit-type rows, their cumulative qualifying loss
    # for losing-type rows. Field name kept as-is (no rename/migration of
    # existing data) despite no longer meaning "deposit" literally for
    # every row.
    deposit_amount = models.DecimalField(max_digits=14, decimal_places=2)
    # 3 decimal places (widened from the original 2) so Rolling Commission's
    # 0.115% default rate is stored exactly rather than rounded to 0.12 —
    # matches CommissionPlan.rate / AffiliatePlayerCommissionStatus.rate_applied.
    # Existing legacy rows (always whole-ish percents like 10.00) are
    # unaffected by the wider precision.
    commission_rate = models.DecimalField(max_digits=6, decimal_places=3)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending", db_index=True)

    commission_type = models.CharField(
        max_length=10, choices=COMMISSION_TYPE_CHOICES, default="legacy", db_index=True,
    )
    # Which game generated the activity behind this commission. Mirrors
    # CommissionLedgerEntry.game and comes from the same shared vocabulary, so
    # the money row and its audit row always agree.
    #
    # "" on every pre-existing row: those commissions were earned before any
    # game was attributed, and backfilling them would be inventing history.
    # Per-game affiliate reporting therefore reads "not attributed" for old
    # activity rather than silently crediting it to a game.
    game = models.CharField(
        max_length=20, choices=GAME_FIELD_CHOICES, blank=True, default=GAME_UNSPECIFIED,
        db_index=True,
    )
    # Existing rows/legacy rows were always awarded unconditionally, so they
    # are correctly "qualified" from the moment this field was introduced.
    qualification_status = models.CharField(
        max_length=15, choices=QUALIFICATION_STATUS_CHOICES, default="qualified",
    )
    required_wagering = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    completed_wagering = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    player_loss = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    not_qualified_reason = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["affiliate", "status"]),
            models.Index(fields=["affiliate", "commission_type"]),
            models.Index(fields=["affiliate", "game"]),
        ]

    def __str__(self):
        return f"{self.affiliate_id} earns {self.amount} from {self.referred_user_id}"


class AffiliateCampaign(models.Model):
    """An affiliate-created tracking bucket for their referral link — lets one
    affiliate run several distinctly-tracked links (e.g. per channel/promo)
    instead of just the one blanket referral_code link. Clicks/visitors are
    attributed to a campaign via AffiliateClickLog.campaign below."""

    STATUS_CHOICES = [("active", "Active"), ("paused", "Paused"), ("expired", "Expired")]

    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="campaigns",
    )
    name = models.CharField(max_length=120)
    # Affiliate-chosen text id embedded in the referral link's ?campaign=
    # param — unique per affiliate (not globally) since the link is always
    # resolved as the (ref, campaign) pair together.
    campaign_id = models.CharField(max_length=60)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active", db_index=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("affiliate", "campaign_id")
        indexes = [models.Index(fields=["affiliate", "status"])]

    def __str__(self):
        return f"{self.name} ({self.campaign_id}) — {self.affiliate_id}"


class AffiliateClickLog(models.Model):
    """One row per referral-link visit — recorded from the public landing
    page (see App.jsx's ?ref=/?campaign= capture) before any signup happens,
    so 'Total Clicks' can be tracked independently of conversions.

    Also doubles as the campaign visitor/attribution ledger: `campaign` links
    a click to the AffiliateCampaign it came through (null for a plain,
    non-campaign referral link visit), and `registered_user` is stamped
    after the fact — by VerifyOTPView — if this exact click goes on to
    become a real signup, letting campaign analytics answer "did this
    visitor register / deposit / bet" without a separate tracking table."""

    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="click_logs",
    )
    campaign = models.ForeignKey(
        AffiliateCampaign, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="click_logs",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    landing_path = models.CharField(max_length=255, blank=True)

    # Which game this referral link was promoting, from the link's ?game=
    # parameter (or inferred from landing_path when the link pointed straight
    # at a game page). This is the *intent* of the referral, and it is
    # deliberately NOT what commission attribution reads: a player referred
    # through a poker link who then plays Andhar Bahar generates Andhar Bahar
    # commission. Keeping the two apart is what stops marketing intent being
    # mistaken for actual activity.
    game = models.CharField(
        max_length=20, choices=GAME_FIELD_CHOICES, blank=True, default=GAME_UNSPECIFIED,
        db_index=True,
    )

    # Best-effort, resolved at write time from ip_address (see
    # authapp/utils/geolocation.py) / user_agent (see authapp/utils/user_agent.py).
    country = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100, blank=True)
    device = models.CharField(max_length=20, blank=True)
    browser = models.CharField(max_length=30, blank=True)

    # Set later, once (if ever) this click converts into a real signup —
    # see authapp/otp/otp_views.py VerifyOTPView.
    registered_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["affiliate", "created_at"]),
            models.Index(fields=["campaign", "created_at"]),
        ]

    def __str__(self):
        return f"Click for {self.affiliate_id} at {self.created_at}"


class AffiliateLoginLog(models.Model):
    """One row per successful affiliate login — written from AffiliateLoginView."""

    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="affiliate_login_logs",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Login for {self.affiliate_id} at {self.created_at}"
