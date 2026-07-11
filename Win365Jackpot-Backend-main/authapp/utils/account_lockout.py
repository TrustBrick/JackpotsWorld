"""
authapp/utils/account_lockout.py
─────────────────────────────────────────────────────────────────────────────
Per-account failed-login lockout, backed by Django's cache framework.
Stops distributed brute force against one account (per-IP throttling alone
does not, since attempts can be spread across many IPs).
"""

from django.core.cache import cache

MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60  # 15 minutes
ATTEMPT_WINDOW_SECONDS = 15 * 60


def _fail_key(email: str) -> str:
    return f"login_fail:{email.strip().lower()}"


def _lock_key(email: str) -> str:
    return f"login_lock:{email.strip().lower()}"


def is_locked_out(email: str) -> bool:
    return cache.get(_lock_key(email)) is not None


def record_failed_attempt(email: str) -> None:
    key = _fail_key(email)
    attempts = cache.get(key, 0) + 1
    cache.set(key, attempts, ATTEMPT_WINDOW_SECONDS)
    if attempts >= MAX_ATTEMPTS:
        cache.set(_lock_key(email), True, LOCKOUT_SECONDS)


def reset_attempts(email: str) -> None:
    cache.delete(_fail_key(email))
    cache.delete(_lock_key(email))
