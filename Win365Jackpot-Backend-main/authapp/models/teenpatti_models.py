"""
authapp/models/teenpatti_models.py
─────────────────────────────────────────────────────────────────────────────
Teen Patti — a seat-limited, registration-backed event section, deliberately
kept separate from Poker (PokerTournament is an interest-capture list with no
seat accounting) and from CasinoEvent (no capacity, no confirmation IDs).

Shape follows CasinoEvent's date+time split rather than a single DateTimeField
so the Back Office form stays a plain date picker + time picker, matching every
other event form in the panel. The combined UTC datetimes needed for
live/upcoming/completed transitions are derived on read via `starts_at` /
`ends_at` below.

Country/casino are NOT new reference tables — `casino` points at the existing
authapp.models.casino_models.Casino and `country` mirrors that row's country
string, keeping one source of truth for destinations across the app.
"""
import secrets
import string
from datetime import datetime, time as dt_time
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from authapp.models.casino_models import Casino

# DRAFT and CANCELLED are terminal admin choices — the date-driven promoter
# (services/teenpatti_service.refresh_event_statuses) only ever moves an event
# between the middle three, so an admin's explicit draft/cancel is never
# silently overridden by the scheduler.
EVENT_STATUS_CHOICES = [
    ("draft", "Draft"),
    ("published", "Published"),
    ("upcoming", "Upcoming"),
    ("live", "Live"),
    ("completed", "Completed"),
    ("cancelled", "Cancelled"),
]

# Statuses a visitor is allowed to see on the public site. "draft" is
# pre-publication and "cancelled" is withdrawn, so both stay Back-Office-only.
PUBLIC_EVENT_STATUSES = ("published", "upcoming", "live", "completed")

# Statuses the scheduler is allowed to rewrite (see the note above).
AUTO_MANAGED_STATUSES = ("published", "upcoming", "live")

REGISTRATION_STATUS_CHOICES = [
    ("confirmed", "Confirmed"),
    ("cancelled", "Cancelled"),
    ("attended", "Attended"),
    ("no_show", "No Show"),
]

# Statuses that still occupy a seat. A cancelled registration frees its seat
# back to the pool; attended/no_show are post-event bookkeeping on a seat that
# was genuinely used.
SEAT_HOLDING_STATUSES = ("confirmed", "attended", "no_show")


def _gen_confirmation_id():
    """TP + 8 unambiguous chars. Excludes O/0 and I/1 so a confirmation read
    aloud at a venue door can't be mistranscribed."""
    alphabet = "".join(c for c in (string.ascii_uppercase + string.digits) if c not in "O0I1")
    return "TP" + "".join(secrets.choice(alphabet) for _ in range(8))


class TeenPattiEvent(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    short_description = models.CharField(max_length=300, blank=True)

    # Mirrors Casino.country. Kept denormalised (rather than reached through
    # `casino`) so an event can still be filtered by country while its venue
    # is being finalised and `casino` is null.
    country = models.CharField(max_length=100, db_index=True)
    city = models.CharField(max_length=100, blank=True)
    casino = models.ForeignKey(
        Casino, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="teen_patti_events",
    )
    # Free-text fallback for a venue that isn't one of the managed Casino
    # rows (a hotel ballroom, a one-off pop-up).
    venue = models.CharField(max_length=200, blank=True)

    start_date = models.DateField(db_index=True)
    end_date = models.DateField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)

    entry_fee = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    currency = models.CharField(max_length=8, default="USD")
    prize_pool = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    # null = unlimited seating; the registration path only enforces capacity
    # when this is set.
    max_participants = models.PositiveIntegerField(null=True, blank=True)
    # Denormalised seat counter maintained transactionally by
    # services/teenpatti_service.py — never written directly from a view, and
    # never trusted as the capacity check on its own (that re-reads under a
    # row lock).
    current_participants = models.PositiveIntegerField(default=0)

    event_type = models.CharField(max_length=100, blank=True)
    image = models.ImageField(upload_to="teenpatti/", null=True, blank=True)
    banner = models.ImageField(upload_to="teenpatti/banners/", null=True, blank=True)

    status = models.CharField(max_length=20, choices=EVENT_STATUS_CHOICES, default="draft", db_index=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    # Separate from status so an admin can pull an event off the site without
    # losing which lifecycle state it was in — same convention as
    # CasinoEvent/PokerTournament.
    is_active = models.BooleanField(default=True, db_index=True)
    registration_open = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="teen_patti_events_created",
    )

    class Meta:
        ordering = ["start_date", "start_time"]
        indexes = [
            models.Index(fields=["is_active", "status", "start_date"]),
            models.Index(fields=["country", "start_date"]),
            models.Index(fields=["is_featured", "start_date"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.country})"

    # ── Derived datetimes ────────────────────────────────────────────────────
    # USE_TZ is on and TIME_ZONE is UTC, so the naive date+time pair is made
    # aware in the project timezone before any comparison against now().

    @property
    def starts_at(self):
        return timezone.make_aware(
            datetime.combine(self.start_date, self.start_time or dt_time.min),
            timezone.get_default_timezone(),
        )

    @property
    def ends_at(self):
        """A missing end_date means a single-day event; a missing end_time
        means it runs to the end of that day, so an event with no explicit
        finish never flips to 'completed' the moment it starts."""
        end_day = self.end_date or self.start_date
        return timezone.make_aware(
            datetime.combine(end_day, self.end_time or dt_time.max),
            timezone.get_default_timezone(),
        )

    @property
    def seats_remaining(self):
        if self.max_participants is None:
            return None
        return max(self.max_participants - self.current_participants, 0)

    @property
    def is_full(self):
        return self.max_participants is not None and self.current_participants >= self.max_participants

    def derive_status(self, now=None):
        """The status this event's dates imply, for the auto-managed states
        only. Returns the current status untouched for draft/cancelled/
        completed so callers can assign the result unconditionally."""
        if self.status not in AUTO_MANAGED_STATUSES:
            return self.status
        now = now or timezone.now()
        if now < self.starts_at:
            return "upcoming"
        if now <= self.ends_at:
            return "live"
        return "completed"


class TeenPattiRegistration(models.Model):
    event = models.ForeignKey(TeenPattiEvent, on_delete=models.CASCADE, related_name="registrations")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="teen_patti_registrations",
    )
    confirmation_id = models.CharField(max_length=12, unique=True, editable=False, db_index=True)
    status = models.CharField(
        max_length=12, choices=REGISTRATION_STATUS_CHOICES, default="confirmed", db_index=True,
    )

    # Snapshot of what the seat cost when it was taken, so a later edit to the
    # event's entry_fee never rewrites what an existing registrant was quoted
    # (same snapshot convention as ReferralCommission.commission_rate).
    entry_fee_at_registration = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    currency = models.CharField(max_length=8, default="USD")

    admin_note = models.TextField(blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        # The hard duplicate-registration guard. The service layer checks
        # first for a clean error message, but this constraint is what makes
        # a double-submit race impossible rather than merely unlikely.
        unique_together = ("event", "user")
        indexes = [
            models.Index(fields=["event", "status"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"{self.confirmation_id} — {self.user_id} @ {self.event_id}"

    def save(self, *args, **kwargs):
        if not self.confirmation_id:
            cid = _gen_confirmation_id()
            while TeenPattiRegistration.objects.filter(confirmation_id=cid).exists():
                cid = _gen_confirmation_id()
            self.confirmation_id = cid
        super().save(*args, **kwargs)
