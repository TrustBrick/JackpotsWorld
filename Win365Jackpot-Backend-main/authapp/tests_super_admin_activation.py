"""
authapp/tests_super_admin_activation.py
─────────────────────────────────────────────────────────────────────────────
The super admin deactivates and re-activates admin accounts. What matters is
the effect on the admin, not the flag: a deactivated admin cannot log in, and
an activated one can again.
"""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models import User

LOGIN_URL = "/api/auth/admin-login/"
PW = "Adm1n-Pass!"


class SuperAdminActivationTests(TestCase):
    def setUp(self):
        cache.clear()  # login throttles and lockouts live in the cache
        self.superadmin = User.objects.create_user(email="sa@jackpotsworld.vip", password="Sup3r-Pass!")
        self.superadmin.is_staff = self.superadmin.is_superuser = True
        self.superadmin.save(update_fields=["is_staff", "is_superuser"])

        self.admin = User.objects.create_user(email="staff@jackpotsworld.vip", password=PW, name="Staff")
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])

        self.sa = APIClient()
        self.sa.force_authenticate(user=self.superadmin)

    def _login(self):
        return APIClient().post(LOGIN_URL, {"email": self.admin.email, "password": PW}, format="json")

    def test_deactivate_then_activate_controls_login(self):
        self.assertEqual(self._login().status_code, 200)

        res = self.sa.delete(f"/api/super-admin/admins/{self.admin.pk}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._login().status_code, 403)

        res = self.sa.post(f"/api/super-admin/admins/{self.admin.pk}/reactivate/")
        self.assertEqual(res.status_code, 200)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)
        self.assertEqual(self._login().status_code, 200)

    def test_list_reports_the_current_state(self):
        self.sa.delete(f"/api/super-admin/admins/{self.admin.pk}/")
        row = next(a for a in self.sa.get("/api/super-admin/admins/").data["results"] if a["id"] == self.admin.pk)
        self.assertFalse(row["is_active"])

    def test_activating_an_active_admin_is_refused(self):
        res = self.sa.post(f"/api/super-admin/admins/{self.admin.pk}/reactivate/")
        self.assertEqual(res.status_code, 400)

    def test_superadmin_rows_cannot_be_touched(self):
        self.assertEqual(self.sa.post(f"/api/super-admin/admins/{self.superadmin.pk}/reactivate/").status_code, 404)

    def test_admins_cannot_activate_each_other(self):
        other = User.objects.create_user(email="other@jackpotsworld.vip", password=PW)
        other.is_staff, other.is_active = True, False
        other.save(update_fields=["is_staff", "is_active"])
        client = APIClient()
        client.force_authenticate(user=self.admin)
        self.assertEqual(client.post(f"/api/super-admin/admins/{other.pk}/reactivate/").status_code, 403)
        other.refresh_from_db()
        self.assertFalse(other.is_active)
