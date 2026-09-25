"""
authapp/services/affiliate_level_service.py
─────────────────────────────────────────────────────────────────────────────
AFFILIATE-LEVELS: moves affiliates up the VIP -> Bronze -> Silver -> Gold ->
Diamond ladder when they meet the conditions admins set in the Back Office
(AffiliateLevelCondition).

Rules (agreed 2026-09-25):
  * Every filled-in minimum for a level must be met; blanks are ignored; a
    level with no minimums at all is never awarded automatically.
  * Lifetime totals.
  * Up only. A level already reached is never taken away automatically.
  * An affiliate whose level an admin set by hand (level_locked) is skipped.
  * The affiliate lands on the HIGHEST level whose conditions are met, so a
    big jump in numbers can go VIP -> Gold in one step.

The four figures use exactly the definitions the affiliate dashboard shows
(views/affiliate_views.AffiliateDashboardView), so a level can always be
explained by numbers the affiliate can see:
  referred_players   users with referred_by = the affiliate
  qualified_players  referred users with a ReferralCommission row (placed a bet)
  deposit_volume     approved DepositRequests + DAC casino-wallet entries of
                     referred users (affiliate_stats_service)
  commission_earned  pending + paid ReferralCommission amounts

Triggered from signals.py whenever one of the underlying rows is saved, from
the Back Office when conditions change, and by the evaluate_affiliate_levels
management command.
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from authapp.models import ActivityLog, User
from authapp.models.affiliate_models import (
    AffiliateLevelCondition, AffiliateProfile, ReferralCommission,
)
from authapp.services.affiliate_stats_service import split_deposit_and_qualified

logger = logging.getLogger(__name__)


def metrics_for(affiliate_user):
    referred_ids = list(User.objects.filter(referred_by=affiliate_user).values_list("id", flat=True))
    funnel = split_deposit_and_qualified(affiliate_user, referred_ids)
    earned = (
        ReferralCommission.objects.filter(affiliate=affiliate_user, status__in=("pending", "paid"))
        .aggregate(total=Sum("amount"))["total"] or Decimal("0")
    )
    return {
        "referred_players": len(referred_ids),
        "qualified_players": funnel["qualified_players_count"],
        "deposit_volume": funnel["total_deposits"],
        "commission_earned": earned,
    }


def _conditions():
    return {c.level: c for c in AffiliateLevelCondition.objects.all()}


def earned_level(metrics, conditions=None):
    """The highest level whose conditions these figures meet (VIP if none)."""
    conditions = _conditions() if conditions is None else conditions
    best = AffiliateProfile.LEVEL_VIP
    for level in AffiliateProfile.LEVEL_ORDER[1:]:
        cond = conditions.get(level)
        if cond and cond.is_met_by(metrics):
            best = level
    return best


def next_level_progress(profile, metrics=None, conditions=None):
    """For the affiliate's own dashboard: the next configured level above
    theirs and how far they are from each of its minimums. None at the top,
    or when no higher level has conditions yet."""
    conditions = _conditions() if conditions is None else conditions
    metrics = metrics_for(profile.user) if metrics is None else metrics
    order = AffiliateProfile.LEVEL_ORDER
    for level in order[order.index(profile.level) + 1:]:
        cond = conditions.get(level)
        if cond and cond.is_configured():
            return {
                "level": level,
                "level_label": cond.get_level_display(),
                "requirements": [
                    {
                        "metric": metric,
                        "required": getattr(cond, field),
                        "current": metrics[metric],
                        "met": metrics[metric] >= getattr(cond, field),
                    }
                    for field, metric in AffiliateLevelCondition.METRIC_FIELDS.items()
                    if getattr(cond, field) is not None
                ],
            }
    return None


def evaluate(profile, *, conditions=None, source=""):
    """Move one affiliate up if they have earned it. Returns the new level,
    or None when nothing changed."""
    if profile.level_locked:
        return None
    target = earned_level(metrics_for(profile.user), conditions)
    order = AffiliateProfile.LEVEL_ORDER
    if order.index(target) <= order.index(profile.level):
        return None   # up only

    previous = profile.level
    profile.level = target
    profile.level_updated_at = timezone.now()
    profile.save(update_fields=["level", "level_updated_at", "updated_at"])
    ActivityLog.log(
        action="affiliate_level_changed",
        target_user=profile.user,
        description=(
            f"Affiliate level raised automatically: {dict(AffiliateProfile.LEVEL_CHOICES)[previous]}"
            f" -> {profile.get_level_display()} (conditions met)"
        ),
        meta={"from": previous, "to": target, "automatic": True, "source": source},
    )
    return target


def evaluate_all(*, source=""):
    """Every unlocked affiliate. Returns {user_id: new level} for those moved."""
    conditions = _conditions()
    moved = {}
    for profile in AffiliateProfile.objects.select_related("user").filter(level_locked=False):
        new = evaluate(profile, conditions=conditions, source=source)
        if new:
            moved[profile.user_id] = new
    return moved


def evaluate_for_player(player_id, *, source=""):
    """A referred player's activity changed: re-check their affiliate after
    the surrounding transaction commits, so a rolled-back deposit never
    promotes anyone. Never raises -- a level check must not break a deposit."""
    def run():
        try:
            affiliate_id = User.objects.filter(pk=player_id).values_list("referred_by_id", flat=True).first()
            if not affiliate_id:
                return
            profile = AffiliateProfile.objects.select_related("user").filter(user_id=affiliate_id).first()
            if profile:
                evaluate(profile, source=source)
        except Exception:
            logger.exception("Affiliate level evaluation failed for player %s", player_id)
    transaction.on_commit(run)


def evaluate_for_affiliate(affiliate_id, *, source=""):
    def run():
        try:
            profile = AffiliateProfile.objects.select_related("user").filter(user_id=affiliate_id).first()
            if profile:
                evaluate(profile, source=source)
        except Exception:
            logger.exception("Affiliate level evaluation failed for affiliate %s", affiliate_id)
    transaction.on_commit(run)
