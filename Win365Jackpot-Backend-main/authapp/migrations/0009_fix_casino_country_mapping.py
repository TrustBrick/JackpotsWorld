# Corrects the Casino reference table. Migration 0004 seeded every casino
# name into every country (a placeholder cross-join). This replaces that
# with the real country -> casino mapping, so the "Select Casino" dropdown
# only ever shows casinos that actually belong to the selected country.
# Location is intentionally not used to disambiguate — country + name is
# the identity (matches Casino.Meta.unique_together), and the same brand
# can legitimately operate in more than one country (e.g. "City of Dreams").

from django.db import migrations

COUNTRY_CASINOS = {
    "Sri Lanka": [
        "Ballys Casino", "Bellagio Casino", "Casino Marina",
        "Majestic Pride", "City of Dreams",
    ],
    "India": [
        "Deltin Royale", "Deltin Jaqk", "Big Daddy", "Majestic Pride",
        "Casino Pride", "Kings Casino", "Atlantiz", "Ocean 7",
        "Phoenix Casino", "Majestic Neo", "Gold Casino", "Mahjong",
        "Deltin Denzong",
    ],
    "Vietnam": [
        "Casino Corona", "Casino Grand", "Casino Crown",
    ],
    "Macau": [
        "Wynn Palace", "City of Dreams", "The Parisian", "The Venetian",
        "Galaxy", "MGM", "Sands Macao", "Grand Lisboa", "Wynn Macau",
        "StarWorld", "L'Arc",
    ],
    "Philippines": [
        "Okada Manila", "Solaire Resorts & Casino", "City of Dreams",
        "Resorts World",
    ],
}


def apply_correct_mapping(apps, schema_editor):
    Casino = apps.get_model("authapp", "Casino")
    Casino.objects.all().delete()
    rows = [
        Casino(country=country, name=name, is_active=True)
        for country, names in COUNTRY_CASINOS.items()
        for name in names
    ]
    Casino.objects.bulk_create(rows, ignore_conflicts=True)


def revert_to_old_seed(apps, schema_editor):
    # Best-effort revert: just clear it back out. The original 0004
    # cross-join seed is not worth restoring — it was the bug.
    Casino = apps.get_model("authapp", "Casino")
    Casino.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0008_alter_activitylog_action"),
    ]

    operations = [
        migrations.RunPython(apply_correct_mapping, revert_to_old_seed),
    ]
