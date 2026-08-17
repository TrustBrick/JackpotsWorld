"""
authapp/tests_section_media.py
─────────────────────────────────────────────────────────────────────────────
Covers the cinematic hero media for Teen Patti and Poker: the public feed is
correctly section-scoped, and the two admin endpoints can never read, edit,
or create across each other's section — the actual guarantee behind "Teen
Patti and Poker must remain separate" rather than an assumption about it.
"""
import io

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.landing_models import SectionMedia
from authapp.models.user_model import User

PUBLIC_URL = "/api/section-media/"
TP_ADMIN_URL = "/api/admin-panel/section-media/teen-patti/"
POKER_ADMIN_URL = "/api/admin-panel/section-media/poker/"


def make_image(name="poster.png"):
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), (10, 10, 10)).save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type="image/png")


def make_row(section, slot="side_left", **overrides):
    defaults = {"is_active": True, "poster_image": make_image()}
    defaults.update(overrides)
    return SectionMedia.objects.create(section=section, slot=slot, **defaults)


class SectionMediaPublicApiTests(APITestCase):
    def test_returns_only_the_requested_section(self):
        make_row("teen_patti", "side_left", label="FEATURED")
        make_row("poker", "side_left", label="CASINO EXPERIENCE")

        tp = self.client.get(PUBLIC_URL, {"section": "teen_patti"}).data
        poker = self.client.get(PUBLIC_URL, {"section": "poker"}).data

        self.assertEqual([r["label"] for r in tp], ["FEATURED"])
        self.assertEqual([r["label"] for r in poker], ["CASINO EXPERIENCE"])

    def test_inactive_rows_are_not_returned(self):
        make_row("teen_patti", "side_left", is_active=False)
        self.assertEqual(self.client.get(PUBLIC_URL, {"section": "teen_patti"}).data, [])

    def test_an_invalid_section_returns_empty_not_an_error(self):
        res = self.client.get(PUBLIC_URL, {"section": "not-a-real-section"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])

    def test_no_section_param_returns_empty(self):
        make_row("teen_patti")
        self.assertEqual(self.client.get(PUBLIC_URL).data, [])

    def test_media_type_reflects_what_was_uploaded(self):
        make_row("teen_patti", "background", poster_image=make_image())
        row = self.client.get(PUBLIC_URL, {"section": "teen_patti"}).data[0]
        self.assertEqual(row["media_type"], "image")


class SectionMediaAdminSeparationTests(APITestCase):
    """The actual guarantee: neither admin endpoint can read, create, or
    modify a row belonging to the other section."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="mediaadmin@example.com", password="pw12345!")
        self.client.force_authenticate(self.admin)

    def test_teen_patti_admin_list_never_shows_poker_rows(self):
        make_row("teen_patti", "side_left", label="TP Card")
        make_row("poker", "side_right", label="Poker Card")

        res = self.client.get(TP_ADMIN_URL)
        results = res.data["results"] if isinstance(res.data, dict) else res.data

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["label"], "TP Card")

    def test_a_row_created_via_the_poker_endpoint_is_stamped_poker_even_if_the_client_lies(self):
        res = self.client.post(POKER_ADMIN_URL, {
            "slot": "side_left", "section": "teen_patti", "poster_image": make_image(),
        }, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        row = SectionMedia.objects.get(pk=res.data["id"])
        self.assertEqual(row.section, "poker")

    def test_teen_patti_admin_cannot_fetch_a_poker_row_by_id(self):
        poker_row = make_row("poker", "side_left")

        res = self.client.get(f"{TP_ADMIN_URL}{poker_row.id}/")

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_teen_patti_admin_cannot_delete_a_poker_row_by_id(self):
        poker_row = make_row("poker", "side_left")

        res = self.client.delete(f"{TP_ADMIN_URL}{poker_row.id}/")

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(SectionMedia.objects.filter(pk=poker_row.id).exists())

    def test_a_patch_cannot_move_a_row_to_the_other_section(self):
        tp_row = make_row("teen_patti", "side_left")

        res = self.client.patch(f"{TP_ADMIN_URL}{tp_row.id}/", {"section": "poker"})

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        tp_row.refresh_from_db()
        self.assertEqual(tp_row.section, "teen_patti")

    def test_duplicate_slot_within_a_section_is_rejected_with_a_clear_message(self):
        make_row("teen_patti", "background")

        res = self.client.post(TP_ADMIN_URL, {"slot": "background", "poster_image": make_image()}, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already has media", str(res.data["slot"][0]))

    def test_the_same_slot_name_is_independent_per_section(self):
        """'background' for Teen Patti and 'background' for Poker are two
        different rows — the uniqueness constraint is (section, slot), not
        slot alone."""
        make_row("teen_patti", "background")

        res = self.client.post(POKER_ADMIN_URL, {"slot": "background", "poster_image": make_image()}, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

    def test_an_active_slot_needs_media(self):
        res = self.client.post(TP_ADMIN_URL, {"slot": "side_left", "is_active": "true"}, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("needs a video or a poster", str(res.data["video"][0]))

    def test_an_inactive_slot_may_be_saved_without_media(self):
        res = self.client.post(TP_ADMIN_URL, {"slot": "side_left", "is_active": "false"}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

    def test_deleting_a_row_makes_the_slot_available_again(self):
        row = make_row("teen_patti", "background")
        self.client.delete(f"{TP_ADMIN_URL}{row.id}/")

        res = self.client.post(TP_ADMIN_URL, {"slot": "background", "poster_image": make_image()}, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)


class SectionMediaAuthTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="notadmin@example.com", password="pw12345!")

    def test_a_normal_user_cannot_write_teen_patti_media(self):
        self.client.force_authenticate(self.user)
        res = self.client.post(TP_ADMIN_URL, {"slot": "side_left", "poster_image": make_image()}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_normal_user_cannot_write_poker_media(self):
        self.client.force_authenticate(self.user)
        res = self.client.post(POKER_ADMIN_URL, {"slot": "side_left", "poster_image": make_image()}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_an_anonymous_request_cannot_write(self):
        res = self.client.post(TP_ADMIN_URL, {"slot": "side_left"}, format="multipart")
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_the_public_feed_needs_no_authentication(self):
        self.assertEqual(self.client.get(PUBLIC_URL, {"section": "teen_patti"}).status_code, status.HTTP_200_OK)
