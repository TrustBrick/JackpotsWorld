"""
"Talk to a VIP Host" now opens the concierge instead of leaving the page.

The CTA shipped pointing at "/#contact" — the footer, which only the landing
page renders. Clicking it therefore left Andhar Bahar entirely, and because a
React Router route change does not act on a hash, the visitor arrived at the
TOP of the landing page: the CTA read as a redirect home.

"#vip-host" is the value the page turns into an "open-chat" event, so the
live-support concierge (mounted on every page by the navbar) opens in place.

Only rows still holding the old default are moved. A link an admin has since
typed themselves is their decision and is left exactly as it is.
"""

from django.db import migrations, models


OLD_DEFAULT = "/#contact"
NEW_DEFAULT = "#vip-host"


def point_cta_at_the_concierge(apps, schema_editor):
    Content = apps.get_model("authapp", "AndharBaharContent")
    Content.objects.filter(hero_cta_secondary_link=OLD_DEFAULT).update(
        hero_cta_secondary_link=NEW_DEFAULT
    )


def restore_the_footer_link(apps, schema_editor):
    Content = apps.get_model("authapp", "AndharBaharContent")
    Content.objects.filter(hero_cta_secondary_link=NEW_DEFAULT).update(
        hero_cta_secondary_link=OLD_DEFAULT
    )


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0088_offline_deposit_game"),
    ]

    operations = [
        migrations.AlterField(
            model_name="andharbaharcontent",
            name="hero_cta_secondary_link",
            field=models.CharField(default="#vip-host", max_length=200),
        ),
        migrations.RunPython(point_cta_at_the_concierge, restore_the_footer_link),
    ]
