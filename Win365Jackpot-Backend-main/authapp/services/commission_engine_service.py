"""
authapp/services/commission_engine_service.py
─────────────────────────────────────────────────────────────────────────────
The Country+Casino+Tier commission calculation engine (Part 35). Every figure
it produces is computed here, server-side, and written to a
CommissionLedgerEntry that records *why* — which rule matched, which tier
applied, which conditions were met, and the arithmetic that followed. Nothing
in a view, serializer or React component recalculates money.

Relationship to the two older layers (see commission_rule_models' docstring):
this engine only ever runs for an (affiliate, country, casino) context that
resolve_rule() matches. When it doesn't match, the caller falls through to the
existing CommissionPlan engine and then to the legacy flat rate, both
untouched.

Idempotency, per branch:
  rolling — keyed on the bet-slip reference via CommissionLedgerEntry's
            uniq_commission_ledger_reference constraint, so re-processing a
            slip is a no-op rather than a second payout.
  deposit — one entry per (affiliate, player), because its base is the
            player's *cumulative* deposit total and so must never be priced
            twice. Enforced two ways: evaluate() returns the existing row
            untouched once it has been awarded, and every deposit entry
            carries the deterministic reference from deposit_reference(),
            which puts that rule under the same unique constraint so a
            concurrent double trigger collides in the database rather than
            racing past the read.
  losing  — prices only the *incremental* loss beyond what earlier entries
            already accounted for, the same self-healing approach
            _evaluate_losing uses in the plan engine.

Across all three, a row that has not committed any money yet (pending /
qualifying) is refreshed in place on the next evaluation instead of being
duplicated, so the ledger shows one row per commission that moves through the
status flow rather than one row per trigger that fired.
"""
import logging
from decimal import Decimal, ROUND_HALF_UP

from django.db import IntegrityError, transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone

from authapp.models.affiliate_models import AffiliateProfile, ReferralCommission
from authapp.models.commission_rule_models import CommissionLedgerEntry
from authapp.models.offline_deposit import OfflineDepositLog
from authapp.services import commission_rule_service
from authapp.services.affiliate_stats_service import (
    get_deposit_totals, get_loss_totals, get_qualified_user_ids,
)

logger = logging.getLogger(__name__)

CENTS = Decimal("0.01")

# Where an entry sits relative to the money it represents.
#   awarded — a ReferralCommission row already exists for this basis, so the
#             same basis must never be priced again.
#   closed  — an admin decided against it; re-evaluating must not resurrect it.
#   open    — nothing committed yet, so a re-evaluation refreshes this row in
#             place instead of stacking another one beside it.
AWARDED_STATUSES = ("qualified", "approved", "payable", "paid")
CLOSED_STATUSES = ("rejected", "cancelled")
OPEN_STATUSES = ("pending", "qualifying")


def deposit_reference(referred_user):
    """The deterministic reference every deposit entry carries.

    Deposit commission is one-time per (affiliate, referred player): its base
    is the player's *cumulative* deposit total, so a second entry would re-price
    deposits an earlier one already paid on. Stamping every deposit entry for a
    given player with the same reference brings that rule under
    uniq_commission_ledger_reference, so the database enforces it even when two
    triggers fire at once — rather than leaving it to the read-then-write check
    in evaluate() winning the race.

    Losing entries deliberately keep a NULL reference: each one prices a
    genuinely new slice of loss, so they must stay exempt from that constraint.
    """
    return f"deposit:{referred_user.id}"


class CommissionResult:
    """What one evaluation decided. `entry` is the persisted ledger row (None
    when nothing was written, e.g. no matching rule)."""

    def __init__(self, *, applied, entry=None, reason="", trace=None):
        self.applied = applied
        self.entry = entry
        self.reason = reason
        self.trace = trace or []

    def __repr__(self):
        return f"<CommissionResult applied={self.applied} reason={self.reason!r}>"


# ─────────────────────────────────────────────────────────────────────────────
# Metric measurement — the one place that knows how to read each METRICS value
# off the existing ledgers. Adding a new metric means adding it here and to
# METRICS; nothing else changes.
# ─────────────────────────────────────────────────────────────────────────────

def _referred_user_ids(affiliate):
    from authapp.models.user_model import User
    return list(User.objects.filter(referred_by=affiliate).values_list("id", flat=True))


def measure(metric, *, affiliate, referred_user=None, bet_amount=None):
    """Returns a Decimal for `metric` in this context, or None if it can't be
    measured (which makes any condition on it fail closed rather than pass)."""
    if metric == "referred_players":
        return Decimal(len(_referred_user_ids(affiliate)))

    if metric == "qualified_players":
        return Decimal(len(get_qualified_user_ids(affiliate)))

    if metric == "active_players":
        # "Active" = has at least one verified bet slip. Same signal the
        # affiliate dashboard's funnel already uses for activity.
        ids = _referred_user_ids(affiliate)
        if not ids:
            return Decimal("0")
        active = (
            OfflineDepositLog.objects
            .filter(user_id__in=ids, entry_type="rolling_points", slip_number__isnull=False)
            .values("user_id").distinct().count()
        )
        return Decimal(active)

    if metric == "deposit_total":
        ids = _referred_user_ids(affiliate)
        return sum(get_deposit_totals(ids).values(), Decimal("0"))

    if metric == "deposit_per_player":
        if not referred_user:
            return None
        return get_deposit_totals([referred_user.id]).get(referred_user.id, Decimal("0"))

    if metric == "betting_amount":
        ids = [referred_user.id] if referred_user else _referred_user_ids(affiliate)
        total = (
            OfflineDepositLog.objects
            .filter(user_id__in=ids, entry_type="rolling_points", slip_number__isnull=False)
            .aggregate(t=Sum("total_bet_amount"))["t"]
        )
        return total or Decimal("0")

    if metric == "rolling_points":
        ids = [referred_user.id] if referred_user else _referred_user_ids(affiliate)
        total = (
            OfflineDepositLog.objects
            .filter(user_id__in=ids, entry_type="rolling_points")
            .aggregate(t=Sum("rolling_points_added"))["t"]
        )
        return Decimal(str(total or 0))

    if metric == "player_loss":
        if not referred_user:
            ids = _referred_user_ids(affiliate)
            return sum(get_loss_totals(ids).values(), Decimal("0"))
        return get_loss_totals([referred_user.id]).get(referred_user.id, Decimal("0"))

    if metric == "active_days":
        if not referred_user:
            return None
        first = (
            OfflineDepositLog.objects
            .filter(user_id=referred_user.id, entry_type="rolling_points")
            .order_by("created_at").values_list("created_at", flat=True).first()
        )
        if not first:
            return Decimal("0")
        return Decimal((timezone.now() - first).days)

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Conditions & tiers
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_conditions(rule, *, affiliate, referred_user=None):
    """Returns (all_met, snapshot_rows, unmet_labels). A rule with no active
    conditions is unconditionally met — an admin who configures no
    requirements means "pay this rate", not "pay nothing"."""
    rows, unmet = [], []
    for condition in rule.conditions.filter(is_active=True):
        actual = measure(condition.metric, affiliate=affiliate, referred_user=referred_user)
        met = condition.evaluate(actual)
        rows.append({
            "metric": condition.metric,
            "operator": condition.operator,
            "required": str(condition.value),
            "actual": str(actual) if actual is not None else None,
            "met": met,
            "label": condition.label(),
        })
        if not met:
            unmet.append(f"{condition.label()} (currently {actual if actual is not None else 'unmeasurable'})")
    return (not unmet), rows, unmet


def select_tier(rule, *, affiliate, referred_user=None):
    """The active tier whose band contains the measured metric. Returns
    (tier, measured_value). Tiers are ordered by `order` then min_value, and
    the first match wins, so overlapping bands resolve predictably by the
    admin's own ordering rather than arbitrarily."""
    tiers = list(rule.tiers.filter(is_active=True).order_by("order", "min_value"))
    if not tiers:
        return None, None
    # Every tier on a rule measures the same thing in practice; use the first
    # tier's metric as the rule's tier metric.
    metric = tiers[0].metric
    value = measure(metric, affiliate=affiliate, referred_user=referred_user)
    for tier in tiers:
        if tier.matches(value):
            return tier, value
    return None, value


# ─────────────────────────────────────────────────────────────────────────────
# Calculation
# ─────────────────────────────────────────────────────────────────────────────

def calculate_amount(rule, tier, base_amount):
    """Returns (amount, rate_used, trace_lines). Pure arithmetic — no I/O, no
    persistence — so it can be unit-tested against the spec's worked examples
    directly."""
    trace = []
    base_amount = Decimal(str(base_amount or 0))

    if rule.rate_type == "fixed":
        rate = Decimal("0")
        amount = rule.fixed_amount
        trace.append(f"Fixed amount: {amount} {rule.currency}")
    elif rule.rate_type == "tiered":
        if not tier:
            return Decimal("0"), Decimal("0"), trace + ["No tier matched — nothing payable."]
        if tier.fixed_amount:
            rate = Decimal("0")
            amount = tier.fixed_amount
            trace.append(f"Tier '{tier.name or tier.id}' fixed amount: {amount} {rule.currency}")
        else:
            rate = tier.rate
            amount = (base_amount * rate / Decimal("100"))
            trace.append(f"Tier '{tier.name or tier.id}' rate {rate}% × base {base_amount} = {amount}")
    else:  # percentage
        rate = rule.rate
        amount = (base_amount * rate / Decimal("100"))
        trace.append(f"Rate {rate}% × base {base_amount} = {amount}")

    amount = amount.quantize(CENTS, rounding=ROUND_HALF_UP)

    if rule.max_commission is not None and amount > rule.max_commission:
        trace.append(f"Capped at max_commission {rule.max_commission} (was {amount})")
        amount = rule.max_commission

    return amount, rate, trace


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

@db_transaction.atomic
def evaluate(referred_user, *, commission_type, base_amount=None, casino_name=None,
             reference_id="", country=None):
    """Evaluate one commission event under the rule engine.

    Returns a CommissionResult. `applied=False` means no rule matched and the
    caller should fall through to the older engines — it is NOT an error.

    Never raises for business reasons; unmet conditions produce a "qualifying"
    ledger entry (so the affiliate can see how close they are), not an
    exception.
    """
    affiliate = referred_user.referred_by
    if not affiliate:
        return CommissionResult(applied=False, reason="Player has no referring affiliate.")

    # NULL rather than "" when there is no reference -- that is what keeps the
    # losing rows out of the uniqueness rule now that it is enforced
    # unconditionally. Deposit rows get a deterministic one instead, so the
    # same constraint enforces their one-per-player rule. See the field and
    # constraint on CommissionLedgerEntry.
    if commission_type == "deposit":
        reference_id = reference_id or deposit_reference(referred_user)
    reference_id = reference_id or None

    prior = _existing_entry(affiliate, referred_user, commission_type, reference_id)

    # Deposit is one-time per player. Answer from the existing row rather than
    # re-pricing, and report applied=True either way: applied=False is the
    # signal the caller uses to fall through to the older engines, which would
    # pay the same deposit a second time by another route.
    if commission_type == "deposit" and prior is not None:
        if prior.status in AWARDED_STATUSES:
            return CommissionResult(
                applied=True, entry=prior,
                reason="Deposit commission already awarded for this player.",
            )
        if prior.status in CLOSED_STATUSES:
            return CommissionResult(
                applied=True, entry=prior,
                reason=f"Deposit commission previously {prior.status}.",
            )

    # A row that has not committed any money yet is refreshed in place, so
    # repeated triggers advance one row towards qualification instead of
    # leaving a trail of near-identical zero-value rows behind them.
    open_entry = prior if (prior is not None and prior.status in OPEN_STATUSES) else None

    # Country comes from the player, not the affiliate: Part 33's chain is
    # Affiliate → Referred Player → Country → Casino.
    country = (country or getattr(referred_user, "country", "") or "").strip()
    casino = commission_rule_service.resolve_casino(casino_name, country)

    rule = commission_rule_service.resolve_rule(
        affiliate, commission_type=commission_type, country=country, casino=casino,
    )
    if not rule:
        return CommissionResult(applied=False, reason="No matching commission rule.")

    trace = [
        f"Rule '{rule.name}' (#{rule.id}) matched — scope: {rule.scope_label}, "
        f"specificity {rule.specificity}, priority {rule.priority}.",
    ]

    caller_supplied_base = base_amount is not None
    base_amount = _resolve_base_amount(
        commission_type, affiliate=affiliate, referred_user=referred_user, base_amount=base_amount,
    )
    trace.append(f"Base amount for {commission_type}: {base_amount}")

    # Nothing to price. A derived base of zero means the ledgers this branch
    # reads hold nothing new -- every dollar of loss is already accounted for,
    # or the player has not deposited yet -- so there is no calculation to
    # record and no progress to show. Writing a zero-value "qualifying" row
    # here would put a meaningless line in the affiliate's ledger every time a
    # trigger fired with no new activity behind it.
    #
    # Only for a *derived* base: a caller that explicitly passes zero (which
    # the bet-slip trigger never does -- the view rejects a non-positive bet
    # amount upstream) is making a claim about a real event, and still gets a
    # row. And applied=True, because the rule did match; applied=False is the
    # fall-through signal, and the older engines must not be handed an event
    # this one has already accounted for.
    if not caller_supplied_base and base_amount <= 0:
        return CommissionResult(
            applied=True, entry=open_entry,
            reason="No new activity to price.", trace=trace,
        )

    conditions_met, condition_rows, unmet = evaluate_conditions(
        rule, affiliate=affiliate, referred_user=referred_user,
    )
    tier, tier_value = select_tier(rule, affiliate=affiliate, referred_user=referred_user)
    if tier:
        trace.append(f"Tier '{tier.name or tier.id}' selected (measured {tier_value}).")
    elif rule.rate_type == "tiered":
        trace.append(f"No tier matched measured value {tier_value}.")

    entry_kwargs = dict(
        affiliate=affiliate, referred_player=referred_user,
        country=country, casino=casino,
        rule=rule, rule_name=rule.name,
        tier=tier, tier_name=(tier.name or str(tier.id)) if tier else "",
        commission_type=commission_type,
        base_amount=base_amount, currency=rule.currency,
        conditions_snapshot=condition_rows,
        reference_id=reference_id,
    )

    if base_amount < rule.min_qualifying_amount:
        reason = f"Base amount {base_amount} below minimum qualifying amount {rule.min_qualifying_amount}."
        trace.append(reason)
        return _persist(entry_kwargs, status="qualifying", amount=Decimal("0"), rate=Decimal("0"),
                        reason=reason, trace=trace, existing=open_entry)

    if not conditions_met:
        reason = "Conditions not yet met: " + "; ".join(unmet)
        trace.append(reason)
        return _persist(entry_kwargs, status="qualifying", amount=Decimal("0"), rate=Decimal("0"),
                        reason=reason[:255], trace=trace, existing=open_entry)

    amount, rate, calc_trace = calculate_amount(rule, tier, base_amount)
    trace.extend(calc_trace)

    if amount <= 0:
        reason = "Calculated commission is zero."
        trace.append(reason)
        return _persist(entry_kwargs, status="qualifying", amount=Decimal("0"), rate=rate,
                        reason=reason, trace=trace, existing=open_entry)

    return _persist(entry_kwargs, status="qualified", amount=amount, rate=rate,
                    reason="All conditions met.", trace=trace, create_money_row=True,
                    existing=open_entry)


def _resolve_base_amount(commission_type, *, affiliate, referred_user, base_amount):
    """What the percentage is applied to, per commission type. An explicit
    base_amount from the caller (the bet-slip's wagered amount) always wins."""
    if base_amount is not None:
        return Decimal(str(base_amount))
    if commission_type == "deposit":
        return get_deposit_totals([referred_user.id]).get(referred_user.id, Decimal("0"))
    if commission_type == "losing":
        already = (
            CommissionLedgerEntry.objects
            .filter(affiliate=affiliate, referred_player=referred_user,
                    commission_type="losing", status__in=("qualified", "approved", "payable", "paid"))
            .aggregate(t=Sum("base_amount"))["t"] or Decimal("0")
        )
        total_loss = get_loss_totals([referred_user.id]).get(referred_user.id, Decimal("0"))
        # Only the loss not already priced by an earlier entry — so a rate
        # change affects new loss only, never re-prices settled history.
        return max(total_loss - already, Decimal("0"))
    return Decimal("0")


def _existing_entry(affiliate, referred_user, commission_type, reference_id):
    """The ledger row this exact (affiliate, player, type, reference) already
    has, newest first — the same tuple uniq_commission_ledger_reference is
    built on, so what this finds is what that constraint would collide with.

    A `reference_id` of None is matched as SQL NULL, mirroring how the
    constraint treats a reference-less losing row.
    """
    return (
        CommissionLedgerEntry.objects
        .select_for_update()
        .filter(
            affiliate=affiliate, referred_player=referred_user,
            commission_type=commission_type, reference_id=reference_id,
        )
        .order_by("-created_at")
        .first()
    )


def _persist(entry_kwargs, *, status, amount, rate, reason, trace,
             create_money_row=False, existing=None):
    now = timezone.now()
    entry_kwargs = dict(entry_kwargs)
    entry_kwargs.update(
        status=status,
        commission_amount=amount,
        commission_rate=rate,
        qualification_reason=reason,
        calculation_trace="\n".join(trace),
    )
    if status == "qualified":
        entry_kwargs["qualified_at"] = now

    if existing is not None:
        # Only ever a row still in an OPEN_STATUSES state — evaluate() returns
        # early for awarded and closed ones — so this refreshes an in-progress
        # calculation rather than rewriting settled history. It is what lets a
        # condition-gated entry move qualifying → qualified on the trigger that
        # finally satisfies it, instead of appearing as a second row beside it.
        for field, value in entry_kwargs.items():
            setattr(existing, field, value)
        existing.save()
        entry = existing
    else:
        try:
            with db_transaction.atomic():
                entry = CommissionLedgerEntry.objects.create(**entry_kwargs)
        except IntegrityError:
            # uniq_commission_ledger_reference — this bet slip, or this
            # player's one deposit commission, was already processed for this
            # affiliate. Idempotent no-op.
            logger.info(
                "Commission ledger entry already exists for reference %s (affiliate %s) — skipping.",
                entry_kwargs.get("reference_id"), entry_kwargs["affiliate"].id,
            )
            return CommissionResult(applied=True, reason="Already processed.", trace=trace)

    if create_money_row:
        entry.referral_commission = _create_money_row(entry)
        entry.save(update_fields=["referral_commission", "updated_at"])

    return CommissionResult(applied=True, entry=entry, reason=reason, trace=trace)


def _create_money_row(entry):
    """Mirrors the plan engine's bookkeeping exactly: a ReferralCommission row
    plus AffiliateProfile.total_earned / User.referral_earnings. Real funds
    still only move when an admin marks it paid through the existing payout
    screen — calculation never pays anyone."""
    commission = ReferralCommission.objects.create(
        affiliate=entry.affiliate,
        referred_user=entry.referred_player,
        source_transaction_ref=entry.reference_id or f"rule-{entry.rule_id}-{entry.id}",
        deposit_amount=entry.base_amount,
        commission_rate=entry.commission_rate,
        amount=entry.commission_amount,
        commission_type=entry.commission_type,
        qualification_status="qualified",
        status="pending",
    )

    profile = AffiliateProfile.objects.select_for_update().filter(user=entry.affiliate).first()
    if profile:
        profile.total_earned += entry.commission_amount
        profile.save(update_fields=["total_earned"])

    affiliate = entry.affiliate
    affiliate.referral_earnings = (affiliate.referral_earnings or Decimal("0")) + entry.commission_amount
    affiliate.save(update_fields=["referral_earnings"])

    return commission
