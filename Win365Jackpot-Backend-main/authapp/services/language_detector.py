# MULTILINGUAL-CHAT: new file — local preview feature, safe to delete entirely.
#
# Priority chain: explicit user setting -> browser Accept-Language hint ->
# user's registered country -> English. Each step is a no-op if the prior
# one already produced an answer.
from authapp.services.translation_service import LANGUAGE_NAMES

_SUPPORTED = set(LANGUAGE_NAMES.keys()) | {"en"}

# Best-effort default per country — deliberately conservative (only used
# when the user has never picked a language and the browser sent nothing
# usable); English remains correct for most of these regardless.
_COUNTRY_LANGUAGE = {
    "LK": "si",  # Sri Lanka
    "VN": "vi",  # Vietnam
    "TH": "th",  # Thailand
    "PH": "fil", # Philippines
    "CN": "zh-CN",
}


def _normalize(code):
    if not code:
        return None
    code = code.strip()
    if code in _SUPPORTED:
        return code
    base = code.split("-")[0].lower()
    if base in _SUPPORTED:
        return base
    return None


def normalize_language_code(code):
    """Public wrapper so callers can validate an explicit client-supplied
    language code (e.g. the support chat's own selector) against the same
    supported-language set this module uses internally."""
    return _normalize(code)


def detect_preferred_language(user=None, accept_language_header=""):
    if user is not None:
        lang = _normalize(getattr(user, "preferred_language", None))
        if lang and lang != "en":
            return lang

    if accept_language_header:
        first = accept_language_header.split(",")[0].split(";")[0]
        lang = _normalize(first)
        if lang:
            return lang

    if user is not None:
        lang = _COUNTRY_LANGUAGE.get(getattr(user, "country", "") or "")
        if lang:
            return lang

    return "en"
