"""
authapp/services/poker_sources/base.py
─────────────────────────────────────────────────────────────────────────────
The source abstraction (Part 5). A connector's only job is to turn one
PokerSource's raw payload into a list of NormalizedEvent — it never touches
the database, never decides whether an event is a duplicate, and never
publishes anything. That keeps every provider's quirks isolated to its own
file and means adding a paid provider later is a new class here plus a
PokerSource row, with no change to the ingest pipeline.

Legal note (Parts 3 & 4): a connector must only fetch sources that permit
automated access. There is no HTML-scraping connector in this package by
design — if a provider offers no feed or API, the correct path is Back Office
manual entry, not scraping around their terms.
"""
from dataclasses import dataclass, field
from datetime import date, time
from decimal import Decimal
from typing import Optional


@dataclass
class NormalizedEvent:
    """One poker event in the shape the ingest pipeline expects.

    Every field except `name` and `event_date` is optional, because real
    sources are patchy. Missing data stays missing — the pipeline writes blank
    and the UI shows "Not available" rather than inventing a value (Part 6).
    """

    name: str
    event_date: date

    end_date: Optional[date] = None
    event_time: Optional[time] = None
    series: str = ""
    country: str = ""
    city: str = ""
    casino_name: str = ""
    organizer: str = ""
    game_type: str = ""
    buy_in: Optional[Decimal] = None
    currency: str = ""
    prize_pool: Optional[Decimal] = None
    description: str = ""
    official_url: str = ""

    # Provenance — set by the connector, used for dedupe and attribution.
    source_event_id: str = ""
    source_url: str = ""

    # Anything the connector couldn't map cleanly, kept for admin review.
    extra: dict = field(default_factory=dict)

    def location_label(self):
        """The legacy free-text `location` column, rebuilt from the split
        city/country so existing cards keep rendering unchanged."""
        return ", ".join(p for p in (self.city, self.country) if p)


class SourceError(Exception):
    """Raised by a connector when its source is unreachable or unusable. The
    sync loop catches this per source so one bad provider never aborts the
    run (Part 10)."""


class BaseConnector:
    """Subclass per source type and register in __init__.py's CONNECTORS."""

    #: Matches PokerSource.source_type
    source_type = ""

    def __init__(self, source):
        self.source = source
        self.config = source.config or {}

    def fetch(self):
        """Return a list[NormalizedEvent]. Raise SourceError on failure —
        never return partial garbage, and never raise anything else."""
        raise NotImplementedError

    # ── Shared parsing helpers ───────────────────────────────────────────────

    @staticmethod
    def parse_decimal(value):
        """Money out of a source is anything from '  $10,000 ' to None. Returns
        None rather than 0 when there's no usable number, so "unknown buy-in"
        stays distinguishable from "free entry"."""
        if value in (None, ""):
            return None
        if isinstance(value, Decimal):
            return value
        text = str(value).strip()
        cleaned = "".join(ch for ch in text if ch.isdigit() or ch in ".-")
        if not cleaned or cleaned in (".", "-", "-."):
            return None
        try:
            return Decimal(cleaned)
        except Exception:  # noqa: BLE001 — an unparseable amount is just unknown
            return None

    @staticmethod
    def parse_date(value):
        """Accepts a date, a datetime, or the common ISO / RFC-822 strings."""
        from datetime import datetime

        if value in (None, ""):
            return None
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        if isinstance(value, datetime):
            return value.date()

        text = str(value).strip()
        formats = (
            "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%Y",
            "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z",
            "%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z",
            "%d %b %Y", "%B %d, %Y",
        )
        for fmt in formats:
            try:
                return datetime.strptime(text, fmt).date()
            except (ValueError, TypeError):
                continue
        # Last resort: a leading ISO date inside a longer string.
        try:
            return datetime.fromisoformat(text[:19]).date()
        except (ValueError, TypeError):
            return None
