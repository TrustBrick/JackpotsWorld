"""
authapp/tests_optional_event_buy_in.py
─────────────────────────────────────────────────────────────────────────────
Buy-in / entry fee are OPTIONAL, and their absence is NULL rather than 0.

A tournament states a buy-in; an event has none to state. Before migration
0099 both columns were NOT NULL with a default of 0, so "the Back Office left
this blank" and "this costs nothing to enter" were the same stored value and
every public surface printed the blank one as a real price.

What these tests pin down, because each is a way the old behaviour could
creep back:

  * omitting the field on create leaves NULL, not 0;
  * sending "" clears a figure that was entered earlier — the Back Office
    form omits blank fields from its multipart PATCH, so without an explicit
    empty string an admin cannot ever take a buy-in back off an event;
  * a real figure still round-trips untouched;
  * the schema.org Offer withholds a price it does not have.

The requests here use the multipart default APITestCase ships with, which is
the same encoding ManageContentTab's FormData produces — this is the real
Back Office path, not a JSON approximation of it.
"""
from datetime import date, timedelta
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.andhar_bahar_models import AndharBaharEvent
from authapp.models.poker_models import PokerTournament
from authapp.models.teenpatti_models import TeenPattiEvent
from authapp.models.user_model import User
from authapp.services import teenpatti_service
from authapp.views.spa_seo import poker_schema


def _future():
    return date.today() + timedelta(days=10)


class PokerOptionalBuyInTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="buyin-admin@example.com", password="pw12345!")
        self.client.force_authenticate(self.admin)

    def test_creating_without_a_buy_in_stores_null_not_zero(self):
        res = self.client.post("/api/admin-panel/poker/", {
            "name": "Goa Festival Opening Night",
            "event_date": str(_future()),
            "country": "India", "city": "Goa",
        })

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertIsNone(PokerTournament.objects.get(name="Goa Festival Opening Night").buy_in)

    def test_a_buy_in_that_was_entered_is_kept(self):
        res = self.client.post("/api/admin-panel/poker/", {
            "name": "Main Event", "event_date": str(_future()),
            "country": "India", "buy_in": "5300",
        })

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(PokerTournament.objects.get(name="Main Event").buy_in, Decimal("5300"))

    def test_an_empty_string_clears_a_buy_in_that_was_entered_earlier(self):
        tournament = PokerTournament.objects.create(
            name="Reclassified As An Event", event_date=_future(),
            country="India", buy_in=Decimal("5300"),
        )

        res = self.client.patch(f"/api/admin-panel/poker/{tournament.id}/", {"buy_in": ""})

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        tournament.refresh_from_db()
        self.assertIsNone(tournament.buy_in)

    def test_omitting_the_field_on_a_patch_still_leaves_the_buy_in_alone(self):
        """The other half of the contract: a PATCH that never mentions buy_in
        must not clear it. Only an explicit "" means "remove this"."""
        tournament = PokerTournament.objects.create(
            name="Day 1a", event_date=_future(), country="India", buy_in=Decimal("1100"),
        )

        self.client.patch(f"/api/admin-panel/poker/{tournament.id}/", {"city": "Goa"})

        tournament.refresh_from_db()
        self.assertEqual(tournament.buy_in, Decimal("1100"))

    def test_the_public_payload_reports_null_rather_than_a_figure(self):
        tournament = PokerTournament.objects.create(
            name="Free Entry Night", event_date=_future(), country="India",
            review_status="published", is_active=True, status="upcoming",
        )

        res = self.client.get(f"/api/poker/{tournament.id}/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data["buy_in"])

    def test_the_seo_offer_withholds_a_price_it_does_not_have(self):
        tournament = PokerTournament.objects.create(
            name="No Buy-in Event", event_date=_future(), country="India",
            currency="USD", review_status="published", is_active=True,
        )

        schema = poker_schema(tournament)

        # No price and no seat count is not an Offer, it is boilerplate.
        self.assertIsNone(schema.get("offers"))


class TeenPattiOptionalEntryFeeTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="tp-buyin-admin@example.com", password="pw12345!")
        self.client.force_authenticate(self.admin)

    def _payload(self, **overrides):
        payload = {
            "name": "Teen Patti Social Night",
            "country": "Sri Lanka", "city": "Colombo",
            "start_date": str(_future()),
        }
        payload.update(overrides)
        return payload

    def test_creating_without_an_entry_fee_stores_null_not_zero(self):
        res = self.client.post("/api/admin-panel/teen-patti/", self._payload())

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertIsNone(TeenPattiEvent.objects.get(name="Teen Patti Social Night").entry_fee)

    def test_an_entry_fee_that_was_entered_is_kept(self):
        res = self.client.post("/api/admin-panel/teen-patti/", self._payload(entry_fee="100"))

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(TeenPattiEvent.objects.get(name="Teen Patti Social Night").entry_fee, Decimal("100"))

    def test_an_empty_string_clears_an_entry_fee_that_was_entered_earlier(self):
        event = TeenPattiEvent.objects.create(
            name="Now Free To Attend", country="Sri Lanka",
            start_date=_future(), entry_fee=Decimal("100"),
        )

        res = self.client.patch(f"/api/admin-panel/teen-patti/{event.id}/", {"entry_fee": ""})

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        event.refresh_from_db()
        self.assertIsNone(event.entry_fee)

    def test_the_public_payload_reports_null_rather_than_a_figure(self):
        event = TeenPattiEvent.objects.create(
            name="Open House", country="Sri Lanka", start_date=_future(),
            status="published", is_active=True,
        )

        res = self.client.get(f"/api/teen-patti/{event.id}/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data["entry_fee"])

    def test_registering_for_a_no_fee_event_snapshots_null_not_zero(self):
        """The snapshot exists so a later fee change cannot rewrite what a
        registrant was quoted. Someone who was quoted nothing must record
        nothing — and assigning NULL across would have failed outright while
        the column was NOT NULL."""
        event = TeenPattiEvent.objects.create(
            name="Free Social", country="Sri Lanka", start_date=_future(),
            status="published", is_active=True,
        )
        player = User.objects.create_user(email="tp-free@example.com", password="pw12345!", name="Player")

        registration, created = teenpatti_service.register_user(player, event.id)

        self.assertTrue(created)
        self.assertIsNone(registration.entry_fee_at_registration)

    def test_the_event_notification_omits_the_entry_line_when_there_is_no_fee(self):
        event = TeenPattiEvent.objects.create(
            name="Free Social", country="Sri Lanka", start_date=_future(),
            status="published", is_active=True,
        )
        player = User.objects.create_user(email="tp-free2@example.com", password="pw12345!", name="Player")

        teenpatti_service.register_user(player, event.id)

        body = player.notifications.first().message
        self.assertNotIn("Entry:", body)


class AndharBaharOptionalMinBuyInTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="ab-buyin-admin@example.com", password="pw12345!")
        self.client.force_authenticate(self.admin)

    def test_creating_without_a_minimum_stores_null(self):
        res = self.client.post("/api/admin-panel/andhar-bahar/events/", {
            "name": "Goa Table Night", "country": "India",
            "start_date": str(_future()),
        })

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertIsNone(AndharBaharEvent.objects.get(name="Goa Table Night").min_buy_in)

    def test_an_empty_string_clears_a_minimum_that_was_entered_earlier(self):
        """min_buy_in was already nullable, but the Back Office form dropped a
        blank field from the payload, so the column could be set and never
        unset. This is the half that was actually broken."""
        event = AndharBaharEvent.objects.create(
            name="Table Night", country="India",
            start_date=_future(), min_buy_in=Decimal("500"),
        )

        res = self.client.patch(
            f"/api/admin-panel/andhar-bahar/events/{event.id}/", {"min_buy_in": ""},
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        event.refresh_from_db()
        self.assertIsNone(event.min_buy_in)


class LegacyZeroMigrationTests(APITestCase):
    """Migration 0099 rewrites the placeholder zeros the old NOT NULL columns
    left behind. Re-running the query here would prove nothing about the
    migration itself, so this asserts the property that made the rewrite safe:
    nothing distinguishes a stored 0 from an unset value on any public
    surface, which is why converting them loses no information."""

    def test_a_zero_buy_in_is_not_advertised_as_a_price(self):
        tournament = PokerTournament.objects.create(
            name="Legacy Zero", event_date=_future(), country="India",
            currency="USD", buy_in=Decimal("0"),
            review_status="published", is_active=True,
        )

        schema = poker_schema(tournament)

        self.assertIsNone(schema.get("offers"))
