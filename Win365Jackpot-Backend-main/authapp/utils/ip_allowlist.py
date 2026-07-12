"""
authapp/utils/ip_allowlist.py
─────────────────────────────────────────────────────────────────────────────
Optional IP allowlist for the Super Admin portal, driven entirely by the
SUPERADMIN_IP_ALLOWLIST env var (comma-separated IPs and/or CIDR ranges,
e.g. "203.0.113.5,198.51.100.0/24"). Left blank, nothing is restricted —
matches how every other env-driven setting in this project defaults to
"off" until explicitly configured.

Parsed once at process start (like ALLOWED_HOSTS/CORS_ALLOWED_ORIGINS) —
changing it requires a Passenger restart, same as those.
"""
import ipaddress

from decouple import config


def _parse_allowlist():
    raw = config("SUPERADMIN_IP_ALLOWLIST", default="")
    networks = []
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            continue
    return networks


_ALLOWLIST = _parse_allowlist()


def is_superadmin_ip_allowed(ip_str):
    """True if unrestricted (no allowlist configured) or `ip_str` falls
    inside one of the configured networks/addresses. False for anything
    that doesn't parse as a valid IP when an allowlist IS configured."""
    if not _ALLOWLIST:
        return True
    try:
        ip = ipaddress.ip_address(ip_str)
    except (ValueError, TypeError):
        return False
    return any(ip in net for net in _ALLOWLIST)
