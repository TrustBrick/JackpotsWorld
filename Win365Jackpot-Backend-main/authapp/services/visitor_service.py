"""
authapp/services/visitor_service.py
─────────────────────────────────────────────────────────────────────────────
VISITOR-ANALYTICS: turning a request into a Visitor + VisitorSession, with an
approximate location attached.

This is the piece the previous implementation did not have, and its absence is
why the admin dashboard had no visitors, no IPs, no first/last seen and no
timeline: events were written straight to a flat table keyed on two opaque
strings, with nothing that could answer "who is this and where are they".

WHAT IS DERIVED SERVER-SIDE, ALWAYS (§23): the IP, the country, the region,
the city, the timezone, the coordinates and the ISP. A client sends event
facts (what happened, on which page, to which video) and its own opaque
visitor/session ids — never a location. Anything a visitor could set, a
visitor could lie about, and a dashboard built on values the audience chooses
is worse than no dashboard.

COST CONTROL — this runs on a public, high-volume endpoint, so the work per
request is bounded on three levels:
  1. Resolution happens ONCE PER INGEST REQUEST, not once per event: a batch
     of 10 events from one browser shares one resolution — see
     analytics_service.record_batch, which calls build_context() once and
     threads the result through every event in the batch.
  2. The geolocation lookup is cached by IP in utils/geolocation.py, so it
     costs one external call per distinct address, not per visitor and not
     per session.
  3. A session's row is only written when something actually changed, and
     `last_activity_at` is rate-limited to one write per
     _ACTIVITY_WRITE_INTERVAL seconds. Without that, a visitor idling on a
     page with a heartbeat would generate an UPDATE per event forever.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.db import DatabaseError, transaction
from django.utils import timezone

from authapp.models.analytics_models import (
    Visitor, VisitorSession,
    GEO_STATUS_PRIVATE_IP, GEO_STATUS_UNAVAILABLE,
)
from authapp.utils.client_ip import get_client_ip_with_source
from authapp.utils.geolocation import resolve_geo
from authapp.utils.traffic_source import classify_traffic_source
from authapp.utils.user_agent import classify_user_agent

logger = logging.getLogger(__name__)

# Don't rewrite last_activity_at on every single event — see the cost note.
# Well under the session idle window, so a session can never look idle just
# because we skipped a write.
_ACTIVITY_WRITE_INTERVAL = 60


def _idle_window():
    return timedelta(minutes=getattr(settings, "ANALYTICS_SESSION_IDLE_MINUTES", 30))


def _store_ip():
    return bool(getattr(settings, "ANALYTICS_STORE_IP", True))


def _own_hosts():
    """Hostnames that count as "this site", so internal navigation is not
    reported as referral traffic. Reuses ALLOWED_HOSTS rather than a second
    list that could drift out of step with it."""
    return tuple(h.strip() for h in getattr(settings, "ALLOWED_HOSTS", []) if h and h != "*")


def cf_country(request):
    """Country from Cloudflare's edge header, when the zone sends one.

    Free and instant, so it is preferred over the geolocation provider when
    present — but it is NOT relied on, which is the fix for the original bug.
    Cloudflare only adds this header when the "Add visitor location headers"
    Managed Transform is enabled on the zone, and it is off by default; the
    previous implementation treated it as the sole source of country and threw
    away the provider's own country, so a zone without that transform produced
    an empty location report forever.

    'XX' (unknown) and 'T1' (Tor) are Cloudflare's non-country sentinels.
    """
    code = (request.META.get("HTTP_CF_IPCOUNTRY", "") or "").strip().upper()[:2]
    return "" if code in ("", "XX", "T1") else code


def _geo_fields(geo, cf_code=""):
    """Map a utils.geolocation result onto the GeoSnapshot columns, letting
    Cloudflare's country code win when we have one (it comes from the edge
    that actually terminated the connection, so it is at least as good as the
    provider's, and free)."""
    country_code = cf_code or geo["country_code"]
    return {
        "country_code": country_code,
        # Only pair the provider's country NAME with its own code. If
        # Cloudflare said "IN" and the provider failed entirely, we know the
        # code but genuinely do not know the display name — leaving it blank
        # is honest; inventing "India" from a lookup table we don't have is
        # not, and the admin UI falls back to showing the code.
        "country_name": geo["country_name"] if country_code == geo["country_code"] else "",
        "region": geo["region"],
        "region_code": geo["region_code"],
        "city": geo["city"],
        "timezone_name": geo["timezone"],
        "latitude": geo["latitude"],
        "longitude": geo["longitude"],
        "isp": geo["isp"],
        "geo_status": geo["status"],
    }


class VisitorContext:
    """Everything the event writer needs about who/where this request is.

    Carries the model rows AND the denormalised bits that get copied onto each
    event, so record_event never has to touch the database again.
    """
    __slots__ = (
        "visitor", "session", "ip", "ip_source", "geo",
        "device_type", "browser", "operating_system", "traffic_source",
    )

    def __init__(self, *, visitor, session, ip, ip_source, geo,
                 device_type, browser, operating_system, traffic_source):
        self.visitor = visitor
        self.session = session
        self.ip = ip
        self.ip_source = ip_source
        self.geo = geo
        self.device_type = device_type
        self.browser = browser
        self.operating_system = operating_system
        self.traffic_source = traffic_source

    @property
    def country_code(self):
        return self.geo["country_code"]

    @property
    def country_name(self):
        return self.geo["country_name"]

    @property
    def region(self):
        return self.geo["region"]

    @property
    def city(self):
        return self.geo["city"]


def _new_session_id(base, attempt):
    """A fresh session key derived from the client's, used when the client's
    own key is still alive but the visit behind it has timed out.

    The client cannot mint a new sessionStorage id on our behalf (it has no
    idea we consider the visit over), so the server derives one. Suffixed
    rather than random so the lineage stays visible when reading rows by hand.
    """
    return f"{base[:56]}~{attempt}"


def _resolve_session(visitor, session_key, now, defaults):
    """Get or create the VisitorSession for this key, honouring the idle
    timeout. Returns (session, created)."""
    idle = _idle_window()

    # Walk the lineage: the client's key, then its ~1, ~2 … successors, until
    # we find one that is still live or a slot that is free. Bounded — a
    # visitor who keeps one tab open for weeks would otherwise walk forever.
    key = session_key
    for attempt in range(1, 25):
        existing = VisitorSession.objects.filter(session_id=key).first()
        if existing is None:
            session = VisitorSession.objects.create(
                session_id=key, visitor=visitor, started_at=now,
                last_activity_at=now, **defaults,
            )
            return session, True
        if existing.visitor_id != visitor.id:
            # Two different browsers presented the same session key. Should be
            # impossible (the key is random), but if it happens, keep them
            # apart rather than merging two people's activity.
            key = _new_session_id(session_key, attempt)
            continue
        if now - existing.last_activity_at <= idle:
            return existing, False
        # Timed out — this visit is over; the next one gets its own row.
        key = _new_session_id(session_key, attempt)

    # Lineage exhausted: reuse the last one rather than failing the request.
    # Analytics must never break the site (§27).
    return existing, False


def build_context(request, *, visitor_key, session_key, referrer="", landing_page="", utm=None):
    """Resolve (and update) the Visitor and VisitorSession for this request.

    Returns a VisitorContext, or None if the request could not be attributed
    to a visitor at all. Never raises: a database or provider problem degrades
    to None and the caller simply records less, rather than 500-ing a page the
    visitor is trying to read.
    """
    utm = utm or {}
    now = timezone.now()

    ip, ip_source = get_client_ip_with_source(request)
    ua = request.META.get("HTTP_USER_AGENT", "")
    device_type, browser, operating_system = classify_user_agent(ua)

    geo = resolve_geo(ip or "")
    geo_cols = _geo_fields(geo, cf_country(request))
    source_label = classify_traffic_source(referrer, utm.get("utm_source"), _own_hosts())

    stored_ip = ip if (ip and _store_ip()) else None

    try:
        with transaction.atomic():
            visitor, created = Visitor.objects.get_or_create(
                visitor_id=visitor_key,
                defaults=dict(
                    first_seen=now,
                    last_seen=now,
                    ip_address=stored_ip,
                    device_type=device_type,
                    browser=browser,
                    operating_system=operating_system,
                    # First-touch acquisition — written here and never again.
                    first_referrer=(referrer or "")[:500],
                    landing_page=(landing_page or "")[:500],
                    traffic_source=source_label,
                    utm_source=(utm.get("utm_source") or "")[:100],
                    utm_medium=(utm.get("utm_medium") or "")[:100],
                    utm_campaign=(utm.get("utm_campaign") or "")[:150],
                    utm_content=(utm.get("utm_content") or "")[:150],
                    utm_term=(utm.get("utm_term") or "")[:150],
                    **geo_cols,
                ),
            )

            if not created:
                _refresh_visitor(visitor, now, stored_ip, geo_cols,
                                 device_type, browser, operating_system)

            session, _ = _resolve_session(
                visitor, session_key, now,
                defaults=dict(
                    ip_address=stored_ip,
                    device_type=device_type,
                    browser=browser,
                    operating_system=operating_system,
                    referrer=(referrer or "")[:500],
                    landing_page=(landing_page or "")[:500],
                    traffic_source=source_label,
                    utm_source=(utm.get("utm_source") or "")[:100],
                    utm_medium=(utm.get("utm_medium") or "")[:100],
                    utm_campaign=(utm.get("utm_campaign") or "")[:150],
                    utm_content=(utm.get("utm_content") or "")[:150],
                    utm_term=(utm.get("utm_term") or "")[:150],
                    **geo_cols,
                ),
            )
            _touch_session(session, now)
    except DatabaseError:
        # Analytics is never allowed to take the site down with it.
        logger.warning("visitor-analytics: could not resolve visitor", exc_info=True)
        return None

    return VisitorContext(
        visitor=visitor, session=session, ip=ip, ip_source=ip_source,
        geo={
            "country_code": geo_cols["country_code"],
            "country_name": geo_cols["country_name"],
            "region": geo_cols["region"],
            "city": geo_cols["city"],
            "status": geo_cols["geo_status"],
        },
        device_type=device_type, browser=browser,
        operating_system=operating_system, traffic_source=source_label,
    )


def _refresh_visitor(visitor, now, stored_ip, geo_cols, device_type, browser, operating_system):
    """Update the mutable half of an existing Visitor. First-touch acquisition
    fields are deliberately NOT touched — see the model."""
    updates = {"last_seen": now}

    if stored_ip and stored_ip != visitor.ip_address:
        updates["ip_address"] = stored_ip
    if device_type and device_type != visitor.device_type:
        updates["device_type"] = device_type
    if browser and browser != visitor.browser:
        updates["browser"] = browser
    if operating_system and operating_system != visitor.operating_system:
        updates["operating_system"] = operating_system

    # Only overwrite location with a BETTER answer. A visitor whose city we
    # already know must not be downgraded to blank because one later lookup
    # hit the provider's rate limit — that would make the dashboard flicker
    # between "Hyderabad" and "Unknown" for no reason the admin can see.
    if _geo_is_better(geo_cols, visitor):
        updates.update(geo_cols)

    for field, value in updates.items():
        setattr(visitor, field, value)
    visitor.save(update_fields=list(updates.keys()))


def _geo_is_better(geo_cols, current):
    """True if the freshly-resolved location says more than what is stored."""
    status = geo_cols["geo_status"]
    if status in (GEO_STATUS_UNAVAILABLE,):
        return False
    if status == GEO_STATUS_PRIVATE_IP:
        # A private address is a real, meaningful answer for local traffic,
        # but it must not overwrite a known public location.
        return not current.country_code
    # A successful/failed lookup for a NEW address is authoritative: the
    # visitor genuinely moved networks.
    return bool(geo_cols["country_code"]) or not current.country_code


def _touch_session(session, now):
    """Advance last_activity_at, at most once per _ACTIVITY_WRITE_INTERVAL."""
    if (now - session.last_activity_at).total_seconds() < _ACTIVITY_WRITE_INTERVAL:
        session.last_activity_at = now  # keep the in-memory value truthful
        return
    session.last_activity_at = now
    session.save(update_fields=["last_activity_at"])


def diagnostic(request, *, visitor_key="", session_key=""):
    """The raw facts behind one request, for the admin diagnostic view (§28).

    Read-only and side-effect free: it resolves nothing, creates nothing and
    writes nothing — it reports exactly what the ingest path WOULD see for
    this request, which is the whole point of a diagnostic.
    """
    ip, ip_source = get_client_ip_with_source(request)
    geo = resolve_geo(ip or "")
    cf = cf_country(request)
    ua = request.META.get("HTTP_USER_AGENT", "")
    device_type, browser, operating_system = classify_user_agent(ua)

    from authapp.utils import geolocation as _geo_mod
    from authapp.utils.bot_detection import is_bot

    return {
        "ip": ip,
        "ip_source": ip_source,
        "ip_is_private": geo["status"] == GEO_STATUS_PRIVATE_IP,
        "geo_provider": _geo_mod.PROVIDER_NAME,
        "geo_lookup_enabled": _geo_mod.GEO_LOOKUP_ENABLED,
        "geo_status": geo["status"],
        "cf_ipcountry_header": cf or None,
        "cf_ipcountry_present": bool(cf),
        "country_code": cf or geo["country_code"],
        "country_name": geo["country_name"],
        "region": geo["region"],
        "region_code": geo["region_code"],
        "city": geo["city"],
        "timezone": geo["timezone"],
        "latitude": geo["latitude"],
        "longitude": geo["longitude"],
        "isp": geo["isp"],
        "visitor_id": visitor_key or None,
        "session_id": session_key or None,
        "user_agent": ua,
        "device_type": device_type,
        "browser": browser,
        "operating_system": operating_system,
        "detected_as_bot": is_bot(ua),
        "store_ip_enabled": _store_ip(),
        "ip_retention_days": getattr(settings, "ANALYTICS_IP_RETENTION_DAYS", None),
        "session_idle_minutes": getattr(settings, "ANALYTICS_SESSION_IDLE_MINUTES", None),
    }
