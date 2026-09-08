"""Give held customers a 120-second ceiling.

`max_hold_seconds` shipped as 0 — "no limit" — and nothing enforced it anyway
until `sweep_expired_calls` started driving `sweep_expired_holds()`. With the
sweep now running every minute, the value finally means something, so it gets
a real one: 120 seconds.

WHAT THIS TOUCHES, AND WHAT IT CANNOT TELL APART
────────────────────────────────────────────────
Only rows still holding 0 are moved. 0 is both "nobody ever configured this"
and "an admin deliberately chose no limit" — the column cannot distinguish
them, so an environment where someone genuinely wanted unlimited holds will be
moved to 120 as well and has to set 0 again in the Back Office (Live Support
Settings → Maximum hold). That is the safer direction of the two: the failure
mode of this migration is a hold that ends after two minutes, and the failure
mode of skipping it is a customer left on hold indefinitely by a crashed tab.
"""

from django.db import migrations, models


NEW_LIMIT = 120


def apply_default_hold_limit(apps, schema_editor):
    Settings = apps.get_model("authapp", "VoiceCallSettings")
    Settings.objects.filter(max_hold_seconds=0).update(max_hold_seconds=NEW_LIMIT)


def restore_no_limit(apps, schema_editor):
    Settings = apps.get_model("authapp", "VoiceCallSettings")
    Settings.objects.filter(max_hold_seconds=NEW_LIMIT).update(max_hold_seconds=0)


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0089_andhar_bahar_vip_host_cta"),
    ]

    operations = [
        migrations.AlterField(
            model_name="voicecallsettings",
            name="max_hold_seconds",
            field=models.PositiveIntegerField(default=120),
        ),
        migrations.RunPython(apply_default_hold_limit, restore_no_limit),
    ]
