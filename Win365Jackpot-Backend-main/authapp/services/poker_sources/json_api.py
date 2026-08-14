"""
authapp/services/poker_sources/json_api.py
─────────────────────────────────────────────────────────────────────────────
Generic JSON-API connector, driven entirely by PokerSource.config so a new
provider with a documented, permitted API needs a database row rather than
code. This is the seam a paid/licensed feed drops into later (Part 4) — the
ingest pipeline above it never changes.

`config` keys:
  results_path   Dot path to the event list in the response, e.g. "data.events".
                 Omit if the response is already a list.
  field_map      {NormalizedEvent field: source key}. Source keys may be dot
                 paths, e.g. {"casino_name": "venue.name"}.
  headers        Extra request headers (an API key belongs in an env var
                 referenced here by the operator, never committed).
  params         Query-string parameters.
  default_country / default_series / default_organizer / default_currency
                 Stamped on every event this source yields.
"""
import logging

import requests

from authapp.services.poker_sources.base import BaseConnector, NormalizedEvent, SourceError

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15
USER_AGENT = "JackpotsWorldSync/1.0 (+https://jackpotsworld.vip)"

DEFAULT_FIELD_MAP = {
    "name": "name",
    "event_date": "start_date",
    "end_date": "end_date",
    "series": "series",
    "country": "country",
    "city": "city",
    "casino_name": "venue",
    "organizer": "organizer",
    "game_type": "game_type",
    "buy_in": "buy_in",
    "currency": "currency",
    "prize_pool": "guaranteed_prize_pool",
    "description": "description",
    "official_url": "url",
    "source_event_id": "id",
}


def _dig(payload, path):
    """Walk a dot path, returning None the moment it stops resolving."""
    if not path:
        return None
    current = payload
    for part in str(path).split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
        if current is None:
            return None
    return current


class JsonApiConnector(BaseConnector):
    source_type = "json_api"

    def fetch(self):
        if not self.source.url:
            raise SourceError("Source has no URL configured.")

        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        headers.update(self.config.get("headers") or {})

        try:
            resp = requests.get(
                self.source.url, timeout=REQUEST_TIMEOUT, headers=headers,
                params=self.config.get("params") or None,
            )
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001 — normalised to SourceError
            raise SourceError(f"Could not read API: {exc}") from exc

        rows = _dig(payload, self.config.get("results_path")) if self.config.get("results_path") else payload
        if not isinstance(rows, list):
            raise SourceError("API response did not contain a list of events.")

        field_map = {**DEFAULT_FIELD_MAP, **(self.config.get("field_map") or {})}
        events = []

        for row in rows:
            if not isinstance(row, dict):
                continue

            name = _dig(row, field_map.get("name")) or ""
            event_date = self.parse_date(_dig(row, field_map.get("event_date")))
            # Both are structurally required; a row missing either isn't an
            # event we can place, so skip it rather than guess.
            if not name or not event_date:
                continue

            def text(key, limit=200):
                value = _dig(row, field_map.get(key))
                return str(value).strip()[:limit] if value not in (None, "") else ""

            events.append(NormalizedEvent(
                name=str(name)[:200],
                event_date=event_date,
                end_date=self.parse_date(_dig(row, field_map.get("end_date"))),
                series=text("series", 150),
                country=text("country", 100) or self.config.get("default_country", ""),
                city=text("city", 100),
                casino_name=text("casino_name", 150),
                organizer=text("organizer", 150) or self.config.get("default_organizer", ""),
                game_type=text("game_type", 100),
                buy_in=self.parse_decimal(_dig(row, field_map.get("buy_in"))),
                currency=text("currency", 8) or self.config.get("default_currency", ""),
                prize_pool=self.parse_decimal(_dig(row, field_map.get("prize_pool"))),
                description=text("description", 2000),
                official_url=text("official_url", 500),
                source_url=text("official_url", 500),
                source_event_id=text("source_event_id", 200),
                extra={"raw_keys": sorted(row.keys())[:25]},
            ))

        return events
