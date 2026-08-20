"""
authapp/utils/anonymous_id.py
─────────────────────────────────────────────────────────────────────────────
ANALYTICS: deriving a privacy-safe anonymous visitor id.

Primary source is the client's own first-party id — a random, opaque token the
browser stores in localStorage and sends with every event. It is derived from
no personal data at all, is stable across refreshes AND sessions (so a reload
never counts as a new visitor), which is exactly what accurate unique-visitor
counting needs.

Fallback, when the client can't supply one (localStorage blocked, or a
server-recorded event with no client id): a salted, daily-rotating hash of
IP + User-Agent. The IP is used ONLY to compute this hash and is never stored;
the daily salt means the id cannot be correlated across days. It changes for a
visitor each day — a deliberate privacy/accuracy trade-off that only applies on
this fallback path, since the client id is the normal one.

No raw IP is ever returned or persisted by anything here.
"""
import hashlib
import re
from datetime import date

from django.conf import settings

from authapp.utils.client_ip import get_client_ip

# Opaque, no PII: letters/digits/_/- only, bounded length. A client value that
# doesn't match is ignored (fallback used) rather than trusted — this is also
# what stops a client from stuffing anything meaningful (or oversized) here.
_VALID_CLIENT_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def _daily_salt():
    # SECRET_KEY keeps the hash unguessable; the date rotates it daily so an
    # anonymous id from one day can't be linked to the same visitor the next.
    return f"{settings.SECRET_KEY}:{date.today().isoformat()}"


def is_valid_client_id(value: str) -> bool:
    return bool(_VALID_CLIENT_ID.match((value or "").strip()))


def derive_anonymous_id(request, provided=None) -> str:
    """Return the anonymous visitor id for this request. Prefers the client's
    first-party id; otherwise a salted daily IP+UA hash (the IP is never
    stored)."""
    provided = (provided or "").strip()
    if _VALID_CLIENT_ID.match(provided):
        return provided

    ip = get_client_ip(request) or ""
    ua = request.META.get("HTTP_USER_AGENT", "")
    digest = hashlib.sha256(f"{_daily_salt()}:{ip}:{ua}".encode("utf-8", "ignore")).hexdigest()
    return f"a_{digest[:30]}"
