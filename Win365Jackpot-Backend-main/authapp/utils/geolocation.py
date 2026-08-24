"""
authapp/utils/geolocation.py
─────────────────────────────────────────────────────────────────────────────
IP -> approximate location, via the free ip-api.com service.

APPROXIMATE, AND LABELLED AS SUCH. What comes back is where the *network*
that owns the address is registered/routed, not where the person is. The
coordinates are a city centroid, never a device fix — nothing here reads GPS
or the browser Geolocation API, and nothing ever will: this module's only
input is an IP address. The admin UI presents it as "Approximate location"
for exactly that reason.

Never raises. Every failure path returns a fully-populated dict whose fields
are blank/None and whose `status` says why, so a caller can merge the result
unconditionally and a failed lookup can never break the request that
triggered it.

  status = "success"      the provider answered and we have data
           "private_ip"   RFC1918/loopback/link-local/reserved — deliberately
                          NOT sent to the provider (it would be meaningless,
                          and it leaks internal topology). Rendered as
                          "Local / Private Network", never as a guessed city.
           "failed"       the provider was asked and could not answer (bad
                          address, provider said "fail", HTTP error, timeout)
           "unavailable"  we never asked — no IP, lookups disabled, or the
                          provider is in rate-limit cooldown

CACHING — read before changing. The lookup is a *blocking* HTTP call and this
service runs behind 3 gunicorn workers (see Procfile), so an uncached call per
analytics event would let a slow third party stall a third of the app's
capacity. Worse, ip-api.com's free tier is rate-limited **per originating
server IP**, not per looked-up address: every lookup this app makes leaves the
same Elastic Beanstalk instance, so the whole site shares one ~45/min budget.
Two things bound that:

  • Results are cached BY IP (not by session, not by visitor). Every visitor
    behind a shared NAT, and every later session of a returning visitor,
    reuses one lookup.
  • A 429 from the provider trips a global cooldown for the `X-Ttl` seconds it
    asks for, during which we return "unavailable" instantly instead of
    queueing more doomed requests behind a timeout.

Failures are cached too (briefly): without that, an address the provider
cannot resolve would be retried on every single event it generates.
"""
import ipaddress

import requests
from decouple import config
from django.core.cache import cache

# The provider actually in use. Surfaced verbatim by the admin diagnostic
# endpoint so "which service produced this city?" has a truthful answer
# rather than a guess.
PROVIDER_NAME = "ip-api.com"
PROVIDER_ENDPOINT = "http://ip-api.com/json/{ip}"

_TIMEOUT = 2.5

STATUS_SUCCESS = "success"
STATUS_FAILED = "failed"
STATUS_PRIVATE_IP = "private_ip"
STATUS_UNAVAILABLE = "unavailable"

# Escape hatch: flip to False in the environment to stop all outbound geo
# lookups on the next request, no deploy needed, if the provider misbehaves.
GEO_LOOKUP_ENABLED = config("ANALYTICS_RESOLVE_LOCATION", default=True, cast=bool)

_CACHE_PREFIX = "analytics:geo:ip:"
_CACHE_TTL_SUCCESS = 60 * 60 * 24 * 7   # a city rarely changes for an address
_CACHE_TTL_FAILURE = 60 * 15            # retry a failure, but not per-event
_COOLDOWN_KEY = "analytics:geo:cooldown"
_COOLDOWN_FALLBACK_SECONDS = 60

# The exact provider fields consumed. Requested explicitly so the provider
# returns nothing else — no reverse-DNS hostname, no proxy/hosting flags, no
# AS details we have no use for and would then be storing for no reason.
_FIELDS = "status,message,country,countryCode,regionName,region,city,timezone,lat,lon,isp"


def _blank(status):
    return {
        "status": status,
        "country_name": "",
        "country_code": "",
        "region": "",
        "region_code": "",
        "city": "",
        "timezone": "",
        "latitude": None,
        "longitude": None,
        "isp": "",
    }


def is_private_ip(ip: str) -> bool:
    """True for an address that must never be sent to the provider — and that
    should be shown as 'Local / Private Network' rather than pretending we
    know a public location for it."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return bool(
        addr.is_private or addr.is_loopback or addr.is_link_local
        or addr.is_reserved or addr.is_multicast or addr.is_unspecified
    )


def _valid_ip(ip: str) -> bool:
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False


def _cache_get(key):
    try:
        return cache.get(key)
    except Exception:
        return None


def _cache_set(key, value, ttl):
    try:
        cache.set(key, value, ttl)
    except Exception:
        pass


def _in_cooldown():
    return bool(_cache_get(_COOLDOWN_KEY))


def _start_cooldown(seconds):
    try:
        ttl = int(seconds)
    except (TypeError, ValueError):
        ttl = _COOLDOWN_FALLBACK_SECONDS
    _cache_set(_COOLDOWN_KEY, True, max(1, ttl))


def resolve_geo(ip: str) -> dict:
    """Approximate location for `ip`. Always returns the full dict shape
    described in the module docstring — check `status` to know whether the
    values mean anything."""
    ip = (ip or "").strip()
    if not ip or not _valid_ip(ip):
        return _blank(STATUS_UNAVAILABLE)
    if is_private_ip(ip):
        # Deliberately no external call — see the module docstring.
        return _blank(STATUS_PRIVATE_IP)
    if not GEO_LOOKUP_ENABLED:
        return _blank(STATUS_UNAVAILABLE)

    cache_key = f"{_CACHE_PREFIX}{ip}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    if _in_cooldown():
        # Rate-limited a moment ago; don't queue another doomed request behind
        # a 2.5s timeout. Not cached — the next call after the cooldown
        # expires should try again for real.
        return _blank(STATUS_UNAVAILABLE)

    try:
        resp = requests.get(
            PROVIDER_ENDPOINT.format(ip=ip),
            params={"fields": _FIELDS},
            timeout=_TIMEOUT,
        )
        if resp.status_code == 429:
            # ip-api asks callers to wait X-Ttl seconds before the quota
            # window resets. Honour it for every caller, not just this one.
            _start_cooldown(resp.headers.get("X-Ttl"))
            return _blank(STATUS_UNAVAILABLE)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        result = _blank(STATUS_FAILED)
        _cache_set(cache_key, result, _CACHE_TTL_FAILURE)
        return result

    if not isinstance(data, dict) or data.get("status") != "success":
        result = _blank(STATUS_FAILED)
        _cache_set(cache_key, result, _CACHE_TTL_FAILURE)
        return result

    def _num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    result = {
        "status": STATUS_SUCCESS,
        "country_name": (data.get("country") or "")[:100],
        "country_code": (data.get("countryCode") or "").upper()[:2],
        "region": (data.get("regionName") or "")[:100],
        "region_code": (data.get("region") or "")[:10],
        "city": (data.get("city") or "")[:100],
        "timezone": (data.get("timezone") or "")[:64],
        "latitude": _num(data.get("lat")),
        "longitude": _num(data.get("lon")),
        "isp": (data.get("isp") or "")[:120],
    }
    _cache_set(cache_key, result, _CACHE_TTL_SUCCESS)
    return result


def resolve_geo_location(ip: str) -> dict:
    """Backwards-compatible shim for the pre-existing callers in auth_views /
    affiliate_views, which expect {"city", "region", "country_name"} and an
    EMPTY dict on any failure. Unchanged contract — those call sites treat a
    missing key as "unknown" and must keep doing so."""
    geo = resolve_geo(ip)
    if geo["status"] != STATUS_SUCCESS:
        return {}
    return {
        "city": geo["city"],
        "region": geo["region"],
        "country_name": geo["country_name"],
    }
