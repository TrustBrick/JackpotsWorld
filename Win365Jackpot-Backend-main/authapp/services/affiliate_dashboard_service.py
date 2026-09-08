"""
authapp/services/affiliate_dashboard_service.py
─────────────────────────────────────────────────────────────────────────────
The richer affiliate dashboard metrics — everything beyond "commission".

EVERY NUMBER HERE COMES FROM A REAL ROW. Nothing is estimated, projected or
filled in with a plausible figure. Where the data genuinely does not exist the
function returns a null/zero and says so in the payload, so the UI can render
an honest empty state instead of a fabricated one. Specifically:

  • "Top performing game" is null until at least one commission has been
    attributed to a game. Commissions earned before game attribution existed
    carry game="" and are reported under "Not attributed" rather than being
    silently assigned to a game.
  • "Conversion rate" divides referred players who reached the qualifying
    action by total referrals, both counted from real rows, and is 0.0 (never
    NaN) when there are no referrals.
  • Tier progress reads the affiliate's OWN commission rules — it is only
    populated when a tiered rule actually applies to them. An affiliate on a
    flat rate has no tier, and the payload says `tier: null` rather than
    inventing a ladder.

Deliberately separate from affiliate_stats_service.py, which owns the
deposit/qualified funnel that BOTH this dashboard and campaign analytics
share. This module composes that funnel with commission, referral and game
data; it does not reimplement any of it.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from authapp.constants.games import GAME_CHOICES, GAME_LABELS, GAME_SLUGS
from authapp.models.affiliate_models import AffiliateClickLog, ReferralCommission
from authapp.models.commission_rule_models import METRICS, CommissionRule
from authapp.services.affiliate_stats_service import split_deposit_and_qualified

User = get_user_model()

# How recently a referred player must have been seen to count as "active".
# A window, not a flag: `User.is_active` is an ACCOUNT STATE (has this account
# been disabled?) and answers a completely different question from "is this
# player still playing?". The affiliate dashboard's old "Active Referrals"
# card read is_active and therefore counted every account that had not been
# banned, which was ~100% of them and told an affiliate nothing.
ACTIVE_WINDOW_DAYS = 30

# Statuses that mean the money is genuinely owed but not yet paid out.
PENDING_STATUSES = ("pending",)
PAID_STATUSES = ("paid",)


def _pct(numerator, denominator):
    """Percentage, or 0.0 when there is nothing to divide by. Same guard the
    analytics service uses — a rate must never render as NaN."""
    if not denominator:
        return 0.0
    return round(100.0 * float(numerator) / float(denominator), 1)


def _money(value):
    return float(value or Decimal("0"))


def referral_overview(affiliate):
    """Referral counts and the conversion funnel, from User + commission rows."""
    referred = User.objects.filter(referred_by=affiliate)
    referred_ids = list(referred.values_list("id", flat=True))
    total = len(referred_ids)

    cutoff = timezone.now() - timedelta(days=ACTIVE_WINDOW_DAYS)
    # `last_login` is the only genuine recency signal on User. A player who has
    # never logged in since registering is not active, and is not counted as
    # such just because their account is enabled.
    active = referred.filter(is_active=True, last_login__gte=cutoff).count()

    funnel = split_deposit_and_qualified(affiliate, referred_ids)
    qualified = funnel["qualified_players_count"]

    return {
        "total_referrals": total,
        "active_referrals": active,
        "active_window_days": ACTIVE_WINDOW_DAYS,
        # Registered but has neither deposited nor bet — the top of the funnel
        # that has not moved at all. The union (not the sum) of the two later
        # cohorts, because a player can be in both.
        "registered_only": max(
            total - len(set(funnel["deposit_totals"].keys()) | funnel["qualified_ids"]), 0,
        ),
        "deposit_players": funnel["deposit_players_count"],
        "qualified_players": qualified,
        # "Completed the required qualifying action" = placed at least one
        # verified bet, which is exactly what makes a ReferralCommission row
        # exist. Same definition the funnel has always used, so this rate can
        # never disagree with the counts beside it.
        "conversion_rate": _pct(qualified, total),
        "total_deposits": _money(funnel["total_deposits"]),
    }


def earnings_overview(affiliate):
    """Lifetime / pending / paid, from ReferralCommission — the money table
    the payout screens already work off, so these numbers are the same ones an
    admin sees."""
    qs = ReferralCommission.objects.filter(affiliate=affiliate)
    pending = qs.filter(status__in=PENDING_STATUSES).aggregate(t=Sum("amount"))["t"] or Decimal("0")
    paid = qs.filter(status__in=PAID_STATUSES).aggregate(t=Sum("amount"))["t"] or Decimal("0")
    rejected = qs.filter(status="rejected").aggregate(t=Sum("amount"))["t"] or Decimal("0")

    return {
        # Lifetime = pending + paid. Rejected is reported separately and is
        # NOT added in: it was reviewed and declined, so counting it as
        # earnings would overstate what the affiliate is owed.
        "total_earnings": _money(pending + paid),
        "pending_earnings": _money(pending),
        "paid_earnings": _money(paid),
        "rejected_earnings": _money(rejected),
        "commission_count": qs.count(),
    }


def commission_by_game(affiliate):
    """Commission split by game, and the top performer.

    Reads ReferralCommission.game — the money row, not the ledger — so the
    total here always reconciles with the earnings card above. Rows with no
    game are surfaced as their own "Not attributed" bucket rather than being
    dropped (which would make the parts not add up to the whole) or assigned
    to a game (which would be fabrication).
    """
    rows = (
        ReferralCommission.objects.filter(affiliate=affiliate)
        .values("game")
        .annotate(total=Sum("amount"), entries=Count("id"))
    )

    by_game = {}
    unattributed = {"total": Decimal("0"), "entries": 0}
    for row in rows:
        slug = row["game"] or ""
        bucket = {"total": row["total"] or Decimal("0"), "entries": row["entries"]}
        if slug in GAME_SLUGS:
            by_game[slug] = bucket
        else:
            unattributed["total"] += bucket["total"]
            unattributed["entries"] += bucket["entries"]

    # Every supported game appears, including ones with no activity — an
    # affiliate should be able to see that Andhar Bahar has earned them
    # nothing yet, which an omitted row would hide.
    games = [
        {
            "game": slug,
            "label": label,
            "total": _money(by_game.get(slug, {}).get("total")),
            "entries": by_game.get(slug, {}).get("entries", 0),
        }
        for slug, label in GAME_CHOICES
    ]

    earning = [g for g in games if g["total"] > 0]
    top = max(earning, key=lambda g: g["total"]) if earning else None

    return {
        "games": games,
        "unattributed": {
            "label": "Not attributed",
            "total": _money(unattributed["total"]),
            "entries": unattributed["entries"],
            # Said plainly, because an affiliate seeing a large unattributed
            # figure deserves to know it is history rather than an error.
            "note": (
                "Commission earned before per-game attribution was recorded, or from "
                "activity that was not tied to a specific game."
            ),
        },
        # None, not a guess, until real attributed activity exists.
        "top_game": top,
    }


def commission_by_status(affiliate):
    """Commission grouped by status — the "Commission Breakdown" card's
    status column."""
    rows = (
        ReferralCommission.objects.filter(affiliate=affiliate)
        .values("status")
        .annotate(total=Sum("amount"), entries=Count("id"))
        .order_by("-total")
    )
    return [
        {"status": r["status"], "total": _money(r["total"]), "entries": r["entries"]}
        for r in rows
    ]


def commission_by_type(affiliate):
    """Commission grouped by commission_type (deposit / losing / rolling /
    legacy / manual), so an affiliate can see WHICH arrangement is paying."""
    rows = (
        ReferralCommission.objects.filter(affiliate=affiliate)
        .values("commission_type")
        .annotate(total=Sum("amount"), entries=Count("id"))
        .order_by("-total")
    )
    return [
        {
            "type": r["commission_type"],
            "total": _money(r["total"]),
            "entries": r["entries"],
        }
        for r in rows
    ]


def performance_over_time(affiliate, months=12):
    """Referrals and commission per month, for the growth chart.

    Both series are built from one pass each and then merged on the month key,
    so a month with commission but no new referrals (or the reverse) still
    appears with a zero rather than being missing from the axis.
    """
    since = (timezone.now() - timedelta(days=31 * months)).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )

    commission_rows = (
        ReferralCommission.objects.filter(affiliate=affiliate, created_at__gte=since)
        .annotate(month=TruncMonth("created_at"))
        .values("month")
        .annotate(total=Sum("amount"), entries=Count("id"))
    )
    referral_rows = (
        User.objects.filter(referred_by=affiliate, date_joined__gte=since)
        .annotate(month=TruncMonth("date_joined"))
        .values("month")
        .annotate(signups=Count("id"))
    )

    merged = defaultdict(lambda: {"commission": 0.0, "referrals": 0, "entries": 0})
    for r in commission_rows:
        if r["month"] is None:
            continue
        key = r["month"].strftime("%Y-%m")
        merged[key]["commission"] = _money(r["total"])
        merged[key]["entries"] = r["entries"]
    for r in referral_rows:
        if r["month"] is None:
            continue
        key = r["month"].strftime("%Y-%m")
        merged[key]["referrals"] = r["signups"]

    return [
        {"month": key, **values}
        for key, values in sorted(merged.items())
    ]


def recent_activity(affiliate, limit=10):
    """The most recent things that actually happened on this account —
    referrals joining and commissions being earned, interleaved by time.

    One list rather than two, because "what has been going on" is one
    question. Each row carries its own `kind` so the UI can icon it.
    """
    events = []

    for user in (
        User.objects.filter(referred_by=affiliate)
        .order_by("-date_joined")[:limit]
        .only("id", "name", "email", "user_uid", "date_joined", "country")
    ):
        events.append({
            "kind": "referral",
            "at": user.date_joined,
            # Never the full email: this is a list an affiliate can screenshot,
            # and the player's identity is not theirs to publish. The UID is
            # the reference support would ask for anyway.
            "label": user.name or (user.user_uid or f"Player #{user.id}"),
            "detail": user.country or "",
            "amount": None,
            "game": "",
        })

    for c in (
        ReferralCommission.objects.filter(affiliate=affiliate)
        .select_related("referred_user")
        .order_by("-created_at")[:limit]
    ):
        events.append({
            "kind": "commission",
            "at": c.created_at,
            "label": (
                c.referred_user.name
                or c.referred_user.user_uid
                or f"Player #{c.referred_user_id}"
            ) if c.referred_user_id else "Commission",
            "detail": c.get_commission_type_display(),
            "amount": _money(c.amount),
            "game": c.game or "",
            "game_label": GAME_LABELS.get(c.game or "", ""),
            "status": c.status,
        })

    events.sort(key=lambda e: e["at"], reverse=True)
    return [
        {**e, "at": e["at"].isoformat()}
        for e in events[:limit]
    ]


def tier_progress(affiliate):
    """Where this affiliate stands on their commission ladder, IF they have
    one.

    Reads the real CommissionRule/CommissionTier rows that apply to them —
    there is no separate "affiliate tier" table in this app, and inventing one
    would create a second source of truth for something the commission engine
    already decides. An affiliate whose applicable rule is not tiered has no
    ladder, and this returns None rather than a fabricated "Bronze".
    """
    from authapp.services import commission_engine_service

    rule = (
        CommissionRule.objects.filter(
            affiliate=affiliate, rate_type="tiered", is_active=True,
        )
        .order_by("-specificity", "-priority")
        .first()
    )
    if rule is None:
        # Fall back to a global tiered rule that would apply to everyone.
        rule = (
            CommissionRule.objects.filter(
                affiliate__isnull=True, rate_type="tiered", is_active=True,
            )
            .order_by("-specificity", "-priority")
            .first()
        )
    if rule is None:
        return None

    tiers = list(rule.tiers.filter(is_active=True).order_by("order", "min_value"))
    if not tiers:
        return None

    metric = tiers[0].metric
    try:
        measured = commission_engine_service.measure(metric, affiliate=affiliate)
    except Exception:
        # A metric this engine cannot read is a code-level gap, not something
        # to guess around — report no ladder rather than a wrong position.
        return None
    if measured is None:
        return None

    current = next((t for t in tiers if t.matches(measured)), None)
    nxt = next((t for t in tiers if t.min_value > measured), None)

    return {
        "rule_name": rule.name,
        "metric": metric,
        "metric_label": dict(METRICS).get(metric, metric),
        "measured": float(measured),
        "current_tier": {
            "name": current.name or f"Tier {current.order + 1}",
            "rate": float(current.rate),
            "min_value": float(current.min_value),
        } if current else None,
        "next_tier": {
            "name": nxt.name or f"Tier {nxt.order + 1}",
            "rate": float(nxt.rate),
            "min_value": float(nxt.min_value),
            "remaining": float(nxt.min_value - measured),
            "progress_pct": _pct(measured, nxt.min_value),
        } if nxt else None,
        # True when they are already on the top band — the UI shows "top tier
        # reached" rather than an empty progress bar.
        "at_top_tier": current is not None and nxt is None,
    }


def affiliate_status(affiliate):
    """Account status, as the four states the brief asks for, derived from
    rows that already exist rather than a new status column.

    AffiliateProfile has `is_active`; the User row has `is_active` too. The
    combination is what the login path already enforces, so this reports the
    same thing rather than a parallel opinion.
    """
    profile = getattr(affiliate, "affiliate_profile", None)
    if profile is None:
        return {"status": "pending", "label": "Pending approval", "can_earn": False}
    if not affiliate.is_active:
        return {"status": "suspended", "label": "Suspended", "can_earn": False}
    if not profile.is_active:
        return {"status": "disabled", "label": "Disabled", "can_earn": False}
    if profile.approved_by_id is None:
        # Created but never explicitly approved by an admin.
        return {"status": "pending", "label": "Pending approval", "can_earn": True}
    return {"status": "active", "label": "Active", "can_earn": True}


def supported_games(affiliate):
    """The games this affiliate can refer for, with the rate that currently
    applies to each.

    The rate is resolved through the SAME engine that would price a real
    commission (commission_rule_service.resolve_rule), so what an affiliate is
    shown is what they would actually be paid — not a separate marketing
    number maintained by hand. `rate` is null when no rule matches and the
    older plan/flat-rate layers would decide instead; the UI says "as agreed"
    rather than inventing a percentage.
    """
    from authapp.services import commission_rule_service

    out = []
    for slug, label in GAME_CHOICES:
        rates = {}
        for commission_type in ("deposit", "losing", "rolling"):
            rule = commission_rule_service.resolve_rule(
                affiliate, commission_type=commission_type, game=slug,
            )
            if rule is None:
                continue
            rates[commission_type] = {
                "rule_name": rule.name,
                "rate_type": rule.rate_type,
                "rate": float(rule.rate),
                "fixed_amount": float(rule.fixed_amount),
                "currency": rule.currency,
            }
        out.append({
            "game": slug,
            "label": label,
            "route": f"/{slug.replace('_', '-')}",
            "rates": rates,
            "has_configured_rate": bool(rates),
        })
    return out


def referral_links(affiliate):
    """The affiliate's link and its per-game variants.

    A game-targeted link is just the base link with ?game=<slug>, recorded on
    AffiliateClickLog.game when the visitor lands. That records the INTENT of
    the referral and is deliberately not what commission attribution reads —
    see AffiliateClickLog.game for why the two must stay apart.
    """
    code = affiliate.referral_code or ""
    return {
        "referral_code": code,
        "games": [
            {"game": slug, "label": label, "param": f"?ref={code}&game={slug}"}
            for slug, label in GAME_CHOICES
        ],
    }


def click_overview(affiliate):
    """Referral-link clicks, and how many became registrations."""
    qs = AffiliateClickLog.objects.filter(affiliate=affiliate)
    total = qs.count()
    converted = qs.filter(registered_user__isnull=False).count()
    by_game = [
        {
            "game": r["game"] or "",
            "label": GAME_LABELS.get(r["game"] or "", "Not specified"),
            "clicks": r["n"],
        }
        for r in qs.values("game").annotate(n=Count("id")).order_by("-n")
    ]
    return {
        "total_clicks": total,
        "converted_clicks": converted,
        "click_conversion_rate": _pct(converted, total),
        "by_game": by_game,
    }


def build(affiliate):
    """The whole dashboard in one payload.

    One request rather than nine: every block below is derived from the same
    handful of tables, and nine round trips would render the dashboard in
    stages while the numbers on screen disagreed with each other mid-load.
    """
    return {
        "status": affiliate_status(affiliate),
        "referrals": referral_overview(affiliate),
        "earnings": earnings_overview(affiliate),
        "by_game": commission_by_game(affiliate),
        "by_status": commission_by_status(affiliate),
        "by_type": commission_by_type(affiliate),
        "performance": performance_over_time(affiliate),
        "activity": recent_activity(affiliate),
        "tier": tier_progress(affiliate),
        "supported_games": supported_games(affiliate),
        "links": referral_links(affiliate),
        "clicks": click_overview(affiliate),
    }
