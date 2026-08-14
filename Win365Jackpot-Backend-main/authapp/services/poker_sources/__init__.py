"""
authapp/services/poker_sources/__init__.py
─────────────────────────────────────────────────────────────────────────────
Connector registry. Adding a provider is: write a BaseConnector subclass in
this package, add it to CONNECTORS, add its source_type to
PokerSource.SOURCE_TYPE_CHOICES. Nothing above this package changes.

"manual" has no connector on purpose — manually entered events are authored in
the Back Office and must never be overwritten by a sync run.
"""
from authapp.services.poker_sources.base import BaseConnector, NormalizedEvent, SourceError
from authapp.services.poker_sources.json_api import JsonApiConnector
from authapp.services.poker_sources.rss import RssConnector

CONNECTORS = {
    RssConnector.source_type: RssConnector,
    JsonApiConnector.source_type: JsonApiConnector,
}

__all__ = [
    "BaseConnector", "NormalizedEvent", "SourceError",
    "RssConnector", "JsonApiConnector",
    "CONNECTORS", "get_connector",
]


def get_connector(source):
    """Returns an instantiated connector for `source`, or None when its type
    has no automated connector (i.e. "manual")."""
    connector_class = CONNECTORS.get(source.source_type)
    return connector_class(source) if connector_class else None
