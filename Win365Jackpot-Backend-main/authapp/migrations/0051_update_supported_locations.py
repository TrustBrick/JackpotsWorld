# Extends the homepage locations ticker from 5 to 10 destinations, and
# clarifies "India" to "India (Goa)" to match the destination it represents.

from django.db import migrations

NEW_LOCATIONS = [
    {"name": "Las Vegas", "country_code": "US", "order": 6},
    {"name": "Malaysia",  "country_code": "MY", "order": 7},
    {"name": "Singapore", "country_code": "SG", "order": 8},
    {"name": "Armenia",   "country_code": "AM", "order": 9},
    {"name": "Georgia",   "country_code": "GE", "order": 10},
]


def extend_locations(apps, schema_editor):
    SupportedLocation = apps.get_model("authapp", "SupportedLocation")
    # Only touch the row if it still has its originally-seeded name, so an
    # admin's own edit via the Manage Locations panel isn't clobbered.
    SupportedLocation.objects.filter(name="India").update(name="India (Goa)")
    for loc in NEW_LOCATIONS:
        SupportedLocation.objects.get_or_create(name=loc["name"], defaults=loc)


def revert_locations(apps, schema_editor):
    SupportedLocation = apps.get_model("authapp", "SupportedLocation")
    SupportedLocation.objects.filter(name="India (Goa)").update(name="India")
    SupportedLocation.objects.filter(name__in=[l["name"] for l in NEW_LOCATIONS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('authapp', '0050_fix_srilanka_top_casino_names'),
    ]

    operations = [
        migrations.RunPython(extend_locations, revert_locations),
    ]
