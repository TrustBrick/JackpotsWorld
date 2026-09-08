"""Move the Andhar Bahar hero onto the sign-up ask.

0093 changed the model DEFAULTS, which only affects a row that does not exist
yet. The singleton is created on first read and every deployment already has
one, so without this the page keeps whatever it was seeded with and the new
wording never appears.

WHAT IS AND IS NOT TOUCHED
──────────────────────────
Only fields still holding the exact previous default are moved. A value an
admin has since typed themselves is their decision and is left alone — the
column cannot tell "never edited" from "deliberately set back to the seeded
text", and of the two, silently overwriting an admin's wording is the worse
mistake.

The secondary CTA is untouched: migration 0089 pointed it at the in-page
concierge for a specific reason, and this change has nothing to do with it.
"""
from django.db import migrations

# (field, old default, new value). The old values are the ones 0085 seeded and
# 0089 left in place.
MOVES = [
    (
        "hero_subtitle",
        "One card. Two sides. A decision in seconds.",
        "Are you an Andhar Bahar player?",
    ),
    (
        "hero_description",
        "Andhar Bahar is one of the fastest and most approachable card games on an "
        "Indian casino floor. We introduce members to the partner venues that run it, "
        "so the table is ready when you arrive.",
        "If you want to know where the events are happening and where the tables are "
        "live, sign up and we will tell you. Members get the dates, the venues and a "
        "VIP host to arrange the visit.",
    ),
    (
        "hero_cta_primary_label",
        "Explore Andhar Bahar",
        "Sign Up For Updates",
    ),
    (
        "hero_cta_primary_link",
        "#andhar-bahar-events",
        "/andhar-bahar/sign-up",
    ),
]


def forwards(apps, schema_editor):
    Content = apps.get_model("authapp", "AndharBaharContent")
    row = Content.objects.filter(pk=1).first()
    if row is None:
        # Nothing to migrate — the singleton is created on first read and will
        # pick up 0093's defaults directly.
        return

    changed = []
    for field, old, new in MOVES:
        if (getattr(row, field, "") or "").strip() == old:
            setattr(row, field, new)
            changed.append(field)
    if changed:
        row.save(update_fields=changed)


def backwards(apps, schema_editor):
    Content = apps.get_model("authapp", "AndharBaharContent")
    row = Content.objects.filter(pk=1).first()
    if row is None:
        return
    changed = []
    for field, old, new in MOVES:
        if (getattr(row, field, "") or "").strip() == new:
            setattr(row, field, old)
            changed.append(field)
    if changed:
        row.save(update_fields=changed)


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0093_andhar_bahar_signup_copy"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
