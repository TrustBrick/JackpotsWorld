# Retire the seeded "150% Welcome Rolling Bonus" promotion.
#
# The offer was removed from the launch seed list in
# 0005_seed_events_poker_promotions (and from scripts/data/jackpotdb_dump.sql,
# so the deploy-time dump import can't re-insert it), but databases that
# already ran that seed still hold the row — this deletes it there.
#
# Matched on title + casino rather than primary key: the row's id differs
# between a freshly seeded database and one restored from the dump.

from django.db import migrations


TITLE = "150% Welcome Rolling Bonus"
CASINO = "Deltin Royale"


def remove_promotion(apps, schema_editor):
    Promotion = apps.get_model("authapp", "Promotion")
    Promotion.objects.filter(title=TITLE, casino_name=CASINO).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0071_chat_message_attachment"),
    ]

    operations = [
        migrations.RunPython(remove_promotion, migrations.RunPython.noop),
    ]
