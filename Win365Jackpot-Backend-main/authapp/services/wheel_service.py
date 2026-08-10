"""
authapp/services/wheel_service.py
─────────────────────────────────────────────────────────────────────────────
Shared logic for both wheel systems (see authapp/models/wheel_models.py):
  • apply_wheel_reward()       — reward-application dispatch, reused by both
                                  Signup Wheel and Bonus Wheel play views.
  • signup_wheel_status() /
    resolve_signup_wheel_spin() — Signup Wheel eligibility + weighted-random
                                  qualification, with permanent per-player
                                  exclusion of already-won high-value tiers.
  • resolve_bonus_wheel_spin() — Bonus Wheel weighted-random pick among a
                                  grant's wheel's active tiers, respecting
                                  allow_repeat / max_winners / daily_limit /
                                  monthly_limit.

Every automated reward type is applied through the SAME wallet-credit
helpers already used by the (now-retired) Daily Spin wheel and the admin
offline-deposit flow — no new money-movement code. Non-wallet rewards
(VIP points, event tickets, gift-tab items) each reuse that feature's own
existing model/service too. Callers (signup_wheel_views.py /
bonus_wheel_views.py) are responsible for the transaction/locking boundary
(db_transaction.atomic() + select_for_update() on the user/grant row) —
these functions are pure resolution + dispatch, no hidden transactions.
"""
import logging
import random
from decimal import Decimal

from django.utils import timezone

from authapp.models.events_models import EventTicketRequest
from authapp.models.gift_level_models import UserGift, UserLevel, PointsLog
from authapp.models.wheel_models import (
    SignupWheelReward, SignupWheelSettings, SignupWheelSpin,
    BonusWheelReward, BonusWheelSpin,
)
from authapp.services.casino_wallet_service import credit_casino_wallet
from authapp.services.notification_service import notify_generic
from authapp.services.wallet_service import credit_main_wallet

logger = logging.getLogger(__name__)

# UserGift.gift_type values that already match a wheel reward_type string
# exactly (both enums were designed to align) — no translation needed.
_DIRECT_GIFT_TYPES = {"gift_voucher", "merchandise", "hotel_stay", "free_travel", "physical_gift"}

MAX_FREE_SPINS_PER_WIN = 50  # abuse ceiling for reward_type="free_spins"


def _add_vip_points(user, points, actor, reason):
    """Adds real UserLevel points (not an instant level-jump) — mirrors
    AdminAddPointsView's logic exactly (authapp/views/gift_level_views.py)
    without importing a views module; a small, intentional ~10-line
    duplication rather than refactoring that unrelated, working admin view.
    "VIP Points" unambiguously means points, unlike the retired spin
    wheel's "vip_upgrade" type, which force-set the level directly."""
    user_level, _ = UserLevel.objects.select_for_update().get_or_create(
        user=user, defaults={"level": 1, "points": 0},
    )
    pts_before = user_level.points
    lvl_before = user_level.level
    new_points = max(int(pts_before) + int(points), 0)
    user_level.points = new_points
    user_level.updated_by = actor
    leveled_up = user_level.recalculate_level()
    user_level.save()
    PointsLog.objects.create(
        user=user, points_added=int(points), points_before=pts_before, points_after=new_points,
        level_before=lvl_before, level_after=user_level.level, leveled_up=leveled_up,
        reason=reason, recorded_by=actor,
    )
    notify_generic(user, "VIP Points Won! \U0001F451", f"You won {int(points)} VIP points from the wheel!", icon="crown")


def apply_wheel_reward(*, user, reward_type, value, label, actor, note,
                        casino_name="", event=None, grant=None):
    """Applies one resolved wheel reward. `grant` (a BonusWheelGrant) is only
    required for reward_type="free_spins"; harmless to omit otherwise."""
    value = Decimal(str(value))

    if reward_type in ("cash_bonus", "cashback"):
        credit_main_wallet(user, "C", value, "CBG", note, actor)

    elif reward_type == "rolling_points":
        from authapp.views.admin_offline_deposit_views import _write_rp_txn
        _write_rp_txn(user, value, "ROP", note, actor)
        notify_generic(user, "Rolling Points Won! \U0001F3B0", f"You won {value} Rolling Points from the wheel.", icon="gift")

    elif reward_type == "vip_points":
        _add_vip_points(user, value, actor, note)

    elif reward_type in _DIRECT_GIFT_TYPES:
        UserGift.objects.create(
            user=user, amount=value, gift_type=reward_type,
            status="pending", description=label, created_by=actor,
        )
        notify_generic(user, "New Gift! \U0001F381", f'You won "{label}" — check your Gifts tab to claim it.', icon="gift")

    elif reward_type == "event_ticket":
        if event is not None and event.is_active:
            EventTicketRequest.objects.get_or_create(event=event, user=user)
            notify_generic(user, "Event Pass Won! \U0001F3AB", f"You've been registered for {event.name}.", icon="calendar")
        else:
            UserGift.objects.create(
                user=user, amount=value, gift_type="event",
                status="pending", description=label, created_by=actor,
            )
            notify_generic(user, "New Gift! \U0001F381", f'You won "{label}" — check your Gifts tab to claim it.', icon="gift")

    elif reward_type == "casino_coupon":
        credit_casino_wallet(user, casino_name, "NC", value, actor, "CBGNC", note=note)

    elif reward_type == "discount":
        UserGift.objects.create(
            user=user, amount=value, gift_type="discount_voucher",
            status="pending", description=label, created_by=actor,
        )
        notify_generic(user, "New Gift! \U0001F381", f'You won "{label}" — check your Gifts tab to claim it.', icon="gift")

    elif reward_type == "free_spins":
        if grant is not None:
            bonus = min(int(value), MAX_FREE_SPINS_PER_WIN)
            grant.spins_total += bonus
            grant.save(update_fields=["spins_total"])
            notify_generic(user, "Free Spins Won! \U0001F3B0", f"You won {bonus} extra spin(s) on this wheel!", icon="rotate")
        else:
            logger.warning("free_spins reward resolved outside a Bonus Wheel grant context — no-op")

    # "no_reward"/"mystery_reward" (a mystery tier dispatches via its own
    # real underlying reward_type before ever reaching this function) and
    # any unrecognized type: nothing to credit.


# ─── Signup Wheel ───────────────────────────────────────────────────────────

def signup_wheel_status(user) -> dict:
    settings_row = SignupWheelSettings.get()
    if not settings_row.is_enabled:
        return {"eligible": False, "reason": "disabled", "spins_remaining": 0}

    window_ends = user.date_joined + timezone.timedelta(days=settings_row.eligibility_window_days)
    if timezone.now() > window_ends:
        return {"eligible": False, "reason": "window_expired", "spins_remaining": 0}

    used = SignupWheelSpin.objects.filter(user=user).count()
    remaining = max(0, settings_row.max_lifetime_spins - used)
    if remaining <= 0:
        return {"eligible": False, "reason": "no_spins_left", "spins_remaining": 0}

    return {"eligible": True, "reason": "", "spins_remaining": remaining}


def resolve_signup_wheel_spin(user) -> "SignupWheelReward | None":
    """Weighted-random pick among active tiers, excluding any
    no_repeat_for_player tier this player has already won. Excluding a tier
    from the candidate list automatically, proportionally redistributes its
    probability mass onto the rest — random.choices() normalizes by the sum
    of whatever weights it's given, so no separate redistribution step is
    needed."""
    already_won = SignupWheelSpin.objects.filter(
        user=user, reward__no_repeat_for_player=True,
    ).values_list("reward_id", flat=True)

    pool = list(SignupWheelReward.objects.filter(is_active=True).exclude(id__in=already_won))
    if not pool:
        # Defensive fallback (e.g. every no-repeat tier this player could
        # win is exhausted and somehow nothing else is active) — never
        # crash a spin attempt over this; fall back to the full active set.
        pool = list(SignupWheelReward.objects.filter(is_active=True))
    if not pool:
        return None

    weights = [float(r.probability_pct) for r in pool]
    if sum(weights) <= 0:
        return random.choice(pool)
    return random.choices(pool, weights=weights, k=1)[0]


# ─── Bonus Wheel ────────────────────────────────────────────────────────────

def resolve_bonus_wheel_spin(grant) -> "BonusWheelReward | None":
    """Weighted-random pick among a grant's wheel's active tiers, filtering
    out anything this spin isn't allowed to win: a non-repeatable tier this
    player already has, or a tier that's hit its platform-wide max_winners /
    daily_limit / monthly_limit. Returns None if nothing is eligible (a real
    but rare admin-configuration edge case — callers must not consume a
    spin when this happens)."""
    user = grant.user
    now = timezone.now()
    today = now.date()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    candidates = []
    for reward in BonusWheelReward.objects.filter(wheel_id=grant.wheel_id, is_active=True):
        if not reward.allow_repeat and BonusWheelSpin.objects.filter(user=user, reward=reward).exists():
            continue
        if reward.max_winners is not None and BonusWheelSpin.objects.filter(reward=reward).count() >= reward.max_winners:
            continue
        if reward.daily_limit is not None and BonusWheelSpin.objects.filter(reward=reward, spun_at__date=today).count() >= reward.daily_limit:
            continue
        if reward.monthly_limit is not None and BonusWheelSpin.objects.filter(reward=reward, spun_at__gte=month_start).count() >= reward.monthly_limit:
            continue
        candidates.append(reward)

    if not candidates:
        return None

    weights = [max(r.weight, 0) for r in candidates]
    if sum(weights) <= 0:
        return random.choice(candidates)
    return random.choices(candidates, weights=weights, k=1)[0]
