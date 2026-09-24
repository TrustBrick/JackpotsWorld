"""
authapp/tests_affiliate_levels.py
─────────────────────────────────────────────────────────────────────────────
AFFILIATE-LEVELS — every affiliate joins at VIP and an admin moves them
through VIP -> Bronze -> Silver -> Gold -> Diamond. The conditions for moving
up come later; for now the level exists, an admin sets it, and both the admin
list and the affiliate's own dashboard show it.
"""

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models import ActivityLog, User
from authapp.models.affiliate_models import AffiliateProfile


class AffiliateLevelTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="lvl-admin@jackpotsworld.vip", password="Adm1n-Pass!")
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])

        self.affiliate = User.objects.create_user(email="lvl-aff@example.com", password="Aff1l-Pass!", name="Aff")
        self.profile = AffiliateProfile.objects.create(
            user=self.affiliate, is_active=True, commission_rate=Decimal("10.00"), approved_by=self.admin,
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)
        self.url = f"/api/admin-panel/affiliates/{self.affiliate.pk}/level/"

    def test_a_new_affiliate_starts_at_vip(self):
        self.assertEqual(self.profile.level, "vip")
        self.assertEqual(self.profile.get_level_display(), "VIP")
        self.assertEqual(AffiliateProfile.LEVEL_ORDER, ["vip", "bronze", "silver", "gold", "diamond"])

    def test_admin_sets_level_and_both_views_show_it(self):
        res = self.admin_client.patch(self.url, {"level": "Gold"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["level_label"], "Gold")
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.level, "gold")
        self.assertIsNotNone(self.profile.level_updated_at)

        row = next(r for r in self.admin_client.get("/api/admin-panel/affiliates/").data["results"]
                   if r["user_id"] == self.affiliate.pk)
        self.assertEqual((row["level"], row["level_label"]), ("gold", "Gold"))

        aff_client = APIClient()
        aff_client.force_authenticate(self.affiliate)
        dash = aff_client.get("/api/affiliate/dashboard/")
        self.assertEqual(dash.status_code, 200)
        self.assertEqual(dash.data["affiliate_profile"]["level_label"], "Gold")

    def test_level_can_go_down_too(self):
        self.admin_client.patch(self.url, {"level": "diamond"}, format="json")
        res = self.admin_client.patch(self.url, {"level": "bronze"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.level, "bronze")

    def test_unknown_level_is_refused(self):
        res = self.admin_client.patch(self.url, {"level": "platinum"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.level, "vip")

    def test_non_affiliate_is_404(self):
        res = self.admin_client.patch(f"/api/admin-panel/affiliates/{self.admin.pk}/level/", {"level": "gold"}, format="json")
        self.assertEqual(res.status_code, 404)

    def test_affiliates_cannot_set_their_own_level(self):
        aff_client = APIClient()
        aff_client.force_authenticate(self.affiliate)
        res = aff_client.patch(self.url, {"level": "diamond"}, format="json")
        self.assertEqual(res.status_code, 403)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.level, "vip")

    def test_the_change_is_in_the_audit_trail(self):
        ActivityLog.objects.all().delete()
        self.admin_client.patch(self.url, {"level": "silver"}, format="json")
        self.assertTrue(ActivityLog.objects.filter(actor=self.admin).exists())
