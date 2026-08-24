"""
authapp/utils/client_ip.py
─────────────────────────────────────────────────────────────────────────────
Single source of truth for "which IP is this request really from".

Requests reach Django through proxies we operate:

    visitor -> Cloudflare edge -> AWS ALB -> nginx -> gunicorn

Every hop *appends* to X-Forwarded-For, so the header Django sees is

    <whatever the caller sent>, <visitor>, <cf-edge>, <alb>

which makes the leftmost entry attacker-controlled: Cloudflare adds to an
incoming XFF rather than replacing it, so a caller who sends
"X-Forwarded-For: 203.0.113.5" lands that value in position 0. Reading the
header from the left — the pattern this module replaces — lets any caller
claim any address. That matters because SUPERADMIN_IP_ALLOWLIST is checked
against this value on every request, not just at login (see
authapp/permissions/super_admin_permissions.py).

So we walk the chain from the right instead, dropping the hops we operate,
until we reach the address that actually opened the connection to our load
balancer:

  * If that address is Cloudflare's, the request came through the proxy and
    CF-Connecting-IP holds the visitor. Cloudflare overwrites that header on
    every proxied request, so unlike XFF it cannot be forged by the caller.
  * If it is anything else, the request reached the origin directly — that
    address *is* the client, and no header it sent is worth trusting.

Returns None when the chain is malformed rather than guessing, so an
allowlist check on the result fails closed.
"""
import ipaddress

# Cloudflare's published edge ranges — https://www.cloudflare.com/ips/
# Fetched 2026-08-05. A stale entry here fails safe rather than open: an
# unrecognised edge address is treated as a direct connection, so we return
# that address itself instead of trusting a header behind it.
CLOUDFLARE_RANGES = (
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
)

_CLOUDFLARE_NETWORKS = tuple(
    ipaddress.ip_network(cidr) for cidr in CLOUDFLARE_RANGES
)


def _parse(value):
    try:
        return ipaddress.ip_address(value)
    except ValueError:
        return None


def _is_internal(ip):
    """True for the hops inside our own network — nginx talking to gunicorn
    and the ALB talking to nginx both appear as private addresses."""
    return ip.is_private or ip.is_loopback or ip.is_link_local


def _is_cloudflare(ip):
    return any(ip in net for net in _CLOUDFLARE_NETWORKS)


def get_client_ip(request):
    """Return the originating client IP as a string, or None if it can't be
    established. See the module docstring for why X-Forwarded-For is read
    right-to-left rather than left-to-right."""
    return get_client_ip_with_source(request)[0]


def get_client_ip_with_source(request):
    """(ip, source) — the same address get_client_ip() returns, plus WHICH
    input it actually came from.

    Only the admin analytics diagnostic uses the second element, and only to
    answer "is the proxy chain wired up the way we think it is?" without
    anyone having to guess from the outside. `source` is one of:

        "CF-Connecting-IP"  through Cloudflare (the trusted, unforgeable path)
        "X-Forwarded-For"   a direct-to-origin request; the peer that opened
                            the connection was taken from the chain
        "REMOTE_ADDR"       no proxy in front at all (local dev)
        "unavailable"       the chain was malformed — we refuse to guess

    Naming the header rather than just returning the address is what makes a
    silent misconfiguration visible: if this ever reads "REMOTE_ADDR" in
    production, every visitor is being recorded as the load balancer.
    """
    entries = [
        part.strip()
        for part in request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")
        if part.strip()
    ]

    # Peel off our own infrastructure to find whoever opened the connection
    # to the load balancer. Stop at the first entry that doesn't parse: our
    # proxies only ever append valid addresses, so anything malformed came
    # from the caller's end and everything left of it is equally suspect.
    peer = None
    while entries:
        candidate = _parse(entries.pop())
        if candidate is None:
            return None, "unavailable"
        if not _is_internal(candidate):
            peer = candidate
            break

    if peer is None:
        # No XFF at all (local dev, or a request that never crossed a proxy).
        return request.META.get("REMOTE_ADDR"), "REMOTE_ADDR"

    if _is_cloudflare(peer):
        forwarded = request.META.get("HTTP_CF_CONNECTING_IP", "").strip()
        if forwarded and _parse(forwarded) is not None:
            return forwarded, "CF-Connecting-IP"
        # Reached us from Cloudflare but without a usable CF-Connecting-IP.
        # Don't fall further left into caller-controlled territory.
        return None, "unavailable"

    return str(peer), "X-Forwarded-For"
