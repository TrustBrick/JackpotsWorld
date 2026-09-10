"""VIP destination experiences — the non-casino half of the public site.

WHY ONE MODEL AND NOT SIX
─────────────────────────────────────────────────────────────────────────────
Luxury travel, hotels & resorts, dining, entertainment and concierge services
are five sections on the landing page, but they are ONE shape of content: a
title, a description, an optional destination, an optional image, a CTA and a
sort order. Six near-identical models would mean six migrations, six
serializers, six admin views and six admin tabs to keep in step, and every
future pillar would cost the same again.

So `category` separates them instead. The public endpoint groups by it, each
admin view forces its own value on write, and adding a sixth pillar is a
CHOICES entry rather than a schema change.

WHAT THIS MODEL DELIBERATELY DOES NOT DO
─────────────────────────────────────────────────────────────────────────────
It is not a booking system and holds no price, availability, inventory or
partner contract. JackpotsWorld arranges these through its network; it does
not own jets, ships, hotels or restaurants, and the copy this model carries
must never imply otherwise (see authapp/tests_landing_wording.py, which fails
the build on that class of claim).

`partner` exists because a venue may be named once a real arrangement exists,
and it is blank by default for exactly that reason — a seeded row names
nobody.

Events are ABSENT on purpose. Poker, Teen Patti and Andhar Bahar events, and
CasinoEvent, are already modelled and already managed in Back Office; adding
an "events" category here would be the second, competing event system the
brief explicitly rules out.
"""
from django.conf import settings
from django.db import models

from .landing_models import Destination


# The landing page's non-casino pillars, in the order the page tells the story.
# `casino` is not here: offline casinos remain their own established section,
# fed by Casino / Destination / PremiumPartner, and must not be re-modelled.
CATEGORY_CHOICES = [
    # The overview band under the hero -- "Beyond the Casino". Not a pillar of
    # its own: its cards are signposts to the rest of the page, including to
    # areas this model does not own (offline casinos, events). It lives here
    # rather than in a new model because a signpost card is the same shape as
    # a pillar card -- title, description, image, icon, CTA, order -- and this
    # is exactly the extension the `category` design was for.
    ("overview", "Beyond the Casino"),
    ("luxury_travel", "Luxury Travel"),
    ("stay", "Hotels & Resorts"),
    ("dining", "Dining & Entertainment"),
    ("concierge", "VIP Concierge"),
]

CATEGORY_VALUES = [slug for slug, _ in CATEGORY_CHOICES]


class Experience(models.Model):
    """One card in one pillar of the VIP destination story."""

    category = models.CharField(
        max_length=20, choices=CATEGORY_CHOICES, db_index=True,
        help_text="Which landing-page section this appears in.",
    )

    title = models.CharField(max_length=120)
    subtitle = models.CharField(max_length=160, blank=True)
    description = models.TextField(blank=True)

    # Nullable because a pillar is not always tied to one place: "Private Jet
    # Travel" is arranged to wherever the member is going, while a resort sits
    # in exactly one destination. A row with no destination reads as
    # network-wide rather than as missing data.
    destination = models.ForeignKey(
        Destination, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="experiences",
        help_text="Leave empty for a service offered across the whole network.",
    )
    city = models.CharField(max_length=100, blank=True)

    # Named only when a real arrangement exists. Blank is the honest default
    # and is what every seeded row ships with.
    partner = models.CharField(
        max_length=150, blank=True,
        help_text="Only name a venue or operator once an arrangement is in place.",
    )

    # Optional by design: these sections are built to look finished on
    # typography alone, so a pillar with no photography yet still renders
    # properly instead of showing a broken or placeholder image.
    image = models.ImageField(
        upload_to="landing/experiences/", max_length=255, null=True, blank=True,
    )
    video = models.FileField(
        upload_to="landing/experiences/", max_length=255, null=True, blank=True,
    )

    # Matched against the ICON_MAP in the rendering component; an unknown name
    # falls back to a default rather than breaking the section.
    icon_name = models.CharField(max_length=40, blank=True)
    accent_color = models.CharField(max_length=20, default="#D4AF37")

    cta_text = models.CharField(max_length=60, blank=True)
    # An in-page anchor, a site route, or a full URL. Blank means the card uses
    # the section's own enquiry action instead of going anywhere.
    cta_link = models.CharField(max_length=300, blank=True)

    # Which EnquiryMessage row prefills WhatsApp when this card's enquiry is
    # sent. A slug, not an id, for the same reason EnquiryMessage.key is:
    # reseeding or re-exporting a row must not silently repoint a button.
    enquiry_key = models.SlugField(
        max_length=60, blank=True,
        help_text="EnquiryMessage key used for this card's WhatsApp handoff.",
    )

    is_featured = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="experiences_updated",
    )

    class Meta:
        ordering = ["display_order", "id"]
        indexes = [
            # The public page reads one category at a time, already ordered.
            models.Index(fields=["category", "is_active", "display_order"]),
        ]

    def __str__(self):
        return f"{self.get_category_display()} — {self.title}"


ENQUIRY_STATUS_CHOICES = [
    ("new", "New"),
    ("contacted", "Contacted"),
    ("closed", "Closed"),
]


class ExperienceEnquiry(models.Model):
    """A visitor asking about one of these services.

    THE MISSING HALF OF THE ENQUIRY FLOW. Every enquiry button on this site
    opens WhatsApp with a prefilled message and records nothing, so a visitor
    who opens the composer and never presses send is a lead nobody ever sees.
    This table is where the details land BEFORE the handoff, so the enquiry
    survives whether or not the message is actually sent.

    It does not replace the WhatsApp flow and is not a support system: the
    visitor is still handed to WhatsApp afterwards, the number is still
    resolved per country by the existing service, and live chat and support
    tickets are untouched. This only makes the lead durable.

    Deliberately open to anonymous visitors — requiring an account would
    defeat the purpose of a public enquiry form — which is why the view
    throttles it and why nothing here is trusted for display without escaping.
    """

    # Kept if the card is later deleted: the enquiry is still a real person who
    # asked, and losing it because Back Office tidied a card would be worse
    # than an enquiry whose card no longer exists.
    experience = models.ForeignKey(
        Experience, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="enquiries",
    )
    # Denormalised so an enquiry still says what it was ABOUT after the card
    # it came from is gone.
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, db_index=True)
    experience_title = models.CharField(max_length=120, blank=True)

    # Set when a signed-in member enquires, null for an anonymous visitor.
    # Both are legitimate; the form never requires an account.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="experience_enquiries",
    )

    name = models.CharField(max_length=120)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)

    destination = models.CharField(max_length=120, blank=True)
    travel_date = models.DateField(null=True, blank=True)
    party_size = models.PositiveSmallIntegerField(null=True, blank=True)
    requirements = models.TextField(blank=True)
    message = models.TextField(blank=True)

    status = models.CharField(
        max_length=12, choices=ENQUIRY_STATUS_CHOICES, default="new", db_index=True,
    )
    # Staff-only. Absent from the public serializer entirely, not merely
    # hidden by the UI.
    admin_note = models.TextField(blank=True)

    # Rate limiting only. Not shown in Back Office and not used to identify
    # anyone; the existing visitor-privacy sweep treats IPs the same way.
    submitted_ip = models.GenericIPAddressField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Experience enquiries"

    def __str__(self):
        return f"{self.name} — {self.experience_title or self.get_category_display()}"
