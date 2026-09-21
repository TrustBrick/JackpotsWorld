"""
FULL-ADMIN-AUDIT — authapp/middleware/admin_audit.py

Writes an ActivityLog row for every state-changing request made by a staff
account, so that "what did the admins do" is answered by the database rather
than by whichever views happened to remember to log.

WHY A MIDDLEWARE AND NOT 300 MORE log() CALLS
─────────────────────────────────────────────
Before this, ~95 call sites logged by hand across ~400 endpoints. The gap was
not the real problem — the real problem is that a hand-written list can only
ever describe the endpoints that existed when someone last went through them.
Every endpoint added afterwards is unlogged by default, and nothing fails when
it is, so the trail rots quietly and you find out the day you need it.

Sitting in the request path inverts that: an endpoint is logged unless it is
deliberately excluded, so a new view added next year is covered the day it is
merged, by nobody. This is the only placement that makes "each and every
admin activity" a property of the system instead of a promise about habits.

WHAT IT RECORDS
───────────────
Actor, endpoint, HTTP method, response status, client IP, user agent, the URL
kwargs of the resolved route, and a redacted copy of the request payload. The
status matters as much as the rest: a refused delete (403) and a completed one
(204) are different facts, and an audit trail that only kept successes would
be unable to show an attempt.

WHAT IT DELIBERATELY DOES NOT RECORD
────────────────────────────────────
**Reads.** GET/HEAD/OPTIONS are skipped. The admin panel polls its dashboards
continuously, so logging reads would add millions of rows a month that say
nothing about who changed what, and would bury the rows that do. "Delete, edit,
add, called" — the actions named in the request — are all writes.

**Requests a view already described.** ActivityLog.log() marks the request
(see utils/audit_context.py) and this net stays silent when it sees that mark,
so a wallet credit keeps its one rich row — amount, before/after balance,
target player — instead of gaining a vague duplicate beside it.

**Secrets.** Passwords, tokens, OTPs and card fields are replaced before the
payload is stored; see _REDACT_KEYS. The audit trail is read by staff, so
anything it keeps is something those staff can read.

**Three high-frequency endpoints** that are machine chatter rather than admin
decisions: token refresh, analytics ingest, and chat read receipts. Each fires
on a timer or as a side effect of looking at a screen; none is an action a
person chose to take. That list is kept short on purpose — every entry is a
hole in the trail. In particular it does NOT exclude live chat or voice calls:
answering, holding, transferring and ending a call all live under
/live-chat/calls/ and are all recorded.

FAILURE POLICY
──────────────
Auditing must never be the reason a request fails. Every step runs under a
broad except that logs and moves on: a malformed payload, a database hiccup
writing the row, a user object in an unexpected shape — none of them turn
into a 500 for the admin who was only trying to save a form. The trade-off is
deliberate and it is the standard one: an audit row is worth a great deal, and
still less than the operation it describes.
"""

import json
import logging

from django.utils.deprecation import MiddlewareMixin

from authapp.utils import audit_context

logger = logging.getLogger(__name__)

# Methods that can change something. Anything else is a read.
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Coarse verb per method; the row's own endpoint/method/meta carry the detail.
_ACTION_BY_METHOD = {
    "POST":   "admin_create",
    "PUT":    "admin_update",
    "PATCH":  "admin_update",
    "DELETE": "admin_delete",
}

# Machine chatter on a timer, not decisions a person made. Substring match
# against the path.
#
# Kept deliberately short. Every entry here is a hole in the trail, so the bar
# is "a timer fires this, not a person" — not "this is noisy".
_SKIP_PATHS = (
    "/auth/token/refresh/",   # every few minutes, per open tab
    "/analytics/event/",      # telemetry ingest, per page view
)


def _is_read_receipt(path):
    """
    Marking a conversation as read is a side effect of looking at it, and it
    fires per message burst.

    Matched precisely rather than by skipping "/live-chat/" wholesale, which
    is what an earlier version of this list did — and which would have been a
    serious hole, because the voice call endpoints are mounted *under*
    live-chat too (/live-chat/calls/<id>/accept|end|hold|transfer|...). Taking
    calls is exactly the kind of admin activity this feature exists to record,
    so only the read receipt itself is excluded.
    """
    return "/live-chat/" in path and path.endswith("/read/")

# Payload keys whose values never reach the table. Matched case-insensitively
# as substrings, so "new_password" and "password_confirm" are both caught by
# "password".
_REDACT_KEYS = (
    "password", "token", "secret", "otp", "pin", "cvv", "card",
    "api_key", "apikey", "authorization", "auth", "signature",
    "backup_code", "recovery_code", "turnstile", "captcha",
)

_REDACTED = "***redacted***"

# A payload is evidence, not a copy of the request. Past this, store the shape
# and drop the rest — a bulk import posting 5 MB of rows should cost one row
# of audit, not 5 MB of it.
_MAX_BODY_CHARS = 4000
_MAX_CAPTURE_BYTES = 64 * 1024

# Body is only read for payload types that are small, structured and already
# buffered. Multipart is excluded on purpose: touching request.body on a file
# upload would pull the whole upload into memory before the view ever sees it.
_CAPTURABLE_TYPES = ("application/json", "application/x-www-form-urlencoded", "text/plain")

# URL/body keys that genuinely name a player. Deliberately narrow: a generic
# "pk" or "id" belongs to whatever the route is about — a casino, a promotion,
# a gift — and resolving one of those into target_user would file the action
# against an unrelated player. Wrong attribution in an audit trail is worse
# than none, so unmatched ids are kept verbatim in meta instead.
_USER_ID_KEYS = ("user_id", "target_user_id", "player_id", "member_id")


def _redact(value, depth=0):
    """Deep-copy a decoded payload with sensitive values replaced."""
    if depth > 6:
        return "..."
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            key = str(k)
            if any(s in key.lower() for s in _REDACT_KEYS):
                out[key] = _REDACTED
            else:
                out[key] = _redact(v, depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        return [_redact(v, depth + 1) for v in value[:50]]
    return value


class AdminAuditMiddleware(MiddlewareMixin):
    """Logs every write an admin makes. See the module docstring."""

    def process_request(self, request):
        # Worker threads are pooled and reused, so the previous request's mark
        # would otherwise still be set and this request's net would never
        # fire. Reset first, capture second.
        audit_context.reset()
        request._audit_payload = self._capture_payload(request)
        return None

    def process_view(self, request, view_func, view_args, view_kwargs):
        # Captured here rather than re-resolved later: by process_response the
        # matched route is available via resolver_match, but the kwargs are
        # what identify the object being acted on, and they are handed to us
        # for free at this point.
        request._audit_view_kwargs = view_kwargs or {}
        return None

    def process_response(self, request, response):
        try:
            self._maybe_log(request, response)
        except Exception:
            # Never let auditing break the response being returned.
            logger.exception("admin audit: failed to write activity row")
        return response

    # ── internals ────────────────────────────────────────────────────────────

    def _capture_payload(self, request):
        """
        Redacted copy of the request body, or None.

        Runs before the view so the body is read once, from the front of the
        stream, and cached on the request as Django's `_body` — which is the
        same cache DRF then parses from, so the view is unaffected.
        """
        try:
            if request.method not in _WRITE_METHODS:
                return None
            ctype = (request.META.get("CONTENT_TYPE") or "").lower()
            if not any(t in ctype for t in _CAPTURABLE_TYPES):
                # Multipart and friends: record the shape, never the bytes.
                return {"_content_type": ctype[:80]} if ctype else None
            try:
                length = int(request.META.get("CONTENT_LENGTH") or 0)
            except (TypeError, ValueError):
                length = 0
            if length > _MAX_CAPTURE_BYTES:
                return {"_skipped": "payload too large", "_bytes": length}

            raw = request.body
            if not raw:
                return None
            text = raw.decode("utf-8", errors="replace")
            if "json" in ctype:
                try:
                    decoded = _redact(json.loads(text))
                except ValueError:
                    pass  # not valid JSON after all; fall through to text
                else:
                    # Under the byte cap but still large once decoded — a
                    # 60 KB body would otherwise be stored verbatim in every
                    # row it produced. Keep the evidence, drop the bulk.
                    if len(json.dumps(decoded, default=str)) > _MAX_BODY_CHARS:
                        return {"_truncated": json.dumps(decoded, default=str)[:_MAX_BODY_CHARS]}
                    return decoded
            return {"_raw": text[:_MAX_BODY_CHARS]}
        except Exception:
            logger.exception("admin audit: failed to capture payload")
            return None

    def _resolve_target_user(self, request, payload):
        """The player this action was about, when the request names one."""
        candidates = []
        for source in (getattr(request, "_audit_view_kwargs", {}) or {}, payload or {}):
            if not isinstance(source, dict):
                continue
            for key in _USER_ID_KEYS:
                if source.get(key) not in (None, ""):
                    candidates.append(source[key])
        if not candidates:
            return None
        from authapp.models import User
        for raw in candidates:
            try:
                pk = int(raw)
            except (TypeError, ValueError):
                continue
            # Keep looking if this id matches nobody: a request can carry a
            # stale user_id in the body and the real one in the URL.
            found = User.objects.filter(pk=pk).first()
            if found is not None:
                return found
        return None

    def _maybe_log(self, request, response):
        if request.method not in _WRITE_METHODS:
            return

        path = request.path or ""
        if any(frag in path for frag in _SKIP_PATHS) or _is_read_receipt(path):
            return

        # DRF authenticates inside the view, but its Request.user setter also
        # assigns to the underlying HttpRequest "ensuring that it is available
        # to any middleware in the stack" — so by now this is the real user.
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return
        if not getattr(user, "is_staff", False):
            return  # players are logged by the views that serve them

        # A view that already described this request in detail wins.
        if audit_context.explicit_log_count():
            return

        from authapp.models import ActivityLog
        from authapp.utils.client_ip import get_client_ip

        payload = getattr(request, "_audit_payload", None)
        kwargs  = getattr(request, "_audit_view_kwargs", {}) or {}
        status  = getattr(response, "status_code", None)

        meta = {"source": "middleware"}
        if kwargs:
            # Stringified because a URL kwarg can be a UUID or a slug, and
            # meta is JSON.
            meta["url_kwargs"] = {k: str(v) for k, v in kwargs.items()}
        if payload is not None:
            meta["payload"] = payload
        if status is not None and status >= 400:
            # Say so in words too: a reader scanning descriptions shouldn't
            # have to know which status codes mean "this didn't happen".
            meta["outcome"] = "failed"

        verb = _ACTION_BY_METHOD.get(request.method, "admin_action")
        outcome = "" if (status or 0) < 400 else f" (failed: HTTP {status})"

        ActivityLog.log(
            actor=user,
            target_user=self._resolve_target_user(request, payload),
            action=verb,
            actor_type="admin",
            description=f"{request.method} {path}{outcome}",
            endpoint=path[:255],
            method=request.method,
            status_code=status,
            meta=meta,
            ip_address=get_client_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:1000],
        )
