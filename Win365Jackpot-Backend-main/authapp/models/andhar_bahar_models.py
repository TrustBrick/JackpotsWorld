"""
authapp/models/andhar_bahar_models.py
─────────────────────────────────────────────────────────────────────────────
Andhar Bahar — the third game section, alongside Poker and Teen Patti.

WHAT IS REUSED, AND WHAT IS NEW
───────────────────────────────
Reused, deliberately, rather than re-modelled:
  • Casino / country — an event's venue is the existing
    authapp.models.casino_models.Casino, exactly as TeenPattiEvent does, so
    destinations stay one source of truth across the app.
  • SectionMedia — the hero watermark and hero media card come from the
    existing landing_models.SectionMedia with section="andhar_bahar". No new
    media model; the Back Office media tab is the same component the Teen
    Patti and Poker tabs already use.
  • The event lifecycle vocabulary and the date+time split are imported from
    teenpatti_models rather than redeclared, so "live"/"upcoming"/"completed"
    can never come to mean two different things in two sections.

New here, because nothing existing covers it:
  • AndharBaharContent — the singleton page copy (hero, intro, how-to-play,
    CTAs). LandingSettings is the landing page's singleton and is already
    crowded with landing-specific fields; a game page's copy is its own
    concern.
  • AndharBaharHighlight — the ordered benefit/highlight cards.
  • AndharBaharStep — the ordered "how the game works" steps.
  • AndharBaharEvent — seatless. That is the difference from TeenPattiEvent,
    which is a seat-limited registration system with confirmation IDs; Andhar
    Bahar events are a destination/date showcase with no seat accounting, so
    modelling capacity here would be inventing a feature nobody asked for and
    leaving a half-built booking flow behind.

NO MARKETING CLAIM HERE ASSERTS AN OUTCOME. The seeded defaults describe pace,
simplicity and venue quality — never winnings, odds or guaranteed results —
matching the wording rules the landing copy already follows (see
landing_models.LandingSettings).
"""
from datetime import datetime, time as dt_time

from django.conf import settings
from django.db import models
from django.utils import timezone

from authapp.models.casino_models import Casino
from authapp.models.teenpatti_models import (
    AUTO_MANAGED_STATUSES,
    EVENT_STATUS_CHOICES,
    PUBLIC_EVENT_STATUSES,
)

# Re-exported so callers of this module do not have to know the vocabulary is
# physically defined next door.
__all__ = [
    "AndharBaharContent",
    "AndharBaharHighlight",
    "AndharBaharStep",
    "AndharBaharEvent",
    "AndharBaharRegistration",
    "EVENT_STATUS_CHOICES",
    "PUBLIC_EVENT_STATUSES",
    "REGISTRATION_STATUS_CHOICES",
]

# Interest-capture vocabulary, the same three values PokerRegistration uses.
# Copied rather than imported from poker_models because it is a coincidence of
# shape, not a shared concept: poker's list is free to change for poker reasons
# without silently redefining what an Andhar Bahar registration means.
REGISTRATION_STATUS_CHOICES = [
    ("new", "New"),
    ("contacted", "Contacted"),
    ("closed", "Closed"),
]


class AndharBaharContent(models.Model):
    """Singleton (pk=1) holding every single-value piece of Andhar Bahar page
    copy. Same load()/save() singleton shape as LandingSettings and
    VoiceCallSettings.

    Every field has a default, so the page renders correctly on a fresh
    database before an admin has touched anything — and every default is
    editable from the Back Office, which is the point: nothing below is
    hardcoded in the frontend.
    """

    # ── Hero ────────────────────────────────────────────────────────────────
    hero_eyebrow = models.CharField(max_length=80, default="Card Game Experience")
    hero_title = models.CharField(max_length=160, default="Andhar Bahar")
    hero_subtitle = models.CharField(
        max_length=200, default="Are you an Andhar Bahar player?",
    )
    hero_description = models.TextField(
        default=(
            "If you want to know where the events are happening and where the tables are "
            "live, sign up and we will tell you. Members get the dates, the venues and a "
            "VIP host to arrange the visit."
        ),
    )
    # CTA label and route are separate columns rather than one JSON blob so the
    # Back Office form is two plain inputs, and a bad route can be corrected
    # without retyping the label.
    hero_cta_primary_label = models.CharField(max_length=60, default="Sign Up For Updates")
    # The section's own sign-up route (see App.jsx). A visitor who lands here
    # for Andhar Bahar should be able to register from here rather than being
    # sent to a generic auth page and losing their place.
    hero_cta_primary_link = models.CharField(max_length=200, default="/andhar-bahar/sign-up")
    hero_cta_secondary_label = models.CharField(max_length=60, default="Talk to a VIP Host")
    # "#vip-host" is not an anchor on the page: the page turns it into an
    # "open-chat" event, so "Talk to a VIP Host" opens the live-support
    # concierge in place. It used to default to "/#contact", which sent the
    # visitor to the landing page's footer — off the page they were reading,
    # and (because a route change drops the hash) to the top of it.
    hero_cta_secondary_link = models.CharField(max_length=200, default="#vip-host")
    # Short trust line under the CTAs. Describes the introduction service,
    # never an outcome.
    hero_trust_text = models.CharField(
        max_length=200,
        default="Verified partner venues · Hosted introductions · Play at the casino, never online",
    )
    hero_image = models.ImageField(upload_to="andhar_bahar/", max_length=255, null=True, blank=True)

    # ── Game introduction ───────────────────────────────────────────────────
    intro_title = models.CharField(max_length=160, default="What Is Andhar Bahar?")
    intro_body = models.TextField(
        default=(
            "Andhar Bahar is a traditional Indian card game played with a single deck. "
            "The dealer draws one joker card, then deals cards alternately to two sides — "
            "Andhar (inside) and Bahar (outside). Players back the side they believe will "
            "match the joker rank first. There is no hand to build and nothing to memorise, "
            "which is why a first-time visitor can follow a round immediately."
        ),
    )
    how_to_play_title = models.CharField(max_length=160, default="How A Round Works")
    how_to_play_note = models.CharField(
        max_length=300,
        default=(
            "Table rules, minimums and payouts are set by each casino — your host confirms "
            "them before you play."
        ),
    )

    # Shown in the sign-in/sign-up banner to a signed-out visitor, and on the
    # section's own auth pages. Its own field rather than reusing the hero copy:
    # the hero sells the game, this asks for the registration, and an admin
    # will want to word them differently.
    signup_prompt = models.CharField(
        max_length=300,
        default=(
            "Interested in Andhar Bahar? Sign up to find out where the events are "
            "happening and where the tables are live."
        ),
    )

    highlights_title = models.CharField(max_length=160, default="Why Players Enjoy It")
    events_title = models.CharField(max_length=160, default="Andhar Bahar Destinations & Events")
    events_subtitle = models.CharField(
        max_length=300,
        default=(
            "Partner casinos currently running Andhar Bahar tables, and the dates we are "
            "hosting members."
        ),
    )

    # ── Visibility ──────────────────────────────────────────────────────────
    # The page master switch. False hides the nav entry and makes the route
    # render an explanation rather than 404 — a hard 404 on a link that was
    # live yesterday is worse for a visitor than being told it is unavailable.
    is_published = models.BooleanField(default=True)
    show_events_section = models.BooleanField(default=True)
    show_highlights_section = models.BooleanField(default=True)
    show_how_to_play_section = models.BooleanField(default=True)

    # ── SEO ─────────────────────────────────────────────────────────────────
    seo_title = models.CharField(max_length=160, blank=True)
    seo_description = models.CharField(max_length=300, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )

    class Meta:
        verbose_name = "Andhar Bahar content"
        verbose_name_plural = "Andhar Bahar content"

    def __str__(self):
        return "Andhar Bahar Content"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class AndharBaharHighlight(models.Model):
    """One benefit/highlight card. Same shape as
    landing_models.WhyChooseUsFeature (icon name + colour + title + body +
    order + is_active) so the Back Office form and the frontend icon
    resolution are the ones that already exist."""

    # A lucide-react icon name, resolved on the frontend against the same
    # allow-list WhyChooseUs already uses — an unknown name falls back to a
    # default icon rather than crashing the page.
    icon_name = models.CharField(max_length=40, default="Zap")
    color = models.CharField(max_length=20, default="#D4AF37")
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class AndharBaharStep(models.Model):
    """One step of the how-to-play flow, e.g. "The dealer draws the joker"."""

    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class AndharBaharEvent(models.Model):
    """An Andhar Bahar event at a partner destination.

    Seatless by design — see the module docstring. Statuses, the date+time
    split and the read-time `computed_status` correction are all the same as
    TeenPattiEvent's, imported rather than copied.
    """

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    short_description = models.CharField(max_length=300, blank=True)

    # Denormalised from Casino.country for the same reason TeenPattiEvent does
    # it: an event can still be filtered by country while its venue is being
    # finalised and `casino` is null.
    country = models.CharField(max_length=100, db_index=True)
    city = models.CharField(max_length=100, blank=True)
    casino = models.ForeignKey(
        Casino, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="andhar_bahar_events",
    )
    venue = models.CharField(max_length=200, blank=True)

    start_date = models.DateField(db_index=True)
    end_date = models.DateField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)

    # Indicative table minimum, rendered as "from X". Nullable because a venue
    # that has not published one must show nothing rather than a guessed zero.
    min_buy_in = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=8, default="USD")

    event_type = models.CharField(max_length=100, blank=True)
    image = models.ImageField(upload_to="andhar_bahar/events/", max_length=255, null=True, blank=True)

    status = models.CharField(max_length=20, choices=EVENT_STATUS_CHOICES, default="draft", db_index=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="andhar_bahar_events_created",
    )

    class Meta:
        ordering = ["order", "start_date", "id"]
        indexes = [
            models.Index(fields=["is_active", "status", "start_date"]),
            models.Index(fields=["country", "start_date"]),
            models.Index(fields=["is_featured", "start_date"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.country})"

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
        finish never flips to "completed" the moment it starts."""
        end_day = self.end_date or self.start_date
        return timezone.make_aware(
            datetime.combine(end_day, self.end_time or dt_time.max),
            timezone.get_default_timezone(),
        )

    @property
    def computed_status(self):
        """The status the clock says, evaluated on read — so a page is never
        wrong just because no scheduler has run. Same contract as
        TeenPattiEvent.computed_status."""
        return self.derive_status()

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


class AndharBaharRegistration(models.Model):
    """A member registering interest in one Andhar Bahar event.

    MIRRORS PokerRegistration, not TeenPattiRegistration, and the difference is
    the point. Teen Patti's is a seat-limited booking: it holds capacity under
    a row lock, mints a confirmation ID to read out at a venue door, and frees
    the seat on cancellation. An AndharBaharEvent has no `max_participants` —
    it is a destination/date showcase — so there is no seat to hold and a
    confirmation ID would confirm nothing. What this records is the same thing
    Poker records: this member wants to be told about this event, and a host
    should contact them.

    `unique_together` is the duplicate guard, so a double-submit or an
    impatient second tap produces one row rather than two. The view uses
    get_or_create on top of it, which makes a repeat registration a friendly
    no-op instead of an error.
    """

    event = models.ForeignKey(
        AndharBaharEvent, on_delete=models.CASCADE, related_name="registrations",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="andhar_bahar_registrations",
    )
    status = models.CharField(
        max_length=12, choices=REGISTRATION_STATUS_CHOICES, default="new", db_index=True,
    )
    admin_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("event", "user")
        indexes = [
            models.Index(fields=["event", "status"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"{self.user_id} -> {self.event_id}"
