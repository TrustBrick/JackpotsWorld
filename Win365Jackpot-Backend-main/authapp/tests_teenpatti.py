"""
authapp/tests_teenpatti.py
─────────────────────────────────────────────────────────────────────────────
Covers the Teen Patti seat accounting, registration guards, status automation
and Back Office authorisation. The seat-count assertions matter most: they are
what stop an event from overselling.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.casino_models import Casino
from authapp.models.teenpatti_models import TeenPattiEvent, TeenPattiRegistration
from authapp.models.user_model import User
from authapp.services import teenpatti_service
from authapp.services.teenpatti_service import RegistrationError


def _make_event(**overrides):
    defaults = {
        "name": "Teen Patti Royal Night",
        "country": "Sri Lanka",
        "city": "Colombo",
        "start_date": (timezone.now() + timedelta(days=7)).date(),
        "start_time": timezone.now().time(),
        "entry_fee": Decimal("100.00"),
        "prize_pool": Decimal("25000.00"),
        "max_participants": 50,
        "status": "published",
        "is_active": True,
    }
    defaults.update(overrides)
    return TeenPattiEvent.objects.create(**defaults)


class TeenPattiRegistrationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="player@example.com", password="pw12345!", name="Player One")
        self.other = User.objects.create_user(email="player2@example.com", password="pw12345!", name="Player Two")
        self.event = _make_event()

    def test_registration_claims_a_seat_and_issues_confirmation(self):
        registration, created = teenpatti_service.register_user(self.user, self.event.id)
        self.event.refresh_from_db()

        self.assertTrue(created)
        self.assertEqual(self.event.current_participants, 1)
        self.assertEqual(self.event.seats_remaining, 49)
        self.assertTrue(registration.confirmation_id.startswith("TP"))
        self.assertEqual(len(registration.confirmation_id), 10)
        # Snapshotted, so a later fee change doesn't rewrite what they paid.
        self.assertEqual(registration.entry_fee_at_registration, Decimal("100.00"))

    def test_duplicate_registration_is_refused_without_taking_a_second_seat(self):
        teenpatti_service.register_user(self.user, self.event.id)

        with self.assertRaises(RegistrationError) as ctx:
            teenpatti_service.register_user(self.user, self.event.id)

        self.assertEqual(ctx.exception.code, "already_registered")
        self.event.refresh_from_db()
        self.assertEqual(self.event.current_participants, 1)

    def test_full_event_refuses_registration(self):
        event = _make_event(name="Tiny Table", max_participants=1)
        teenpatti_service.register_user(self.user, event.id)

        with self.assertRaises(RegistrationError) as ctx:
            teenpatti_service.register_user(self.other, event.id)

        self.assertEqual(ctx.exception.code, "event_full")
        event.refresh_from_db()
        self.assertEqual(event.current_participants, 1)
        self.assertTrue(event.is_full)

    def test_unlimited_seating_never_reports_full(self):
        event = _make_event(name="Open Floor", max_participants=None)
        teenpatti_service.register_user(self.user, event.id)
        event.refresh_from_db()

        self.assertIsNone(event.seats_remaining)
        self.assertFalse(event.is_full)

    def test_cancelled_event_refuses_registration(self):
        event = _make_event(name="Called Off", status="cancelled")

        with self.assertRaises(RegistrationError) as ctx:
            teenpatti_service.register_user(self.user, event.id)

        self.assertEqual(ctx.exception.code, "event_closed")

    def test_draft_event_refuses_registration(self):
        event = _make_event(name="Not Yet", status="draft")

        with self.assertRaises(RegistrationError) as ctx:
            teenpatti_service.register_user(self.user, event.id)

        self.assertEqual(ctx.exception.code, "event_closed")

    def test_closed_registration_refuses_even_when_seats_remain(self):
        event = _make_event(name="Registration Shut", registration_open=False)

        with self.assertRaises(RegistrationError) as ctx:
            teenpatti_service.register_user(self.user, event.id)

        self.assertEqual(ctx.exception.code, "registration_closed")

    def test_cancelling_releases_the_seat_and_allows_re_registration(self):
        teenpatti_service.register_user(self.user, self.event.id)
        teenpatti_service.cancel_registration(self.user, self.event.id)
        self.event.refresh_from_db()
        self.assertEqual(self.event.current_participants, 0)

        # Re-claiming revives the same row rather than violating unique_together.
        teenpatti_service.register_user(self.user, self.event.id)
        self.event.refresh_from_db()
        self.assertEqual(self.event.current_participants, 1)
        self.assertEqual(TeenPattiRegistration.objects.filter(event=self.event, user=self.user).count(), 1)

    def test_recount_seats_repairs_a_drifted_counter(self):
        teenpatti_service.register_user(self.user, self.event.id)
        teenpatti_service.register_user(self.other, self.event.id)
        TeenPattiEvent.objects.filter(pk=self.event.pk).update(current_participants=99)
        self.event.refresh_from_db()

        self.assertEqual(teenpatti_service.recount_seats(self.event), 2)
        self.event.refresh_from_db()
        self.assertEqual(self.event.current_participants, 2)

    def test_registration_sends_a_confirmation_notification(self):
        teenpatti_service.register_user(self.user, self.event.id)
        self.assertTrue(
            self.user.notifications.filter(title="Teen Patti registration confirmed").exists()
        )


class TeenPattiStatusAutomationTests(APITestCase):
    def test_dates_drive_upcoming_live_and_completed(self):
        now = timezone.now()
        future = _make_event(name="Future", start_date=(now + timedelta(days=3)).date())
        running = _make_event(
            name="Running",
            start_date=(now - timedelta(days=1)).date(),
            end_date=(now + timedelta(days=1)).date(),
        )
        finished = _make_event(
            name="Finished",
            start_date=(now - timedelta(days=5)).date(),
            end_date=(now - timedelta(days=4)).date(),
        )

        counts = teenpatti_service.refresh_event_statuses(now=now)

        future.refresh_from_db(); running.refresh_from_db(); finished.refresh_from_db()
        self.assertEqual(future.status, "upcoming")
        self.assertEqual(running.status, "live")
        self.assertEqual(finished.status, "completed")
        self.assertEqual(counts, {"upcoming": 1, "live": 1, "completed": 1})

    def test_draft_and_cancelled_are_never_auto_promoted(self):
        now = timezone.now()
        draft = _make_event(name="Draft", status="draft", start_date=(now - timedelta(days=1)).date())
        cancelled = _make_event(name="Cancelled", status="cancelled", start_date=(now - timedelta(days=1)).date())

        teenpatti_service.refresh_event_statuses(now=now)

        draft.refresh_from_db(); cancelled.refresh_from_db()
        self.assertEqual(draft.status, "draft")
        self.assertEqual(cancelled.status, "cancelled")

    def test_going_live_notifies_registrants(self):
        now = timezone.now()
        event = _make_event(
            name="About To Start",
            start_date=(now - timedelta(hours=1)).date(),
            start_time=(now - timedelta(hours=1)).time(),
            end_date=(now + timedelta(days=1)).date(),
        )
        user = User.objects.create_user(email="live@example.com", password="pw12345!", name="Live Player")
        teenpatti_service.register_user(user, event.id)

        teenpatti_service.refresh_event_statuses(now=now)

        self.assertTrue(user.notifications.filter(title="Your Teen Patti event is now LIVE").exists())


class TeenPattiApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="api@example.com", password="pw12345!", name="Api User")
        self.admin = User.objects.create_superuser(email="admin@example.com", password="pw12345!", name="Admin")
        # get_or_create, not create — migration 0050 already seeds Sri Lankan
        # casinos, and unique_together(country, name) would reject a duplicate.
        self.casino, _ = Casino.objects.get_or_create(
            country="Sri Lanka", name="Bellagio Casino", defaults={"is_active": True},
        )
        self.published = _make_event(name="Public Event", casino=self.casino)
        self.draft = _make_event(name="Hidden Draft", status="draft")

    def test_public_list_hides_draft_and_cancelled_events(self):
        res = self.client.get("/api/teen-patti/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        names = [row["name"] for row in res.data["results"]]
        self.assertIn("Public Event", names)
        self.assertNotIn("Hidden Draft", names)

    def test_country_filter_narrows_results(self):
        _make_event(name="India Event", country="India")

        res = self.client.get("/api/teen-patti/?country=India")
        names = [row["name"] for row in res.data["results"]]
        self.assertEqual(names, ["India Event"])

    def test_anonymous_cannot_register(self):
        res = self.client.post(f"/api/teen-patti/{self.published.id}/register/")
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertEqual(TeenPattiRegistration.objects.count(), 0)

    def test_authenticated_registration_returns_confirmation(self):
        self.client.force_authenticate(self.user)
        res = self.client.post(f"/api/teen-patti/{self.published.id}/register/")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["registration"]["confirmation_id"].startswith("TP"))

    def test_duplicate_registration_returns_400_not_500(self):
        self.client.force_authenticate(self.user)
        self.client.post(f"/api/teen-patti/{self.published.id}/register/")
        res = self.client.post(f"/api/teen-patti/{self.published.id}/register/")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "already_registered")

    def test_my_registrations_is_scoped_to_the_requesting_user(self):
        other = User.objects.create_user(email="other@example.com", password="pw12345!", name="Other")
        teenpatti_service.register_user(other, self.published.id)
        teenpatti_service.register_user(self.user, self.published.id)

        self.client.force_authenticate(self.user)
        res = self.client.get("/api/teen-patti/my-registrations/")

        self.assertEqual(res.data["count"], 1)
        self.assertEqual(
            res.data["results"][0]["confirmation_id"],
            TeenPattiRegistration.objects.get(user=self.user).confirmation_id,
        )

    def test_normal_user_cannot_reach_back_office_endpoints(self):
        self.client.force_authenticate(self.user)
        for url in ("/api/admin-panel/teen-patti/", "/api/admin-panel/teen-patti/stats/",
                    "/api/admin-panel/teen-patti/registrations/"):
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, url)

    def test_normal_user_cannot_create_an_event(self):
        self.client.force_authenticate(self.user)
        res = self.client.post("/api/admin-panel/teen-patti/", {
            "name": "Rogue Event", "country": "Nowhere",
            "start_date": str(timezone.now().date()),
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(TeenPattiEvent.objects.filter(name="Rogue Event").exists())

    def test_admin_can_create_an_event(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post("/api/admin-panel/teen-patti/", {
            "name": "Admin Made", "country": "Sri Lanka", "city": "Colombo",
            "start_date": str((timezone.now() + timedelta(days=2)).date()),
            "entry_fee": "100.00", "prize_pool": "25000.00",
            "max_participants": 50, "status": "published",
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertTrue(TeenPattiEvent.objects.filter(name="Admin Made").exists())

    def test_casino_country_mismatch_is_rejected(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post("/api/admin-panel/teen-patti/", {
            "name": "Mismatched", "country": "India", "casino": self.casino.id,
            "start_date": str((timezone.now() + timedelta(days=2)).date()),
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("casino", res.data)

    def test_end_date_before_start_date_is_rejected(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post("/api/admin-panel/teen-patti/", {
            "name": "Backwards", "country": "Sri Lanka",
            "start_date": str((timezone.now() + timedelta(days=5)).date()),
            "end_date": str((timezone.now() + timedelta(days=2)).date()),
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", res.data)

    def test_max_participants_cannot_drop_below_seats_already_taken(self):
        teenpatti_service.register_user(self.user, self.published.id)
        self.client.force_authenticate(self.admin)

        res = self.client.patch(f"/api/admin-panel/teen-patti/{self.published.id}/", {"max_participants": 0})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("max_participants", res.data)

    def test_cancelling_an_event_notifies_registrants(self):
        teenpatti_service.register_user(self.user, self.published.id)
        self.client.force_authenticate(self.admin)

        self.client.patch(f"/api/admin-panel/teen-patti/{self.published.id}/", {"status": "cancelled"})

        self.assertTrue(self.user.notifications.filter(title="Teen Patti event cancelled").exists())
