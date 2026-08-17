"""
authapp/services/commission_rule_service.py
─────────────────────────────────────────────────────────────────────────────
Rule resolution only — "given this affiliate, player, country and casino,
which CommissionRule applies?". The arithmetic lives in
commission_engine_service.py; keeping them apart means the precedence logic
can be tested on its own, which is the part most likely to be argued about.

PRECEDENCE (Part 34), most specific wins:

    affiliate + casino + country   (specificity 7)
    affiliate + casino             (6)
    affiliate + country            (5)
    affiliate                      (4)
    casino + country               (3)
    casino                         (2)
    country                        (1)
    global default                 (0)

`priority` (admin-set, higher wins) only breaks ties *within* one specificity
level — it can never promote a country-wide rule above an affiliate-specific
one, because "use the most specific valid active rule" is the requirement and
a priority override would quietly violate it. Newest-created breaks a tie on
both.

A rule only counts as a candidate if it is active, in its date window, and
scoped to something that actually matches the context: a rule pinned to
Bellagio never applies to a bet placed at Marina, and a rule with no casino
pinned applies to every casino.
"""
import logging

from django.db.models import Q
from django.utils import timezone

from authapp.models.casino_models import Casino
from authapp.models.commission_rule_models import CommissionRule

logger = logging.getLogger(__name__)


def resolve_casino(casino_name, country=None):
    """Best-effort Casino lookup from the free-text casino name the offline
    deposit ledger records. Casino is unique on (country, name), so the
    country narrows an otherwise ambiguous name (e.g. "Majestic Pride" exists
    in both India and Sri Lanka). Returns None rather than guessing when the
    name matches several rows and no country disambiguates them."""
    if not casino_name:
        return None
    qs = Casino.objects.filter(name__iexact=casino_name.strip(), is_active=True)
    if country:
        narrowed = qs.filter(country__iexact=country.strip())
        if narrowed.exists():
            qs = narrowed
    matches = list(qs[:2])
    return matches[0] if len(matches) == 1 else None


def resolve_rule(affiliate, *, commission_type, country=None, casino=None, on_date=None):
    """The single entry point for "which rule applies here". Returns a
    CommissionRule or None (None means: fall through to the CommissionPlan
    layer, then to the legacy flat rate).

    `casino` may be a Casino instance or None. `country` is a plain string,
    matched case-insensitively against CommissionRule.country.
    """
    if not affiliate:
        return None

    on_date = on_date or timezone.now().date()
    country = (country or "").strip()
    casino_id = getattr(casino, "id", casino) or None

    # Scope match: for each dimension, a rule either leaves it unset (applies
    # to everything) or pins it to exactly this context's value.
    scope = (
        (Q(affiliate__isnull=True) | Q(affiliate=affiliate))
        & (Q(casino__isnull=True) | Q(casino_id=casino_id))
    )
    if country:
        scope &= (Q(country="") | Q(country__iexact=country))
    else:
        # No country in context — only rules that don't pin one can match.
        scope &= Q(country="")

    if not casino_id:
        # Likewise for casino: without one in context, a casino-pinned rule
        # can't be shown to apply.
        scope &= Q(casino__isnull=True)

    candidates = CommissionRule.objects.filter(
        scope,
        is_active=True,
        commission_type=commission_type,
    ).filter(
        Q(start_date__isnull=True) | Q(start_date__lte=on_date),
    ).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=on_date),
    ).select_related("casino").order_by("-specificity", "-priority", "-created_at")

    return candidates.first()


def has_commission_rule(affiliate, *, commission_type, country=None, casino=None, on_date=None):
    """Cheap existence check for the dispatch site, so the trigger can decide
    between the rule engine and the older plan engine without building the
    full rule object twice."""
    return resolve_rule(
        affiliate, commission_type=commission_type,
        country=country, casino=casino, on_date=on_date,
    ) is not None


def explain_resolution(affiliate, *, commission_type, country=None, casino=None, on_date=None):
    """Back-Office diagnostic: every candidate rule in precedence order, with
    the winner flagged. Answers "why is this affiliate on 7% and not 12%?"
    without anyone having to reason about the ordering by hand."""
    on_date = on_date or timezone.now().date()
    country = (country or "").strip()
    casino_id = getattr(casino, "id", casino) or None

    rows = []
    for rule in CommissionRule.objects.filter(commission_type=commission_type).select_related("casino"):
        reasons = []
        if not rule.is_active:
            reasons.append("inactive")
        if not rule.is_effective_on(on_date):
            reasons.append("outside date window")
        if rule.affiliate_id and rule.affiliate_id != getattr(affiliate, "id", None):
            reasons.append("different affiliate")
        if rule.country and rule.country.lower() != country.lower():
            reasons.append("different country")
        if rule.casino_id and rule.casino_id != casino_id:
            reasons.append("different casino")
        rows.append({
            "id": rule.id,
            "name": rule.name,
            "scope": rule.scope_label,
            "specificity": rule.specificity,
            "priority": rule.priority,
            "eligible": not reasons,
            "excluded_because": reasons,
        })

    eligible = [r for r in rows if r["eligible"]]
    eligible.sort(key=lambda r: (-r["specificity"], -r["priority"], -r["id"]))
    winner_id = eligible[0]["id"] if eligible else None
    for row in rows:
        row["selected"] = row["id"] == winner_id

    rows.sort(key=lambda r: (not r["eligible"], -r["specificity"], -r["priority"]))
    return {"selected_rule_id": winner_id, "candidates": rows}
