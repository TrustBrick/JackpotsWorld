# Adds Kazakhstan to the homepage locations ticker (11th destination).

from django.db import migrations


def add_kazakhstan(apps, schema_editor):
    SupportedLocation = apps.get_model("authapp", "SupportedLocation")
    SupportedLocation.objects.get_or_create(
        name="Kazakhstan", defaults={"country_code": "KZ", "order": 11},
    )


def remove_kazakhstan(apps, schema_editor):
    SupportedLocation = apps.get_model("authapp", "SupportedLocation")
    SupportedLocation.objects.filter(name="Kazakhstan").delete()


class Migration(migrations.Migration):

    dependencies = [
        ('authapp', '0052_fix_armenia_location_order'),
    ]

    operations = [
        migrations.RunPython(add_kazakhstan, remove_kazakhstan),
    ]
