"""
authapp/services/poker_review_service.py
─────────────────────────────────────────────────────────────────────────────
The Part 8 review actions. Every transition goes through here so each one is
validated the same way and every one writes a PokerEventChangeLog row — the
Back Office "Change History" view is only trustworthy if nothing can move an
event without leaving a trace.
"""
import logging

from django.db import transaction as db_transaction
from django.utils import timezone

from authapp.models.poker_models import PokerEventChangeLog, PokerTournament

logger = logging.getLogger(__name__)

# Which review_status may follow which. Enforced server-side; the Back Office
# only renders the buttons this map allows.
ALLOWED_REVIEW_TRANSITIONS = {
    "discovered": {"pending_review", "rejected", "duplicate"},
    "pending_review": {"approved", "published", "rejected", "duplicate"},
    "approved": {"published", "pending_review", "rejected", "archived"},
    "published": {"archived", "pending_review"},
    "rejected": {"pending_review"},
    "duplicate": {"pending_review", "rejected"},
    "archived": {"published", "pending_review"},
}


class ReviewError(Exception):
    """An invalid or disallowed review action."""


@db_transaction.atomic
def transition(tournament, target, *, actor=None, note="", duplicate_of_id=None):
    """Move an event through the review lifecycle. Returns the updated row."""
    current = tournament.review_status
    allowed = ALLOWED_REVIEW_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise ReviewError(
            f"Cannot move a '{current}' event to '{target}'. Allowed: {', '.join(sorted(allowed)) or 'none'}."
        )

    if target == "duplicate":
        if not duplicate_of_id:
            raise ReviewError("Marking an event as a duplicate requires the event it duplicates.")
        if int(duplicate_of_id) == tournament.id:
            raise ReviewError("An event cannot be a duplicate of itself.")
        original = PokerTournament.objects.filter(pk=duplicate_of_id).first()
        if not original:
            raise ReviewError("The event this duplicates was not found.")
        tournament.duplicate_of = original
    elif current == "duplicate":
        # Clearing the duplicate verdict clears the link with it.
        tournament.duplicate_of = None

    tournament.review_status = target
    tournament.reviewed_by = actor
    tournament.reviewed_at = timezone.now()
    if note:
        tournament.review_note = note
    # Publishing is the moment the date-driven status starts mattering to a
    # visitor, so refresh it here rather than waiting for the next cron tick.
    if target in ("approved", "published"):
        tournament.status = tournament.derive_status()
    tournament.save()

    PokerEventChangeLog.objects.create(
        tournament=tournament,
        action=target,
        from_status=current,
        to_status=target,
        note=note,
        actor=actor,
    )
    return tournament


def record_edit(tournament, before, actor=None, note=""):
    """Write a change-history row for a field edit made through the Back
    Office. `before` is the pre-edit field snapshot."""
    changed = {}
    for field, old in (before or {}).items():
        new = getattr(tournament, field, None)
        if str(old) != str(new):
            changed[field] = [str(old), str(new)]
    if not changed:
        return None
    return PokerEventChangeLog.objects.create(
        tournament=tournament, action="edited", changed_fields=changed, note=note, actor=actor,
    )


def notify_pending_review(count):
    """Tell the Back Office that events are waiting. Reuses the existing
    staff fan-out; called from the sync loop rather than per-event so a
    100-event import doesn't produce 100 notifications per admin."""
    if not count:
        return
    from authapp.models.user_model import User
    from authapp.services.notification_service import notify_generic

    for staff in User.objects.filter(is_staff=True, is_active=True):
        notify_generic(
            staff,
            "Poker events awaiting review",
            f"🃏 {count} poker event(s) are pending review in the Back Office.",
            icon="poker",
        )
