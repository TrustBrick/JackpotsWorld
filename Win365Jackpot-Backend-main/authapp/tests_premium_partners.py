"""
authapp/tests_premium_partners.py
─────────────────────────────────────────────────────────────────────────────
Covers the hero's Top Premium Partners showcase: server-side eligibility
filtering, upload validation, admin-only write access, and the guarantee that
the showcase and Casino Destinations never touch each other.
"""
import io

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.landing_models import Destination, DestinationMedia, PremiumPartner
from authapp.models.user_model import User

PUBLIC_URL = "/api/premium-partners/"
ADMIN_URL = "/api/admin-panel/premium-partners/"


def make_image(name="hero.png", fmt="PNG", size=(24, 24)):
    buf = io.BytesIO()
    Image.new("RGB", size, (12, 12, 12)).save(buf, format=fmt)
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type=f"image/{fmt.lower()}")


def make_video(name="hero.mp4", size_bytes=2048, content_type="video/mp4"):
    return SimpleUploadedFile(name, b"\x00" * size_bytes, content_type=content_type)


def make_partner(name="Bellagio Casino", **overrides):
    defaults = {
        "country": "Sri Lanka",
        "city": "Colombo",
        "flag_country_code": "LK",
        "partner_type": "top_premium",
        "is_featured_in_hero": True,
        "is_active": True,
        "order": 1,
        "hero_image": make_image(),
    }
    defaults.update(overrides)
    return PremiumPartner.objects.create(name=name, **defaults)


class PremiumPartnerPublicApiTests(APITestCase):
    """Eligibility is decided by the backend, never by the client."""

    def test_an_eligible_partner_is_returned(self):
        make_partner()

        res = self.client.get(PUBLIC_URL)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([p["name"] for p in res.data], ["Bellagio Casino"])

    def test_unfeaturing_removes_a_partner_from_the_api(self):
        partner = make_partner()
        self.assertEqual(len(self.client.get(PUBLIC_URL).data), 1)

        partner.is_featured_in_hero = False
        partner.save()

        self.assertEqual(self.client.get(PUBLIC_URL).data, [])

    def test_deactivating_removes_a_partner_from_the_api(self):
        partner = make_partner()
        partner.is_active = False
        partner.save()

        self.assertEqual(self.client.get(PUBLIC_URL).data, [])

    def test_a_non_top_premium_partner_never_reaches_the_hero(self):
        make_partner(name="Standard Co", partner_type="standard")
        make_partner(name="Mid Co", partner_type="premium")

        self.assertEqual(self.client.get(PUBLIC_URL).data, [])

    def test_partners_come_back_in_display_order(self):
        make_partner(name="Third", order=3)
        make_partner(name="First", order=1)
        make_partner(name="Second", order=2)

        names = [p["name"] for p in self.client.get(PUBLIC_URL).data]

        self.assertEqual(names, ["First", "Second", "Third"])

    def test_media_type_tells_the_hero_what_to_render(self):
        make_partner(name="Photo Only")
        make_partner(name="With Video", order=2, hero_video=make_video())

        by_name = {p["name"]: p for p in self.client.get(PUBLIC_URL).data}

        self.assertEqual(by_name["Photo Only"]["media_type"], "image")
        # A video wins over the image, which becomes its poster.
        self.assertEqual(by_name["With Video"]["media_type"], "video")

    def test_empty_when_nothing_is_featured(self):
        self.assertEqual(self.client.get(PUBLIC_URL).data, [])

    def test_the_endpoint_is_public(self):
        make_partner()
        self.assertEqual(self.client.get(PUBLIC_URL).status_code, status.HTTP_200_OK)


class PremiumPartnerSeparationTests(APITestCase):
    """Parts 3, 16 and 19: the showcase and Casino Destinations are
    independent systems, in both directions."""

    def test_featuring_a_partner_creates_no_destination(self):
        # Compared against a baseline rather than zero: migrations seed real
        # destination rows, so an absolute count would be asserting on the
        # fixture instead of on the behaviour.
        destinations_before = Destination.objects.count()
        media_before = DestinationMedia.objects.count()

        make_partner()

        self.assertEqual(Destination.objects.count(), destinations_before)
        self.assertEqual(DestinationMedia.objects.count(), media_before)

    def test_editing_a_destination_does_not_change_the_hero(self):
        make_partner(name="Bellagio Casino")
        destination = Destination.objects.create(name="Sri Lanka", tagline="Jewel", is_active=True)

        destination.name = "Renamed"
        destination.tagline = "Changed"
        destination.save()

        partners = self.client.get(PUBLIC_URL).data
        self.assertEqual([p["name"] for p in partners], ["Bellagio Casino"])

    def test_destinations_are_not_a_fallback_for_an_empty_hero(self):
        """With destinations present but no featured partner, the hero API
        must still return nothing rather than borrowing destination data."""
        destination = Destination.objects.create(name="Sri Lanka", is_active=True)
        DestinationMedia.objects.create(
            destination=destination, media=make_image("dest.png"), media_type="image", label="Ballagio",
        )

        self.assertEqual(self.client.get(PUBLIC_URL).data, [])

    def test_deleting_a_partner_leaves_destinations_intact(self):
        destination = Destination.objects.create(name="Sri Lanka", is_active=True)
        partner = make_partner()

        partner.delete()

        self.assertTrue(Destination.objects.filter(pk=destination.pk).exists())

    def test_the_model_has_no_relation_to_destination(self):
        related = {
            f.name for f in PremiumPartner._meta.get_fields()
            if f.is_relation and f.related_model in (Destination, DestinationMedia)
        }
        self.assertEqual(related, set())


class PremiumPartnerAdminTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="ppadmin@example.com", password="pw12345!")
        self.user = User.objects.create_user(email="ppuser@example.com", password="pw12345!")

    def test_admin_can_create_a_partner_with_an_image(self):
        self.client.force_authenticate(self.admin)

        res = self.client.post(ADMIN_URL, {
            "name": "Bellagio Casino", "country": "Sri Lanka", "city": "Colombo",
            "flag_country_code": "LK", "order": "1",
            "hero_image": make_image(),
        }, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        partner = PremiumPartner.objects.get(name="Bellagio Casino")
        # Actually persisted to storage, not just accepted.
        self.assertTrue(partner.hero_image.name)
        self.assertTrue(partner.hero_image.storage.exists(partner.hero_image.name))

    def test_admin_can_create_a_partner_with_a_video(self):
        self.client.force_authenticate(self.admin)

        res = self.client.post(ADMIN_URL, {
            "name": "Marina Casino", "order": "2", "hero_video": make_video(),
        }, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        partner = PremiumPartner.objects.get(name="Marina Casino")
        self.assertTrue(partner.hero_video.storage.exists(partner.hero_video.name))
        self.assertEqual(partner.media_type, "video")

    def test_an_invalid_video_extension_is_rejected_with_a_useful_message(self):
        self.client.force_authenticate(self.admin)

        res = self.client.post(ADMIN_URL, {
            "name": "Bad", "hero_video": make_video("clip.avi", content_type="video/x-msvideo"),
        }, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        message = str(res.data["hero_video"][0])
        self.assertIn("mp4", message)
        self.assertNotIn("Upload failed", message)

    def test_a_non_image_masquerading_as_an_image_is_rejected(self):
        """A .png that isn't a PNG must not reach storage. DRF's own
        ImageField decode runs before the shared validator and catches this
        one first, so the assertion accepts either message — what matters is
        that it is refused and the reason names the problem."""
        self.client.force_authenticate(self.admin)

        res = self.client.post(ADMIN_URL, {
            "name": "Bad", "hero_image": SimpleUploadedFile("x.png", b"not an image", content_type="image/png"),
        }, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not an image", str(res.data["hero_image"][0]).lower())
        self.assertFalse(PremiumPartner.objects.filter(name="Bad").exists())

    def test_an_oversized_video_is_rejected(self):
        self.client.force_authenticate(self.admin)

        res = self.client.post(ADMIN_URL, {
            "name": "Huge", "hero_video": make_video(size_bytes=51 * 1024 * 1024),
        }, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("too large", str(res.data["hero_video"][0]).lower())

    def test_a_featured_partner_needs_media(self):
        self.client.force_authenticate(self.admin)

        res = self.client.post(ADMIN_URL, {"name": "No Media", "is_featured_in_hero": "true"}, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("image or a video", str(res.data["hero_image"][0]))

    def test_an_unfeatured_partner_may_be_saved_without_media(self):
        self.client.force_authenticate(self.admin)

        res = self.client.post(
            ADMIN_URL, {"name": "Draft", "is_featured_in_hero": "false"}, format="multipart",
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

    def test_a_patch_that_only_changes_order_keeps_existing_media(self):
        partner = make_partner()
        self.client.force_authenticate(self.admin)

        res = self.client.patch(f"{ADMIN_URL}{partner.id}/", {"order": "5"}, format="multipart")

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        partner.refresh_from_db()
        self.assertEqual(partner.order, 5)
        self.assertTrue(partner.hero_image.name)

    def test_admin_can_delete_a_partner(self):
        partner = make_partner()
        self.client.force_authenticate(self.admin)

        res = self.client.delete(f"{ADMIN_URL}{partner.id}/")

        self.assertIn(res.status_code, (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT))
        self.assertFalse(PremiumPartner.objects.filter(pk=partner.pk).exists())

    def test_a_normal_user_cannot_write(self):
        partner = make_partner()
        self.client.force_authenticate(self.user)

        self.assertEqual(
            self.client.post(ADMIN_URL, {"name": "X"}, format="multipart").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.patch(f"{ADMIN_URL}{partner.id}/", {"name": "X"}).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(f"{ADMIN_URL}{partner.id}/").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_an_anonymous_request_cannot_write(self):
        res = self.client.post(ADMIN_URL, {"name": "X"}, format="multipart")
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
