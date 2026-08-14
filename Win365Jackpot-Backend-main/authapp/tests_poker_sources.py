"""
authapp/tests_poker_sources.py
─────────────────────────────────────────────────────────────────────────────
Covers the poker aggregation pipeline: source failure isolation (Part 10),
duplicate detection (Part 7), the review lifecycle (Parts 8/9), and the
guarantee that nothing reaches the public site without an explicit approval.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.poker_models import (
    PokerEventChangeLog, PokerSource, PokerSyncLog, PokerTournament,
)
from authapp.models.user_model import User
from authapp.services import poker_ingest_service, poker_review_service, poker_sync_service
from authapp.services.poker_review_service import ReviewError
from authapp.services.poker_sources import SourceError
from authapp.services.poker_sources.base import BaseConnector, NormalizedEvent


def _event(**overrides):
    defaults = {
        "name": "WSOP Main Event",
        "event_date": date.today() + timedelta(days=30),
        "country": "United States",
        "city": "Las Vegas",
        "casino_name": "Horseshoe",
        "buy_in": Decimal("10000"),
        "source_event_id": "evt-1",
    }
    defaults.update(overrides)
    return NormalizedEvent(**defaults)


def _source(name="Test Feed", **overrides):
    defaults = {"source_type": "rss", "url": "https://example.test/feed.xml", "is_enabled": True}
    defaults.update(overrides)
    return PokerSource.objects.create(name=name, **defaults)


def _clear_seeded_tournaments():
    """Migration 0005_seed_events_poker_promotions ships 8 published poker
    events as real seed data. Any test asserting on absolute counts needs them
    gone first, or it is really asserting on the seed fixture."""
    PokerTournament.objects.all().delete()


class PokerIngestTests(APITestCase):
    def setUp(self):
        _clear_seeded_tournaments()
        self.source = _source()

    def test_a_discovered_event_lands_in_pending_review_not_public(self):
        outcome = poker_ingest_service.ingest_event(_event(), self.source)

        self.assertEqual(outcome, "created")
        tournament = PokerTournament.objects.get(source_event_id="evt-1")
        self.assertEqual(tournament.review_status, "pending_review")
        self.assertIsNotNone(tournament.discovered_at)
        # Not visible publicly.
        self.assertEqual(
            PokerTournament.objects.filter(is_active=True, review_status="published").count(), 0,
        )

    def test_missing_fields_are_left_blank_never_invented(self):
        poker_ingest_service.ingest_event(
            _event(buy_in=None, prize_pool=None, organizer="", game_type=""), self.source,
        )
        tournament = PokerTournament.objects.get(source_event_id="evt-1")

        self.assertEqual(tournament.buy_in, Decimal("0"))
        self.assertEqual(tournament.organizer, "")
        self.assertEqual(tournament.game_type, "")
        self.assertEqual(tournament.official_url, "")

    def test_resyncing_the_same_source_event_updates_rather_than_duplicates(self):
        poker_ingest_service.ingest_event(_event(), self.source)
        outcome = poker_ingest_service.ingest_event(_event(buy_in=Decimal("12000")), self.source)

        self.assertEqual(outcome, "updated")
        self.assertEqual(PokerTournament.objects.filter(source_event_id="evt-1").count(), 1)
        self.assertEqual(PokerTournament.objects.get(source_event_id="evt-1").buy_in, Decimal("12000"))

    def test_an_unchanged_resync_is_a_no_op(self):
        poker_ingest_service.ingest_event(_event(), self.source)
        outcome = poker_ingest_service.ingest_event(_event(), self.source)
        self.assertEqual(outcome, "skipped")

    def test_a_blank_source_value_never_erases_existing_data(self):
        poker_ingest_service.ingest_event(_event(organizer="WSOP"), self.source)
        poker_ingest_service.ingest_event(_event(organizer=""), self.source)

        self.assertEqual(PokerTournament.objects.get(source_event_id="evt-1").organizer, "WSOP")

    def test_the_same_event_from_a_second_source_is_flagged_not_merged(self):
        other = _source(name="Second Feed")
        poker_ingest_service.ingest_event(_event(), self.source)

        outcome = poker_ingest_service.ingest_event(_event(source_event_id="other-99"), other)

        self.assertEqual(outcome, "duplicate")
        flagged = PokerTournament.objects.get(source_event_id="other-99")
        self.assertEqual(flagged.review_status, "duplicate")
        self.assertIsNotNone(flagged.duplicate_of)
        # Both rows still exist — nothing was silently merged away.
        self.assertEqual(PokerTournament.objects.count(), 2)

    def test_similarly_named_events_at_one_venue_are_flagged_for_a_human(self):
        poker_ingest_service.ingest_event(_event(name="WSOP Main Event Day 1a"), self.source)
        outcome = poker_ingest_service.ingest_event(
            _event(name="WSOP Main Event Day 1b", source_event_id="evt-2"), self.source,
        )

        self.assertEqual(outcome, "duplicate")
        self.assertEqual(PokerTournament.objects.get(source_event_id="evt-2").review_status, "duplicate")

    def test_unrelated_events_on_the_same_date_are_not_flagged(self):
        poker_ingest_service.ingest_event(_event(name="WSOP Main Event"), self.source)
        outcome = poker_ingest_service.ingest_event(
            _event(name="Sunday Deepstack Turbo", source_event_id="evt-2"), self.source,
        )

        self.assertEqual(outcome, "created")

    def test_events_on_different_dates_are_never_duplicates(self):
        poker_ingest_service.ingest_event(_event(), self.source)
        outcome = poker_ingest_service.ingest_event(
            _event(source_event_id="evt-2", event_date=date.today() + timedelta(days=60)), self.source,
        )

        self.assertEqual(outcome, "created")

    def test_a_rejected_event_is_not_resurrected_by_a_resync(self):
        poker_ingest_service.ingest_event(_event(), self.source)
        tournament = PokerTournament.objects.get(source_event_id="evt-1")
        poker_review_service.transition(tournament, "rejected", note="Not relevant")

        outcome = poker_ingest_service.ingest_event(_event(buy_in=Decimal("99999")), self.source)

        self.assertEqual(outcome, "skipped")
        tournament.refresh_from_db()
        self.assertEqual(tournament.review_status, "rejected")
        self.assertEqual(tournament.buy_in, Decimal("10000"))


class PokerStatusTests(APITestCase):
    def setUp(self):
        _clear_seeded_tournaments()

    def test_dates_drive_upcoming_live_and_completed(self):
        today = date.today()
        source = _source()
        for name, start, end in [
            ("Future", today + timedelta(days=5), None),
            ("Running", today - timedelta(days=1), today + timedelta(days=1)),
            ("Finished", today - timedelta(days=10), today - timedelta(days=8)),
        ]:
            t = PokerTournament.objects.create(
                name=name, event_date=start, end_date=end,
                review_status="published", source=source, status="upcoming",
            )
            del t

        counts = poker_ingest_service.refresh_statuses()

        self.assertEqual(PokerTournament.objects.get(name="Future").status, "upcoming")
        self.assertEqual(PokerTournament.objects.get(name="Running").status, "live")
        self.assertEqual(PokerTournament.objects.get(name="Finished").status, "completed")
        self.assertEqual(counts["live"] + counts["completed"], 2)

    def test_a_single_day_event_is_live_on_its_own_date(self):
        tournament = PokerTournament.objects.create(
            name="One Day", event_date=date.today(), review_status="published",
        )
        self.assertEqual(tournament.derive_status(), "live")

    def test_unreviewed_events_are_not_status_promoted(self):
        tournament = PokerTournament.objects.create(
            name="Pending", event_date=date.today() - timedelta(days=5),
            review_status="pending_review", status="upcoming",
        )

        poker_ingest_service.refresh_statuses()

        tournament.refresh_from_db()
        self.assertEqual(tournament.status, "upcoming")


class PokerSyncResilienceTests(APITestCase):
    """Part 10's core promise: one source failing never stops the others."""

    def test_a_failing_source_does_not_stop_the_rest_of_the_run(self):
        bad = _source(name="Broken Feed")
        good = _source(name="Working Feed")

        class GoodConnector(BaseConnector):
            source_type = "rss"

            def fetch(self):
                return [_event(source_event_id="ok-1")]

        class BadConnector(BaseConnector):
            source_type = "rss"

            def fetch(self):
                raise SourceError("host unreachable")

        def fake_get_connector(source):
            return BadConnector(source) if source.id == bad.id else GoodConnector(source)

        with patch("authapp.services.poker_sync_service.get_connector", side_effect=fake_get_connector):
            totals = poker_sync_service.sync_poker_from_sources(notify=False)

        self.assertEqual(totals["sources"], 2)
        self.assertEqual(totals["sources_failed"], 1)
        # The healthy source still produced its event.
        self.assertEqual(totals["created"], 1)
        self.assertTrue(PokerTournament.objects.filter(source_event_id="ok-1").exists())

        bad.refresh_from_db(); good.refresh_from_db()
        self.assertEqual(bad.sync_status, "failed")
        self.assertIn("host unreachable", bad.error_message)
        self.assertEqual(good.sync_status, "success")
        self.assertIsNotNone(good.last_successful_sync)

    def test_an_unexpected_connector_crash_is_contained(self):
        source = _source(name="Crashy")

        class CrashConnector(BaseConnector):
            source_type = "rss"

            def fetch(self):
                raise ValueError("connector bug")

        with patch("authapp.services.poker_sync_service.get_connector", return_value=CrashConnector(source)):
            totals = poker_sync_service.sync_poker_from_sources(notify=False)

        self.assertEqual(totals["sources_failed"], 1)
        source.refresh_from_db()
        self.assertEqual(source.sync_status, "failed")
        self.assertIn("connector bug", source.error_message)

    def test_one_bad_row_does_not_lose_the_rest_of_the_batch(self):
        source = _source(name="Mixed")

        class MixedConnector(BaseConnector):
            source_type = "rss"

            def fetch(self):
                return [
                    _event(source_event_id="a"),
                    _event(source_event_id="b", name="Second Event", city="Reno"),
                ]

        real_ingest = poker_ingest_service.ingest_event

        def flaky(event, src):
            if event.source_event_id == "a":
                raise RuntimeError("bad row")
            return real_ingest(event, src)

        with patch("authapp.services.poker_sync_service.get_connector", return_value=MixedConnector(source)), \
             patch("authapp.services.poker_sync_service.poker_ingest_service.ingest_event", side_effect=flaky):
            totals = poker_sync_service.sync_poker_from_sources(notify=False)

        self.assertEqual(totals["skipped"], 1)
        self.assertEqual(totals["created"], 1)
        self.assertTrue(PokerTournament.objects.filter(source_event_id="b").exists())

    def test_every_run_writes_a_sync_log(self):
        source = _source(name="Logged")

        class EmptyConnector(BaseConnector):
            source_type = "rss"

            def fetch(self):
                return []

        with patch("authapp.services.poker_sync_service.get_connector", return_value=EmptyConnector(source)):
            poker_sync_service.sync_poker_from_sources(notify=False)

        log = PokerSyncLog.objects.get(source=source)
        self.assertEqual(log.status, "success")
        self.assertIsNotNone(log.finished_at)

    def test_a_manual_source_is_never_fetched(self):
        source = _source(name="Manual", source_type="manual", url="")

        totals = poker_sync_service.sync_poker_from_sources(notify=False)

        self.assertEqual(totals["sources_failed"], 0)
        source.refresh_from_db()
        self.assertEqual(source.sync_status, "success")

    def test_disabled_sources_are_skipped(self):
        _source(name="Off", is_enabled=False)
        totals = poker_sync_service.sync_poker_from_sources(notify=False)
        self.assertEqual(totals["sources"], 0)

    def test_sync_notifies_staff_when_events_need_review(self):
        staff = User.objects.create_superuser(email="pstaff@example.com", password="pw12345!")
        source = _source(name="Notifier")

        class OneConnector(BaseConnector):
            source_type = "rss"

            def fetch(self):
                return [_event(source_event_id="n-1")]

        with patch("authapp.services.poker_sync_service.get_connector", return_value=OneConnector(source)):
            poker_sync_service.sync_poker_from_sources(notify=True)

        self.assertTrue(staff.notifications.filter(title="Poker sync completed").exists())


class PokerReviewTests(APITestCase):
    def setUp(self):
        _clear_seeded_tournaments()
        self.admin = User.objects.create_superuser(email="padmin@example.com", password="pw12345!")
        self.user = User.objects.create_user(email="puser@example.com", password="pw12345!")
        self.source = _source()
        poker_ingest_service.ingest_event(_event(), self.source)
        self.tournament = PokerTournament.objects.get(source_event_id="evt-1")

    def test_approving_then_publishing_makes_an_event_public(self):
        self.assertEqual(self.client.get("/api/poker/").data["count"], 0)

        poker_review_service.transition(self.tournament, "approved", actor=self.admin)
        poker_review_service.transition(self.tournament, "published", actor=self.admin)

        res = self.client.get("/api/poker/")
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["name"], "WSOP Main Event")

    def test_an_illegal_transition_is_refused(self):
        with self.assertRaises(ReviewError):
            poker_review_service.transition(self.tournament, "archived", actor=self.admin)

    def test_marking_a_duplicate_requires_the_original(self):
        with self.assertRaises(ReviewError):
            poker_review_service.transition(self.tournament, "duplicate", actor=self.admin)

    def test_an_event_cannot_duplicate_itself(self):
        with self.assertRaises(ReviewError):
            poker_review_service.transition(
                self.tournament, "duplicate", actor=self.admin, duplicate_of_id=self.tournament.id,
            )

    def test_every_transition_is_recorded_in_the_change_history(self):
        poker_review_service.transition(self.tournament, "approved", actor=self.admin, note="Looks good")

        entry = PokerEventChangeLog.objects.filter(tournament=self.tournament, action="approved").first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.from_status, "pending_review")
        self.assertEqual(entry.to_status, "approved")
        self.assertEqual(entry.actor, self.admin)
        self.assertEqual(entry.note, "Looks good")

    def test_rejected_events_never_appear_publicly(self):
        poker_review_service.transition(self.tournament, "rejected", actor=self.admin)

        self.assertEqual(self.client.get("/api/poker/").data["count"], 0)
        self.assertEqual(
            self.client.get(f"/api/poker/{self.tournament.id}/").status_code, status.HTTP_404_NOT_FOUND,
        )

    def test_review_endpoint_requires_admin(self):
        self.client.force_authenticate(self.user)
        res = self.client.post(
            f"/api/admin-panel/poker/{self.tournament.id}/review/", {"action": "published"},
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.tournament.refresh_from_db()
        self.assertEqual(self.tournament.review_status, "pending_review")

    def test_a_plain_patch_cannot_publish_an_event(self):
        """review_status is read-only on the serializer — publishing must go
        through the transition endpoint so it is validated and logged."""
        self.client.force_authenticate(self.admin)

        self.client.patch(
            f"/api/admin-panel/poker/{self.tournament.id}/", {"review_status": "published"},
        )

        self.tournament.refresh_from_db()
        self.assertEqual(self.tournament.review_status, "pending_review")

    def test_admin_can_publish_through_the_review_endpoint(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            f"/api/admin-panel/poker/{self.tournament.id}/review/",
            {"action": "approved", "note": "Verified against the organiser's site"},
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.tournament.refresh_from_db()
        self.assertEqual(self.tournament.review_status, "approved")

    def test_manual_back_office_creation_is_published_immediately(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post("/api/admin-panel/poker/", {
            "name": "Hand-entered Event",
            "event_date": str(date.today() + timedelta(days=10)),
            "country": "Sri Lanka", "city": "Colombo", "buy_in": "500",
        })

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        created = PokerTournament.objects.get(name="Hand-entered Event")
        self.assertEqual(created.review_status, "published")

    def test_editing_an_event_records_what_changed(self):
        self.client.force_authenticate(self.admin)
        self.client.patch(f"/api/admin-panel/poker/{self.tournament.id}/", {"buy_in": "25000"})

        entry = PokerEventChangeLog.objects.filter(tournament=self.tournament, action="edited").first()
        self.assertIsNotNone(entry)
        self.assertIn("buy_in", entry.changed_fields)

    def test_normal_users_cannot_reach_source_or_sync_endpoints(self):
        self.client.force_authenticate(self.user)
        for url in (
            "/api/admin-panel/poker/sources/",
            "/api/admin-panel/poker/sync-logs/",
            "/api/admin-panel/poker/stats/",
            "/api/admin-panel/poker/history/",
        ):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN, url)


class PokerPublicFilterTests(APITestCase):
    def setUp(self):
        _clear_seeded_tournaments()
        base = date.today() + timedelta(days=10)
        for name, country, city, series, game, buy_in in [
            ("Vegas Main", "United States", "Las Vegas", "WSOP", "NLHE", 10000),
            ("Goa Deepstack", "India", "Goa", "DPT", "PLO", 500),
            ("Colombo Classic", "Sri Lanka", "Colombo", "APT", "NLHE", 1000),
        ]:
            PokerTournament.objects.create(
                name=name, event_date=base, country=country, city=city,
                series=series, game_type=game, buy_in=Decimal(buy_in),
                review_status="published", is_active=True, status="upcoming",
            )
        PokerTournament.objects.create(
            name="Hidden Pending", event_date=base, country="India",
            review_status="pending_review", is_active=True,
        )

    def test_only_published_events_are_listed(self):
        names = [r["name"] for r in self.client.get("/api/poker/").data["results"]]
        self.assertNotIn("Hidden Pending", names)
        self.assertEqual(len(names), 3)

    def test_country_filter(self):
        res = self.client.get("/api/poker/?country=India")
        self.assertEqual([r["name"] for r in res.data["results"]], ["Goa Deepstack"])

    def test_series_and_game_type_filters(self):
        self.assertEqual(self.client.get("/api/poker/?series=WSOP").data["count"], 1)
        self.assertEqual(self.client.get("/api/poker/?game_type=NLHE").data["count"], 2)

    def test_buy_in_range_filter(self):
        res = self.client.get("/api/poker/?max_buy_in=1000")
        self.assertEqual(res.data["count"], 2)

    def test_filter_options_only_offer_values_with_published_events(self):
        options = self.client.get("/api/poker/filters/").data

        self.assertEqual(sorted(options["countries"]), ["India", "Sri Lanka", "United States"])
        self.assertIn("WSOP", options["series"])
        self.assertEqual(options["counts"]["upcoming"], 3)
