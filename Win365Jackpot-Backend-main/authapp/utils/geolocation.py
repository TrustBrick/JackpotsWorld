"""
authapp/utils/geolocation.py
Best-effort IP -> city/region/country lookup using the free ip-api.com
service. Never raises — returns an empty dict on any failure, private IP,
or missing IP so callers can safely merge the result without extra checks.
"""
import ipaddress

import requests

_TIMEOUT = 2.5


def _is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved)


def resolve_geo_location(ip: str) -> dict:
    """Returns {"city": str, "region": str, "country_name": str} — any/all
    keys may be missing if the lookup didn't succeed. Safe to call on every
    login/signup; failures are swallowed and simply produce an empty dict."""
    if not ip or not _is_public_ip(ip):
        return {}
    try:
        resp = requests.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "status,city,regionName,country"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != "success":
            return {}
        return {
            "city": data.get("city") or "",
            "region": data.get("regionName") or "",
            "country_name": data.get("country") or "",
        }
    except Exception:
        return {}
