"""Seed the "Beyond the Casino" overview band.

Six signposts under the hero, saying in one screen that the platform is more
than a casino. Four of them point at the pillar sections this model already
owns; two point at areas it does not — offline casinos and events — because
those are established parts of the site with their own content and their own
Back Office, and duplicating them here would be the second competing system
the brief rules out. These cards LINK to them, they do not re-implement them.

OFFLINE CASINOS IS FIRST ON PURPOSE. The brief is explicit that the casino
identity must not be reduced, so it leads the band rather than being folded in
among the new pillars.

Same content discipline as 0096: no venue, operator, price, availability or
licence is named anywhere below, and the casino card says plainly that the
network is one of partners rather than of properties JackpotsWorld owns.

Reversible: drops exactly the six seeded rows and nothing else.
"""
from django.db import migrations


# (title, subtitle, description, icon, cta_link, order)
SEED = [
    (
        "Offline Casinos",
        "",
        "Play at selected casino destinations and trusted local partners "
        "across our network. We make the introduction; the venue runs the "
        "floor.",
        "Spade", "#packages", 10,
    ),
    (
        "Luxury Travel",
        "",
        "Arrive in style with private aviation arrangements, or take a curated "
        "cruise journey between destinations.",
        "Plane", "#luxury-travel", 20,
    ),
    (
        "Hotels & Resorts",
        "",
        "Stay somewhere exceptional. Rooms, suites and resorts arranged close "
        "to the destinations we introduce members to.",
        "BedDouble", "#stays", 30,
    ),
    (
        "VIP Concierge",
        "",
        "One host for travel, reservations, introductions and the ordinary "
        "problems of being somewhere unfamiliar.",
        "Crown", "#vip-concierge", 40,
    ),
    (
        "Events",
        "",
        "From poker tournaments and Teen Patti nights to destination events "
        "across the network.",
        "CalendarDays", "#events-preview", 50,
    ),
    (
        "Dining & Entertainment",
        "",
        "Restaurant tables, lounges, live music, shows and nightlife arranged "
        "around your evening.",
        "UtensilsCrossed", "#dining-entertainment", 60,
    ),
]

SEED_TITLES = [row[0] for row in SEED]


def seed(apps, schema_editor):
    Experience = apps.get_model("authapp", "Experience")
    for title, subtitle, description, icon, link, order in SEED:
        Experience.objects.get_or_create(
            category="overview",
            title=title,
            defaults={
                "subtitle": subtitle,
                "description": description,
                "icon_name": icon,
                "cta_text": "Explore",
                "cta_link": link,
                "display_order": order,
                "is_active": True,
                # Signposts, not services: nothing to enquire about here, the
                # card sends you to the section that has the enquiry buttons.
                "enquiry_key": "",
                "partner": "",
                "city": "",
            },
        )


def unseed(apps, schema_editor):
    Experience = apps.get_model("authapp", "Experience")
    # Scoped to the overview category as well as the titles, so a pillar card
    # an admin happened to name "Events" is never collateral.
    Experience.objects.filter(category="overview", title__in=SEED_TITLES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0097_experience_overview_category"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
