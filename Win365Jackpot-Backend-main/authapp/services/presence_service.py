"""
authapp/services/presence_service.py
─────────────────────────────────────────────────────────────────────────────
Who is on the site right now, for the Back Office live-chat contact picker
(the green dot next to a player or affiliate the agent can text or call).

The signed-in site sends a heartbeat (POST /api/live-chat/presence/) every
PRESENCE_HEARTBEAT_SECONDS. That stamps User.last_seen_at, and a user counts
as online while that stamp is younger than ONLINE_WINDOW. A timestamp rather
than a socket registry because the app runs on more than one instance and
the customer site may be on the polling transport, where there is no socket
to count at all.

Writes are throttled to one per PRESENCE_WRITE_INTERVAL per user, so a busy
player's heartbeat is mostly a read.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

PRESENCE_HEARTBEAT_SECONDS = 10
PRESENCE_WRITE_INTERVAL = timedelta(seconds=30)
# Two missed heartbeats plus a write interval of slack before the dot goes grey.
ONLINE_WINDOW = timedelta(seconds=75)


def touch(user):
    """Mark `user` as seen now (at most once per PRESENCE_WRITE_INTERVAL)."""
    now = timezone.now()
    last = getattr(user, "last_seen_at", None)
    if last and now - last < PRESENCE_WRITE_INTERVAL:
        return
    # .update() so the heartbeat never round-trips the whole user row (or
    # trips auto_now fields / save signals) just to move one timestamp.
    get_user_model().objects.filter(pk=user.pk).update(last_seen_at=now)
    user.last_seen_at = now


def is_online(user, now=None):
    last = getattr(user, "last_seen_at", None)
    if not last:
        return False
    return (now or timezone.now()) - last < ONLINE_WINDOW


def online_cutoff(now=None):
    return (now or timezone.now()) - ONLINE_WINDOW
