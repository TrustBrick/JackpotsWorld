"""
authapp/services/poker_sources/rss.py
─────────────────────────────────────────────────────────────────────────────
RSS/Atom connector. Publishing a feed is itself an invitation to fetch it, so
this is the one automated connector that is safe by default — but it can only
produce what a feed actually contains.

Reality check (Part 4): poker RSS feeds in the wild are *news* feeds, not
structured event calendars. A feed item reliably gives a title, a date and a
link; it almost never gives a buy-in, venue or prize pool. So events created
from this connector land in PENDING_REVIEW with mostly blank fields for an
admin to complete — which is exactly the workflow Part 8 asks for, rather
than a pretence of full automation.

`config` keys (all optional):
  item_path        XML tag holding each entry. Default: auto (item, then entry)
  title_field      Default "title"
  date_field       Default "pubDate" (falls back to "published"/"updated")
  link_field       Default "link"
  description_field Default "description" (falls back to "summary")
  default_country  Stamped on every event from this feed
  default_series   Stamped on every event from this feed
  default_organizer Stamped on every event from this feed
"""
import logging
import xml.etree.ElementTree as ET

import requests

from authapp.services.poker_sources.base import BaseConnector, NormalizedEvent, SourceError

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 10
USER_AGENT = "JackpotsWorldSync/1.0 (+https://jackpotsworld.vip)"

# Atom namespaces vary; strip them so findtext works on local names.
def _localname(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _find_text(element, *names):
    """First non-empty match on any of `names`, namespace-insensitive."""
    for child in element.iter():
        if _localname(child.tag) in names:
            if child.text and child.text.strip():
                return child.text.strip()
            # Atom <link href="..."/> carries its value in an attribute.
            href = child.attrib.get("href")
            if href:
                return href.strip()
    return ""


class RssConnector(BaseConnector):
    source_type = "rss"

    def fetch(self):
        if not self.source.url:
            raise SourceError("Source has no URL configured.")

        try:
            resp = requests.get(
                self.source.url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": USER_AGENT},
            )
            resp.raise_for_status()
            root = ET.fromstring(resp.content)
        except Exception as exc:  # noqa: BLE001 — normalised to SourceError below
            raise SourceError(f"Could not read feed: {exc}") from exc

        title_field = self.config.get("title_field", "title")
        date_field = self.config.get("date_field", "pubDate")
        link_field = self.config.get("link_field", "link")
        desc_field = self.config.get("description_field", "description")
        item_tag = self.config.get("item_path")

        entries = []
        for element in root.iter():
            name = _localname(element.tag)
            if name == (item_tag or "item") or (not item_tag and name == "entry"):
                entries.append(element)

        events = []
        for entry in entries:
            title = _find_text(entry, title_field)
            if not title:
                continue

            event_date = self.parse_date(_find_text(entry, date_field, "published", "updated", "pubDate"))
            if not event_date:
                # No date at all means it can't be placed on a calendar. Skip
                # rather than inventing "today", which would create a stream of
                # bogus same-day events on every run.
                continue

            events.append(NormalizedEvent(
                name=title[:200],
                event_date=event_date,
                description=_find_text(entry, desc_field, "summary")[:2000],
                official_url=_find_text(entry, link_field)[:500],
                source_url=_find_text(entry, link_field)[:500],
                source_event_id=(_find_text(entry, "guid", "id") or "")[:200],
                country=self.config.get("default_country", ""),
                series=self.config.get("default_series", ""),
                organizer=self.config.get("default_organizer", ""),
            ))

        return events
