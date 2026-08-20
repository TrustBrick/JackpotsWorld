"""
authapp/models/commission_rule_models.py
─────────────────────────────────────────────────────────────────────────────
Country + Casino + Affiliate scoped commission rules — the third and most
specific layer of the commission stack. The full dispatch order, implemented
in services/commission_rule_service.resolve_rule():

  1. CommissionRule  (this module)  — country/casino/affiliate scoped, tiered,
                                      condition-gated
  2. CommissionPlan  (affiliate_commission_models.py) — one plan per affiliate
  3. AffiliateProfile.commission_rate — the original flat rate

Each layer only applies when the layer above it produces no match, so adding
rules here never changes what an affiliate earns until an admin creates a rule
that actually matches them. Nothing in this module rewrites, migrates or
disables the two layers below it.

Country is a plain string matching Casino.country / User.country rather than a
new Country table — the app has never had one, and introducing it would mean
migrating every existing country column. Casino is a real FK, since that table
already exists.
"""
from decimal import Decimal

from django.conf import settings
from django.db import models

from authapp.models.casino_models import Casino

# Deliberately the same three values as affiliate_commission_models.
# COMMISSION_TYPES so a rule and a plan describe the same kinds of earning and
# ReferralCommission.commission_type stays a single shared vocabulary.
COMMISSION_TYPES = [
    ("deposit", "Deposit Commission"),
    ("losing", "Losing Commission"),
    ("rolling", "Rolling Commission"),
]

RATE_TYPES = [
    ("percentage", "Percentage of base amount"),
    ("fixed", "Fixed amount per qualifying player"),
    ("tiered", "Tiered — rate comes from the matching CommissionTier"),
]

# What a tier or condition measures. Every one of these is resolved by
# services/commission_engine_service._measure(), which is the single place
# that knows how to read each metric off the existing ledgers.
METRICS = [
    ("referred_players", "Referred players"),
    ("qualified_players", "Qualified players"),
    ("active_players", "Active players"),
    ("deposit_total", "Total deposits"),
    ("deposit_per_player", "Deposit per player"),
    ("betting_amount", "Total betting amount"),
    ("rolling_points", "Rolling points"),
    ("player_loss", "Player loss"),
    ("active_days", "Days player has been active"),
]

OPERATORS = [
    ("gte", "≥"),
    ("gt", ">"),
    ("lte", "≤"),
    ("lt", "<"),
    ("eq", "="),
]

# Part 36's vocabulary. pending → qualifying → qualified → approved → payable
# → paid, with rejected/cancelled reachable from any pre-paid state. Nothing
# reaches "paid" from calculation alone; only an explicit admin action does.
LEDGER_STATUSES = [
    ("pending", "Pending"),
    ("qualifying", "Qualifying"),
    ("qualified", "Qualified"),
    ("approved", "Approved"),
    ("payable", "Payable"),
    ("paid", "Paid"),
    ("rejected", "Rejected"),
    ("cancelled", "Cancelled"),
]

# Scope weights behind CommissionRule.specificity. Chosen so that summing the
# dimensions a rule pins down reproduces Part 34's precedence order exactly:
#   affiliate+casino+country 7 > affiliate+casino 6 > affiliate+country 5 >
#   affiliate 4 > casino+country 3 > casino 2 > country 1 > global 0
_WEIGHT_AFFILIATE = 4
_WEIGHT_CASINO = 2
_WEIGHT_COUNTRY = 1


class CommissionRule(models.Model):
    name = models.CharField(max_length=150)

    # All three scope columns are optional. A rule that pins none of them is
    # the global default; pinning more makes it win over less specific rules.
    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.CASCADE, related_name="commission_rules",
    )
    country = models.CharField(max_length=100, blank=True, db_index=True)
    casino = models.ForeignKey(
        Casino, null=True, blank=True,
        on_delete=models.CASCADE, related_name="commission_rules",
    )

    commission_type = models.CharField(max_length=10, choices=COMMISSION_TYPES, db_index=True)
    rate_type = models.CharField(max_length=12, choices=RATE_TYPES, default="percentage")

    rate = models.DecimalField(
        max_digits=6, decimal_places=3, default=Decimal("0"),
        help_text="Percent, used when rate_type is 'percentage'. 3dp so 0.115% is exact.",
    )
    fixed_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0"),
        help_text="Used when rate_type is 'fixed'.",
    )
    currency = models.CharField(max_length=8, default="USD")

    min_qualifying_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0"),
        help_text="Base amount must reach this before any commission is calculated.",
    )
    max_commission = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
        help_text="Optional ceiling applied to the calculated amount.",
    )

    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    # Admin-set tiebreaker between two rules of identical specificity. Higher
    # wins. Never overrides specificity — a country-only rule with priority
    # 999 still loses to an affiliate+casino+country rule with priority 0,
    # because "most specific valid active rule" is the primary requirement.
    priority = models.IntegerField(default=0)

    # Denormalised scope weight, maintained in save(). Stored rather than
    # computed per-request so rule resolution orders in SQL and stays O(log n)
    # as the rule table grows.
    specificity = models.PositiveSmallIntegerField(default=0, editable=False, db_index=True)

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="commission_rules_created",
    )

    class Meta:
        ordering = ["-specificity", "-priority", "name"]
        indexes = [
            models.Index(fields=["is_active", "commission_type", "-specificity"]),
            models.Index(fields=["country", "commission_type"]),
            models.Index(fields=["affiliate", "commission_type"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_commission_type_display()}) — {self.scope_label}"

    @property
    def scope_label(self):
        parts = []
        if self.affiliate_id:
            parts.append(f"Affiliate #{self.affiliate_id}")
        if self.country:
            parts.append(self.country)
        if self.casino_id:
            parts.append(self.casino.name if self.casino else f"Casino #{self.casino_id}")
        return " + ".join(parts) or "Global default"

    def compute_specificity(self):
        return (
            (_WEIGHT_AFFILIATE if self.affiliate_id else 0)
            + (_WEIGHT_CASINO if self.casino_id else 0)
            + (_WEIGHT_COUNTRY if self.country else 0)
        )

    def is_effective_on(self, on_date):
        """Date-window check, kept here so the engine and the Back Office
        'currently effective?' badge can never disagree."""
        if self.start_date and on_date < self.start_date:
            return False
        if self.end_date and on_date > self.end_date:
            return False
        return True

    def save(self, *args, **kwargs):
        self.specificity = self.compute_specificity()
        # Normalised so "sri lanka" and "Sri Lanka" resolve identically —
        # country is matched case-insensitively at read time, but storing it
        # consistently keeps the Back Office list from showing near-duplicates.
        self.country = (self.country or "").strip()
        super().save(*args, **kwargs)


class CommissionTier(models.Model):
    """A performance band within a rule (Part 32). Only consulted when the
    parent rule's rate_type is 'tiered'."""

    rule = models.ForeignKey(CommissionRule, on_delete=models.CASCADE, related_name="tiers")
    name = models.CharField(max_length=120, blank=True)

    metric = models.CharField(max_length=24, choices=METRICS, default="qualified_players")
    min_value = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    # null = unbounded upper end, so the top tier doesn't need an arbitrary
    # ceiling that a high performer could accidentally exceed.
    max_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    rate = models.DecimalField(max_digits=6, decimal_places=3, default=Decimal("0"))
    fixed_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["rule", "order", "min_value"]
        indexes = [models.Index(fields=["rule", "is_active", "order"])]

    def __str__(self):
        upper = f"{self.max_value}" if self.max_value is not None else "∞"
        return f"{self.name or 'Tier'} [{self.min_value}–{upper}] → {self.rate}%"

    def matches(self, value):
        if value is None:
            return False
        if value < self.min_value:
            return False
        if self.max_value is not None and value > self.max_value:
            return False
        return True


class CommissionCondition(models.Model):
    """A qualification requirement attached to a rule (Part 31). The *types*
    are a fixed vocabulary (each needs engine code that knows how to measure
    it), but every threshold is Back-Office configurable — no number in this
    system is hardcoded."""

    rule = models.ForeignKey(CommissionRule, on_delete=models.CASCADE, related_name="conditions")
    metric = models.CharField(max_length=24, choices=METRICS)
    operator = models.CharField(max_length=4, choices=OPERATORS, default="gte")
    value = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["rule", "metric"]
        indexes = [models.Index(fields=["rule", "is_active"])]

    def __str__(self):
        return f"{self.get_metric_display()} {self.get_operator_display()} {self.value}"

    def evaluate(self, actual):
        if actual is None:
            return False
        return {
            "gte": actual >= self.value,
            "gt": actual > self.value,
            "lte": actual <= self.value,
            "lt": actual < self.value,
            "eq": actual == self.value,
        }[self.operator]

    def label(self):
        return self.description or f"{self.get_metric_display()} {self.get_operator_display()} {self.value}"


class CommissionLedgerEntry(models.Model):
    """The Part 37 audit record: one immutable row per commission the rule
    engine calculated, carrying the rule/tier/rate/conditions *as they were at
    calculation time*.

    Deliberately separate from ReferralCommission (the money row). Existing
    money bookkeeping — AffiliateProfile.total_earned, the affiliate dashboard,
    the admin payout screens — keeps working off ReferralCommission untouched;
    this table is the traceability layer next to it, linked by
    `referral_commission`. That is the same shape
    AffiliatePlayerCommissionStatus.commission already uses.

    Rule/tier FKs are SET_NULL with the name snapshotted alongside, so deleting
    a rule never destroys the history of what was paid under it.
    """

    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="commission_ledger_entries",
    )
    referred_player = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="commission_ledger_entries_generated",
    )

    country = models.CharField(max_length=100, blank=True, db_index=True)
    casino = models.ForeignKey(
        Casino, null=True, blank=True, on_delete=models.SET_NULL, related_name="commission_ledger_entries",
    )

    rule = models.ForeignKey(
        CommissionRule, null=True, blank=True, on_delete=models.SET_NULL, related_name="ledger_entries",
    )
    rule_name = models.CharField(max_length=150, blank=True)
    tier = models.ForeignKey(
        CommissionTier, null=True, blank=True, on_delete=models.SET_NULL, related_name="ledger_entries",
    )
    tier_name = models.CharField(max_length=120, blank=True)

    commission_type = models.CharField(max_length=10, choices=COMMISSION_TYPES, db_index=True)
    base_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    commission_rate = models.DecimalField(max_digits=6, decimal_places=3, default=Decimal("0"))
    commission_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    currency = models.CharField(max_length=8, default="USD")

    # [{metric, operator, required, actual, met}, …] — the exact condition
    # evaluation this entry was judged against, so "why did/didn't this
    # qualify" is answerable months later even if the rule has since changed.
    conditions_snapshot = models.JSONField(default=list, blank=True)
    # Human-readable calculation trail (Part 35's traceability requirement).
    calculation_trace = models.TextField(blank=True)
    qualification_reason = models.CharField(max_length=255, blank=True)

    status = models.CharField(max_length=12, choices=LEDGER_STATUSES, default="pending", db_index=True)

    # The money row this entry produced, if it reached qualification.
    referral_commission = models.ForeignKey(
        "authapp.ReferralCommission", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="ledger_entries",
    )
    # Bet-slip number / transaction ref that triggered this calculation. Used
    # for idempotency on the rolling branch, and — via the synthetic
    # "deposit:<player id>" reference that
    # commission_engine_service.deposit_reference() stamps on every deposit
    # entry — for the deposit branch's one-per-(affiliate, player) rule too.
    #
    # NULL, never "", when there is no reference. The uniqueness below is
    # enforced unconditionally, and every backend treats NULLs in a unique
    # index as distinct from one another -- so the losing entries, which
    # price a genuinely new slice of loss each time and have no bet slip,
    # stay exempt without needing a partial index that MySQL cannot build.
    # Blank strings would all collide instead.
    reference_id = models.CharField(max_length=100, null=True, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    qualified_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    admin_notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="commission_entries_reviewed",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["affiliate", "status"]),
            models.Index(fields=["affiliate", "commission_type"]),
            models.Index(fields=["country", "status"]),
            models.Index(fields=["status", "created_at"]),
        ]
        constraints = [
            # Idempotency for the rolling branch (one entry per bet slip per
            # affiliate/player) and for the deposit branch (one entry per
            # affiliate/player, under its synthetic deposit:<id> reference).
            #
            # This deliberately carries no condition=. It used to be
            # condition=~Q(reference_id="") to exempt the deposit/losing rows
            # that have no bet slip, but a conditional UniqueConstraint
            # compiles to a partial index, which MySQL does not support --
            # Django's schema editor returns None for the SQL and the
            # constraint is silently never created (models.W036). The
            # IntegrityError that _persist() catches for idempotency
            # therefore never fired, and nothing stopped the same bet slip
            # being paid twice.
            #
            # Exemption now comes from reference_id being NULL rather than
            # "" on those rows (see the field above), which every backend
            # already treats as distinct in a unique index. Same intent,
            # actually enforced.
            models.UniqueConstraint(
                fields=["affiliate", "referred_player", "commission_type", "reference_id"],
                name="uniq_commission_ledger_reference",
            ),
        ]

    def __str__(self):
        return f"{self.affiliate_id} — {self.commission_amount} {self.currency} ({self.status})"

    def save(self, *args, **kwargs):
        # Snapshot the names so history survives the rule being renamed or
        # deleted (the FKs are SET_NULL).
        if self.rule_id and not self.rule_name:
            self.rule_name = self.rule.name
        if self.tier_id and not self.tier_name:
            self.tier_name = self.tier.name or str(self.tier)
        super().save(*args, **kwargs)
