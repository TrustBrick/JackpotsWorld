"""
authapp/tests_casino_catalog.py
─────────────────────────────────────────────────────────────────────────────
The admin casino catalog drives every Back Office country dropdown (Poker,
Teen Patti, Andhar Bahar, commission rules). It must offer all the site's
destination countries, not only the ones that already have a casino.
"""
from rest_framework.test import APITestCase

from authapp.data.destination_countries import DESTINATION_COUNTRIES
from authapp.models.casino_models import Casino
from authapp.models.user_model import User

URL = "/api/admin-panel/casino-catalog/"


class CasinoCatalogCountriesTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(
            User.objects.create_superuser(email="catalog@example.com", password="pw12345!")
        )

    def names(self):
        return [c["name"] for c in self.client.get(URL).data["countries"]]

    def test_every_destination_country_is_offered_even_without_a_casino(self):
        Casino.objects.all().delete()

        self.assertEqual(self.names(), DESTINATION_COUNTRIES)

    def test_a_casino_country_outside_the_list_is_still_offered_once(self):
        Casino.objects.all().delete()
        Casino.objects.create(name="Casino Nepal", country="Nepal")
        Casino.objects.create(name="Deltin Test", country="India")

        names = self.names()

        self.assertEqual(names[:len(DESTINATION_COUNTRIES)], DESTINATION_COUNTRIES)
        self.assertEqual(names[len(DESTINATION_COUNTRIES):], ["Nepal"])
        self.assertEqual(names.count("India"), 1)
