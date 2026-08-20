"""End-to-end tests for the first-party analytics pipeline.

Real action → /api/analytics/event → AnalyticsEvent row → aggregation →
admin API. Everything below drives the real endpoints and asserts on real
rows/aggregates — there is no mock data anywhere in the system, and these
prove it: an empty range returns zeros, and every number traces to events
these tests created.

Covered: page views, URL-click redirect + attribution, unique visitors/
members (refresh ≠ new visitor), UTM/campaign attribution, video start + all
milestones + duplicate-milestone prevention + completion + watch time +
retention, anonymous vs authenticated identity, the identity-injection guard,
admin authorization (member → 403), admin aggregation, bot filtering, and that
the separate affiliate click-tracking system is untouched.
"""
from itertools import count
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from authapp.models.affiliate_models import AffiliateProfile, AffiliateClickLog
from authapp.models.analytics_models import AnalyticsEvent, Campaign
from authapp.throttles import AnalyticsIngestThrottle

User = get_user_model()

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
INGEST_URL = "/api/analytics/event/"


class AnalyticsTestBase(APITestCase):
    def setUp(self):
        # The dashboard aggregations are cached (60s) keyed by date-range, so
        # the same key recurs across tests run on one day — clear it per test
        # so one test's cached result can't bleed into another's assertions.
        try:
            cache.clear()
        except Exception:
            pass
        counter = count()
        patcher = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"TEST{wtype}{next(counter):06d}",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        # Ingest throttle off for deterministic multi-request tests.
        throttle_patch = patch.object(AnalyticsIngestThrottle, "allow_request", return_value=True)
        throttle_patch.start()
        self.addCleanup(throttle_patch.stop)

        self.member = User.objects.create_user(
            email="member@example.com", password="pw-Test-1", user_uid="TESTMEM1",
        )
        self.other = User.objects.create_user(
            email="other@example.com", password="pw-Test-1", user_uid="TESTOTH1",
        )
        self.admin = User.objects.create_user(
            email="admin@example.com", password="pw-Test-1", user_uid="TESTADM1",
            is_staff=True, is_superuser=True,
        )

    def ingest(self, event, user=None, ua=BROWSER_UA, country="IN"):
        self.client.force_authenticate(user=user)  # None clears auth
        return self.client.post(
            INGEST_URL, event, format="json",
            HTTP_USER_AGENT=ua, HTTP_CF_IPCOUNTRY=country,
        )

    def admin_get(self, url, **params):
        self.client.force_authenticate(user=self.admin)
        return self.client.get(url, params)


# ── Ingestion + identity ─────────────────────────────────────────────────────
class IngestionTests(AnalyticsTestBase):
    def test_anonymous_page_view_is_recorded_with_anon_id_and_no_user(self):
        res = self.ingest({
            "event_type": "page_view", "url": "/", "anonymous_id": "anonaaaa0001",
            "session_id": "sess1",
        })
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["recorded"], 1)
        ev = AnalyticsEvent.objects.get()
        self.assertEqual(ev.event_type, "page_view")
        self.assertIsNone(ev.user_id)
        self.assertEqual(ev.anonymous_id, "anonaaaa0001")
        self.assertEqual(ev.country, "IN")
        self.assertEqual(ev.device_type, "Desktop")
        self.assertEqual(ev.browser, "Chrome")
        self.assertEqual(ev.operating_system, "Windows")

    def test_authenticated_event_is_attributed_to_the_jwt_user(self):
        self.ingest({"event_type": "login"}, user=self.member)
        ev = AnalyticsEvent.objects.get()
        self.assertEqual(ev.user_id, self.member.id)
        self.assertEqual(ev.anonymous_id, "")

    def test_client_cannot_inject_another_users_id_when_authenticated(self):
        # Authenticated as member, but the body claims to be `other`.
        self.ingest(
            {"event_type": "page_view", "user_id": self.other.id, "user": self.other.id},
            user=self.member,
        )
        ev = AnalyticsEvent.objects.get()
        self.assertEqual(ev.user_id, self.member.id, "identity must come from the JWT, not the body")

    def test_client_cannot_inject_a_user_id_when_anonymous(self):
        self.ingest({"event_type": "page_view", "user_id": self.other.id, "anonymous_id": "anonx0001"})
        ev = AnalyticsEvent.objects.get()
        self.assertIsNone(ev.user_id, "a body user_id must never authenticate an anonymous event")

    def test_bot_user_agent_is_dropped(self):
        res = self.ingest({"event_type": "page_view", "anonymous_id": "anonbot001"},
                          ua="Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")
        self.assertEqual(res.data["recorded"], 0)
        self.assertEqual(AnalyticsEvent.objects.count(), 0)

    def test_empty_user_agent_is_treated_as_non_human(self):
        res = self.ingest({"event_type": "page_view", "anonymous_id": "anonnoua01"}, ua="")
        self.assertEqual(res.data["recorded"], 0)
        self.assertEqual(AnalyticsEvent.objects.count(), 0)

    def test_disallowed_event_type_is_rejected(self):
        # url_click is recorded server-side by the redirect, never ingestable.
        res = self.ingest({"event_type": "url_click", "anonymous_id": "anonz0001"})
        self.assertEqual(res.data["recorded"], 0)
        self.assertEqual(AnalyticsEvent.objects.count(), 0)

    def test_batch_ingest_records_each_valid_event(self):
        res = self.ingest({"events": [
            {"event_type": "page_view", "anonymous_id": "anonb0001", "session_id": "s"},
            {"event_type": "video_start", "content_type": "video", "content_id": "v1",
             "anonymous_id": "anonb0001", "session_id": "s"},
            {"event_type": "not_a_type", "anonymous_id": "anonb0001"},  # skipped
        ]})
        self.assertEqual(res.data["recorded"], 2)
        self.assertEqual(AnalyticsEvent.objects.count(), 2)

    def test_metadata_is_sanitised_to_allowed_scalars(self):
        self.ingest({
            "event_type": "video_progress", "content_type": "video", "content_id": "v1",
            "anonymous_id": "anonm0001", "session_id": "s",
            "metadata": {"percent": 50, "watched_seconds": 12.5, "evil": {"x": 1}, "token": "secret"},
        })
        ev = AnalyticsEvent.objects.get()
        self.assertEqual(ev.metadata.get("percent"), 50)
        self.assertEqual(ev.metadata.get("watched_seconds"), 12.5)
        self.assertNotIn("evil", ev.metadata)   # nested dropped
        self.assertNotIn("token", ev.metadata)  # unknown key dropped


# ── Unique visitor / member counting ─────────────────────────────────────────
class UniqueCountingTests(AnalyticsTestBase):
    def test_refreshing_does_not_create_a_new_unique_visitor(self):
        for _ in range(5):  # same anonymous_id = same person reloading
            self.ingest({"event_type": "page_view", "anonymous_id": "samevisitor1", "session_id": "s1"})
        data = self.admin_get("/api/admin-panel/analytics/overview/", range="30d").data
        self.assertEqual(data["total_page_views"], 5)
        self.assertEqual(data["unique_visitors"], 1)
        self.assertEqual(data["unique_members"], 0)

    def test_distinct_anonymous_ids_are_distinct_visitors(self):
        self.ingest({"event_type": "page_view", "anonymous_id": "visitorA01", "session_id": "a"})
        self.ingest({"event_type": "page_view", "anonymous_id": "visitorB01", "session_id": "b"})
        data = self.admin_get("/api/admin-panel/analytics/overview/", range="30d").data
        self.assertEqual(data["unique_visitors"], 2)

    def test_member_counts_as_unique_member(self):
        self.ingest({"event_type": "page_view"}, user=self.member)
        self.ingest({"event_type": "page_view"}, user=self.member)  # refresh
        self.ingest({"event_type": "page_view", "anonymous_id": "anonc0001"})
        data = self.admin_get("/api/admin-panel/analytics/overview/", range="30d").data
        self.assertEqual(data["unique_members"], 1)
        self.assertEqual(data["unique_visitors"], 2)  # the member + one anon


# ── URL click redirect + attribution ─────────────────────────────────────────
class UrlClickTests(AnalyticsTestBase):
    def _campaign(self, **kw):
        defaults = dict(
            name="August Promo", utm_source="partner-site", utm_medium="banner",
            utm_campaign="august_2026", destination_url="https://jackpotsworld.vip/promotions",
        )
        defaults.update(kw)
        return Campaign.objects.create(**defaults)

    def test_trackable_link_records_a_click_and_redirects(self):
        c = self._campaign()
        res = self.client.get(f"/api/analytics/click/{c.tracking_id}/",
                              HTTP_USER_AGENT=BROWSER_UA, HTTP_CF_IPCOUNTRY="IN")
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, "https://jackpotsworld.vip/promotions")
        ev = AnalyticsEvent.objects.get()
        self.assertEqual(ev.event_type, "url_click")
        self.assertEqual(ev.campaign_id, c.id)
        self.assertEqual(ev.utm_campaign, "august_2026")

    def test_unsafe_destination_falls_back_to_site_root(self):
        c = self._campaign(destination_url="javascript:alert(1)")
        res = self.client.get(f"/api/analytics/click/{c.tracking_id}/", HTTP_USER_AGENT=BROWSER_UA)
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, "/")

    def test_unknown_tracking_id_redirects_home_without_recording(self):
        res = self.client.get("/api/analytics/click/doesnotexist/", HTTP_USER_AGENT=BROWSER_UA)
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, "/")
        self.assertEqual(AnalyticsEvent.objects.count(), 0)

    def test_url_analytics_report_aggregates_clicks_and_uniques(self):
        c = self._campaign()
        for aid in ("clkA", "clkA", "clkB"):  # A twice, B once
            self.client.get(f"/api/analytics/click/{c.tracking_id}/?aid={aid}0000", HTTP_USER_AGENT=BROWSER_UA)
        rows = self.admin_get("/api/admin-panel/analytics/urls/", range="30d").data
        row = next(r for r in rows if r["campaign"] == "august_2026")
        self.assertEqual(row["clicks"], 3)
        self.assertEqual(row["unique_visitors"], 2)


# ── UTM / campaign attribution ───────────────────────────────────────────────
class CampaignAttributionTests(AnalyticsTestBase):
    def test_inbound_utm_is_matched_to_a_defined_campaign(self):
        c = Campaign.objects.create(name="Aug", utm_source="partner", utm_campaign="aug_2026")
        self.ingest({
            "event_type": "page_view", "anonymous_id": "anonu0001", "session_id": "s",
            "utm_source": "partner", "utm_campaign": "aug_2026",
        })
        ev = AnalyticsEvent.objects.get()
        self.assertEqual(ev.campaign_id, c.id)

    def test_registration_is_attributed_to_the_campaign(self):
        c = Campaign.objects.create(name="Aug", utm_source="partner", utm_campaign="aug_2026")
        # A visitor arrives on the campaign and signs up (authenticated event).
        self.ingest({"event_type": "signup", "utm_source": "partner", "utm_campaign": "aug_2026"},
                    user=self.member)
        rows = self.admin_get("/api/admin-panel/analytics/campaigns/", range="30d").data
        row = next(r for r in rows if r["id"] == c.id)
        self.assertEqual(row["registrations"], 1)

    def test_utm_without_a_campaign_still_appears_in_url_report(self):
        self.ingest({"event_type": "page_view", "anonymous_id": "anonu90001", "session_id": "s",
                     "utm_source": "newsletter", "utm_campaign": "spring_blast"})
        rows = self.admin_get("/api/admin-panel/analytics/urls/", range="30d").data
        self.assertTrue(any(r["campaign"] == "spring_blast" for r in rows))


# ── Video engagement ─────────────────────────────────────────────────────────
class VideoAnalyticsTests(AnalyticsTestBase):
    VID = "showcase_srilanka"

    def _watch(self, anon="vanon0001", session="vs1", milestones=(10, 25, 50, 75, 90),
               complete=True, watched=120):
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": anon, "session_id": session, "metadata": {"watched_seconds": 0}})
        for m in milestones:
            self.ingest({"event_type": "video_progress", "content_type": "video", "content_id": self.VID,
                         "anonymous_id": anon, "session_id": session,
                         "metadata": {"percent": m, "watched_seconds": watched * m / 100.0}})
        if complete:
            self.ingest({"event_type": "video_complete", "content_type": "video", "content_id": self.VID,
                         "anonymous_id": anon, "session_id": session, "metadata": {"watched_seconds": watched}})

    def test_full_watch_records_start_all_milestones_and_completion(self):
        self._watch()
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_start", content_id=self.VID).count(), 1)
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_progress", content_id=self.VID).count(), 5)
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_complete", content_id=self.VID).count(), 1)

    def test_video_view_requires_actual_playback_not_a_page_load(self):
        # Loading a page that contains the video (a page_view) is NOT a view.
        self.ingest({"event_type": "page_view", "url": "/", "anonymous_id": "vanon0001", "session_id": "vs1"})
        data = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        self.assertEqual(data["total_views"], 0)

    def test_videos_report_and_detail_reflect_real_events(self):
        self._watch(anon="viewer0001", session="s1")
        self._watch(anon="viewer0002", session="s2", milestones=(10, 25, 50), complete=False)  # drops at 50
        rows = self.admin_get("/api/admin-panel/analytics/videos/", range="30d").data
        row = next(r for r in rows if r["content_id"] == self.VID)
        self.assertEqual(row["total_views"], 2)
        self.assertEqual(row["unique_viewers"], 2)
        self.assertEqual(row["completed"], 1)
        self.assertEqual(row["completion_rate"], 50.0)

        detail = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        stages = {s["stage"]: s["count"] for s in detail["retention"]}
        self.assertEqual(stages["Started"], 2)
        self.assertEqual(stages["50%"], 2)   # both reached 50
        self.assertEqual(stages["75%"], 1)   # only viewer1
        self.assertEqual(stages["Completed"], 1)

    def test_duplicate_milestone_events_do_not_inflate_retention(self):
        # viewer1 sends the 50% marker three times (pause/resume around 50%).
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "dupviewer", "session_id": "sd"})
        for _ in range(3):
            self.ingest({"event_type": "video_progress", "content_type": "video", "content_id": self.VID,
                         "anonymous_id": "dupviewer", "session_id": "sd", "metadata": {"percent": 50}})
        detail = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        stages = {s["stage"]: s["count"] for s in detail["retention"]}
        self.assertEqual(stages["50%"], 1, "distinct-viewer counting must absorb duplicate milestones")

    def test_watch_time_is_the_max_per_viewer(self):
        self._watch(anon="wviewer001", session="ws", watched=200)
        detail = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        self.assertEqual(detail["avg_watch_seconds"], 200.0)

    def test_unique_viewers_counts_a_repeat_watcher_once(self):
        self._watch(anon="repeatview1", session="r1")
        self._watch(anon="repeatview1", session="r2")  # same person, second watch
        rows = self.admin_get("/api/admin-panel/analytics/videos/", range="30d").data
        row = next(r for r in rows if r["content_id"] == self.VID)
        self.assertEqual(row["total_views"], 2)
        self.assertEqual(row["unique_viewers"], 1)


# ── Admin security + aggregation + empty state ───────────────────────────────
class AdminAnalyticsAccessTests(AnalyticsTestBase):
    ADMIN_ENDPOINTS = [
        "/api/admin-panel/analytics/overview/",
        "/api/admin-panel/analytics/urls/",
        "/api/admin-panel/analytics/videos/",
        "/api/admin-panel/analytics/campaigns/",
    ]

    def test_normal_member_cannot_access_admin_analytics(self):
        self.client.force_authenticate(user=self.member)
        for url in self.ADMIN_ENDPOINTS:
            self.assertIn(self.client.get(url).status_code, (401, 403), url)

    def test_anonymous_cannot_access_admin_analytics(self):
        self.client.force_authenticate(user=None)
        for url in self.ADMIN_ENDPOINTS:
            self.assertIn(self.client.get(url).status_code, (401, 403), url)

    def test_admin_can_access_and_empty_state_is_zeros_not_fake(self):
        data = self.admin_get("/api/admin-panel/analytics/overview/", range="30d").data
        for key in ("total_visitors", "unique_visitors", "unique_members",
                    "total_page_views", "total_video_views", "new_members"):
            self.assertEqual(data[key], 0, f"{key} must be 0 on an empty database, never a demo value")
        self.assertEqual(data["video_completion_rate"], 0.0)

    def test_member_cannot_inject_identity_to_read_admin_data(self):
        # Even passing an admin's id around gets a member nowhere — auth is JWT.
        self.client.force_authenticate(user=self.member)
        res = self.client.get("/api/admin-panel/analytics/overview/", {"user_id": self.admin.id})
        self.assertIn(res.status_code, (401, 403))

    def test_overview_aggregates_a_known_scenario_exactly(self):
        # anon A: 2 page views, a full video watch. anon B: 1 page view + a start.
        self.ingest({"event_type": "page_view", "anonymous_id": "agganon001", "session_id": "sA"})
        self.ingest({"event_type": "page_view", "anonymous_id": "agganon001", "session_id": "sA"})
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": "v",
                     "anonymous_id": "agganon001", "session_id": "sA"})
        self.ingest({"event_type": "video_complete", "content_type": "video", "content_id": "v",
                     "anonymous_id": "agganon001", "session_id": "sA"})
        self.ingest({"event_type": "page_view", "anonymous_id": "agganon002", "session_id": "sB"})
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": "v",
                     "anonymous_id": "agganon002", "session_id": "sB"})
        # member: a page view + a login, in their own session.
        self.ingest({"event_type": "page_view", "session_id": "sM"}, user=self.member)
        self.ingest({"event_type": "login", "session_id": "sM"}, user=self.member)

        d = self.admin_get("/api/admin-panel/analytics/overview/", range="30d").data
        self.assertEqual(d["total_page_views"], 4)  # A:2, B:1, member:1
        self.assertEqual(d["total_video_views"], 2)
        self.assertEqual(d["video_completion_rate"], 50.0)
        self.assertEqual(d["unique_video_viewers"], 2)
        self.assertEqual(d["unique_visitors"], 3)   # A, B, member
        self.assertEqual(d["unique_members"], 1)
        self.assertEqual(d["total_visitors"], 3)     # sessions sA, sB, sM


class MemberEngagementTests(AnalyticsTestBase):
    def test_member_engagement_summary_is_real(self):
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": "vX",
                     "metadata": {"watched_seconds": 0}}, user=self.member)
        self.ingest({"event_type": "video_complete", "content_type": "video", "content_id": "vX",
                     "metadata": {"watched_seconds": 90}}, user=self.member)
        self.ingest({"event_type": "page_view"}, user=self.member)
        data = self.admin_get(f"/api/admin-panel/analytics/members/{self.member.id}/").data
        self.assertEqual(data["user_id"], self.member.id)
        self.assertEqual(data["videos_watched"], 1)
        self.assertEqual(data["videos_completed"], 1)
        self.assertEqual(data["total_watch_seconds"], 90.0)
        self.assertEqual(data["page_views"], 1)

    def test_member_cannot_view_engagement_of_others(self):
        self.client.force_authenticate(user=self.member)
        res = self.client.get(f"/api/admin-panel/analytics/members/{self.other.id}/")
        self.assertIn(res.status_code, (401, 403))


# ── The separate affiliate system stays untouched ────────────────────────────
class AffiliateIndependenceTests(AnalyticsTestBase):
    def test_affiliate_click_tracking_still_works_and_is_separate(self):
        affiliate = User.objects.create_user(
            email="aff@example.com", password="pw-Test-1", user_uid="TESTAFF1",
        )
        AffiliateProfile.objects.create(user=affiliate)  # is_active defaults True

        before_analytics = AnalyticsEvent.objects.count()
        res = self.client.post(
            "/api/affiliate/track-click/",
            {"referral_code": affiliate.referral_code, "landing_path": "/"},
            format="json", HTTP_USER_AGENT=BROWSER_UA,
        )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data.get("tracked"))
        # The affiliate system recorded its own click…
        self.assertEqual(AffiliateClickLog.objects.filter(affiliate=affiliate).count(), 1)
        # …and the new analytics system was not involved at all.
        self.assertEqual(AnalyticsEvent.objects.count(), before_analytics)
