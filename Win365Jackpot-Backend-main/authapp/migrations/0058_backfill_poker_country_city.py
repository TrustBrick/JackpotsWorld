"""
Backfills PokerTournament.country / .city from the pre-existing free-text
`location` column, so the new country/city filters work on events that were
created before those columns existed.

Conservative by design:
  • Only touches rows where `country` is still blank — never overwrites a
    value a source or an admin already set.
  • Only splits a location shaped exactly "City, Country" (one comma). Values
    like "Online — hosted via GGNetwork" have no country to extract and are
    left alone rather than guessed at, per the "never invent data" rule.
  • `location` itself is left untouched, so every existing card renders
    exactly as before.

Reversible: the reverse operation clears only the values this migration could
have set, leaving `location` intact either way.
"""
from django.db import migrations


def split_location(apps, schema_editor):
    PokerTournament = apps.get_model("authapp", "PokerTournament")

    for tournament in PokerTournament.objects.filter(country="").exclude(location=""):
        parts = [p.strip() for p in tournament.location.split(",")]
        if len(parts) != 2 or not all(parts):
            continue
        city, country = parts
        tournament.city = city[:100]
        tournament.country = country[:100]
        tournament.save(update_fields=["city", "country"])


def clear_split(apps, schema_editor):
    """Only clears rows whose city/country still exactly reconstruct their
    `location` — anything edited since is left as the admin left it."""
    PokerTournament = apps.get_model("authapp", "PokerTournament")

    for tournament in PokerTournament.objects.exclude(country="").exclude(location=""):
        if f"{tournament.city}, {tournament.country}" == tournament.location.strip():
            tournament.city = ""
            tournament.country = ""
            tournament.save(update_fields=["city", "country"])


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0057_poker_sources_review_and_change_history"),
    ]

    operations = [
        migrations.RunPython(split_location, clear_split),
    ]
