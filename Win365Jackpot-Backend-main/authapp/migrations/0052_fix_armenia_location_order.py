# "Armenia" already existed in some deployments (added manually via the
# Manage Locations admin panel before this app-wide 10-location rollout,
# order=6), which meant 0051's get_or_create() correctly left it alone
# rather than overwrite admin data - but that leaves it out of the intended
# ticker sequence (Vietnam..Philippines, Las Vegas, Malaysia, Singapore,
# Armenia, Georgia). This aligns its order with that sequence.

from django.db import migrations


def fix_order(apps, schema_editor):
    SupportedLocation = apps.get_model("authapp", "SupportedLocation")
    SupportedLocation.objects.filter(name="Armenia", order=6).update(order=9)


def revert_order(apps, schema_editor):
    SupportedLocation = apps.get_model("authapp", "SupportedLocation")
    SupportedLocation.objects.filter(name="Armenia", order=9).update(order=6)


class Migration(migrations.Migration):

    dependencies = [
        ('authapp', '0051_update_supported_locations'),
    ]

    operations = [
        migrations.RunPython(fix_order, revert_order),
    ]
