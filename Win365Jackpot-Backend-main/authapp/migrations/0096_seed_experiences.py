"""Seed the VIP destination pillars with SERVICE-LEVEL copy.

WHAT THESE ROWS ARE, AND WHAT THEY ARE CAREFULLY NOT
─────────────────────────────────────────────────────────────────────────────
Every row below describes a kind of arrangement JackpotsWorld makes through
its network. Not one of them names a hotel, an airline, an operator, a
restaurant, a ship or a venue; not one quotes a price, a duration, an
availability or a licence; and not one claims JackpotsWorld owns or operates
anything. That is the whole discipline of this file — the business fills in
real partners from Back Office as arrangements are actually signed, and until
then the page says what it can honestly say.

The wording is checked by authapp/tests_landing_wording.py, which fails the
build on the class of claim this file must never make.

Reversible: the reverse drops exactly the seeded keys and nothing else, so an
admin's own rows are never collateral.
"""
from django.db import migrations


# (category, title, subtitle, description, icon_name, enquiry_key, order)
SEED_EXPERIENCES = [
    # ── §8 LUXURY TRAVEL ────────────────────────────────────────────────────
    (
        "luxury_travel",
        "Private Jet Travel",
        "Arrive on your schedule",
        "Private aviation arranged around your destination and your timing, "
        "rather than around a published timetable. Tell us where you are "
        "going and when, and a VIP host coordinates the aircraft, the crew "
        "and the ground arrangements through our network.",
        "Plane", "experience_private_jet", 10,
    ),
    (
        "luxury_travel",
        "Cruise Journeys",
        "Several destinations, one journey",
        "Curated cruise journeys combining exceptional destinations, "
        "hospitality and onboard experiences. We arrange the itinerary, the "
        "cabin and the transfers at each end so the trip is planned as one "
        "piece rather than several bookings.",
        "Ship", "cruise_package", 20,
    ),

    # ── §9 HOTELS & RESORTS ─────────────────────────────────────────────────
    (
        "stay",
        "Hotels & Resorts",
        "Stay somewhere exceptional",
        "Rooms and suites arranged at selected properties close to the "
        "destinations we introduce members to, so an evening at the tables "
        "does not end with a long drive.",
        "BedDouble", "experience_stay", 10,
    ),
    (
        "stay",
        "Suites & Private Villas",
        "More space, more privacy",
        "For longer stays or travelling groups, we arrange larger "
        "accommodation with private space — the kind of stay that works when "
        "the trip is about more than one night out.",
        "Home", "experience_stay", 20,
    ),
    (
        "stay",
        "Arrival & Departure Nights",
        "Travel days that are not spent in transit",
        "Stays arranged around the shape of your itinerary, including the "
        "nights either side of a long flight, so arriving and leaving are "
        "part of the trip rather than an afterthought.",
        "Building2", "experience_stay", 30,
    ),

    # ── §11 DINING & ENTERTAINMENT ──────────────────────────────────────────
    (
        "dining",
        "Fine Dining",
        "Tables worth planning around",
        "Reservations arranged at restaurants near your destination, "
        "including the ones that are difficult to get into at short notice. "
        "Tell your host the occasion and the party size.",
        "UtensilsCrossed", "experience_dining", 10,
    ),
    (
        "dining",
        "Premium Lounges",
        "Somewhere quieter",
        "Access to lounge and club settings arranged through our network — "
        "for the part of the evening that is about conversation rather than "
        "the floor.",
        "Martini", "experience_dining", 20,
    ),
    (
        "dining",
        "Live Music",
        "The room, not the recording",
        "Live sets and resident performances at venues around our "
        "destinations, arranged alongside the rest of your evening.",
        "Music", "experience_dining", 30,
    ),
    (
        "dining",
        "Shows & Performances",
        "An evening with a headline",
        "Seats arranged for stage shows, residencies and destination "
        "performances, coordinated with your travel and dining so the night "
        "runs in order.",
        "Drama", "experience_dining", 40,
    ),
    (
        "dining",
        "Nightlife",
        "After the tables",
        "Introductions to the nightlife around each destination, arranged by "
        "a host who knows which rooms suit which evening.",
        "Sparkles", "experience_dining", 50,
    ),

    # ── §12 VIP CONCIERGE ───────────────────────────────────────────────────
    (
        "concierge",
        "Travel Arrangements",
        "Flights, transfers and timing",
        "Your host plans the route, the connections and the transfers, and "
        "keeps the itinerary in one place rather than across several "
        "confirmations.",
        "Plane", "experience_concierge", 10,
    ),
    (
        "concierge",
        "Casino Introductions",
        "Arriving as an expected guest",
        "We introduce members to partner venues at each destination, so you "
        "arrive known to the host rather than as a walk-in. The venue "
        "provides the gaming; we provide the introduction.",
        "Crown", "experience_concierge", 20,
    ),
    (
        "concierge",
        "Dining & Event Reservations",
        "Booked before you land",
        "Restaurant tables, event seats and evening plans arranged in advance "
        "and adjusted while you are there if the trip changes shape.",
        "CalendarDays", "experience_concierge", 30,
    ),
    (
        "concierge",
        "Airport Transfers",
        "From the aircraft to the room",
        "Ground transport arranged at both ends, timed to your actual arrival "
        "rather than your scheduled one.",
        "Car", "experience_concierge", 40,
    ),
    (
        "concierge",
        "Destination Assistance",
        "Someone to ask",
        "A point of contact for the ordinary problems of being somewhere "
        "unfamiliar — a change of plan, a question about a venue, a "
        "reservation that needs moving.",
        "Headset", "experience_concierge", 50,
    ),
]

SEED_TITLES = [row[1] for row in SEED_EXPERIENCES]


# WhatsApp templates for the new pillars, in the same table and the same shape
# every other enquiry button on the site already uses. `cruise_package` is
# absent because it already exists (migration 0069) and is reused as-is.
SEED_ENQUIRY_MESSAGES = [
    (
        "experience_private_jet",
        "Private Jet Enquiry",
        "Luxury Travel section — private aviation card.",
        "Hi! I'd like to enquire about *Private Jet Travel* arrangements. "
        "Please share more details.",
        "",
    ),
    (
        "experience_stay",
        "Hotels & Resorts Enquiry",
        "Hotels & Resorts section.",
        "Hi! I'd like to enquire about *{experience}* arrangements. "
        "Please share more details.",
        "experience",
    ),
    (
        "experience_dining",
        "Dining & Entertainment Enquiry",
        "Dining & Entertainment section.",
        "Hi! I'd like to enquire about *{experience}* at one of your "
        "destinations. Please share more details.",
        "experience",
    ),
    (
        "experience_concierge",
        "VIP Concierge Enquiry",
        "VIP Concierge section.",
        "Hi! I'd like to speak to a VIP host about *{experience}*. "
        "Please get in touch.",
        "experience",
    ),
]

SEED_ENQUIRY_KEYS = [row[0] for row in SEED_ENQUIRY_MESSAGES]


def seed(apps, schema_editor):
    Experience = apps.get_model("authapp", "Experience")
    EnquiryMessage = apps.get_model("authapp", "EnquiryMessage")

    for key, label, description, template, placeholders in SEED_ENQUIRY_MESSAGES:
        # get_or_create, not update_or_create: if an admin has already reworded
        # one of these, this migration must not overwrite their text.
        EnquiryMessage.objects.get_or_create(
            key=key,
            defaults={
                "label": label,
                "description": description,
                "template": template,
                "placeholders": placeholders,
                "is_active": True,
                "order": 100,
            },
        )

    for category, title, subtitle, description, icon, enquiry_key, order in SEED_EXPERIENCES:
        Experience.objects.get_or_create(
            category=category,
            title=title,
            defaults={
                "subtitle": subtitle,
                "description": description,
                "icon_name": icon,
                "enquiry_key": enquiry_key,
                "display_order": order,
                "is_active": True,
                # Blank on purpose — see the module docstring. A seeded row
                # names no partner and claims no place.
                "partner": "",
                "city": "",
                "cta_text": "Enquire Now",
            },
        )


def unseed(apps, schema_editor):
    Experience = apps.get_model("authapp", "Experience")
    EnquiryMessage = apps.get_model("authapp", "EnquiryMessage")

    # Only the rows this migration created, matched the same way it created
    # them. An admin's own cards and messages are untouched.
    Experience.objects.filter(title__in=SEED_TITLES).delete()
    EnquiryMessage.objects.filter(key__in=SEED_ENQUIRY_KEYS).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0095_experiences"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
