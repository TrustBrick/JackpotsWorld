"""
Tests for the admin-managed Promotions voice-over.

Covers the singleton PromotionSettings surface: the public promotions payload
now carries a `voiceover` block, and the admin settings endpoint uploads /
toggles the clip with the same audio validation the video path uses.
"""
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models.user_model import User
from authapp.models.promotion_models import PromotionSettings

PUBLIC_URL = "/api/promotions/"
ADMIN_URL = "/api/admin-panel/promotions/settings/"


def make_audio(name="intro.mp3", content_type="audio/mpeg", size_bytes=2048):
    return SimpleUploadedFile(name, b"\x00" * size_bytes, content_type=content_type)


class PromotionVoiceOverPublicTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_public_payload_includes_voiceover_defaults(self):
        res = self.client.get(PUBLIC_URL)
        self.assertEqual(res.status_code, 200)
        self.assertIn("voiceover", res.data)
        vo = res.data["voiceover"]
        self.assertIsNone(vo["audio"])
        self.assertTrue(vo["enabled"])

    def test_public_payload_reflects_uploaded_and_enabled_state(self):
        obj = PromotionSettings.load()
        obj.voiceover_audio = make_audio("saved.mp3")
        obj.voiceover_enabled = False
        obj.save()

        res = self.client.get(PUBLIC_URL)
        vo = res.data["voiceover"]
        self.assertIn("promotions/audio", vo["audio"])
        self.assertFalse(vo["enabled"])


class PromotionVoiceOverAdminTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="voadmin@jackpotsworld.vip", password="pw-admin-1234", name="VO Admin",
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])

        self.player = User.objects.create_user(
            email="voplayer@jackpotsworld.vip", password="pw-player-1234", name="VO Player",
        )
        self.client = APIClient()

    def _as_admin(self):
        self.client.force_authenticate(user=self.admin)

    def test_get_returns_settings(self):
        self._as_admin()
        res = self.client.get(ADMIN_URL)
        self.assertEqual(res.status_code, 200)
        self.assertIn("audio", res.data)
        self.assertIn("enabled", res.data)

    def test_can_upload_audio(self):
        self._as_admin()
        res = self.client.patch(ADMIN_URL, {"audio": make_audio("welcome.mp3")}, format="multipart")
        self.assertEqual(res.status_code, 200)
        self.assertIn("promotions/audio", res.data["audio"])
        self.assertIsNotNone(PromotionSettings.load().voiceover_audio.name)

    def test_can_toggle_enabled(self):
        self._as_admin()
        res = self.client.patch(ADMIN_URL, {"enabled": "false"}, format="multipart")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["enabled"])
        self.assertFalse(PromotionSettings.load().voiceover_enabled)

    def test_rejects_unsupported_extension(self):
        self._as_admin()
        res = self.client.patch(
            ADMIN_URL, {"audio": make_audio("voice.exe", content_type="application/octet-stream")},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)

    def test_generic_content_type_is_accepted(self):
        # Browsers routinely send application/octet-stream for a media file
        # chosen through a native picker — the extension is the real gate.
        self._as_admin()
        res = self.client.patch(
            ADMIN_URL, {"audio": make_audio("clip.mp3", content_type="application/octet-stream")},
            format="multipart",
        )
        self.assertEqual(res.status_code, 200)

    def test_content_type_naming_a_different_format_is_rejected(self):
        self._as_admin()
        res = self.client.patch(
            ADMIN_URL, {"audio": make_audio("clip.mp3", content_type="image/png")},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)

    def test_requires_admin(self):
        # Anonymous.
        self.assertIn(self.client.get(ADMIN_URL).status_code, (401, 403))
        # Authenticated non-staff player.
        self.client.force_authenticate(user=self.player)
        self.assertEqual(self.client.get(ADMIN_URL).status_code, 403)
