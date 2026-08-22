# -*- coding: utf-8 -*-
"""Standard support wording from the Call & Live Chat Script Manual v1.0.

Seeded verbatim from the manual, section by section. The greeting is the only
row flagged is_auto_send -- see the model docstring for why. Everything else is
wording an agent chooses to send.

get_or_create on `key`, so re-running never overwrites an admin's edit. The
reverse removes only the keys seeded here.
"""
from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


# key, label, body, source_section, is_auto_send, order
SEED = [
    (
        "greeting",
        "Live Chat Greeting",
        "Hello! Welcome to Jackpots World VIP Support. How can I help you today?",
        "Manual s.5 / s.35 - Standard Live Chat Opening",
        True,
        10,
    ),
    (
        "waiting",
        "Waiting",
        "Please give me a moment while I check the details for you.",
        "Manual s.26 / s.35 - Chat Waiting Script",
        False,
        20,
    ),
    (
        "checking",
        "Checking",
        "Thank you for waiting. I'm checking the available information now.",
        "Manual s.19 / s.35",
        False,
        30,
    ),
    (
        "verified",
        "Verified",
        "Thank you for confirming. I have verified your [REQUIRED ACCOUNT INFORMATION].",
        "Manual s.35 - Quick Reference Script Library",
        False,
        40,
    ),
    (
        "need_information",
        "Need More Information",
        "Could you please confirm your [REQUIRED ACCOUNT INFORMATION] so I can check this for you?",
        "Manual s.35 - Quick Reference Script Library",
        False,
        50,
    ),
    (
        "status_update",
        "Status Update",
        "I have checked, and current status is showing as [STATUS].",
        "Manual s.29 / s.35 - Status Update",
        False,
        60,
    ),
    (
        "unknown_answer",
        "Unknown Answer",
        "I want to make sure I give you the correct information. Let me verify that before I confirm anything.",
        "Manual s.22 / s.35 - Unknown Answer",
        False,
        70,
    ),
    (
        "angry_customer",
        "Upset Customer",
        "I understand your concern. Let me check current information for you right away.",
        "Manual s.20 / s.35 - Angry Customer",
        False,
        80,
    ),
    (
        "escalation",
        "Escalation",
        "I've checked available information, but this requires further checking. "
        "I'll have it reviewed through appropriate internal process.",
        "Manual s.23 / s.35 - Escalation",
        False,
        90,
    ),
    (
        "closing",
        "Live Chat Closing",
        "Is there anything else I can help you with today? "
        "Thank you for contacting Jackpots World VIP Support.",
        "Manual s.31 / s.35 - Live Chat Closing",
        False,
        100,
    ),
]


def seed(apps, schema_editor):
    SupportScript = apps.get_model("authapp", "SupportScript")
    for key, label, body, source, auto, order in SEED:
        SupportScript.objects.get_or_create(
            key=key,
            defaults={
                "label": label,
                "body": body,
                "source_section": source,
                "is_auto_send": auto,
                "order": order,
                "is_active": True,
            },
        )


def unseed(apps, schema_editor):
    SupportScript = apps.get_model("authapp", "SupportScript")
    SupportScript.objects.filter(key__in=[row[0] for row in SEED]).delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("authapp", "0069_enquiry_message"),
    ]

    operations = [
        migrations.CreateModel(
            name="SupportScript",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.SlugField(max_length=60, unique=True)),
                ("label", models.CharField(max_length=120)),
                ("body", models.TextField()),
                ("source_section", models.CharField(blank=True, max_length=120)),
                ("is_auto_send", models.BooleanField(default=False, help_text="Send automatically when a live chat session opens. Only the greeting should have this.")),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="support_scripts_updated", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["order", "key"]},
        ),
        migrations.RunPython(seed, unseed),
    ]
