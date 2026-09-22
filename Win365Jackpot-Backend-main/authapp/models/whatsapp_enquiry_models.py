"""
authapp/models/whatsapp_enquiry_models.py
─────────────────────────────────────────────────────────────────────────────
WHATSAPP-CAPTURE: the lead behind a WhatsApp button press.

WHY THIS EXISTS
───────────────
Every WhatsApp button on this site opens `wa.me` and the conversation then
happens between the visitor's phone and ours, on WhatsApp's servers. Nothing
they type there reaches this system, and nothing ever can without Meta's
Business Cloud API — which would make the number API-only and take it out of
the WhatsApp app the desk actually uses.

So the capture happens on the near side of the handoff instead: the visitor
gives a name and a number, that lands here, and *then* WhatsApp opens. The
enquiry survives whether or not they ever press send, and whether or not they
type anything once WhatsApp is open.

This is the same trade the Experiences form already makes
(models/experience_models.py — ExperienceEnquiry), generalised to every
button on the site rather than the VIP pillars alone. That model is left
exactly as it is: it collects travel dates and party sizes this one has no
business asking for on a floating button.

WHAT IT DOES NOT CLAIM
──────────────────────
A row here means "someone asked to talk to us and left a number". It does
**not** mean a WhatsApp message was sent, received or answered — that is not
knowable from this side. `status` tracks what the desk did about it, which is
knowable, and nothing pretends to mirror WhatsApp's own delivery state.

Anonymous on purpose: requiring an account would defeat a public enquiry
form. Which is why the view is throttled and why nothing stored here is
trusted for display without escaping.
"""

from django.conf import settings
from django.db import models

# WHATSAPP-LEADS: a press with no details is still a lead worth having --
# which button somebody reached for says what they wanted, even when they
# declined to type anything. `clicked` is that row.
STATUS_CLICKED = "clicked"
STATUS_NEW = "new"
STATUS_CONTACTED = "contacted"
STATUS_CLOSED = "closed"
# Reserved for a WhatsApp Cloud API webhook. NO CODE PATH SETS THIS, and none
# may until an inbound message has actually been observed -- see the "what it
# does not claim" note above. A click is not a message.
STATUS_MESSAGE_RECEIVED = "message_received"

STATUS_CHOICES = [
    (STATUS_CLICKED, "Clicked (no details given)"),
    (STATUS_NEW, "New"),
    (STATUS_CONTACTED, "Contacted"),
    (STATUS_CLOSED, "Closed"),
    (STATUS_MESSAGE_RECEIVED, "Message received"),
]

# What Back Office may set by hand. The observational states describe what the
# visitor did and are recorded automatically; MESSAGE_RECEIVED needs evidence
# that does not exist yet. Neither is a host's to assert.
STAFF_SETTABLE_STATUSES = {STATUS_CONTACTED, STATUS_CLOSED}

# Statuses a later, richer record may overwrite. A row that a host has already
# worked (contacted/closed) is never demoted by a fresh click.
UPGRADEABLE_STATUSES = {STATUS_CLICKED, STATUS_NEW}

# Which button the visitor pressed. A slug, passed by the frontend, so a
# button can be renamed or restyled without repointing anything here. An
# unknown value is stored as-is rather than rejected: losing a real lead
# because a new button shipped with a new slug would be the worse failure.
SOURCE_MAX = 40


class WhatsAppEnquiry(models.Model):
    """A visitor who asked to be contacted on WhatsApp."""

    name = models.CharField(max_length=120)
    whatsapp_number = models.CharField(max_length=32, db_index=True)

    # Optional everywhere, and deliberately so. The number is what answers an
    # enquiry — WhatsApp is the channel they chose — so making email required
    # would cost leads to collect something the desk may never use. It is
    # captured when the platform already knows it (a signed-in member) or when
    # a visitor volunteers it, and left blank otherwise rather than guessed.
    email = models.EmailField(blank=True)

    # What they want. Optional -- an extra required field on a floating button
    # is where people give up, and a name plus a number is already enough to
    # answer them.
    message = models.TextField(blank=True)

    # Which button, and what page it was on. Together these say what the
    # person was looking at when they decided to ask, which is most of the
    # context a host needs before replying.
    source = models.CharField(max_length=SOURCE_MAX, blank=True, db_index=True)
    page_path = models.CharField(max_length=255, blank=True)

    # WHATSAPP-LEADS: what that slug MEANT, resolved server-side from the
    # EnquiryMessage row whose `key` matches it and frozen here.
    #
    # Denormalised deliberately. The Back Office can rename or retire a button
    # at any time, and an enquiry that then reads "which button? the one that
    # no longer exists" is useless to the host chasing it. A snapshot keeps the
    # lead meaningful for as long as the lead matters, not for as long as the
    # button does.
    #
    # Blank when `source` matches no EnquiryMessage -- see the note on
    # SOURCE_MAX above: an unrecognised slug is still recorded rather than
    # refused, because losing a real lead over a new button is the worse
    # failure. Back Office can show the raw slug in that case.
    button_label = models.CharField(max_length=120, blank=True)
    section = models.CharField(max_length=200, blank=True)

    # Where they came from. Campaign attribution matters most for exactly this
    # table: it is the only place that connects ad spend to somebody actually
    # asking to talk.
    referrer = models.CharField(max_length=500, blank=True)
    utm_source = models.CharField(max_length=150, blank=True)
    utm_medium = models.CharField(max_length=150, blank=True)
    utm_campaign = models.CharField(max_length=150, blank=True, db_index=True)
    utm_content = models.CharField(max_length=150, blank=True)
    utm_term = models.CharField(max_length=150, blank=True)

    # Identity for a visitor who has not signed in. `anonymous_id` is the id
    # analytics already keeps in localStorage, so the same browser is
    # recognisable across presses; `session_key` bounds the dedupe window.
    # Neither identifies a person and neither is shown in Back Office.
    anonymous_id = models.CharField(max_length=64, blank=True, db_index=True)
    session_key = models.CharField(max_length=64, blank=True, db_index=True)

    # Pressing the same button twice because the first press did not seem to
    # do anything is one intent, not two leads. The repeat bumps this instead
    # of inserting -- see the view's _resolve() for the full reasoning.
    click_count = models.PositiveIntegerField(default=1)
    first_clicked_at = models.DateTimeField(null=True, blank=True)
    last_clicked_at = models.DateTimeField(null=True, blank=True)

    # The number they were handed to, resolved per country by the frontend
    # (Sri Lanka gets the local one, everywhere else the default). Stored so a
    # lead can be traced to the desk that should have received it.
    destination_number = models.CharField(max_length=32, blank=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="whatsapp_enquiries",
    )

    # 20, not 12: "message_received" is 16 characters. Widened when the
    # reserved Cloud API state was added, so the column already fits it and a
    # future webhook needs no schema change on a table that will by then be
    # large.
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_NEW, db_index=True,
    )
    # Staff-only. Absent from the public serializer entirely, not merely
    # hidden by the UI.
    admin_note = models.TextField(blank=True)

    # Throttling and abuse review only, exactly as ExperienceEnquiry treats
    # it: never displayed, never used to identify anyone.
    submitted_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    country_code = models.CharField(max_length=8, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "WhatsApp enquiries"
        indexes = [
            models.Index(fields=["status", "-created_at"], name="waenq_status_idx"),
            # The three questions Back Office asks of this list, beyond status:
            # "what came in today", "which buttons are working", and "did this
            # campaign produce anything".
            models.Index(fields=["-created_at"], name="waenq_created_idx"),
            models.Index(fields=["source", "-created_at"], name="waenq_source_idx"),
            models.Index(fields=["utm_campaign", "-created_at"], name="waenq_campaign_idx"),
        ]

    def __str__(self):
        return f"{self.name} — {self.whatsapp_number}"
