# -*- coding: utf-8 -*-
"""The hero watermark and the hero media card must stay two separate,
independently manageable SectionMedia rows.

They were one row (`background`) read by both surfaces, so the same clip
played dimmed behind the hero copy AND full-strength in the card on the same
screen -- and no Back Office edit could tell them apart, because there was only
one row to edit. Migration 0082 added the `hero_card` slot; 0083 seeded it from
each section's existing background row so the live page did not change
appearance on deploy.

Two groups:
  * the seed migration, against a fixture that mimics a real install. A fresh
    database has NO SectionMedia rows -- 0023 never seeded any -- so the
    fixture supplies the one `background` row per section that production has.
  * the actual Back Office endpoints, driven the way the admin UI drives them.
"""
from importlib import import_module

from django.apps import apps as global_apps
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models.landing_models import SectionMedia

seed_mod = import_module("authapp.migrations.0083_seed_hero_card_from_background")

POKER_ADMIN = "/api/admin-panel/section-media/poker/"


def clip(name):
    """A byte-sized .mp4. The video validator gates on extension and size, not
    on decodability (it has no video processing dependency), so this is enough
    to satisfy a real upload."""
    return SimpleUploadedFile(
        name, bytes([0, 0, 0, 24]) + b"ftypmp42", content_type="video/mp4",
    )


class HeroCardSeedMigrationTests(TestCase):

    def setUp(self):
        SectionMedia.objects.all().delete()
        for section in ("poker", "teen_patti"):
            SectionMedia.objects.create(
                section=section, slot="background",
                label="FEATURED",
                video=f"landing/section_media/{section}-backdrop.mp4",
                poster_image=f"landing/section_media/posters/{section}.jpg",
                is_active=True,
            )
        seed_mod.seed_hero_card(global_apps, None)

    def test_both_sections_gain_a_card_row(self):
        for section in ("poker", "teen_patti"):
            slots = set(
                SectionMedia.objects.filter(section=section)
                .values_list("slot", flat=True)
            )
            self.assertEqual(slots, {"background", "hero_card"}, section)

    def test_seeded_card_points_at_the_background_file(self):
        """Day one looks identical rather than dropping to the bundled asset,
        which was encoded to be invisible under a watermark and looks soft at
        card size."""
        for section in ("poker", "teen_patti"):
            bg = SectionMedia.objects.get(section=section, slot="background")
            card = SectionMedia.objects.get(section=section, slot="hero_card")
            self.assertEqual(card.video.name, bg.video.name, section)
            self.assertEqual(card.poster_image.name, bg.poster_image.name, section)

    def test_rows_are_independent(self):
        card = SectionMedia.objects.get(section="teen_patti", slot="hero_card")
        bg = SectionMedia.objects.get(section="teen_patti", slot="background")
        self.assertNotEqual(card.pk, bg.pk)

        card.video = "landing/section_media/a-different-clip.mp4"
        card.label = "CARD ONLY"
        card.save()

        bg.refresh_from_db()
        self.assertNotEqual(bg.video.name, card.video.name)
        self.assertNotEqual(bg.label, "CARD ONLY")

    def test_card_delete_leaves_watermark(self):
        SectionMedia.objects.filter(section="poker", slot="hero_card").delete()
        self.assertTrue(
            SectionMedia.objects.filter(section="poker", slot="background").exists())

    def test_one_card_row_per_section(self):
        """unique_together must still stop a duplicate card row."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                SectionMedia.objects.create(section="poker", slot="hero_card")

    def test_rerun_is_idempotent(self):
        seed_mod.seed_hero_card(global_apps, None)
        self.assertEqual(SectionMedia.objects.filter(slot="hero_card").count(), 2)

    def test_reverse_removes_only_card_rows(self):
        seed_mod.drop_hero_card(global_apps, None)
        self.assertEqual(SectionMedia.objects.filter(slot="hero_card").count(), 0)
        self.assertEqual(SectionMedia.objects.filter(slot="background").count(), 2)

    def test_section_without_background_gets_nothing(self):
        """No file to copy, and a blank row would only render an empty frame."""
        SectionMedia.objects.all().delete()
        seed_mod.seed_hero_card(global_apps, None)
        self.assertEqual(SectionMedia.objects.count(), 0)

    def test_hero_card_is_an_offered_choice(self):
        self.assertIn("hero_card", dict(SectionMedia.SLOT_CHOICES))


class AdminSlotCrudTests(TestCase):
    """Create / edit / delete each slot through the endpoints the Back Office
    tabs actually call."""

    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(
            email="slotadmin@example.com", password="x",
            is_staff=True, is_superuser=True,
        )
        self.c = APIClient()
        self.c.force_authenticate(user=self.admin)
        SectionMedia.objects.all().delete()

    def _create_both(self):
        r1 = self.c.post(
            POKER_ADMIN,
            {"slot": "background", "label": "BACKDROP", "video": clip("backdrop.mp4")},
            format="multipart",
        )
        r2 = self.c.post(
            POKER_ADMIN,
            {"slot": "hero_card", "label": "CARD", "video": clip("card.mp4")},
            format="multipart",
        )
        return r1, r2

    def test_admin_can_create_both_slots_independently(self):
        r1, r2 = self._create_both()
        self.assertIn(r1.status_code, (200, 201), r1.content)
        self.assertIn(r2.status_code, (200, 201), r2.content)

        rows = {r.slot: r.label for r in SectionMedia.objects.filter(section="poker")}
        self.assertEqual(rows, {"background": "BACKDROP", "hero_card": "CARD"})

    def test_editing_the_card_leaves_the_watermark_alone(self):
        self._create_both()
        card = SectionMedia.objects.get(section="poker", slot="hero_card")

        r = self.c.patch(
            f"{POKER_ADMIN}{card.id}/",
            {"label": "NEW CARD LABEL"}, format="multipart",
        )
        self.assertEqual(r.status_code, 200, r.content)

        self.assertEqual(
            SectionMedia.objects.get(section="poker", slot="background").label,
            "BACKDROP")
        self.assertEqual(
            SectionMedia.objects.get(section="poker", slot="hero_card").label,
            "NEW CARD LABEL")

    def test_deleting_the_card_leaves_the_watermark(self):
        self._create_both()
        card = SectionMedia.objects.get(section="poker", slot="hero_card")

        r = self.c.delete(f"{POKER_ADMIN}{card.id}/")
        self.assertIn(r.status_code, (200, 204), r.content)
        self.assertFalse(
            SectionMedia.objects.filter(section="poker", slot="hero_card").exists())
        self.assertTrue(
            SectionMedia.objects.filter(section="poker", slot="background").exists())

    def test_public_api_exposes_slot_so_the_card_can_filter(self):
        """SectionHeroMedia filters on `slot`; if it stopped being serialised
        the card would silently fall back to rendering every row again."""
        self._create_both()
        pub = self.client.get("/api/section-media/?section=poker")
        self.assertEqual(pub.status_code, 200)
        self.assertEqual(
            sorted(row["slot"] for row in pub.json()),
            ["background", "hero_card"])

    def test_poker_tab_cannot_write_a_teen_patti_row(self):
        """The section is hardcoded per view. This is what keeps the two pages'
        media from leaking into each other."""
        self.c.post(
            POKER_ADMIN,
            {"slot": "hero_card", "section": "teen_patti", "video": clip("x.mp4")},
            format="multipart",
        )
        self.assertFalse(SectionMedia.objects.filter(section="teen_patti").exists())
