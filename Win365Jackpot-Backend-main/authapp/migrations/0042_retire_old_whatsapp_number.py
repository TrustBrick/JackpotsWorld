"""Retire the old enquiry WhatsApp number.

The number is being removed from the product entirely, so changing the model
default isn't enough on its own: any LandingSettings row already saved with it
would keep serving it through /api/landing-settings/. This rewrites those rows
as well.

Enquiry buttons no longer read this field at all — routing is decided per
visitor in the frontend (see services/enquiryContact.js: Sri Lanka gets the
local number, every other country gets the default). The field is kept because
the admin panel still exposes it, but it must not hold the retired number.
"""
from django.db import migrations, models

OLD_NUMBER = "917795281999"
NEW_NUMBER = "919573807779"


def replace_retired_number(apps, schema_editor):
    LandingSettings = apps.get_model("authapp", "LandingSettings")
    LandingSettings.objects.filter(whatsapp_number=OLD_NUMBER).update(
        whatsapp_number=NEW_NUMBER
    )


def noop(apps, schema_editor):
    """Reverse is a no-op on purpose — restoring the retired number is exactly
    what this migration exists to prevent. The schema change still reverses."""


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0041_supportticket_is_live_chat_chatmessage"),
    ]

    operations = [
        migrations.AlterField(
            model_name="landingsettings",
            name="whatsapp_number",
            field=models.CharField(default=NEW_NUMBER, max_length=20),
        ),
        migrations.RunPython(replace_retired_number, noop),
    ]
