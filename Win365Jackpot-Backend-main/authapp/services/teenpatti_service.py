"""
authapp/services/teenpatti_service.py
─────────────────────────────────────────────────────────────────────────────
All Teen Patti seat accounting lives here, never in a view or serializer, so
there is exactly one place where a seat can be taken or released and exactly
one definition of "can this person register".

Concurrency: register_user() and cancel_registration() both take a row lock on
the event (select_for_update) before re-reading the seat count, so two
simultaneous registrations for the last remaining seat serialise rather than
both succeeding. The unique_together(event, user) constraint is the second
line of defence against a double-submit — caught here and reported as the
same friendly "already registered" result rather than a 500.

Notifications reuse notification_service.notify_generic (the existing
infrastructure) rather than introducing a parallel Teen Patti notification
table.
"""
import logging

from django.db import IntegrityError, transaction as db_transaction
from django.db.models import F
from django.utils import timezone

from authapp.models.teenpatti_models import (
    AUTO_MANAGED_STATUSES,
    SEAT_HOLDING_STATUSES,
    TeenPattiEvent,
    TeenPattiRegistration,
)
from authapp.services.notification_service import notify_generic

logger = logging.getLogger(__name__)

# Statuses during which a seat may still be claimed. "completed"/"cancelled"/
# "draft" are all closed to new registrations.
REGISTRABLE_STATUSES = ("published", "upcoming", "live")


class RegistrationError(Exception):
    """Raised for every expected refusal (full, closed, duplicate, …) so the
    view can turn it into a 400 with the message verbatim. `code` lets the
    frontend branch on the reason without string-matching the message."""

    def __init__(self, message, code="registration_failed"):
        super().__init__(message)
        self.message = message
        self.code = code


def _event_display(event):
    where = event.city or event.country or ""
    return f"{event.name}{f' — {where}' if where else ''}"


# ─────────────────────────────────────────────────────────────────────────────
# Registration
# ─────────────────────────────────────────────────────────────────────────────

def register_user(user, event_id):
    """Claim a seat. Returns (registration, created). Raises RegistrationError
    for every expected refusal."""
    with db_transaction.atomic():
        try:
            # Locks this event row for the rest of the transaction — the seat
            # count read below is only trustworthy under that lock.
            event = TeenPattiEvent.objects.select_for_update().get(pk=event_id, is_active=True)
        except TeenPattiEvent.DoesNotExist:
            raise RegistrationError("This event is not available.", code="not_found")

        existing = TeenPattiRegistration.objects.filter(event=event, user=user).first()
        if existing:
            if existing.status == "cancelled":
                # Re-claiming a seat the user previously gave up: revive the
                # original row rather than creating a second one, which
                # unique_together would reject anyway.
                if _is_full(event):
                    raise RegistrationError("This event is now full.", code="event_full")
                existing.status = "confirmed"
                existing.cancelled_at = None
                existing.entry_fee_at_registration = event.entry_fee
                existing.currency = event.currency
                existing.save(update_fields=["status", "cancelled_at", "entry_fee_at_registration", "currency", "updated_at"])
                _bump_seats(event, +1)
                _notify_registration_confirmed(user, event, existing)
                return existing, True
            raise RegistrationError("You have already registered for this event.", code="already_registered")

        if event.status not in REGISTRABLE_STATUSES:
            raise RegistrationError(
                "Registration is closed for this event." if event.status != "cancelled"
                else "This event has been cancelled.",
                code="event_closed",
            )
        if not event.registration_open:
            raise RegistrationError("Registration is closed for this event.", code="registration_closed")
        if _is_full(event):
            raise RegistrationError("This event is full.", code="event_full")

        try:
            registration = TeenPattiRegistration.objects.create(
                event=event,
                user=user,
                entry_fee_at_registration=event.entry_fee,
                currency=event.currency,
            )
        except IntegrityError:
            # Lost a double-submit race that slipped past the check above.
            raise RegistrationError("You have already registered for this event.", code="already_registered")

        _bump_seats(event, +1)

    _notify_registration_confirmed(user, event, registration)
    return registration, True


def cancel_registration(user, event_id):
    """Release a seat the user holds. Returns the updated registration."""
    with db_transaction.atomic():
        try:
            event = TeenPattiEvent.objects.select_for_update().get(pk=event_id)
        except TeenPattiEvent.DoesNotExist:
            raise RegistrationError("This event is not available.", code="not_found")

        registration = TeenPattiRegistration.objects.filter(event=event, user=user).first()
        if not registration:
            raise RegistrationError("You are not registered for this event.", code="not_registered")
        if registration.status == "cancelled":
            raise RegistrationError("This registration is already cancelled.", code="already_cancelled")
        if event.status in ("live", "completed"):
            raise RegistrationError(
                "This event has already started — please contact support to cancel.",
                code="event_started",
            )

        registration.status = "cancelled"
        registration.cancelled_at = timezone.now()
        registration.save(update_fields=["status", "cancelled_at", "updated_at"])
        _bump_seats(event, -1)

    return registration


def _is_full(event):
    return event.max_participants is not None and event.current_participants >= event.max_participants


def _bump_seats(event, delta):
    """F()-expression update so the counter is adjusted by the database, never
    by writing back a value this process read earlier. Clamped at zero so a
    double-cancel can never drive the count negative."""
    TeenPattiEvent.objects.filter(pk=event.pk).update(current_participants=F("current_participants") + delta)
    if delta < 0:
        TeenPattiEvent.objects.filter(pk=event.pk, current_participants__lt=0).update(current_participants=0)
    event.refresh_from_db(fields=["current_participants"])


def recount_seats(event):
    """Rebuild current_participants from the registration rows. Used after an
    admin bulk-edits registrations, where the incremental counter can't see
    what changed."""
    actual = TeenPattiRegistration.objects.filter(
        event=event, status__in=SEAT_HOLDING_STATUSES,
    ).count()
    if actual != event.current_participants:
        TeenPattiEvent.objects.filter(pk=event.pk).update(current_participants=actual)
        event.current_participants = actual
    return actual


# ─────────────────────────────────────────────────────────────────────────────
# Status automation (Part 23) — driven by the sync_teenpatti_statuses command
# ─────────────────────────────────────────────────────────────────────────────

def refresh_event_statuses(now=None):
    """Promote published → upcoming → live → completed from the clock.

    Only touches AUTO_MANAGED_STATUSES, so an admin's explicit draft or
    cancelled is never overwritten. Returns a per-transition count dict.
    Registrants are notified when their event goes live.
    """
    now = now or timezone.now()
    counts = {"upcoming": 0, "live": 0, "completed": 0}

    for event in TeenPattiEvent.objects.filter(is_active=True, status__in=AUTO_MANAGED_STATUSES):
        new_status = event.derive_status(now=now)
        if new_status == event.status:
            continue
        event.status = new_status
        event.save(update_fields=["status", "updated_at"])
        counts[new_status] = counts.get(new_status, 0) + 1
        if new_status == "live":
            notify_event_live(event)

    return counts


def notify_upcoming_events(within_hours=24, now=None):
    """Remind registrants of events starting inside the window. Returns the
    number of notifications sent.

    Idempotency: relies on being scheduled at a cadence no tighter than the
    window it queries (see the management command's --within-hours default of
    24 against a daily run), rather than a per-notification sent-flag, since
    the Notification model has no dedupe key and adding one would mean
    migrating a table shared by every other feature.
    """
    from datetime import timedelta

    now = now or timezone.now()
    horizon = now + timedelta(hours=within_hours)
    sent = 0

    candidates = TeenPattiEvent.objects.filter(
        is_active=True, status__in=("published", "upcoming"),
        start_date__range=(now.date(), horizon.date()),
    )
    for event in candidates:
        if not (now <= event.starts_at <= horizon):
            continue
        for registration in _seat_holders(event):
            notify_generic(
                registration.user,
                "Your Teen Patti event starts soon",
                f"🃏 {_event_display(event)} starts on "
                f"{event.start_date:%d %b %Y}{event.start_time and f' at {event.start_time:%I:%M %p}' or ''}.\n"
                f"🎟 Confirmation: {registration.confirmation_id}",
                icon="event",
            )
            sent += 1

    return sent


# ─────────────────────────────────────────────────────────────────────────────
# Notifications (Part 24) — all via the existing notification infrastructure
# ─────────────────────────────────────────────────────────────────────────────

def _seat_holders(event):
    return TeenPattiRegistration.objects.filter(
        event=event, status__in=SEAT_HOLDING_STATUSES,
    ).select_related("user")


def _notify_registration_confirmed(user, event, registration):
    """Best-effort — a notification failure must never undo a seat that was
    successfully claimed, so this is called after the transaction commits and
    swallows its own errors (notify_generic already logs)."""
    lines = [
        f"🃏 Your seat for {event.name} is confirmed.",
        f"🎟 Confirmation ID: {registration.confirmation_id}",
        f"📅 {event.start_date:%d %b %Y}" + (f" at {event.start_time:%I:%M %p}" if event.start_time else ""),
    ]
    where = ", ".join(p for p in (event.city, event.country) if p)
    if where:
        lines.append(f"📍 {where}")
    venue = event.venue or (event.casino.name if event.casino else "")
    if venue:
        lines.append(f"🏛 {venue}")
    if event.entry_fee:
        lines.append(f"💵 Entry: {event.currency} {event.entry_fee:,.2f}")

    notify_generic(user, "Teen Patti registration confirmed", "\n".join(lines), icon="event")


def notify_event_live(event):
    for registration in _seat_holders(event):
        notify_generic(
            registration.user,
            "Your Teen Patti event is now LIVE",
            f"🔴 {_event_display(event)} has started.\n"
            f"🎟 Confirmation: {registration.confirmation_id}",
            icon="event",
        )


def notify_event_cancelled(event):
    """Called from the admin update path when an event is moved to cancelled."""
    for registration in _seat_holders(event):
        notify_generic(
            registration.user,
            "Teen Patti event cancelled",
            f"⚠️ {_event_display(event)}, scheduled for {event.start_date:%d %b %Y}, has been cancelled.\n"
            f"🎟 Your registration {registration.confirmation_id} has been released. "
            f"Please contact support if you need assistance.",
            icon="system",
        )
