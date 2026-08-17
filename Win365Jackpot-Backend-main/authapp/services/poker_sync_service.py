"""
authapp/services/poker_sync_service.py
─────────────────────────────────────────────────────────────────────────────
The Part 10 synchronisation loop.

    for each enabled source:
        fetch → validate → normalise → dedupe → pending events
        record PokerSyncLog + update the source's own sync fields
        on failure: log it and CONTINUE to the next source
    notify Back Office once at the end

The per-source try/except is the whole point: source A failing must never stop
sources B and C, and must never abort the run. A failed source records its
error on PokerSource.error_message and in a PokerSyncLog row, then the loop
moves on.

Backwards compatibility: settings.POKER_RSS_FEEDS (the previous mechanism) is
still honoured. Any URL listed there with no matching PokerSource row is
adopted as one on first run, so the existing deployment keeps working without
anyone having to re-enter feeds in the Back Office.
"""
import logging

from django.conf import settings
from django.utils import timezone

from authapp.models.poker_models import PokerSource, PokerSyncLog
from authapp.services import poker_ingest_service
from authapp.services.poker_sources import SourceError, get_connector

logger = logging.getLogger(__name__)


def _adopt_settings_feeds():
    """Create a PokerSource for any settings.POKER_RSS_FEEDS URL that doesn't
    have one yet, so the pre-existing config keeps working after this change."""
    for url in getattr(settings, "POKER_RSS_FEEDS", []) or []:
        PokerSource.objects.get_or_create(
            url=url,
            defaults={
                "name": f"Feed: {url[:120]}",
                "source_type": "rss",
                "is_enabled": True,
                "permission_note": "Adopted from settings.POKER_RSS_FEEDS.",
            },
        )


def sync_source(source):
    """Sync one source. Never raises — returns its PokerSyncLog row."""
    log = PokerSyncLog.objects.create(
        source=source, source_name=source.name, started_at=timezone.now(),
    )
    source.last_attempted_sync = log.started_at

    connector = get_connector(source)
    if connector is None:
        # "manual" sources are authored in the Back Office; nothing to fetch.
        log.status = "success"
        log.finished_at = timezone.now()
        log.error_message = "Manual source — nothing to fetch."
        log.save()
        source.sync_status = "success"
        source.error_message = ""
        source.save(update_fields=["last_attempted_sync", "sync_status", "error_message", "updated_at"])
        return log

    try:
        events = connector.fetch()
    except SourceError as exc:
        return _record_failure(source, log, str(exc))
    except Exception as exc:  # noqa: BLE001 — a connector bug must not abort the run
        logger.exception("poker sync: unexpected error from source %s", source.name)
        return _record_failure(source, log, f"Unexpected connector error: {exc}")

    counts = {"created": 0, "updated": 0, "duplicate": 0, "skipped": 0}
    errors = []

    for event in events:
        try:
            outcome = poker_ingest_service.ingest_event(event, source)
            counts[outcome] = counts.get(outcome, 0) + 1
        except Exception as exc:  # noqa: BLE001 — one bad row shouldn't lose the batch
            logger.warning("poker sync: could not ingest '%s' from %s: %s", event.name, source.name, exc)
            errors.append(f"{event.name}: {exc}")
            counts["skipped"] += 1

    log.fetched_count = len(events)
    log.created_count = counts["created"]
    log.updated_count = counts["updated"]
    log.duplicate_count = counts["duplicate"]
    log.skipped_count = counts["skipped"]
    log.status = "partial" if errors else "success"
    log.error_message = "\n".join(errors[:20])
    log.finished_at = timezone.now()
    log.save()

    source.last_successful_sync = log.finished_at
    source.sync_status = log.status
    source.error_message = log.error_message
    source.save(update_fields=[
        "last_attempted_sync", "last_successful_sync", "sync_status", "error_message", "updated_at",
    ])
    return log


def _record_failure(source, log, message):
    log.status = "failed"
    log.error_message = message[:2000]
    log.finished_at = timezone.now()
    log.save()

    source.sync_status = "failed"
    source.error_message = message[:2000]
    source.save(update_fields=["last_attempted_sync", "sync_status", "error_message", "updated_at"])

    logger.warning("poker sync: source '%s' failed — %s", source.name, message)
    return log


def sync_poker_from_sources(source_ids=None, notify=True):
    """Run every enabled source (or just `source_ids`). Returns a summary dict.

    Safe to run repeatedly and safe to run concurrently with itself — ingest is
    keyed on (source, source_event_id), so a second run updates rather than
    duplicates.
    """
    _adopt_settings_feeds()

    sources = PokerSource.objects.filter(is_enabled=True)
    if source_ids:
        sources = sources.filter(id__in=source_ids)

    totals = {
        "sources": 0, "sources_failed": 0,
        "fetched": 0, "created": 0, "updated": 0, "duplicate": 0, "skipped": 0,
    }
    failures = []

    for source in sources:
        totals["sources"] += 1
        log = sync_source(source)
        totals["fetched"] += log.fetched_count
        totals["created"] += log.created_count
        totals["updated"] += log.updated_count
        totals["duplicate"] += log.duplicate_count
        totals["skipped"] += log.skipped_count
        if log.status == "failed":
            totals["sources_failed"] += 1
            failures.append(f"{source.name}: {log.error_message[:200]}")

    totals["failures"] = failures

    if notify and (totals["created"] or totals["duplicate"] or failures):
        _notify_back_office(totals)

    return totals


def _notify_back_office(totals):
    """Part 10's "notify Back Office" step, using the existing notification
    infrastructure — one Notification per staff user, the same fan-out pattern
    affiliate registration alerts already use."""
    from authapp.models.user_model import User
    from authapp.services.notification_service import notify_generic

    lines = []
    if totals["created"]:
        lines.append(f"🆕 {totals['created']} new poker event(s) awaiting review.")
    if totals["duplicate"]:
        lines.append(f"🔁 {totals['duplicate']} possible duplicate(s) flagged.")
    if totals["updated"]:
        lines.append(f"♻️ {totals['updated']} existing event(s) refreshed.")
    if totals["failures"]:
        lines.append(f"⚠️ {totals['sources_failed']} source(s) failed:")
        lines.extend(f"   • {f}" for f in totals["failures"][:5])

    if not lines:
        return

    message = "\n".join(lines)
    for staff in User.objects.filter(is_staff=True, is_active=True):
        notify_generic(staff, "Poker sync completed", message, icon="poker")
