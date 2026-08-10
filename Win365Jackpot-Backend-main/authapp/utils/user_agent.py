"""
authapp/utils/user_agent.py
─────────────────────────────────────────────────────────────────────────────
Tiny, dependency-free User-Agent classifier. Good enough for "what device/
browser did this affiliate click come from" reporting — not a full UA parser
(no version numbers, no OS detection), so it never needs a third-party
library or dataset update to stay accurate enough for that purpose.
"""
import re

_TABLET_RE = re.compile(r"iPad|Android(?!.*Mobile)|Tablet|Kindle|PlayBook", re.I)
_MOBILE_RE = re.compile(r"Mobi|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini", re.I)

# Order matters — e.g. Edge/Opera/Samsung UAs also contain "Chrome" or
# "Safari" substrings, so the more specific tokens must be checked first.
_BROWSER_PATTERNS = [
    ("Edge", re.compile(r"Edg(?:e|A|iOS)?/", re.I)),
    ("Opera", re.compile(r"OPR/|Opera/", re.I)),
    ("Samsung Internet", re.compile(r"SamsungBrowser/", re.I)),
    ("Firefox", re.compile(r"Firefox/", re.I)),
    ("Chrome", re.compile(r"Chrome/|CriOS/", re.I)),
    ("Safari", re.compile(r"Safari/", re.I)),
    ("Internet Explorer", re.compile(r"MSIE |Trident/", re.I)),
]


def parse_user_agent(ua: str) -> tuple:
    """Returns (device, browser) — device is one of Mobile/Tablet/Desktop,
    browser is a best-guess label or 'Other'. Never raises; blank input
    yields ('Unknown', 'Unknown')."""
    ua = (ua or "").strip()
    if not ua:
        return "Unknown", "Unknown"

    if _TABLET_RE.search(ua):
        device = "Tablet"
    elif _MOBILE_RE.search(ua):
        device = "Mobile"
    else:
        device = "Desktop"

    browser = "Other"
    for label, pattern in _BROWSER_PATTERNS:
        if pattern.search(ua):
            browser = label
            break

    return device, browser
