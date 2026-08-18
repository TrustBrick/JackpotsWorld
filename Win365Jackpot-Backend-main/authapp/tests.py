import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.landing_models import Destination, DestinationMedia, GiftItem, VipTier
from authapp.models.user_model import User
from authapp.utils.file_validation import MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES


def _tiny_png_bytes():
    """A real, minimal, decodable PNG — needed because validate_uploaded_image
    does an actual Pillow decode, not just an extension check."""
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (1, 1)).save(buf, format="PNG")
    return buf.getvalue()


def _oversized_png_bytes():
    """A real, decodable PNG that genuinely exceeds MAX_IMAGE_SIZE_BYTES.

    The size ceiling lives in validate_uploaded_image, but the serializer's
    ImageField decodes the upload first, so a buffer of filler bytes never
    reaches it -- it is rejected as a corrupt image and the test ends up
    exercising the decoder rather than the ceiling. Random pixels rather than
    a flat colour because PNG compresses the latter almost to nothing.
    """
    import os
    from PIL import Image
    size = (1400, 1300)  # ~5.2MB encoded, just over the 5MB limit
    buf = io.BytesIO()
    Image.frombytes("RGB", size, os.urandom(size[0] * size[1] * 3)).save(buf, format="PNG")
    return buf.getvalue()


class LandingMediaValidationTests(APITestCase):
    """
    Covers authapp/utils/file_validation.py's validate_uploaded_image /
    validate_uploaded_video as wired into authapp/serializers/landing_serializers.py
    — the fix for the "no size ceiling on landing media" root cause.
    """

    def setUp(self):
        self.admin = User.objects.create_user(email="admin@test.local", password="x", is_staff=True)
        self.client.force_authenticate(user=self.admin)

    def test_oversized_image_rejected_with_specific_message(self):
        payload = _oversized_png_bytes()
        # Guards the fixture itself: if PNG ever compresses this below the
        # ceiling, the test would pass for the wrong reason.
        self.assertGreater(len(payload), MAX_IMAGE_SIZE_BYTES)
        big = SimpleUploadedFile("big.png", payload, content_type="image/png")
        r = self.client.post("/api/admin-panel/vip-service-images/", {"image": big, "label": "x"}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("too large", str(r.data).lower())

    def test_wrong_extension_image_rejected(self):
        bad = SimpleUploadedFile("script.exe", b"MZ-not-an-image", content_type="application/octet-stream")
        r = self.client.post("/api/admin-panel/vip-service-images/", {"image": bad, "label": "x"}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_valid_small_image_accepted(self):
        good = SimpleUploadedFile("ok.png", _tiny_png_bytes(), content_type="image/png")
        r = self.client.post("/api/admin-panel/vip-service-images/", {"image": good, "label": "x"}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.data)

    def test_oversized_video_rejected(self):
        big = SimpleUploadedFile("big.mp4", b"0" * (MAX_VIDEO_SIZE_BYTES + 1), content_type="video/mp4")
        r = self.client.patch("/api/admin-panel/landing-settings/", {"hero_background_video": big}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_metadata_only_patch_without_file_still_succeeds(self):
        # A partial update that never touches the file field must not be
        # rejected just because a validator now exists on that field.
        gift = GiftItem.objects.create(name="Test Gift")
        r = self.client.patch(f"/api/admin-panel/gift-items/{gift.id}/", {"order": 5}, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.data)

    def test_destination_media_video_type_uses_video_validator_not_image(self):
        # Bigger than the image cap but under the video cap: only accepted if
        # media_type="video" correctly routes to validate_uploaded_video
        # instead of validate_uploaded_image.
        dest = Destination.objects.create(name="Macau")
        big = SimpleUploadedFile("big.mp4", b"0" * (MAX_IMAGE_SIZE_BYTES + 1), content_type="video/mp4")
        r = self.client.post("/api/admin-panel/destination-media/", {
            "destination": dest.id, "media_type": "video", "media": big,
        }, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.data)

    def test_destination_media_image_type_rejects_oversized_image(self):
        dest = Destination.objects.create(name="Macau")
        big = SimpleUploadedFile("big.jpg", b"0" * (MAX_IMAGE_SIZE_BYTES + 1), content_type="image/jpeg")
        r = self.client.post("/api/admin-panel/destination-media/", {
            "destination": dest.id, "media_type": "image", "media": big,
        }, format="multipart")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)


class LandingAdminQueryCountTests(APITestCase):
    """
    Covers the N+1 fix in authapp/views/landing_views.py — proves list-query
    cost doesn't scale with row count now that the admin Destination/VipTier
    list views prefetch their nested images/benefits, matching what the
    public views already did.
    """

    def setUp(self):
        self.admin = User.objects.create_user(email="admin2@test.local", password="x", is_staff=True)
        self.client.force_authenticate(user=self.admin)

    def test_destination_admin_list_query_count_does_not_scale_with_rows(self):
        def make_destination(name):
            dest = Destination.objects.create(name=name)
            for i in range(2):
                DestinationMedia.objects.create(
                    destination=dest, media_type="image",
                    media=SimpleUploadedFile(f"{name}-{i}.png", _tiny_png_bytes()),
                )
            return dest

        make_destination("A")
        with CaptureQueriesContext(connection) as ctx_one:
            r1 = self.client.get("/api/admin-panel/destinations/")
        self.assertEqual(r1.status_code, status.HTTP_200_OK)

        make_destination("B")
        make_destination("C")
        with CaptureQueriesContext(connection) as ctx_three:
            r2 = self.client.get("/api/admin-panel/destinations/")
        self.assertEqual(r2.status_code, status.HTTP_200_OK)

        self.assertEqual(len(ctx_one.captured_queries), len(ctx_three.captured_queries))

    def test_vip_tier_admin_list_query_count_does_not_scale_with_rows(self):
        VipTier.objects.create(label="Tier 1")
        with CaptureQueriesContext(connection) as ctx_one:
            r1 = self.client.get("/api/admin-panel/vip-tiers/")
        self.assertEqual(r1.status_code, status.HTTP_200_OK)

        VipTier.objects.create(label="Tier 2")
        VipTier.objects.create(label="Tier 3")
        with CaptureQueriesContext(connection) as ctx_three:
            r2 = self.client.get("/api/admin-panel/vip-tiers/")
        self.assertEqual(r2.status_code, status.HTTP_200_OK)

        self.assertEqual(len(ctx_one.captured_queries), len(ctx_three.captured_queries))
