from django.db import models
from django.conf import settings
from django.utils import timezone

STATUS_CHOICES = [
    ("upcoming",  "Upcoming"),
    ("live",      "Live"),
    ("completed", "Completed"),
]

# Part 9's review lifecycle, kept in a separate column from `status` above:
# `status` answers "has this event happened yet?" (date-driven), review_status
# answers "may the public see it?" (admin-driven). Conflating them would mean
# an admin approval could silently un-complete a finished event.
#
#   discovered → pending_review → approved → published → archived
#                pending_review → rejected / duplicate
#
# Every pre-existing row is migrated to "published" so nothing that is live on
# the site today disappears behind the new gate.
REVIEW_STATUS_CHOICES = [
    ("discovered", "Discovered"),
    ("pending_review", "Pending Review"),
    ("approved", "Approved"),
    ("published", "Published"),
    ("rejected", "Rejected"),
    ("duplicate", "Duplicate"),
    ("archived", "Archived"),
]

# The only review state a visitor may see.
PUBLIC_REVIEW_STATUS = "published"

SOURCE_TYPE_CHOICES = [
    ("manual", "Manual Back Office entry"),
    ("rss", "RSS / Atom feed"),
    ("json_api", "Public JSON API"),
    ("ical", "iCalendar feed"),
]

SYNC_STATUS_CHOICES = [
    ("never", "Never run"),
    ("success", "Success"),
    ("partial", "Partial"),
    ("failed", "Failed"),
]


class PokerSource(models.Model):
    """A configured origin for poker events (Part 5). Adding a provider means
    adding a row here plus a connector class in services/poker_sources/ — never
    editing one large scraper function.

    Only sources that explicitly permit automated access should be enabled;
    `permission_note` is where an admin records what grants that permission
    (published API terms, a feed's own usage policy, a written agreement).
    """

    name = models.CharField(max_length=150, unique=True)
    source_type = models.CharField(max_length=16, choices=SOURCE_TYPE_CHOICES, default="rss")
    url = models.URLField(max_length=500, blank=True)
    is_enabled = models.BooleanField(default=True, db_index=True)

    # Free-form config for the connector (feed field mappings, API params).
    # A dict rather than columns so a new connector never needs a migration.
    config = models.JSONField(default=dict, blank=True)

    permission_note = models.TextField(
        blank=True,
        help_text="Why automated access to this source is permitted (ToS clause, API terms, agreement).",
    )

    last_attempted_sync = models.DateTimeField(null=True, blank=True)
    last_successful_sync = models.DateTimeField(null=True, blank=True)
    sync_status = models.CharField(max_length=10, choices=SYNC_STATUS_CHOICES, default="never")
    error_message = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_source_type_display()})"


class PokerTournament(models.Model):
    image       = models.ImageField(upload_to="poker/", null=True, blank=True)
    name        = models.CharField(max_length=200)
    casino_name = models.CharField(max_length=150, blank=True)
    location    = models.CharField(max_length=150, blank=True)
    event_date  = models.DateField(db_index=True)
    event_time  = models.TimeField(null=True, blank=True)
    prize_pool  = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    buy_in      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default="upcoming", db_index=True)
    description = models.TextField(blank=True)
    seats_available = models.PositiveIntegerField(null=True, blank=True)

    # ── Part 6 fields ────────────────────────────────────────────────────────
    # `location` above is the pre-existing free-text "City, Country" string and
    # is left untouched; these split it for filtering without rewriting history.
    series = models.CharField(max_length=150, blank=True, db_index=True)
    country = models.CharField(max_length=100, blank=True, db_index=True)
    city = models.CharField(max_length=100, blank=True)
    currency = models.CharField(max_length=8, blank=True, default="USD")
    game_type = models.CharField(max_length=100, blank=True, db_index=True)
    organizer = models.CharField(max_length=150, blank=True)
    end_date = models.DateField(null=True, blank=True)
    # Never fabricated — left blank when a source doesn't supply one (Part 13).
    official_url = models.URLField(max_length=500, blank=True)

    # ── Part 5/8 review + provenance ─────────────────────────────────────────
    review_status = models.CharField(
        max_length=16, choices=REVIEW_STATUS_CHOICES, default="published", db_index=True,
    )
    source = models.ForeignKey(
        PokerSource, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="tournaments",
    )
    # The source's own id for this event — the strongest dedupe key when present.
    source_event_id = models.CharField(max_length=200, blank=True, db_index=True)
    source_url = models.URLField(max_length=500, blank=True)
    discovered_at = models.DateTimeField(null=True, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    # Set when this row is judged a duplicate of another — the survivor.
    duplicate_of = models.ForeignKey(
        "self", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="duplicates",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="poker_tournaments_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True)

    is_active  = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="poker_tournaments_created",
    )

    class Meta:
        ordering = ["-event_date", "-event_time"]
        indexes = [
            models.Index(fields=["is_active", "event_date"]),
            models.Index(fields=["review_status", "event_date"]),
            models.Index(fields=["country", "event_date"]),
            models.Index(fields=["source", "source_event_id"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.casino_name})"

    def derive_status(self, now=None):
        """Part 9's date rules. end_date is optional — a single-day event runs
        to the end of its start date rather than completing the moment it
        begins."""
        now = now or timezone.now()
        today = now.date()
        finish = self.end_date or self.event_date
        if self.event_date > today:
            return "upcoming"
        if today <= finish:
            return "live"
        return "completed"


class PokerSyncLog(models.Model):
    """One row per source per sync run (Part 10). Written even when the source
    fails, which is the point — a silent failure is what this makes visible."""

    source = models.ForeignKey(
        PokerSource, null=True, blank=True, on_delete=models.SET_NULL, related_name="sync_logs",
    )
    source_name = models.CharField(max_length=150, blank=True)
    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=SYNC_STATUS_CHOICES, default="never")

    fetched_count = models.PositiveIntegerField(default=0)
    created_count = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    duplicate_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [models.Index(fields=["source", "-started_at"])]

    def __str__(self):
        return f"{self.source_name or 'sync'} @ {self.started_at:%Y-%m-%d %H:%M} — {self.status}"


class PokerEventChangeLog(models.Model):
    """Audit trail for the Back Office "Change History" view — who approved,
    rejected or edited an event, and what changed."""

    tournament = models.ForeignKey(
        PokerTournament, on_delete=models.CASCADE, related_name="change_logs",
    )
    action = models.CharField(max_length=40)
    from_status = models.CharField(max_length=16, blank=True)
    to_status = models.CharField(max_length=16, blank=True)
    # {field: [old, new]} for edits; empty for pure status transitions.
    changed_fields = models.JSONField(default=dict, blank=True)
    note = models.TextField(blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="poker_change_logs",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["tournament", "-created_at"])]

    def __str__(self):
        return f"{self.action} on #{self.tournament_id} at {self.created_at:%Y-%m-%d %H:%M}"


REGISTRATION_STATUS_CHOICES = [
    ("new",       "New"),
    ("contacted", "Contacted"),
    ("closed",    "Closed"),
]


class PokerRegistration(models.Model):
    tournament = models.ForeignKey(PokerTournament, on_delete=models.CASCADE, related_name="registrations")
    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="poker_registrations")
    status     = models.CharField(max_length=12, choices=REGISTRATION_STATUS_CHOICES, default="new", db_index=True)
    admin_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("tournament", "user")

    def __str__(self):
        return f"{self.user} -> {self.tournament}"
