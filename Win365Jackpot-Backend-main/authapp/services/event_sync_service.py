"""
Best-effort RSS aggregator for CasinoEvent.

Reads feed URLs from settings.EVENT_RSS_FEEDS (empty by default — curated
seed data already keeps the Events section populated). Any feed that is
unreachable, malformed, or empty is skipped silently so a bad/offline feed
never blanks out the section. Safe to run repeatedly (dedupes by name+date).
"""
import logging
import xml.etree.ElementTree as ET
from datetime import datetime

import requests
from django.conf import settings

from authapp.models.events_models import CasinoEvent

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 10


def _parse_rfc822_date(value):
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z"):
        try:
            return datetime.strptime(value, fmt).date()
        except (ValueError, TypeError):
            continue
    return None


def _fetch_feed_items(url):
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": "Win365JackpotSync/1.0"})
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
    except Exception as exc:  # noqa: BLE001 — any feed failure is non-fatal
        logger.warning("event_sync_service: skipping feed %s (%s)", url, exc)
        return []

    items = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        if not title:
            continue
        pub_date = _parse_rfc822_date((item.findtext("pubDate") or "").strip())
        description = (item.findtext("description") or "").strip()[:300]
        link = (item.findtext("link") or "").strip()
        items.append({
            "title": title,
            "date": pub_date,
            "description": description,
            "link": link,
        })
    return items


def sync_events_from_sources(feed_urls=None):
    """Pulls each configured feed and creates CasinoEvent rows for new entries.

    Returns a dict with counts: {"fetched": N, "created": N, "skipped_feeds": N}.
    """
    feed_urls = feed_urls if feed_urls is not None else settings.EVENT_RSS_FEEDS
    fetched, created, skipped_feeds = 0, 0, 0

    for url in feed_urls:
        items = _fetch_feed_items(url)
        if not items:
            skipped_feeds += 1
            continue
        for entry in items:
            fetched += 1
            event_date = entry["date"] or datetime.utcnow().date()
            if CasinoEvent.objects.filter(name=entry["title"], event_date=event_date).exists():
                continue
            CasinoEvent.objects.create(
                name=entry["title"][:200],
                country="",
                city="",
                venue="",
                event_date=event_date,
                category="Gaming News",
                short_description=entry["description"][:300],
                description=entry["description"],
                ticket_note=entry["link"][:300],
                status="upcoming",
            )
            created += 1

    return {"fetched": fetched, "created": created, "skipped_feeds": skipped_feeds}
