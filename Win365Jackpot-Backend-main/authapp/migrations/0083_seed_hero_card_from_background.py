# -*- coding: utf-8 -*-
"""Give each section a `hero_card` row so the media card stops sharing the
watermark's row.

Until now the Poker and Teen Patti heroes had ONE SectionMedia row per section
(`background`). The watermark read it, and so did the framed media card, so
the same clip played dimmed behind the copy and full-strength in the card on
the same screen -- and no Back Office edit could separate them, because there
was only one row to edit.

`hero_card` (added in 0082) is the card's own slot. This migration creates
that row for each section, seeded with the file the background row is already
using.

WHY SEED A COPY RATHER THAN LEAVE IT EMPTY

An empty `hero_card` row would send the card to the bundled fallback in
config/heroWatermarks.js -- poker-watermark.mp4 at CRF 34, vip-lounge.mp4 at
640x360. Both were encoded to be invisible under a 0.28-opacity watermark and
look soft at card size. Deploying that would make the live page visibly worse
until someone uploaded a replacement, which is not a reasonable thing for a
migration to do on its own.

Copying the background file means day one looks exactly as it does today, and
the admin then has two independent rows: change the card's video whenever they
like, and the watermark is unaffected. The two rows reference the same file
until that happens -- Django does not delete files on row delete, so neither
row can pull the file out from under the other.

A section with no background row, or one whose background row carries no
media, gets nothing: there is no file to copy and a blank row would only
render an empty frame.

Reversing deletes the hero_card rows this created. It matches on slot alone,
so a card row an admin has since re-uploaded is removed too -- that is the
honest reverse of "this migration introduced the slot", and the background row
it was copied from is untouched either way.
"""
from django.db import migrations


def seed_hero_card(apps, schema_editor):
    SectionMedia = apps.get_model("authapp", "SectionMedia")

    for section in ("poker", "teen_patti"):
        # Already has its own card row (a re-run, or an admin got there first).
        if SectionMedia.objects.filter(section=section, slot="hero_card").exists():
            continue

        background = SectionMedia.objects.filter(
            section=section, slot="background",
        ).first()
        if background is None:
            continue

        # `.name` is the stored path, not the file: assigning it points the new
        # row at the same object in storage without re-uploading anything.
        video_name = background.video.name if background.video else ""
        poster_name = background.poster_image.name if background.poster_image else ""
        if not video_name and not poster_name:
            continue

        SectionMedia.objects.create(
            section=section,
            slot="hero_card",
            label=background.label,
            video=video_name,
            poster_image=poster_name,
            # Inherits the background row's state: if an admin had the section's
            # media switched off, turning it on is not this migration's call.
            is_active=background.is_active,
        )


def drop_hero_card(apps, schema_editor):
    SectionMedia = apps.get_model("authapp", "SectionMedia")
    SectionMedia.objects.filter(slot="hero_card").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0082_section_media_hero_card_slot"),
    ]

    operations = [
        migrations.RunPython(seed_hero_card, drop_hero_card),
    ]
