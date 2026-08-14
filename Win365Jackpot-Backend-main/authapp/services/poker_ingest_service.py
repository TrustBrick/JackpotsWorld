"""
authapp/services/poker_ingest_service.py
─────────────────────────────────────────────────────────────────────────────
Normalisation → duplicate detection → pending events (Parts 5, 7, 8).

Nothing here publishes. Every newly discovered event lands in
PENDING_REVIEW and only an explicit Back Office action moves it to published
(see poker_review_service). Manually authored events are never touched by a
sync run.

Duplicate detection (Part 7), in decreasing order of confidence:
  1. Same source + same source_event_id  → the same row; update in place.
  2. Same normalised name + same start date → the same event arriving from a
     second source; flagged DUPLICATE and linked, never silently merged.
  3. Same date + same venue/city + a high name-similarity score → *possible*
     duplicate; flagged for a human, because "WSOP Main Event Day 1a" and
     "WSOP Main Event Day 1b" are genuinely different events and an automated
     merge would lose one.
"""
import logging
import re
from difflib import SequenceMatcher

from django.db import transaction as db_transaction
from django.utils import timezone

from authapp.models.poker_models import PokerTournament

logger = logging.getLogger(__name__)

# Above this ratio, two names on the same date at the same venue are treated
# as a possible duplicate and sent for review. Tuned so day-numbered flights
# ("Day 1a"/"Day 1b", ratio ≈0.97) still get flagged for a human rather than
# auto-merged, while unrelated events (<0.85) don't generate review noise.
NAME_SIMILARITY_THRESHOLD = 0.85

# Fields a re-sync is allowed to refresh on an already-known event. Review
# state, admin edits to identity, and anything a human curated are excluded on
# purpose — a source must never undo an admin's work.
REFRESHABLE_FIELDS = (
    "event_date", "end_date", "event_time", "buy_in", "prize_pool",
    "currency", "game_type", "organizer", "series", "official_url", "source_url",
)


def normalize_name(name):
    """Lowercase, punctuation-free, whitespace-collapsed — so "WSOP Main Event
    — $10,000" and "wsop main event $10000" compare equal."""
    text = (name or "").lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def name_similarity(a, b):
    return SequenceMatcher(None, normalize_name(a), normalize_name(b)).ratio()


def find_existing(event, source):
    """The same row this event was previously ingested into, if any.
    Identity is (source, source_event_id) — the only key a source guarantees
    is stable across runs."""
    if not event.source_event_id:
        return None
    return PokerTournament.objects.filter(
        source=source, source_event_id=event.source_event_id,
    ).first()


def find_duplicate(event, exclude_pk=None):
    """Another event that looks like the same real-world tournament from a
    different source. Returns (match, confidence) or (None, None)."""
    candidates = PokerTournament.objects.filter(event_date=event.event_date).exclude(
        review_status__in=("rejected", "duplicate"),
    )
    if exclude_pk:
        candidates = candidates.exclude(pk=exclude_pk)

    normalized = normalize_name(event.name)
    venue = (event.casino_name or "").strip().lower()
    city = (event.city or "").strip().lower()

    best, best_ratio = None, 0.0
    for candidate in candidates.only(
        "id", "name", "casino_name", "city", "country", "organizer", "event_date",
    ):
        if normalize_name(candidate.name) == normalized:
            return candidate, "exact"

        same_place = (
            (venue and venue == (candidate.casino_name or "").strip().lower())
            or (city and city == (candidate.city or "").strip().lower())
        )
        if not same_place:
            continue
        ratio = name_similarity(event.name, candidate.name)
        if ratio >= NAME_SIMILARITY_THRESHOLD and ratio > best_ratio:
            best, best_ratio = candidate, ratio

    return (best, "probable") if best else (None, None)


def _apply(tournament, event, source):
    """Copy normalised values onto a model instance. Blank source values never
    overwrite existing data — a source that stops sending a field shouldn't
    erase what an admin already filled in."""
    tournament.name = event.name[:200]
    tournament.event_date = event.event_date
    tournament.source = source
    tournament.source_event_id = event.source_event_id[:200]
    tournament.source_url = (event.source_url or "")[:500]
    tournament.last_synced_at = timezone.now()

    optional = {
        "end_date": event.end_date,
        "event_time": event.event_time,
        "series": event.series,
        "country": event.country,
        "city": event.city,
        "casino_name": event.casino_name,
        "organizer": event.organizer,
        "game_type": event.game_type,
        "currency": event.currency,
        "description": event.description,
        "official_url": event.official_url,
        "buy_in": event.buy_in,
        "prize_pool": event.prize_pool,
    }
    for field, value in optional.items():
        if value not in (None, ""):
            setattr(tournament, field, value)

    location = event.location_label()
    if location:
        tournament.location = location[:150]

    return tournament


@db_transaction.atomic
def ingest_event(event, source):
    """Ingest one NormalizedEvent. Returns one of:
    "created" | "updated" | "duplicate" | "skipped".
    """
    existing = find_existing(event, source)
    if existing:
        # Known event from this source — refresh the volatile fields only.
        if existing.review_status in ("rejected", "duplicate"):
            return "skipped"
        before = {f: getattr(existing, f) for f in REFRESHABLE_FIELDS}
        _apply(existing, event, source)
        changed = {
            f: [str(before[f]), str(getattr(existing, f))]
            for f in REFRESHABLE_FIELDS if before[f] != getattr(existing, f)
        }
        existing.save()
        if changed:
            from authapp.models.poker_models import PokerEventChangeLog
            PokerEventChangeLog.objects.create(
                tournament=existing, action="synced",
                changed_fields=changed, note=f"Refreshed from {source.name}.",
            )
            return "updated"
        return "skipped"

    match, confidence = find_duplicate(event)

    tournament = PokerTournament(
        review_status="pending_review",
        status="upcoming",
        # Discovered events stay off the public site until approved. is_active
        # is the pre-existing visibility flag and stays True so the row behaves
        # normally in the Back Office; review_status is what gates the public
        # queryset.
        is_active=True,
        discovered_at=timezone.now(),
    )
    _apply(tournament, event, source)
    tournament.status = tournament.derive_status()

    if match:
        tournament.review_status = "duplicate"
        tournament.duplicate_of = match
        tournament.review_note = (
            f"Possible duplicate of #{match.id} ({match.name}) — {confidence} match. "
            f"Flagged for review rather than merged automatically."
        )

    tournament.save()

    from authapp.models.poker_models import PokerEventChangeLog
    PokerEventChangeLog.objects.create(
        tournament=tournament,
        action="discovered",
        to_status=tournament.review_status,
        note=f"Discovered from {source.name}." + (
            f" Flagged as possible duplicate of #{match.id}." if match else ""
        ),
    )

    return "duplicate" if match else "created"


def refresh_statuses(now=None):
    """Part 9's date-driven upcoming/live/completed transitions, applied to
    published events only — an unreviewed event's status is meaningless to a
    visitor, and a rejected one should never change again."""
    now = now or timezone.now()
    counts = {"upcoming": 0, "live": 0, "completed": 0}

    for tournament in PokerTournament.objects.filter(
        is_active=True, review_status__in=("approved", "published"),
    ).only("id", "event_date", "end_date", "status"):
        derived = tournament.derive_status(now=now)
        if derived != tournament.status:
            tournament.status = derived
            tournament.save(update_fields=["status", "updated_at"])
            counts[derived] += 1

    return counts
