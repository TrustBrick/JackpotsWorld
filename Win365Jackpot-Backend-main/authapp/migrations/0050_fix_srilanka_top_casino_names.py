# Generated for the Casino Destinations "Top Casinos" name correction:
#   Bally's Colombo -> Bally's Casino
#   Marina           -> Marina Casino
#   Ballagio         -> Bellagio Casino

from django.db import migrations

OLD_CASINOS_TEXT = "Bally's Colombo, Marina, Ballagio, Majestic Pride, City of Dreams"
NEW_CASINOS_TEXT = "Bally's Casino, Marina Casino, Bellagio Casino, Majestic Pride, City of Dreams"


def fix_names(apps, schema_editor):
    Destination = apps.get_model("authapp", "Destination")
    # Only touch the row if it still has the originally-seeded text, so an
    # admin's own edit via the Manage Destinations panel isn't clobbered.
    Destination.objects.filter(name="Sri Lanka", casinos_text=OLD_CASINOS_TEXT).update(casinos_text=NEW_CASINOS_TEXT)


def revert_names(apps, schema_editor):
    Destination = apps.get_model("authapp", "Destination")
    Destination.objects.filter(name="Sri Lanka", casinos_text=NEW_CASINOS_TEXT).update(casinos_text=OLD_CASINOS_TEXT)


class Migration(migrations.Migration):

    dependencies = [
        ('authapp', '0049_merge_20260810_1347'),
    ]

    operations = [
        migrations.RunPython(fix_names, revert_names),
    ]
