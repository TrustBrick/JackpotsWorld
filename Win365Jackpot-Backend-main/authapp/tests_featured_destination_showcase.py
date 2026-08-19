"""
authapp/tests_featured_destination_showcase.py
-----------------------------------------------------------------------------
The landing page's promotional destination blocks.

Two things are worth stating because they are the whole point of the feature:
this is NOT DestinationMedia, and the public endpoint must never leak an
inactive row. DestinationMedia is the per-destination gallery and is
deliberately left untouched -- the last test class pins that down, because
"we added a separate feature" is only true if the existing one still behaves
identically afterwards.
"""
import io

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.landing_models import (
    Destination,
    DestinationMedia,
    FeaturedDestinationShowcase,
)
from authapp.models.user_model import User

PUBLIC_URL = "/api/featured-destination-showcases/"
ADMIN_URL = "/api/admin-panel/featured-destination-showcases/"


def make_image(name="promo.png"):
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), (10, 10, 10)).save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type="image/png")


def make_video(name="promo.mp4", content_type="video/mp4", size_bytes=2048):
    return SimpleUploadedFile(name, b"\x00" * size_bytes, content_type=content_type)


class ShowcaseTestBase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="showcaseadmin@example.com", password="pw12345!",
        )
        self.member = User.objects.create_user(
            email="showcasemember@example.com", password="pw12345!",
        )
        self.sri_lanka = Destination.objects.create(name="Sri Lanka", order=0)
        self.macau = Destination.objects.create(name="Macau", order=1)

    def as_admin(self):
        self.client.force_authenticate(self.admin)

    def make_showcase(self, destination=None, **overrides):
        fields = dict(
            destination=destination or self.sri_lanka,
            title="Discover Sri Lanka",
            description="Experience unforgettable VIP travel in Sri Lanka.",
            media_type="video",
            media=make_video(),
            cta_text="Explore Sri Lanka",
            is_active=True,
            display_order=0,
        )
        fields.update(overrides)
        return FeaturedDestinationShowcase.objects.create(**fields)


# -- 1-3. Admin CRUD ---------------------------------------------------------

class ShowcaseAdminCrudTests(ShowcaseTestBase):
    def test_admin_can_create_a_showcase(self):
        self.as_admin()
        res = self.client.post(ADMIN_URL, {
            "destination": self.sri_lanka.id,
            "title": "Discover Sri Lanka",
            "description": "VIP travel in Sri Lanka.",
            "media_type": "video",
            "media": make_video(),
            "cta_text": "Explore Sri Lanka",
            "display_order": 0,
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        row = FeaturedDestinationShowcase.objects.get(pk=res.data["id"])
        self.assertEqual(row.destination_id, self.sri_lanka.id)
        self.assertEqual(row.title, "Discover Sri Lanka")

    def test_admin_can_update_a_showcase(self):
        row = self.make_showcase()
        self.as_admin()
        res = self.client.patch(f"{ADMIN_URL}{row.id}/", {
            "title": "Discover Macau",
            "destination": self.macau.id,
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        row.refresh_from_db()
        self.assertEqual(row.title, "Discover Macau")
        self.assertEqual(row.destination_id, self.macau.id)

    def test_admin_can_delete_a_showcase(self):
        row = self.make_showcase()
        self.as_admin()
        res = self.client.delete(f"{ADMIN_URL}{row.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(FeaturedDestinationShowcase.objects.filter(pk=row.id).exists())

    def test_admin_can_replace_the_media(self):
        row = self.make_showcase()
        original = row.media.name
        self.as_admin()
        res = self.client.patch(
            f"{ADMIN_URL}{row.id}/", {"media": make_video("replacement.mp4")},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        row.refresh_from_db()
        self.assertNotEqual(row.media.name, original)

    def test_admin_can_deactivate_without_deleting(self):
        row = self.make_showcase()
        self.as_admin()
        res = self.client.patch(
            f"{ADMIN_URL}{row.id}/", {"is_active": False}, format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        row.refresh_from_db()
        self.assertFalse(row.is_active)


# -- 4. Authorization --------------------------------------------------------

class ShowcaseAuthorizationTests(ShowcaseTestBase):
    def test_anonymous_cannot_write(self):
        res = self.client.post(ADMIN_URL, {
            "destination": self.sri_lanka.id, "title": "Nope", "media": make_video(),
        }, format="multipart")
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertEqual(FeaturedDestinationShowcase.objects.count(), 0)

    def test_ordinary_member_cannot_write(self):
        self.client.force_authenticate(self.member)
        res = self.client.post(ADMIN_URL, {
            "destination": self.sri_lanka.id, "title": "Nope", "media": make_video(),
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(FeaturedDestinationShowcase.objects.count(), 0)

    def test_ordinary_member_cannot_delete(self):
        row = self.make_showcase()
        self.client.force_authenticate(self.member)
        res = self.client.delete(f"{ADMIN_URL}{row.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(FeaturedDestinationShowcase.objects.filter(pk=row.id).exists())


# -- 5-7, 13-14. The public feed --------------------------------------------

class ShowcasePublicFeedTests(ShowcaseTestBase):
    def test_active_showcase_is_returned(self):
        self.make_showcase()
        res = self.client.get(PUBLIC_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["title"], "Discover Sri Lanka")

    def test_inactive_showcase_is_never_exposed(self):
        self.make_showcase(is_active=False, title="Hidden draft")
        res = self.client.get(PUBLIC_URL)
        self.assertEqual(res.data, [])

    def test_only_active_rows_are_returned_when_mixed(self):
        self.make_showcase(title="Visible", display_order=0)
        self.make_showcase(destination=self.macau, title="Hidden", is_active=False, display_order=1)
        res = self.client.get(PUBLIC_URL)
        self.assertEqual([r["title"] for r in res.data], ["Visible"])

    def test_no_active_showcases_returns_an_empty_list(self):
        """The frontend renders nothing at all for [] -- never an empty
        container. See FeaturedDestinationShowcase.jsx."""
        res = self.client.get(PUBLIC_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])

    def test_display_order_controls_the_sequence(self):
        self.make_showcase(destination=self.macau, title="Second", display_order=5)
        self.make_showcase(destination=self.sri_lanka, title="First", display_order=1)
        res = self.client.get(PUBLIC_URL)
        self.assertEqual([r["title"] for r in res.data], ["First", "Second"])

    def test_multiple_showcases_are_all_returned(self):
        vietnam = Destination.objects.create(name="Vietnam", order=2)
        philippines = Destination.objects.create(name="Philippines", order=3)
        for i, dest in enumerate([self.sri_lanka, self.macau, vietnam, philippines]):
            self.make_showcase(destination=dest, title=f"Showcase {i}", display_order=i)
        res = self.client.get(PUBLIC_URL)
        self.assertEqual(len(res.data), 4)

    def test_public_payload_does_not_leak_admin_only_fields(self):
        self.make_showcase()
        row = self.client.get(PUBLIC_URL).data[0]
        for leaked in ("is_active", "created_at", "updated_at"):
            self.assertNotIn(leaked, row)

    def test_anonymous_may_read(self):
        self.make_showcase()
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(PUBLIC_URL).status_code, status.HTTP_200_OK)


# -- 8. The destination relationship ----------------------------------------

class ShowcaseDestinationRelationshipTests(ShowcaseTestBase):
    def test_showcase_exposes_the_linked_destination(self):
        self.make_showcase()
        row = self.client.get(PUBLIC_URL).data[0]
        self.assertEqual(row["destination"], self.sri_lanka.id)
        self.assertEqual(row["destination_name"], "Sri Lanka")

    def test_renaming_the_destination_flows_through(self):
        """The name is read from Destination, never copied onto the showcase."""
        self.make_showcase()
        self.sri_lanka.name = "Sri Lanka (VIP)"
        self.sri_lanka.save(update_fields=["name"])
        self.assertEqual(self.client.get(PUBLIC_URL).data[0]["destination_name"], "Sri Lanka (VIP)")

    def test_deleting_the_destination_removes_its_showcases(self):
        row = self.make_showcase()
        self.sri_lanka.delete()
        self.assertFalse(FeaturedDestinationShowcase.objects.filter(pk=row.id).exists())

    def test_one_destination_may_have_several_showcases(self):
        self.make_showcase(title="Beaches", display_order=0)
        self.make_showcase(title="Casinos", display_order=1)
        self.assertEqual(self.sri_lanka.showcases.count(), 2)


# -- 9-12. Media type and upload validation ---------------------------------

class ShowcaseMediaTests(ShowcaseTestBase):
    def test_image_media_type_is_accepted(self):
        self.as_admin()
        res = self.client.post(ADMIN_URL, {
            "destination": self.macau.id, "title": "Experience Macau",
            "media_type": "image", "media": make_image(), "cta_text": "Explore Macau",
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(FeaturedDestinationShowcase.objects.get(pk=res.data["id"]).media_type, "image")

    def test_video_media_type_is_accepted(self):
        self.as_admin()
        res = self.client.post(ADMIN_URL, {
            "destination": self.sri_lanka.id, "title": "Discover Sri Lanka",
            "media_type": "video", "media": make_video(), "cta_text": "Explore Sri Lanka",
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(FeaturedDestinationShowcase.objects.get(pk=res.data["id"]).media_type, "video")

    def test_invalid_media_type_is_rejected(self):
        self.as_admin()
        res = self.client.post(ADMIN_URL, {
            "destination": self.sri_lanka.id, "title": "Bad type",
            "media_type": "hologram", "media": make_video(),
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("media_type", res.data)

    def test_executable_upload_is_rejected(self):
        self.as_admin()
        res = self.client.post(ADMIN_URL, {
            "destination": self.sri_lanka.id, "title": "Malicious",
            "media_type": "image",
            "media": SimpleUploadedFile("payload.exe", b"MZ\x90\x00", content_type="application/x-msdownload"),
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(FeaturedDestinationShowcase.objects.count(), 0)

    def test_a_video_file_is_rejected_when_media_type_is_image(self):
        self.as_admin()
        res = self.client.post(ADMIN_URL, {
            "destination": self.sri_lanka.id, "title": "Mismatch",
            "media_type": "image", "media": make_video(),
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_oversized_video_is_rejected(self):
        self.as_admin()
        res = self.client.post(ADMIN_URL, {
            "destination": self.sri_lanka.id, "title": "Huge",
            "media_type": "video",
            "media": make_video(size_bytes=51 * 1024 * 1024),
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_active_showcase_needs_something_renderable(self):
        self.as_admin()
        res = self.client.post(ADMIN_URL, {
            "destination": self.sri_lanka.id, "title": "Empty", "media_type": "video",
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mobile_media_is_validated_too(self):
        self.as_admin()
        res = self.client.post(ADMIN_URL, {
            "destination": self.sri_lanka.id, "title": "Bad mobile cut",
            "media_type": "video", "media": make_video(),
            "mobile_media": SimpleUploadedFile("m.exe", b"MZ", content_type="application/x-msdownload"),
        }, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("mobile_media", res.data)


# -- The separation guarantee -----------------------------------------------

class DestinationMediaIsUnaffectedTests(ShowcaseTestBase):
    """The existing destination gallery must behave exactly as before. If this
    class ever fails, the two features have been merged by accident."""

    def test_gallery_and_showcase_coexist_on_one_destination(self):
        DestinationMedia.objects.create(
            destination=self.sri_lanka, media=make_image("beach.png"),
            media_type="image", label="Beach", order=0,
        )
        self.make_showcase()
        self.assertEqual(self.sri_lanka.images.count(), 1)
        self.assertEqual(self.sri_lanka.showcases.count(), 1)

    def test_showcase_rows_never_appear_in_the_gallery(self):
        # Compared before/after rather than against zero: migrations seed
        # DestinationMedia rows, so the meaningful assertion is that creating
        # a showcase leaves the gallery table untouched.
        before = DestinationMedia.objects.count()
        self.make_showcase()
        self.assertEqual(DestinationMedia.objects.count(), before)

    def test_gallery_rows_never_appear_in_the_public_showcase_feed(self):
        DestinationMedia.objects.create(
            destination=self.sri_lanka, media=make_image("hotel.png"),
            media_type="image", label="Hotel", order=0,
        )
        self.assertEqual(self.client.get(PUBLIC_URL).data, [])

    def test_destinations_endpoint_still_returns_its_gallery(self):
        DestinationMedia.objects.create(
            destination=self.sri_lanka, media=make_image("casino.png"),
            media_type="image", label="Casino", order=0,
        )
        res = self.client.get("/api/destinations/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        sri = next(d for d in res.data if d["id"] == self.sri_lanka.id)
        self.assertEqual(len(sri["images"]), 1)
        self.assertNotIn("showcases", sri)
