from django.db import models
from django.conf import settings
from django.utils import timezone

STATUS_CHOICES = [
    ("upcoming",  "Upcoming"),
    ("live",      "Live"),
    ("completed", "Completed"),
]


def derive_status(event_date, end_date=None):
    """Status implied by the event's own dates.

    The stored `status` column is set by hand in the Back Office and is never
    revisited, so every event silently stays "upcoming"/"live" forever once
    its date passes. This derives the value instead, at read time.

    `end_date` is optional because only PokerTournament has one. Given it, a
    multi-day festival reads "live" for its whole run. Without it -- every
    CasinoEvent, and any tournament whose end_date has not been filled in --
    only the opening day can be called live, which is the honest limit of what
    a single date can say rather than a guess at a duration.
    """
    if event_date is None:
        return None
    today = timezone.localdate()
    if event_date > today:
        return "upcoming"
    # Started on or before today.
    if end_date is not None:
        return "live" if today <= end_date else "completed"
    return "live" if event_date == today else "completed"


class CasinoEvent(models.Model):
    image             = models.ImageField(upload_to="events/", max_length=255, null=True, blank=True)
    name              = models.CharField(max_length=200)
    country           = models.CharField(max_length=100, db_index=True)
    city              = models.CharField(max_length=100, blank=True)
    venue             = models.CharField(max_length=200, blank=True)
    event_date        = models.DateField(db_index=True)
    event_time        = models.TimeField(null=True, blank=True)
    category          = models.CharField(max_length=100, blank=True, db_index=True)
    short_description = models.CharField(max_length=300, blank=True)
    description       = models.TextField(blank=True)
    ticket_note       = models.CharField(max_length=300, blank=True)
    status            = models.CharField(max_length=20, choices=STATUS_CHOICES, default="upcoming", db_index=True)

    is_active  = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="events_created",
    )

    class Meta:
        ordering = ["-event_date", "-event_time"]
        indexes = [models.Index(fields=["is_active", "event_date"])]

    # A property, not a field: nothing is stored, so this adds no column and
    # needs no migration. `status` is left alone as the admin-editable value.
    @property
    def computed_status(self):
        return derive_status(self.event_date)

    def __str__(self):
        return f"{self.name} ({self.country})"


REGISTRATION_STATUS_CHOICES = [
    ("new",       "New"),
    ("contacted", "Contacted"),
    ("closed",    "Closed"),
]


class EventTicketRequest(models.Model):
    event      = models.ForeignKey(CasinoEvent, on_delete=models.CASCADE, related_name="ticket_requests")
    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="event_ticket_requests")
    status     = models.CharField(max_length=12, choices=REGISTRATION_STATUS_CHOICES, default="new", db_index=True)
    admin_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("event", "user")

    def __str__(self):
        return f"{self.user} -> {self.event}"
