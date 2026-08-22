# -*- coding: utf-8 -*-
"""Admin-managed WhatsApp enquiry messages.

The seed rows are the exact strings the React components used before this
migration, copied across verbatim. That is deliberate: applying this migration
must not change what any enquiry button sends. It moves the text from source
code to a table, and only an admin editing a row afterwards changes behaviour.

get_or_create on `key` rather than bulk insert, so re-running against a
database that already has these rows -- a re-deploy, a restored dump -- leaves
existing text alone instead of resetting an admin's edits back to the default.

The reverse deletes only the keys seeded here. A row an admin added later has
a key that is not in this list and survives a rollback.
"""
from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


# key, label, description, template, placeholders, order
SEED = [
    (
        "tour_packages_general",
        "General Tour Package Enquiry",
        "Landing page: 'Chat About VIP Services' and 'Chat with a VIP Consultant'",
        "Hi! I'm interested in your Offline Casino Tour Packages. Please share more details.",
        "",
        10,
    ),
    (
        "tour_package_named",
        "Named Package / Destination Enquiry",
        "Landing page: per-package and per-country enquiry buttons",
        "Hi! I'm interested in the *{package}* Offline Casino Tour Package. Please share more details.",
        "package",
        20,
    ),
    (
        "cruise_package",
        "Cruise Package Enquiry",
        "Landing page: the Cruise Offline Casino Package block",
        "Hi! I'm interested in the *Cruise Offline Casino Package*. Please share more details.",
        "",
        30,
    ),
    (
        "footer_general",
        "Footer Contact Enquiry",
        "Site footer: the general 'get in touch' WhatsApp link",
        "Hi! I'd like to get in touch with Jackpots World \U0001F3B0",
        "",
        40,
    ),
    (
        "floating_button",
        "Floating Contact Button",
        "Site-wide: the floating WhatsApp / Telegram button, bottom right",
        "Hi! I'm interested in a casino package from jackpotsworld.com 🎰 Please help me!",
        "",
        45,
    ),
    (
        "package_purchase",
        "Package Purchase Enquiry",
        "Player dashboard: the purchase button on each tour package",
        "Hi! I'm interested in purchasing the *{package}* Offline Casino Tour Package ({price}). Please share more details.",
        "package,price",
        50,
    ),
]


def seed(apps, schema_editor):
    EnquiryMessage = apps.get_model("authapp", "EnquiryMessage")
    for key, label, description, template, placeholders, order in SEED:
        EnquiryMessage.objects.get_or_create(
            key=key,
            defaults={
                "label": label,
                "description": description,
                "template": template,
                "placeholders": placeholders,
                "order": order,
                "is_active": True,
            },
        )


def unseed(apps, schema_editor):
    EnquiryMessage = apps.get_model("authapp", "EnquiryMessage")
    EnquiryMessage.objects.filter(key__in=[row[0] for row in SEED]).delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("authapp", "0068_seed_teen_patti_events"),
    ]

    operations = [
        migrations.CreateModel(
            name="EnquiryMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.SlugField(max_length=60, unique=True)),
                ("label", models.CharField(max_length=120)),
                ("description", models.CharField(blank=True, help_text="Where this button appears, shown to the admin editing it.", max_length=200)),
                ("template", models.TextField(help_text="The WhatsApp message. May contain {placeholders} listed below.")),
                ("placeholders", models.CharField(blank=True, help_text="Comma-separated placeholder names this message may use, e.g. package,price", max_length=200)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="enquiry_messages_updated", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["order", "key"]},
        ),
        migrations.RunPython(seed, unseed),
    ]
