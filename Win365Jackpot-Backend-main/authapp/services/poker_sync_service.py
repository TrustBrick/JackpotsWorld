"""
Best-effort RSS aggregator for PokerTournament — same pattern as
event_sync_service.py. Reads settings.POKER_RSS_FEEDS (empty by default),
skips unreachable/malformed feeds silently, dedupes by name+date.
"""
import logging
from datetime import datetime

from django.conf import settings

from authapp.models.poker_models import PokerTournament
from authapp.services.event_sync_service import _fetch_feed_items

logger = logging.getLogger(__name__)


def sync_poker_from_sources(feed_urls=None):
    """Pulls each configured feed and creates PokerTournament rows for new entries.

    Returns a dict with counts: {"fetched": N, "created": N, "skipped_feeds": N}.
    """
    feed_urls = feed_urls if feed_urls is not None else settings.POKER_RSS_FEEDS
    fetched, created, skipped_feeds = 0, 0, 0

    for url in feed_urls:
        items = _fetch_feed_items(url)
        if not items:
            skipped_feeds += 1
            continue
        for entry in items:
            fetched += 1
            event_date = entry["date"] or datetime.utcnow().date()
            if PokerTournament.objects.filter(name=entry["title"], event_date=event_date).exists():
                continue
            PokerTournament.objects.create(
                name=entry["title"][:200],
                casino_name="",
                location="",
                event_date=event_date,
                prize_pool=0,
                buy_in=0,
                status="upcoming",
                description=entry["description"],
            )
            created += 1

    return {"fetched": fetched, "created": created, "skipped_feeds": skipped_feeds}
