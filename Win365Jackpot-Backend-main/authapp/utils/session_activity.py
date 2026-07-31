"""
Server-side inactivity tracking for JWT sessions.

The SPA logs an idle user out after SESSION_IDLE_TIMEOUT_MINUTES, but that is
client-side only — anyone holding a copy of the refresh token could ignore the
browser entirely and keep minting access tokens until the refresh token's own
30-day lifetime ran out. This module records when each user was last seen so
/api/auth/token/refresh/ can refuse to resurrect a session that has been idle
past the timeout.

Cost control
────────────
Writing "last seen" on every authenticated request would be one cache write
per request, and in production the cache is DB-backed. Instead each worker
process keeps an in-memory note of when it last stamped a given user and only
writes through to the shared cache once per THROTTLE_SECONDS. That means the
stored timestamp can lag real activity by up to THROTTLE_SECONDS, which is
what settings.SESSION_IDLE_GRACE_SECONDS compensates for.

Fail-open by design
───────────────────
Any cache problem — a missing entry, an evicted key, an unavailable backend —
resolves to "not idle". This check exists to shorten the window on stolen
tokens, not to become a new way for legitimate users to get locked out; the
access token's own 15-minute expiry is the guard that always holds.
"""

import time

from django.conf import settings
from django.core.cache import cache

# How often a single worker process writes a user's timestamp through to the
# shared cache. Reads on the refresh path are unaffected.
THROTTLE_SECONDS = 60

# Keep the entry alive well past the idle window so "no entry" reliably means
# "no recorded activity at all" (fresh deploy, cleared cache) rather than
# "idle" — see fail-open note above.
_CACHE_TTL_MULTIPLIER = 8

# Bounded per-process throttle map: {user_id: monotonic-ish seconds}.
_last_write = {}
_MAX_TRACKED = 5000


def _idle_timeout_seconds():
    return int(settings.SESSION_IDLE_TIMEOUT_MINUTES) * 60


def _key(user_id):
    return f"session_last_seen:{user_id}"


def touch(user_id):
    """Record that ``user_id`` just made an authenticated request."""
    if not user_id:
        return

    now = time.time()
    last = _last_write.get(user_id)
    if last is not None and now - last < THROTTLE_SECONDS:
        return

    if len(_last_write) >= _MAX_TRACKED:
        _last_write.clear()
    _last_write[user_id] = now

    try:
        cache.set(_key(user_id), now, timeout=_idle_timeout_seconds() * _CACHE_TTL_MULTIPLIER)
    except Exception:
        # Never let activity bookkeeping break a real request.
        pass


def is_idle_expired(user_id):
    """
    True only when we positively know the user has been inactive longer than
    the configured idle window. Unknown/unavailable -> False (fail open).
    """
    if not user_id:
        return False

    try:
        last_seen = cache.get(_key(user_id))
    except Exception:
        return False

    if not last_seen:
        return False

    idle_for = time.time() - float(last_seen)
    return idle_for > _idle_timeout_seconds() + int(settings.SESSION_IDLE_GRACE_SECONDS)


def clear(user_id):
    """Drop the record — used on logout so the next login starts clean."""
    if not user_id:
        return
    _last_write.pop(user_id, None)
    try:
        cache.delete(_key(user_id))
    except Exception:
        pass
