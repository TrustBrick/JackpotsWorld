"""
authapp/models/affiliate_commission_models.py
─────────────────────────────────────────────────────────────────────────────
The configurable, per-affiliate-assignable commission engine — sits alongside
the pre-existing flat-rate system (AffiliateProfile.commission_rate +
ReferralCommission, see affiliate_models.py and services/affiliate_service.py)
rather than replacing it. An affiliate only starts using this engine once an
admin explicitly creates an AffiliateCommissionAssignment for them; until
then they keep earning under the original flat-rate-per-bet-slip flow
unchanged — see services/affiliate_commission_service.py for the dispatch
logic.

Three commission types, each independently configurable via CommissionPlan:
  deposit — one-time per referred player: rate% of their deposit total, paid
            out once their completed wagering reaches deposit_total × the
            plan's wagering_multiplier.
  losing  — same wagering gate as deposit (off the *losing* plan's own
            min_deposit/wagering_multiplier), then rate% of the player's
            cumulative qualifying loss, recalculated upward as they keep
            losing.
  rolling — no gate: rate% of every verified bet-slip's wagered amount,
            same event-driven shape as the legacy flow.
"""
from decimal import Decimal

from django.conf import settings
from django.db import models

COMMISSION_TYPES = [
    ("deposit", "Deposit Commission"),
    ("losing", "Losing Commission"),
    ("rolling", "Rolling Commission"),
]

QUALIFICATION_STATUSES = [
    ("pending", "Pending"),
    ("in_progress", "In Progress"),
    ("qualified", "Qualified"),
    ("not_qualified", "Not Qualified"),
]


class CommissionPlan(models.Model):
    """A Back-Office-managed commission configuration template. Multiple
    plans of the same commission_type may exist (e.g. a richer "VIP" deposit
    plan alongside the standard one) — an affiliate is assigned exactly one
    plan at a time via AffiliateCommissionAssignment."""

    commission_type = models.CharField(max_length=10, choices=COMMISSION_TYPES, db_index=True)
    name = models.CharField(max_length=120)

    # 3 decimal places so 0.115% (Rolling Commission's default rate) is
    # represented exactly rather than rounded to 0.12.
    rate = models.DecimalField(max_digits=6, decimal_places=3)

    # Used by "deposit" (both fields) and "losing" (both fields, off that
    # plan's own values — Losing Commission's gate is independent of
    # whatever the affiliate's Deposit plan, if any, is configured with).
    # Ignored by "rolling" plans.
    min_deposit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("5000.00"))
    wagering_multiplier = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("7.00"))

    is_active = models.BooleanField(default=True, db_index=True)
    # Marks the one suggested/pre-selected plan per commission_type when an
    # admin opens the "assign a plan" UI — purely a UX default, not enforced.
    is_default = models.BooleanField(default=False)
    description = models.TextField(
        blank=True,
        help_text="Shown to the affiliate as the plain-language explanation of this plan's terms.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["commission_type", "-is_default", "name"]

    def __str__(self):
        return f"{self.name} ({self.get_commission_type_display()} — {self.rate}%)"


class AffiliateCommissionAssignment(models.Model):
    """The one commission plan currently assigned to a given affiliate.
    Absence of a row for an affiliate means they're still on the legacy
    flat-rate system — see the module docstring."""

    affiliate = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="commission_assignment",
    )
    plan = models.ForeignKey(CommissionPlan, on_delete=models.PROTECT, related_name="assignments")
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="commission_assignments_made",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    # Stamped once the affiliate acknowledges/accepts the plan's terms via
    # the affiliate-facing "agree" action — null until then.
    agreed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.affiliate_id} → {self.plan}"


class AffiliatePlayerCommissionStatus(models.Model):
    """The live 'Commission Slip' row — one per (affiliate, referred_user,
    commission_type), continuously re-evaluated by
    services/affiliate_commission_service.evaluate_player_commission()
    rather than computed fresh on every read, so the affiliate-facing
    Commission Slip and the Back Office report always agree and never
    recompute financial figures on the frontend."""

    affiliate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="player_commission_statuses",
    )
    referred_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="commission_statuses",
    )
    commission_type = models.CharField(max_length=10, choices=COMMISSION_TYPES, db_index=True)
    plan = models.ForeignKey(CommissionPlan, on_delete=models.PROTECT, related_name="player_statuses")

    # Snapshot of the rate actually used once qualified, so a later edit to
    # the plan's rate never retroactively changes an already-qualified
    # player's historical figures (mirrors ReferralCommission.commission_rate,
    # which already snapshots the same way).
    rate_applied = models.DecimalField(max_digits=6, decimal_places=3, null=True, blank=True)

    deposit_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    required_wagering = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    completed_wagering = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    player_loss = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    rolling_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    # "losing" only: how much of player_loss has already been converted into
    # a ReferralCommission amount (at whatever rate applied at the time).
    # Evaluating again only ever prices the loss *beyond* this figure at the
    # plan's current rate, then advances it by that same slice — so a
    # mid-cycle rate change affects newly-incurred loss going forward only,
    # never re-prices loss that's already reflected in an existing row (see
    # services/affiliate_commission_service._evaluate_losing).
    loss_basis_committed = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    qualification_status = models.CharField(
        max_length=15, choices=QUALIFICATION_STATUSES, default="pending", db_index=True,
    )
    not_qualified_reason = models.CharField(max_length=255, blank=True)

    commission_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    # The actual money-ledger row this status has (most recently) produced,
    # if any — null until qualification_status first reaches "qualified".
    commission = models.ForeignKey(
        "authapp.ReferralCommission", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="player_status_source",
    )

    last_evaluated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        unique_together = ("affiliate", "referred_user", "commission_type")
        indexes = [
            models.Index(fields=["affiliate", "qualification_status"]),
            models.Index(fields=["affiliate", "commission_type"]),
        ]

    def __str__(self):
        return f"{self.affiliate_id} / {self.referred_user_id} / {self.commission_type} — {self.qualification_status}"
