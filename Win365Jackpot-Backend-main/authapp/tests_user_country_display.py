"""
authapp/tests_user_country_display.py
─────────────────────────────────────────────────────────────────────────────
A user's country is STORED as an ISO alpha-2 code and DISPLAYED as a name.

The admin user panel used to render `country` straight out of the payload, so
an admin looking at a player saw "IN" — the same defect the analytics location
report had before utils/countries.py existed. UserProfileSerializer now ships
`country_display` alongside the code; these tests pin the contract both ways:
the code must keep flowing through unchanged (filters and the edit/PATCH paths
write it), and the name must come along for free.
"""

from itertools import count
from unittest.mock import patch

from rest_framework.test import APITestCase

from authapp.models import User
from authapp.serializers.user_serializers import UserProfileSerializer


class UserCountryDisplayTests(APITestCase):
    def setUp(self):
        counter = count()
        patcher = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"TEST{wtype}{next(counter):06d}",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.admin = User.objects.create_user(
            email="country-admin@example.com", password="pw-Test-1",
            user_uid="TESTCADM", is_staff=True, is_superuser=True,
        )
        self.member = User.objects.create_user(
            email="country-member@example.com", password="pw-Test-1",
            user_uid="TESTCMEM", country="IN",
        )

    def detail(self, user):
        self.client.force_authenticate(user=self.admin)
        return self.client.get(f"/api/admin-panel/users/{user.id}/")

    def test_admin_detail_carries_both_the_code_and_the_name(self):
        data = self.detail(self.member).data
        self.assertEqual(data["country"], "IN", "the stored code must not change")
        self.assertEqual(data["country_display"], "India")

    def test_display_name_follows_the_stored_code(self):
        self.member.country = "PH"
        self.member.save(update_fields=["country"])
        data = self.detail(self.member).data
        self.assertEqual(data["country"], "PH")
        self.assertEqual(data["country_display"], "Philippines")

    def test_no_country_displays_as_blank_not_as_a_guess(self):
        self.member.country = ""
        self.member.save(update_fields=["country"])
        data = self.detail(self.member).data
        self.assertEqual(data["country"], "")
        self.assertEqual(data["country_display"], "",
                         "a missing country is blank — the client picks the placeholder")

    def test_unrecognised_code_shows_itself_rather_than_disappearing(self):
        # Not an officially assigned alpha-2 code. Better to show "XK" than to
        # claim we have no country when the row plainly has one.
        self.member.country = "XK"
        self.member.save(update_fields=["country"])
        self.assertEqual(UserProfileSerializer(self.member).data["country_display"], "XK")

    def test_country_display_is_read_only(self):
        # It is derived, so it must not become a second, writable spelling of
        # the country that could drift from the code.
        self.assertIn("country_display", UserProfileSerializer.Meta.read_only_fields)
        self.client.force_authenticate(user=self.admin)
        r = self.client.patch(
            f"/api/admin-panel/users/{self.member.id}/",
            {"country_display": "Atlantis"}, format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.member.refresh_from_db()
        self.assertEqual(self.member.country, "IN")
        self.assertEqual(r.data["country_display"], "India")
