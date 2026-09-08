"""
authapp/services/communication_restriction_service.py
─────────────────────────────────────────────────────────────────────────────
Per-player chat and call access — the "your issue will be answered within 24
hours, please stop calling" control.

ONE FUNCTION DECIDES, AND EVERY GATE CALLS IT. `check(user, channel)` is the
single place that combines the three things that can close a channel:

  1. the platform switch      (VoiceCallSettings.chat_enabled / calls_enabled)
  2. working hours / holiday  (VoiceCallSettings, calls only)
  3. this player's own row    (PlayerCommunicationRestriction)

Anything that opens a chat or starts a call goes through it. That matters more
than it looks: a restriction enforced in three places is a restriction that
will eventually be enforced in two.

EXPIRY IS EVALUATED ON READ. There is no scheduler in this project (see
analytics_service's note on the same subject), so a restriction with a
`disabled_until` in the past is simply not blocking the next time it is
checked. Nothing has to run for a restriction to lift, which is the only
design that cannot leave a player locked out because a cron was never
installed.

WHAT A PLAYER IS TOLD, AND WHAT THEY ARE NOT. The result carries a
`player_message` that is safe to render — the admin's own wording if they set
one, otherwise the configured default. `reason` and `admin_note` are NEVER
part of it. They are internal, they are why the restriction exists, and they
frequently say things ("suspected bonus abuse, under review") that must not be
handed to the person under review. The serializers enforce this too; this is
the first of the two layers.
"""
import logging

from django.utils import timezone

from authapp.models.call_models import VoiceCallSettings
from authapp.models.support_communication_models import (
    CHANNEL_CALL,
    CHANNEL_CHAT,
    PlayerCommunicationRestriction,
    PlayerCommunicationRestrictionLog,
)

logger = logging.getLogger(__name__)


class RestrictionResult:
    """Why a channel is open or closed.

    `allowed` is the only thing a gate needs. `message` is what to show the
    player. `scope` says which of the three layers closed it, which is what
    makes a support ticket about "I cannot chat" answerable without guessing.
    """

    __slots__ = ("allowed", "message", "scope", "until")

    def __init__(self, allowed, *, message="", scope="", until=None):
        self.allowed = allowed
        self.message = message
        self.scope = scope
        self.until = until

    def as_dict(self):
        return {
            "allowed": self.allowed,
            "message": self.message,
            "scope": self.scope,
            "until": self.until.isoformat() if self.until else None,
        }

    def __bool__(self):
        return self.allowed


def _within_working_hours(row, now=None):
    """True when the desk is open. Both hours unset = always open, which is
    what the desk did before these columns existed."""
    if row.holiday_mode:
        return False
    start, end = row.working_hours_start, row.working_hours_end
    if start is None or end is None:
        return True
    now = (now or timezone.localtime()).time()
    if start <= end:
        return start <= now <= end
    # An overnight window (22:00–06:00) is two ranges, not one.
    return now >= start or now <= end


def get_restriction(user, channel):
    """This user's row for one channel, or None. Never raises."""
    if user is None or not getattr(user, "is_authenticated", True):
        return None
    try:
        return PlayerCommunicationRestriction.objects.filter(
            user=user, channel=channel,
        ).first()
    except Exception:
        # A restriction lookup failing must not close support to everyone —
        # fail OPEN here and log, because the alternative is a database blip
        # locking every player out of the only channel they have to report it.
        logger.exception("communication restriction lookup failed for user %s", getattr(user, "id", None))
        return None


def check(user, channel):
    """Is `channel` open for `user` right now? Returns a RestrictionResult."""
    row = VoiceCallSettings.load()

    # 1. Platform switch.
    if channel == CHANNEL_CHAT and not row.chat_enabled:
        return RestrictionResult(False, message=row.offline_message, scope="platform")
    if channel == CHANNEL_CALL and not row.calls_enabled:
        return RestrictionResult(False, message=row.call_unavailable_message, scope="platform")

    # 2. Working hours — calls only. Chat has an offline path (a message that
    # is answered later); a call does not, so an out-of-hours call would ring
    # an empty desk.
    if channel == CHANNEL_CALL and not _within_working_hours(row):
        return RestrictionResult(False, message=row.offline_message, scope="hours")

    # 3. This player's own restriction.
    restriction = get_restriction(user, channel)
    if restriction is not None and restriction.is_currently_active:
        default = (
            row.chat_disabled_message if channel == CHANNEL_CHAT else row.call_disabled_message
        )
        message = restriction.player_message or default
        if restriction.disabled_until:
            # Appended rather than templated into the message: an admin who
            # wrote their own wording gets it back verbatim, with the time
            # added, instead of having to know a placeholder syntax.
            when = timezone.localtime(restriction.disabled_until).strftime("%d %b %Y, %H:%M")
            message = f"{message} Please check back after {when}."
        return RestrictionResult(
            False, message=message, scope="player", until=restriction.disabled_until,
        )

    return RestrictionResult(True)


def chat_allowed(user):
    return check(user, CHANNEL_CHAT)


def calls_allowed(user):
    return check(user, CHANNEL_CALL)


def set_restriction(actor, user, channel, *, is_enabled, disabled_until=None,
                    reason="", admin_note="", player_message=""):
    """Create or update one player's access to one channel, and log it.

    The log row is written on every change, including a change back to
    enabled, because "who lifted this, and when" is as much a part of the
    history as who imposed it.
    """
    if channel not in (CHANNEL_CHAT, CHANNEL_CALL):
        raise ValueError(f"Unknown channel: {channel}")

    restriction, _created = PlayerCommunicationRestriction.objects.update_or_create(
        user=user, channel=channel,
        defaults={
            "is_enabled": bool(is_enabled),
            # Cleared when re-enabling: an expiry on an enabled row is
            # meaningless and would resurface confusingly if it were ever
            # disabled again.
            "disabled_until": None if is_enabled else disabled_until,
            "reason": (reason or "")[:255],
            "admin_note": admin_note or "",
            "player_message": (player_message or "")[:300],
            "updated_by": actor,
        },
    )

    PlayerCommunicationRestrictionLog.objects.create(
        user=user, channel=channel,
        is_enabled=restriction.is_enabled,
        disabled_until=restriction.disabled_until,
        reason=restriction.reason,
        admin_note=restriction.admin_note,
        actor=actor,
    )
    logger.info(
        "communication restriction: user=%s channel=%s enabled=%s until=%s by=%s",
        user.id, channel, restriction.is_enabled, restriction.disabled_until,
        getattr(actor, "id", None),
    )
    return restriction


def restrictions_for(user):
    """Both channels for one player, as the Back Office panel renders them.

    Always returns both keys, even when no row exists — an absent row means
    "enabled", and the admin form needs something to render either way.
    """
    rows = {
        r.channel: r
        for r in PlayerCommunicationRestriction.objects.filter(user=user)
    }
    out = {}
    for channel in (CHANNEL_CHAT, CHANNEL_CALL):
        row = rows.get(channel)
        out[channel] = {
            "channel": channel,
            "is_enabled": row.is_enabled if row else True,
            "is_currently_blocking": row.is_currently_active if row else False,
            "disabled_until": row.disabled_until.isoformat() if row and row.disabled_until else None,
            "reason": row.reason if row else "",
            "admin_note": row.admin_note if row else "",
            "player_message": row.player_message if row else "",
            "updated_at": row.updated_at.isoformat() if row else None,
            "updated_by": (getattr(row.updated_by, "email", "") if row and row.updated_by_id else ""),
        }
    return out


def history_for(user, limit=50):
    """Append-only change history for one player. Admin-facing, so the
    internal note IS included — this endpoint is admin-gated."""
    return [
        {
            "id": log.id,
            "channel": log.channel,
            "is_enabled": log.is_enabled,
            "disabled_until": log.disabled_until.isoformat() if log.disabled_until else None,
            "reason": log.reason,
            "admin_note": log.admin_note,
            "actor": getattr(log.actor, "email", "") if log.actor_id else "",
            "created_at": log.created_at.isoformat(),
        }
        for log in (
            PlayerCommunicationRestrictionLog.objects
            .select_related("actor")
            .filter(user=user)[:limit]
        )
    ]
