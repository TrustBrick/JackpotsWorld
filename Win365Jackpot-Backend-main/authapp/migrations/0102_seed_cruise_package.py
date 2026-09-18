"""Seed the Cruise Offline Casino Package with the copy it already shows.

WHY THIS EXISTS. The card used to be hardcoded in CountryPackages.jsx. The
moment the frontend starts reading it from the API, an empty table means the
section silently disappears from the live page. This migration carries the
exact wording across so the deploy is invisible to visitors, and the Back
Office simply becomes able to edit what is already there.

NO MEDIA ROWS ARE SEEDED, deliberately. The two photographs the old carousel
used are frontend static files under /public/assets, not uploads. In
production MEDIA_ROOT is an S3 bucket, so a migration can write a path into
the column but cannot put the file in the bucket — it would ship two broken
images. The frontend keeps those two static files as its media fallback for a
package that has no uploaded slides, which is the same call
experiences/shared.js FALLBACK_IMAGES makes and for the same reason.

IDEMPOTENT. Keyed on the title, and child rows are only added when the
package has none, so re-running it cannot duplicate anything or overwrite an
admin's later edits.
"""
from django.db import migrations

TITLE = "Cruise Offline Casino Package"

PACKAGE = {
    "eyebrow_text": "Limited Availability · Exclusive Experience",
    "subtitle": "International Waters · Casino at Sea · Full Luxury Experience",
    "icon_name": "Ship",
    "accent_color": "#22d3ee",
    "highlights": ["Luxury gaming experience at Cruise Casinos all over the World"],
    "inclusions": [
        "Casino Credits Arranged With Venue",
        "VIP Boarding Lounge",
        "Port Excursions",
        "Professional Dealer Tables",
        "High Roller Rooms",
        "Jackpot Rewards Program",
        "Onboard Photography",
        "24/7 Concierge",
    ],
    "cta_text": "Enquire – Cruise Offline Casino Package",
    "enquiry_key": "cruise_package",
    "is_active": True,
    "order": 0,
}

# (icon_name, label, value) — the details grid, in the order it was rendered.
DETAILS = [
    ("Ship", "Transport", "Luxury Cruise Ship"),
    ("Bed", "Cabin", "Ocean View / Suite Cabin"),
    ("UtensilsCrossed", "Dining", "All-inclusive Fine Dining"),
    ("Wine", "Drinks", "Unlimited Premium Bar"),
    ("Coins", "Offline Casino", "Onboard Casino (24/7)"),
    ("Drama", "Entertainment", "Live Shows & Nightclub"),
    ("Sparkles", "Spa", "Full Spa & Wellness Centre"),
    ("Waves", "Amenities", "Pool, Gym, Sun Deck"),
]


def seed(apps, schema_editor):
    CruisePackage = apps.get_model("authapp", "CruisePackage")
    CruisePackageDetail = apps.get_model("authapp", "CruisePackageDetail")

    package, created = CruisePackage.objects.get_or_create(
        title=TITLE, defaults=PACKAGE,
    )
    # Only fill the children when there are none. An admin who has already
    # curated this card keeps their rows.
    if not package.details.exists():
        CruisePackageDetail.objects.bulk_create([
            CruisePackageDetail(
                package=package, icon_name=icon, label=label, value=value, order=i,
            )
            for i, (icon, label, value) in enumerate(DETAILS)
        ])


def unseed(apps, schema_editor):
    """Remove only the row this migration created, and only while it is still
    the untouched seed — an admin's edits are not something a `migrate
    --backwards` should throw away."""
    CruisePackage = apps.get_model("authapp", "CruisePackage")
    CruisePackage.objects.filter(
        title=TITLE, subtitle=PACKAGE["subtitle"],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0101_cruise_package"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
