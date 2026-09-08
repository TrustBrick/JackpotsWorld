"""
Video CTR — the metric, verified against real AnalyticsEvent rows.

Every test here builds events through the ORM and then reads the number the
Back Office would actually render, end to end (service → API → payload). None
of them assert on an intermediate value, because the bug being guarded against
was precisely that an intermediate value (the impression count) was correct and
never reached the number on screen.

WHAT WAS WRONG, in one line: CTR divided unique clickers by unique *players*,
and on a click-to-play video the click that starts playback is the same gesture
that creates a player — so the numerator was a subset of the denominator and
CTR sat near (or above) 100%. See _reduce_video's docstring for the full
account. The denominator is now exposure, measured by the `video_impression`
event that was already being collected and never read.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from authapp.models.analytics_models import AnalyticsEvent
from authapp.services import analytics_service

User = get_user_model()

VID = "ctr_test_video"


class VideoCtrTestBase(TestCase):
    def setUp(self):
        AnalyticsEvent.objects.all().delete()
        analytics_service.cache.clear()
        self.admin = User.objects.create_user(
            email="ctr-admin@example.com", password="x", name="CTR Admin",
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save()
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def tearDown(self):
        analytics_service.cache.clear()

    def ev(self, event_type, visitor, *, content_id=VID, metadata=None):
        """One event from one anonymous visitor, written straight to the table.

        Direct ORM creation rather than the ingest endpoint on purpose: this
        suite is about the READ side (aggregation), and the ingest path has its
        own tests. Building rows here keeps each scenario exact — "10
        impressions, 2 clicks" means exactly that.
        """
        return AnalyticsEvent.objects.create(
            event_type=event_type,
            content_type="video",
            content_id=content_id,
            anonymous_id=visitor,
            session_id=visitor,
            metadata=metadata or {},
        )

    def detail(self, content_id=VID):
        analytics_service.cache.clear()
        res = self.client.get(
            f"/api/admin-panel/analytics/videos/{content_id}/", {"range": "30d"},
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        return res.data

    def row(self, content_id=VID):
        analytics_service.cache.clear()
        res = self.client.get("/api/admin-panel/analytics/videos/", {"range": "30d"})
        self.assertEqual(res.status_code, 200, res.content[:400])
        match = [r for r in res.data if r["content_id"] == content_id]
        self.assertTrue(match, f"{content_id} missing from the videos report")
        return match[0]


class CtrArithmeticTests(VideoCtrTestBase):
    def test_ten_impressions_two_clickers_is_twenty_percent(self):
        """The worked example from the brief: 10 exposed, 2 clicked -> 20%."""
        for i in range(10):
            self.ev("video_impression", f"v{i}")
        for i in range(2):
            self.ev("video_cta_click", f"v{i}")

        detail = self.detail()
        self.assertEqual(detail["impressions"], 10)
        self.assertEqual(detail["unique_exposed"], 10)
        self.assertEqual(detail["unique_clickers"], 2)
        self.assertEqual(detail["ctr"], 20.0)
        # Total CTR over the same rows: 2 clicks / 10 impressions.
        self.assertEqual(detail["total_ctr"], 20.0)
        # And the list row an admin sees first agrees with the detail view.
        self.assertEqual(self.row()["ctr"], 20.0)

    def test_zero_impressions_and_zero_clicks_is_zero_not_nan(self):
        """An empty window reports 0%, never NaN, Infinity or null."""
        # One unrelated event so the video exists in the report at all.
        self.ev("video_start", "lonely")
        AnalyticsEvent.objects.filter(event_type="video_start").delete()
        self.ev("video_pause", "lonely")

        detail = self.detail()
        self.assertEqual(detail["impressions"], 0)
        self.assertEqual(detail["ctr"], 0.0)
        self.assertIsInstance(detail["ctr"], float)
        self.assertEqual(detail["completion_rate"], 0.0)
        self.assertEqual(detail["view_through_rate"], 0.0)
        # With no impressions there is no honest Total CTR denominator, so it
        # is None and the dashboard shows a dash rather than a measured 0%.
        self.assertIsNone(detail["total_ctr"])
        self.assertFalse(detail["has_impression_data"])

    def test_ctr_never_exceeds_one_hundred_percent(self):
        """THE REGRESSION. A click-to-play video: every viewer taps the player,
        which emits video_click AND video_start. Under the old formula the
        numerator was the denominator and CTR was 100%; worse, a tap that never
        produced playback pushed it ABOVE 100%.

        Exposure fixes both — and the union with clickers means even a click
        with no recorded impression cannot break the ceiling.
        """
        for i in range(5):
            self.ev("video_impression", f"p{i}")
            self.ev("video_click", f"p{i}")
            self.ev("video_start", f"p{i}")
        # Two people who tapped but whose playback never began, and whose
        # impression event never fired either — the exact shape that used to
        # produce >100%.
        for i in range(2):
            self.ev("video_click", f"ghost{i}")

        detail = self.detail()
        self.assertEqual(detail["unique_clickers"], 7)
        # 5 impression viewers + 2 clickers who were never seen otherwise.
        self.assertEqual(detail["unique_exposed"], 7)
        self.assertEqual(detail["ctr"], 100.0)
        self.assertLessEqual(detail["ctr"], 100.0)

    def test_old_formula_would_have_been_wrong_here(self):
        """A video most people saw and few played — the case the old formula
        could not represent at all.

        20 exposed, 4 played, 4 clicked to play. Old: 4/4 = 100%. New: 4/20 =
        20%, which is the number that actually describes the video.
        """
        for i in range(20):
            self.ev("video_impression", f"e{i}")
        for i in range(4):
            self.ev("video_click", f"e{i}")
            self.ev("video_start", f"e{i}")

        detail = self.detail()
        self.assertEqual(detail["unique_exposed"], 20)
        self.assertEqual(detail["unique_viewers"], 4)
        self.assertEqual(detail["ctr"], 20.0)
        # The view-through rate the impression event was collected for.
        self.assertEqual(detail["view_through_rate"], 20.0)

    def test_repeat_clicks_do_not_inflate_unique_ctr(self):
        """One person clicking five times is one click-through, not five."""
        for i in range(10):
            self.ev("video_impression", f"r{i}")
        for _ in range(5):
            self.ev("video_cta_click", "r0")

        detail = self.detail()
        self.assertEqual(detail["total_clicks"], 5)
        self.assertEqual(detail["unique_clickers"], 1)
        self.assertEqual(detail["ctr"], 10.0)        # 1 of 10 people
        self.assertEqual(detail["total_ctr"], 50.0)  # 5 clicks over 10 impressions

    def test_duplicate_impression_events_cannot_inflate_exposure(self):
        """Unique exposure counts DISTINCT visitors. Even if the client's
        once-per-session guard were bypassed and the same browser sent three
        impressions, it is still one exposed person.

        (Total impressions legitimately counts all three — it is a count of
        events, and the two numbers answer different questions.)
        """
        for _ in range(3):
            self.ev("video_impression", "dupe")
        self.ev("video_cta_click", "dupe")

        detail = self.detail()
        self.assertEqual(detail["impressions"], 3)
        self.assertEqual(detail["unique_impressions"], 1)
        self.assertEqual(detail["unique_exposed"], 1)
        self.assertEqual(detail["ctr"], 100.0)

    def test_completion_rate_zero_starts_is_zero(self):
        """Division guards apply to every rate, not just CTR."""
        self.ev("video_impression", "c1")
        detail = self.detail()
        self.assertEqual(detail["completion_rate"], 0.0)
        for stage in detail["retention"]:
            self.assertEqual(stage["pct"], 0.0)
            self.assertEqual(stage["count"], 0)


class CtrScopingTests(VideoCtrTestBase):
    def test_metrics_are_scoped_per_video(self):
        """A busy video must not lend its impressions to a quiet one."""
        for i in range(10):
            self.ev("video_impression", f"a{i}", content_id="video_a")
        self.ev("video_cta_click", "a0", content_id="video_a")

        for i in range(2):
            self.ev("video_impression", f"b{i}", content_id="video_b")

        a = self.detail("video_a")
        b = self.detail("video_b")
        self.assertEqual(a["impressions"], 10)
        self.assertEqual(a["ctr"], 10.0)
        self.assertEqual(b["impressions"], 2)
        self.assertEqual(b["ctr"], 0.0)

    def test_overview_matches_the_per_video_numbers(self):
        """The Overview card and the Video Analytics tab must not disagree —
        they go through the same reduction, and this proves it stays that way.
        """
        for i in range(8):
            self.ev("video_impression", f"o{i}")
        for i in range(2):
            self.ev("video_cta_click", f"o{i}")

        detail = self.detail()
        analytics_service.cache.clear()
        res = self.client.get("/api/admin-panel/analytics/overview/", {"range": "30d"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["video_ctr"], detail["ctr"])
        self.assertEqual(res.data["total_video_impressions"], detail["impressions"])
        self.assertEqual(res.data["unique_video_exposed"], detail["unique_exposed"])


class CtrAuthorizationTests(VideoCtrTestBase):
    def test_video_analytics_is_admin_only(self):
        """Analytics reads stay admin-gated — a signed-in player must not be
        able to read platform-wide engagement figures."""
        player = User.objects.create_user(
            email="ctr-player@example.com", password="x", name="Player",
        )
        client = APIClient()
        client.force_authenticate(player)
        for path in (
            "/api/admin-panel/analytics/videos/",
            f"/api/admin-panel/analytics/videos/{VID}/",
            "/api/admin-panel/analytics/overview/",
        ):
            with self.subTest(path=path):
                self.assertEqual(client.get(path).status_code, 403, path)

    def test_video_analytics_rejects_anonymous(self):
        client = APIClient()
        self.assertIn(client.get("/api/admin-panel/analytics/videos/").status_code, (401, 403))
