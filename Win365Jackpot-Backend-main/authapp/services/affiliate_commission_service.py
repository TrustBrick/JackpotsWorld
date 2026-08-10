"""
authapp/services/affiliate_commission_service.py
─────────────────────────────────────────────────────────────────────────────
The configurable, per-affiliate-assignable commission engine (model layer:
authapp/models/affiliate_commission_models.py). Entry point is
evaluate_player_commission() — safe to call redundantly/concurrently for the
same event; it always recomputes qualification fresh from the underlying
ledgers (deposits, bet-slips, losses) rather than trusting incremental
deltas from the caller, so a duplicate trigger can never double-create a
commission (deposit/losing branches are naturally idempotent this way; the
rolling branch relies on the existing upstream slip_number uniqueness guard
in admin_offline_deposit_views.py, same as the legacy flow already does).

An affiliate with no AffiliateCommissionAssignment is completely untouched
by this module — they keep earning under the original flat-rate flow (see
affiliate_service.record_referral_commission), called separately by the
same two trigger sites. See that module's docstring for why: this engine is
strictly additive, not a replacement.

Two trigger events call evaluate_player_commission() today (both non-fatal,
wrapped in try/except by the caller):
  • a verified bet-slip (OfflineDepositLog entry_type="rolling_points") —
    passes bet_amount/slip_number, the only branch that needs them (rolling).
  • a recorded casino loss (CasinoWalletTransaction transaction_type="LAC")
    — no bet_amount/slip_number; relevant to the losing branch.
Calling with a bet_amount but an affiliate on a "losing" or "deposit" plan
(or vice versa) is expected and harmless — each branch only acts on the
event data it actually needs and ignores the rest.

Money flow note: a qualified commission here creates a ReferralCommission
row (status="pending") and bumps AffiliateProfile.total_earned /
User.referral_earnings, exactly mirroring record_referral_commission's
bookkeeping — which keeps AffiliateDashboardView's available_balance
(profile.total_earned - total_paid) consistent with its
commission_pending/commission_paid cards, since those are summed fresh from
ReferralCommission and therefore already include every commission_type with
no dashboard code change needed. It deliberately does NOT call
affiliate_wallet_service.credit_wallet_from_commission() the way the legacy
flow does — that module immediately credits a separate withdrawable wallet
balance, whereas here "qualified" is only meant to reach the spec's
"Payable" display state (qualified + still status="pending"); real funds
only move once an admin pays it out via the existing, untouched
AdminMarkCommissionPaidView, same admin-gated mechanism the legacy flow's
ReferralCommission rows already go through.
"""
import logging
from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Sum

from authapp.models.affiliate_commission_models import (
    AffiliateCommissionAssignment,
    AffiliatePlayerCommissionStatus,
)
from authapp.models.affiliate_models import AffiliateProfile, ReferralCommission
from authapp.models.offline_deposit import OfflineDepositLog
from authapp.services.affiliate_stats_service import get_deposit_totals, get_loss_totals

logger = logging.getLogger(__name__)


def commission_display_status(qualification_status, referral_status=None) -> str:
    """Single source of truth for collapsing the two underlying fields
    (AffiliatePlayerCommissionStatus.qualification_status +ReferralCommission.status)
    into the one unambiguous label the spec calls for — reused by every
    serializer/report so the affiliate Commission Slip and the Back Office
    reporting table never disagree. See the plan's status-vocabulary table:
      qualified + pending  -> Payable   qualified + paid -> Paid
      in_progress / not_qualified -> "Not Qualified"      no row yet -> Pending
      any + rejected -> Rejected (rejection is a payment-side outcome,
      checked first so it can override an otherwise-qualified row)."""
    if referral_status == "rejected":
        return "Rejected"
    if qualification_status == "qualified":
        return "Paid" if referral_status == "paid" else "Payable"
    if qualification_status in ("in_progress", "not_qualified"):
        return "Not Qualified"
    return "Pending"


def has_commission_assignment(affiliate) -> bool:
    """True if this affiliate has been explicitly opted into the new
    commission engine — regardless of whether their currently assigned
    plan happens to be active right now. This is the signal callers use to
    decide whether to dispatch to evaluate_player_commission() or fall back
    to the legacy flat-rate record_referral_commission(): an assignment
    existing but its plan being deactivated should pause new-engine
    commissions for that affiliate, not silently resurrect the old
    flat-rate system underneath them, so this deliberately does NOT check
    plan.is_active (evaluate_player_commission handles that no-op itself)."""
    if not affiliate:
        return False
    return AffiliateCommissionAssignment.objects.filter(affiliate=affiliate).exists()


def _get_completed_wagering(user_id) -> Decimal:
    """Sum of every verified bet-slip's wagered amount for this player — the
    same ledger the legacy flow's per-slip commission is triggered from,
    reused here as "completed wagering" for the deposit/losing gate rather
    than User.rolling_points_total (RP points, not a dollar total, and
    decoupled from the ledger whenever an admin manually overrides RP)."""
    total = (
        OfflineDepositLog.objects
        .filter(user_id=user_id, entry_type="rolling_points", slip_number__isnull=False)
        .aggregate(total=Sum("total_bet_amount"))["total"]
    )
    return total or Decimal("0")


def _bump_earned(affiliate, amount):
    """Mirrors record_referral_commission's own bookkeeping (total_earned +
    referral_earnings) for a newly qualified/incremented commission amount.
    Locks the AffiliateProfile row first since, unlike the legacy flow
    (one bet-slip at a time, already serialized by evaluate_player_commission's
    per-status-row lock), two different referred_users under the same
    affiliate could otherwise race on this shared counter."""
    if not amount:
        return
    profile = AffiliateProfile.objects.select_for_update().filter(user=affiliate).first()
    if profile:
        profile.total_earned += amount
        profile.save(update_fields=["total_earned"])
    affiliate.referral_earnings = (affiliate.referral_earnings or Decimal("0")) + amount
    affiliate.save(update_fields=["referral_earnings"])


def _create_commission_row(*, affiliate, referred_user, commission_type, amount, eligible_amount,
                            rate, source_ref="", required_wagering=None, completed_wagering=None,
                            player_loss=None) -> ReferralCommission:
    commission = ReferralCommission.objects.create(
        affiliate=affiliate, referred_user=referred_user,
        source_transaction_ref=source_ref, deposit_amount=eligible_amount,
        commission_rate=rate, amount=amount,
        commission_type=commission_type, qualification_status="qualified",
        required_wagering=required_wagering, completed_wagering=completed_wagering,
        player_loss=player_loss,
    )
    _bump_earned(affiliate, amount)
    return commission


def _evaluate_deposit(status, plan, affiliate, referred_user):
    """One-time per referred player: rate% of their deposit total, once
    completed wagering reaches deposit_total × the plan's wagering_multiplier."""
    if status.qualification_status == "qualified":
        return  # already awarded — one-time, hard stop

    deposit_total = get_deposit_totals([referred_user.id]).get(referred_user.id, Decimal("0"))
    completed_wagering = _get_completed_wagering(referred_user.id)
    required_wagering = (deposit_total * plan.wagering_multiplier).quantize(Decimal("0.01"))

    status.plan = plan
    status.deposit_total = deposit_total
    status.completed_wagering = completed_wagering
    status.required_wagering = required_wagering

    if deposit_total < plan.min_deposit:
        status.qualification_status = "pending"
        status.not_qualified_reason = f"Minimum deposit of {plan.min_deposit} not yet reached."
    elif completed_wagering < required_wagering:
        status.qualification_status = "in_progress"
        status.not_qualified_reason = (
            f"{plan.wagering_multiplier}x wagering requirement not yet completed "
            f"({completed_wagering} of {required_wagering})."
        )
    else:
        amount = (deposit_total * plan.rate / Decimal("100")).quantize(Decimal("0.01"))
        status.qualification_status = "qualified"
        status.not_qualified_reason = ""
        status.rate_applied = plan.rate
        status.commission_amount = amount
        status.commission = _create_commission_row(
            affiliate=affiliate, referred_user=referred_user, commission_type="deposit",
            amount=amount, eligible_amount=deposit_total, rate=plan.rate,
            required_wagering=required_wagering, completed_wagering=completed_wagering,
        )

    status.save()


def _evaluate_losing(status, plan, affiliate, referred_user):
    """Same wagering gate as deposit (off the losing plan's own independent
    min_deposit/wagering_multiplier). Once gated, commission tracks the
    player's cumulative qualifying loss and only ever grows.

    Prices only the *incremental* loss since status.loss_basis_committed at
    the plan's *current* rate, then advances that basis by the same slice —
    self-healing/idempotent (a duplicate trigger with no new loss since the
    last evaluation is a no-op) without ever re-pricing loss that's already
    reflected in an existing row. This is what makes a mid-cycle admin rate
    change affect only newly-incurred loss going forward: loss_basis_committed
    remembers how much loss earlier evaluations (at whatever rate applied
    then) already accounted for, so it's never re-multiplied by a later,
    different rate — whether that row is still pending or already paid."""
    deposit_total = get_deposit_totals([referred_user.id]).get(referred_user.id, Decimal("0"))
    completed_wagering = _get_completed_wagering(referred_user.id)
    required_wagering = (deposit_total * plan.wagering_multiplier).quantize(Decimal("0.01"))

    status.plan = plan
    status.deposit_total = deposit_total
    status.completed_wagering = completed_wagering
    status.required_wagering = required_wagering

    if deposit_total < plan.min_deposit:
        status.qualification_status = "pending"
        status.not_qualified_reason = f"Minimum deposit of {plan.min_deposit} not yet reached."
        status.save()
        return
    if completed_wagering < required_wagering:
        status.qualification_status = "in_progress"
        status.not_qualified_reason = (
            f"{plan.wagering_multiplier}x wagering requirement not yet completed "
            f"({completed_wagering} of {required_wagering})."
        )
        status.save()
        return

    player_loss = get_loss_totals([referred_user.id]).get(referred_user.id, Decimal("0"))
    status.qualification_status = "qualified"
    status.not_qualified_reason = ""
    status.rate_applied = plan.rate
    status.player_loss = player_loss

    # Guards against both directions of drift: a correction that lowers
    # player_loss below the committed basis (delta would be negative — never
    # claws back an already-committed row) and simple no-op re-evaluations
    # with no new loss at all (delta == 0).
    new_loss = player_loss - status.loss_basis_committed
    if new_loss > 0:
        delta = (new_loss * plan.rate / Decimal("100")).quantize(Decimal("0.01"))
        if delta > 0:
            existing_rows = ReferralCommission.objects.filter(
                affiliate=affiliate, referred_user=referred_user, commission_type="losing",
            )
            pending_row = existing_rows.filter(status="pending").order_by("-created_at").first()
            if pending_row:
                pending_row.amount += delta
                pending_row.deposit_amount = player_loss
                pending_row.player_loss = player_loss
                pending_row.completed_wagering = completed_wagering
                pending_row.save(update_fields=["amount", "deposit_amount", "player_loss", "completed_wagering"])
                status.commission = pending_row
                _bump_earned(affiliate, delta)
            else:
                # No adjustable row exists (first time qualifying, or the only
                # prior row was already paid/rejected) — top up with a new row
                # for just the incremental slice. Never mutates a paid record.
                status.commission = _create_commission_row(
                    affiliate=affiliate, referred_user=referred_user, commission_type="losing",
                    amount=delta, eligible_amount=player_loss, rate=plan.rate,
                    source_ref=f"cumloss-{referred_user.id}",
                    required_wagering=required_wagering, completed_wagering=completed_wagering,
                    player_loss=player_loss,
                )
            # Only advance the basis once its slice has actually been priced
            # and committed — a sub-cent sliver that rounds to $0.00 stays
            # "new" and rolls into whatever loss accrues next, rather than
            # being silently written off by rounding.
            status.loss_basis_committed += new_loss

    status.commission_amount = (
        ReferralCommission.objects.filter(
            affiliate=affiliate, referred_user=referred_user, commission_type="losing",
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    )
    status.save()


def _evaluate_rolling(status, plan, affiliate, referred_user, bet_amount, slip_number):
    """No gate: rate% of this specific bet-slip's wagered amount, same
    event-driven shape as the legacy per-slip flow. No-ops when called from
    a non-bet-slip trigger (bet_amount is None). Belt-and-suspenders
    idempotency: the existing slip_number uniqueness guard upstream in
    admin_offline_deposit_views.py already stops a duplicate slip from
    reaching here at all (same guard the legacy flow relies on), but this
    also checks directly — a second evaluate_player_commission() call for a
    slip_number already recorded under this exact (affiliate, referred_user,
    "rolling") triple is a no-op rather than a second commission."""
    if bet_amount is None:
        return
    if slip_number and ReferralCommission.objects.filter(
        affiliate=affiliate, referred_user=referred_user,
        commission_type="rolling", source_transaction_ref=slip_number,
    ).exists():
        return

    bet_amount = Decimal(str(bet_amount))
    amount = (bet_amount * plan.rate / Decimal("100")).quantize(Decimal("0.01"))
    if amount <= 0:
        return

    status.plan = plan
    status.rate_applied = plan.rate
    status.qualification_status = "qualified"
    status.not_qualified_reason = ""
    status.rolling_amount = (status.rolling_amount or Decimal("0")) + bet_amount
    status.commission_amount = (status.commission_amount or Decimal("0")) + amount
    status.commission = _create_commission_row(
        affiliate=affiliate, referred_user=referred_user, commission_type="rolling",
        amount=amount, eligible_amount=bet_amount, rate=plan.rate, source_ref=slip_number or "",
    )
    status.save()


@db_transaction.atomic
def evaluate_player_commission(referred_user, *, bet_amount=None, slip_number=None):
    """Safe to call unconditionally from any trigger event — no-ops
    immediately if referred_user has no referrer, or their referrer has no
    AffiliateCommissionAssignment (still on the legacy flat-rate flow), or
    the assigned plan has been deactivated."""
    affiliate = referred_user.referred_by
    if not affiliate:
        return None

    try:
        assignment = AffiliateCommissionAssignment.objects.select_related("plan").get(affiliate=affiliate)
    except AffiliateCommissionAssignment.DoesNotExist:
        return None

    plan = assignment.plan
    if not plan.is_active:
        return None

    status, _created = AffiliatePlayerCommissionStatus.objects.get_or_create(
        affiliate=affiliate, referred_user=referred_user, commission_type=plan.commission_type,
        defaults={"plan": plan},
    )
    status = AffiliatePlayerCommissionStatus.objects.select_for_update().get(pk=status.pk)

    if plan.commission_type == "deposit":
        _evaluate_deposit(status, plan, affiliate, referred_user)
    elif plan.commission_type == "losing":
        _evaluate_losing(status, plan, affiliate, referred_user)
    elif plan.commission_type == "rolling":
        _evaluate_rolling(status, plan, affiliate, referred_user, bet_amount, slip_number)

    return status
