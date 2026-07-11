from django.db import migrations

LOCATIONS = [
    {"name": "Vietnam",     "country_code": "VN", "order": 1},
    {"name": "Macau",       "country_code": "MO", "order": 2},
    {"name": "India",       "country_code": "IN", "order": 3},
    {"name": "Sri Lanka",   "country_code": "LK", "order": 4},
    {"name": "Philippines", "country_code": "PH", "order": 5},
]


def seed_locations(apps, schema_editor):
    SupportedLocation = apps.get_model("authapp", "SupportedLocation")
    for loc in LOCATIONS:
        SupportedLocation.objects.get_or_create(name=loc["name"], defaults=loc)


def unseed_locations(apps, schema_editor):
    SupportedLocation = apps.get_model("authapp", "SupportedLocation")
    SupportedLocation.objects.filter(name__in=[l["name"] for l in LOCATIONS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0018_supportedlocation"),
    ]

    operations = [
        migrations.RunPython(seed_locations, unseed_locations),
    ]
