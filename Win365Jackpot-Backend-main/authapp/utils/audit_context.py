"""
Per-request bookkeeping that lets the audit middleware tell the difference
between an admin action a view already described in detail and one that
nothing has recorded yet.

WHY THIS EXISTS
───────────────
`AdminAuditMiddleware` is a safety net: it writes an ActivityLog row for every
state-changing admin request so that no action can go unrecorded, including
actions on endpoints written after the middleware. But ~95 call sites already
write their own, far richer, rows — with amounts, before/after balances, the
target player, a reference id. If the net fired on those too, every wallet
credit would produce two rows: the good one, and a vague
"POST /api/admin-panel/wallet/credit/" beside it.

So `ActivityLog.log()` marks the request as already-described, and the
middleware only writes its own row when that mark is absent. Explicit logging
always wins; the net covers what it doesn't reach.

WHY A THREAD-LOCAL
──────────────────
The mark has to travel from deep inside a service function back up to
middleware, through call stacks that have no request object to hang it on
(services are called from management commands and Celery-style jobs too).
Django's WSGI handler serves one request per thread, so a thread-local is the
standard way to carry that, and it degrades safely: outside a request the
counter is simply zero and nothing reads it.

The middleware resets the counter at the start of every request, which matters
because worker threads are pooled and reused — without the reset, a request
would inherit the previous request's mark and the net would stay silent.
"""

import threading

_state = threading.local()


def reset():
    """Start a fresh request. Called by the audit middleware on the way in."""
    _state.explicit_logs = 0


def note_explicit_log():
    """Record that a view/service wrote its own ActivityLog row."""
    _state.explicit_logs = getattr(_state, "explicit_logs", 0) + 1


def explicit_log_count():
    """How many rows this request wrote by hand. 0 => the net should fire."""
    return getattr(_state, "explicit_logs", 0)
