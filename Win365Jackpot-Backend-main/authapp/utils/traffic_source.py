"""
authapp/utils/traffic_source.py
─────────────────────────────────────────────────────────────────────────────
VISITOR-ANALYTICS: "where did this visit come from?", derived from the
referrer and the UTM tuple.

Precedence is deliberate and matters:

  1. utm_source wins outright when present. If a link was tagged, the tag is
     the ground truth — a Facebook ad tagged utm_source=newsletter really is
     newsletter traffic, and letting the referrer override that would silently
     misattribute every campaign the marketing team tags.
  2. Otherwise the referrer host is matched against the known networks below.
  3. A referrer we don't recognise is "Referral" — NOT the site's own name,
     and not "Direct".
  4. No referrer at all is "Direct". So is a referrer from our own host: a
     visitor clicking from /events to /poker did not arrive from anywhere,
     and counting internal navigation as referral traffic is the single most
     common way a traffic-source report becomes useless.

Returns a display-ready label ("Google", "Facebook", "Direct"). Never guesses
a network from a partial match — an unrecognised host is reported as the host
itself under Referral, so an admin can see what it actually was.
"""
from urllib.parse import urlparse

DIRECT = "Direct"
REFERRAL = "Referral"

# Host substring -> display name. Substring rather than exact match so
# regional and mobile variants (google.co.in, m.facebook.com, l.instagram.com)
# land on the right network without enumerating every one.
_NETWORKS = (
    ("google.", "Google"),
    ("bing.", "Bing"),
    ("duckduckgo.", "DuckDuckGo"),
    ("yahoo.", "Yahoo"),
    ("yandex.", "Yandex"),
    ("baidu.", "Baidu"),
    ("facebook.", "Facebook"),
    ("fb.", "Facebook"),
    ("instagram.", "Instagram"),
    ("twitter.", "X (Twitter)"),
    ("x.com", "X (Twitter)"),
    ("t.co", "X (Twitter)"),
    ("youtube.", "YouTube"),
    ("youtu.be", "YouTube"),
    ("t.me", "Telegram"),
    ("telegram.", "Telegram"),
    ("whatsapp.", "WhatsApp"),
    ("wa.me", "WhatsApp"),
    ("tiktok.", "TikTok"),
    ("reddit.", "Reddit"),
    ("linkedin.", "LinkedIn"),
    ("pinterest.", "Pinterest"),
    ("snapchat.", "Snapchat"),
)


def _strip_www(host):
    # NOT str.lstrip("www.") — that strips a CHARACTER SET, so a host like
    # "wow.com" would come back as "o.com". Prefix removal, explicitly.
    return host[4:] if host.startswith("www.") else host


def _host(url):
    if not url:
        return ""
    try:
        parsed = urlparse(url if "//" in url else f"//{url}")
    except ValueError:
        return ""
    return _strip_www((parsed.hostname or "").lower())


def classify_traffic_source(referrer, utm_source=None, own_hosts=()):
    """Label this visit's origin. `own_hosts` is the set of hostnames that
    count as "us" — a referrer from one of those is internal navigation, which
    is Direct, not Referral."""
    utm_source = (utm_source or "").strip()
    if utm_source:
        # Title-case a bare token ("facebook" -> "Facebook") but leave an
        # already-styled value ("MyPartner_Q3") exactly as the tagger wrote it.
        return utm_source[:60] if not utm_source.islower() else utm_source.title()[:60]

    host = _host(referrer)
    if not host:
        return DIRECT

    own = {_strip_www((h or "").lower()) for h in own_hosts if h}
    if host in own or any(host.endswith(f".{h}") for h in own if h):
        return DIRECT

    for needle, label in _NETWORKS:
        if needle in host:
            return label

    return f"{REFERRAL}: {host}"[:60]


def referrer_host(referrer):
    """Bare hostname of a referrer, for display next to the source label."""
    return _host(referrer)
