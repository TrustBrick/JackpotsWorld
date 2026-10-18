"""
authapp/services/content_translation_service.py
─────────────────────────────────────────────────────────────────────────────
Machine translation of Back Office content for the public site.

The site's own interface text is translated in the frontend (i18next). Most
of what a visitor reads, though — packages, experiences, events, promotions,
FAQs, hero copy — is typed into the Back Office in English and served by the
public content APIs. When the visitor has chosen another language, those
responses are translated on the way out (middleware/content_translation.py).

  * Only display fields are touched (TRANSLATABLE_KEYS). Status values,
    slugs, links, colours, places used as filter values and the like are
    left exactly as they are, because code compares and filters on them.
  * Every distinct string is translated once per language and stored in
    ContentTranslation, so the provider is only paid for new or edited text.
  * Strings are sent in batches, one request per batch, not one per string.
  * Failure is never visible: anything that could not be translated is
    shown in English, and is not cached, so it is retried next time.
"""
import hashlib
import json
import logging

import requests
from django.conf import settings
from django.db import IntegrityError

from authapp.models.content_translation_models import ContentTranslation

logger = logging.getLogger(__name__)

# Mirrors SUPPORTED_LANGUAGES in the frontend's components/LanguageSelector.jsx.
SUPPORTED_LANGUAGES = {
    "hi": "Hindi", "te": "Telugu", "ta": "Tamil", "kn": "Kannada", "ml": "Malayalam",
    "bn": "Bengali", "mr": "Marathi", "gu": "Gujarati", "pa": "Punjabi", "si": "Sinhala",
    "vi": "Vietnamese", "zh-CN": "Simplified Chinese", "zh-TW": "Traditional Chinese",
    "ja": "Japanese", "ko": "Korean", "th": "Thai", "fil": "Filipino", "ar": "Arabic",
    "fr": "French", "de": "German", "es": "Spanish", "pt": "Portuguese", "ru": "Russian",
    "nl": "Dutch", "da": "Danish", "el": "Greek", "is": "Icelandic", "it": "Italian",
    "nb": "Norwegian (Bokmål)", "ro": "Romanian", "sv": "Swedish",
}

# Response fields that hold display text. Everything else is left alone.
TRANSLATABLE_KEYS = frozenset({
    # generic copy
    "title", "subtitle", "name", "description", "short_description", "label",
    "tagline", "badge", "question", "answer", "highlights", "inclusions",
    "benefits", "perks", "value", "tier", "event_type", "duration",
    "cta_label", "cta_text", "eyebrow_text", "validity_text", "terms_conditions",
    "bonus_details", "ticket_note", "best_for",
    # tour package rows
    "flight", "hotel", "food", "liquor",
    # landing settings
    "hero_badge_text", "global_reach_tagline", "hero_cta_primary_label",
    "hero_cta_secondary_label", "trust_banner_heading", "trust_banner_subtext",
    # game landing content (Andhar Bahar etc.)
    "hero_title", "hero_subtitle", "hero_eyebrow", "hero_description", "hero_trust_text",
    "intro_title", "intro_body", "highlights_title", "how_to_play_title",
    "how_to_play_note", "events_title", "events_subtitle", "signup_prompt",
})

BATCH_MAX_ITEMS = 40
BATCH_MAX_CHARS = 6000
REQUEST_TIMEOUT = 45


def is_supported(lang):
    return lang in SUPPORTED_LANGUAGES


def _hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _looks_translatable(text):
    if not isinstance(text, str):
        return False
    t = text.strip()
    if len(t) < 2 or not any(ch.isalpha() for ch in t):
        return False
    if t.startswith(("http://", "https://", "/", "#", "www.")) or ("@" in t and " " not in t):
        return False
    return True


def _call_provider(texts, lang):
    """Translate a list of strings with one OpenAI request. Returns a list of
    the same length, or None if the batch could not be translated."""
    api_key = getattr(settings, "OPENAI_API_KEY", "")
    if not api_key:
        return None
    target = SUPPORTED_LANGUAGES[lang]
    system = (
        f"You translate website copy for a premium offline-casino travel and VIP concierge "
        f"service from English into {target}. You receive a JSON array of strings and reply "
        f"with ONLY a JSON array of the same length, each item the translation of the item at "
        f"the same position. Keep brand names (JackpotsWorld, Jackpotsworld), casino, hotel, "
        f"ship and product names, currency amounts, numbers, emoji and symbols such as ★ · – "
        f"unchanged. Keep markdown such as **bold** markers. Keep the tone natural and polished."
    )
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": getattr(settings, "OPENAI_TRANSLATE_MODEL", "gpt-4o-mini"),
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(texts, ensure_ascii=False)},
                ],
                "temperature": 0.1,
            },
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.strip("`")
            content = content[content.find("["):]
        out = json.loads(content)
        if isinstance(out, list) and len(out) == len(texts) and all(isinstance(x, str) for x in out):
            return out
        logger.warning("content translation: malformed batch reply for %s (%d items)", lang, len(texts))
    except Exception as exc:
        logger.warning("content translation: batch failed for %s: %s", lang, exc)
    return None


def _batches(texts):
    batch, size = [], 0
    for t in texts:
        if batch and (len(batch) >= BATCH_MAX_ITEMS or size + len(t) > BATCH_MAX_CHARS):
            yield batch
            batch, size = [], 0
        batch.append(t)
        size += len(t)
    if batch:
        yield batch


def translate_texts(texts, lang, provider=None):
    """{english: translation} for each distinct string in `texts`. Strings
    that could not be translated map to themselves."""
    provider = provider or _call_provider
    unique = list(dict.fromkeys(t for t in texts if _looks_translatable(t)))
    if not unique or not is_supported(lang):
        return {}

    by_hash = {_hash(t): t for t in unique}
    result = {
        by_hash[h]: tr
        for h, tr in ContentTranslation.objects
        .filter(lang=lang, source_hash__in=list(by_hash))
        .values_list("source_hash", "translated_text")
    }

    missing = [t for t in unique if t not in result]
    for batch in _batches(missing):
        translated = provider(batch, lang)
        if translated is None:
            continue
        for src, tr in zip(batch, translated):
            tr = (tr or "").strip() or src
            result[src] = tr
            try:
                ContentTranslation.objects.get_or_create(
                    lang=lang, source_hash=_hash(src),
                    defaults={"source_text": src, "translated_text": tr},
                )
            except IntegrityError:
                pass  # a concurrent request stored the same string first
    return result


def _collect(node, key, out):
    if isinstance(node, dict):
        for k, v in node.items():
            _collect(v, k, out)
    elif isinstance(node, list):
        for v in node:
            _collect(v, key, out)
    elif key in TRANSLATABLE_KEYS and _looks_translatable(node):
        out.append(node)


def _apply(node, key, table):
    if isinstance(node, dict):
        return {k: _apply(v, k, table) for k, v in node.items()}
    if isinstance(node, list):
        return [_apply(v, key, table) for v in node]
    if key in TRANSLATABLE_KEYS and isinstance(node, str):
        return table.get(node, node)
    return node


def translate_payload(data, lang, provider=None):
    """A copy of a decoded JSON payload with its display fields translated."""
    if not is_supported(lang):
        return data
    found = []
    _collect(data, None, found)
    if not found:
        return data
    table = translate_texts(found, lang, provider=provider)
    if not table:
        return data
    return _apply(data, None, table)
