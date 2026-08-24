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

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models.affiliate_models import AffiliateProfile, AffiliateClickLog
from authapp.models.analytics_models import AnalyticsEvent, Campaign, VIDEO_MILESTONES
from authapp.throttles import AnalyticsIngestThrottle

User = get_user_model()

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
INGEST_URL = "/api/analytics/event/"


def geo_ok(**over):
    """A full utils.geolocation.resolve_geo() result, for patching.

    Built from the real blank shape so a test can never accidentally assert
    against a dict that is missing a key the production code reads.
    """
    base = {
        "status": "success", "country_name": "", "country_code": "",
        "region": "", "region_code": "", "city": "", "timezone": "",
        "latitude": None, "longitude": None, "isp": "",
    }
    base.update(over)
    return base


def geo_none(status="failed"):
    return geo_ok(status=status)


class _FakeGeoResponse:
    """Minimal stand-in for a requests.Response from the geolocation provider,
    for tests that need to count real outbound calls rather than stub the
    function that makes them."""

    def __init__(self, payload, status_code=200, headers=None):
        self._payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


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
        "/api/admin-panel/analytics/locations/",
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


# ── VIDEO-CLICK-ANALYTICS: clicks + idempotency ──────────────────────────────
class VideoClickTests(AnalyticsTestBase):
    VID = "click_test_video"

    def test_one_click_creates_one_event(self):
        res = self.ingest({"event_type": "video_click", "content_type": "video", "content_id": self.VID,
                            "anonymous_id": "clicker001", "session_id": "cs1", "client_event_id": "click-a"})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_click", content_id=self.VID).count(), 1)

    def test_duplicate_click_request_does_not_double_count(self):
        # Same client_event_id twice — a network retry or a duplicate React
        # event fire of the SAME physical click.
        payload = {"event_type": "video_click", "content_type": "video", "content_id": self.VID,
                   "anonymous_id": "clicker002", "session_id": "cs2", "client_event_id": "click-dup"}
        self.ingest(dict(payload))
        self.ingest(dict(payload))
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_click", content_id=self.VID).count(), 1)

    def test_double_click_protection_via_idempotency_key(self):
        # A literal double-click: the frontend's mintActionId debounce would
        # hand both physical clicks the SAME id (see services/analytics.js) —
        # simulated here directly at the layer that actually enforces it.
        payload = {"event_type": "video_click", "content_type": "video", "content_id": self.VID,
                   "anonymous_id": "clicker003", "session_id": "cs3", "client_event_id": "double-click-1"}
        for _ in range(2):
            self.ingest(dict(payload))
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_click", content_id=self.VID).count(), 1)

    def test_repeated_click_from_same_visitor_with_new_id_counts_again(self):
        # A GENUINELY separate later click by the same visitor — different id
        # — must be counted as a second click, not deduplicated away.
        self.ingest({"event_type": "video_click", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "clicker004", "session_id": "cs4", "client_event_id": "first-click"})
        self.ingest({"event_type": "video_click", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "clicker004", "session_id": "cs4", "client_event_id": "second-click"})
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_click", content_id=self.VID).count(), 2)
        detail = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        self.assertEqual(detail["total_clicks"], 2)
        self.assertEqual(detail["unique_clickers"], 1, "same visitor, two real clicks — one unique clicker")

    def test_different_visitors_clicking_same_video(self):
        for i in range(3):
            self.ingest({"event_type": "video_click", "content_type": "video", "content_id": self.VID,
                         "anonymous_id": f"visitor{i:03d}", "session_id": f"s{i}", "client_event_id": f"c{i}"})
        detail = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        self.assertEqual(detail["total_clicks"], 3)
        self.assertEqual(detail["unique_clickers"], 3)

    def test_play_click_and_cta_click_are_tracked_separately(self):
        self.ingest({"event_type": "video_click", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "vplay0001", "session_id": "sp", "client_event_id": "play-1"})
        self.ingest({"event_type": "video_cta_click", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "vcta00001", "session_id": "sc", "client_event_id": "cta-1"})
        detail = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        self.assertEqual(detail["play_clicks"], 1)
        self.assertEqual(detail["cta_clicks"], 1)
        self.assertEqual(detail["total_clicks"], 2, "the headline metric combines both click kinds")

    def test_ctr_is_unique_clickers_over_unique_viewers(self):
        # 2 unique viewers, 1 of whom also clicks -> CTR 50%.
        for anon in ("viewer_a1", "viewer_b1"):
            self.ingest({"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                         "anonymous_id": anon, "session_id": anon})
        self.ingest({"event_type": "video_click", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "viewer_a1", "session_id": "va", "client_event_id": "ctr-click"})
        detail = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        self.assertEqual(detail["ctr"], 50.0)

    def test_client_event_id_uniqueness_is_a_real_db_constraint(self):
        # Model-level guarantee, independent of the ingest view — this is
        # what actually makes the above tests correct under real concurrency,
        # not just under sequential test-client calls.
        from django.db import IntegrityError, transaction
        AnalyticsEvent.objects.create(event_type="video_click", client_event_id="uniq-1")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AnalyticsEvent.objects.create(event_type="video_click", client_event_id="uniq-1")
        # Multiple NULL client_event_id rows must NOT collide with each other.
        AnalyticsEvent.objects.create(event_type="video_click", client_event_id=None)
        AnalyticsEvent.objects.create(event_type="video_click", client_event_id=None)
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_click", client_event_id__isnull=True).count(), 2)


# ── VIEW-RULES: milestones, completion merging ───────────────────────────────
class VideoMilestoneTests(AnalyticsTestBase):
    VID = "milestone_test_video"

    def test_milestone_set_is_exactly_25_50_75_100(self):
        self.assertEqual(VIDEO_MILESTONES, (25, 50, 75, 100))

    def test_reaching_100_percent_counts_as_completed_without_an_ended_event(self):
        # A viewer who scrubs straight to the end — the element's `ended`
        # event never fires, only the 100% progress milestone does.
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "scrubber", "session_id": "ss"})
        self.ingest({"event_type": "video_progress", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "scrubber", "session_id": "ss", "metadata": {"percent": 100}})
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_complete", content_id=self.VID).count(), 0,
                          "no `ended` event was ever sent")
        detail = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        self.assertEqual(detail["completion_rate"], 100.0, "the 100% milestone alone must still count as completed")

    def test_refresh_does_not_duplicate_a_milestone(self):
        # Same session id, same milestone client_event_id, sent twice — what
        # useVideoAnalytics.js actually sends on a mid-playback refresh.
        payload = {"event_type": "video_progress", "content_type": "video", "content_id": self.VID,
                   "anonymous_id": "refresher", "session_id": "rs", "metadata": {"percent": 50},
                   "client_event_id": f"{self.VID}:rs:progress:50"}
        self.ingest(dict(payload))
        self.ingest(dict(payload))
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_progress", content_id=self.VID).count(), 1)

    def test_react_or_network_retry_does_not_duplicate_a_start(self):
        payload = {"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                   "anonymous_id": "retryer01", "session_id": "rts", "client_event_id": f"{self.VID}:rts:start"}
        for _ in range(3):
            self.ingest(dict(payload))
        self.assertEqual(AnalyticsEvent.objects.filter(event_type="video_start", content_id=self.VID).count(), 1,
                          "a refresh must not inflate total_views (see F2 in the inspection report)")


# ── LOCATION-ANALYTICS ────────────────────────────────────────────────────────
class LocationAnalyticsTests(AnalyticsTestBase):
    VID = "location_test_video"

    def test_country_attribution_from_cloudflare_header(self):
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "geoanon001", "session_id": "gs1"}, country="PH")
        row = AnalyticsEvent.objects.get(anonymous_id="geoanon001")
        self.assertEqual(row.country, "PH")

    @patch("authapp.services.visitor_service.get_client_ip_with_source",
           return_value=("203.0.113.9", "CF-Connecting-IP"))
    @patch("authapp.services.visitor_service.resolve_geo",
           return_value=geo_ok(region="Telangana", city="Hyderabad"))
    def test_region_and_city_attribution(self, mock_geo, mock_ip):
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "geoanon002", "session_id": "gs2"}, country="IN")
        row = AnalyticsEvent.objects.get(anonymous_id="geoanon002")
        self.assertEqual(row.region, "Telangana")
        self.assertEqual(row.city, "Hyderabad")

    @patch("authapp.services.visitor_service.get_client_ip_with_source",
           return_value=("203.0.113.9", "CF-Connecting-IP"))
    @patch("authapp.services.visitor_service.resolve_geo", return_value=geo_none())
    def test_unresolvable_location_is_unknown_not_fabricated(self, mock_geo, mock_ip):
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "geoanon003", "session_id": "gs3"}, country="IN")
        row = AnalyticsEvent.objects.get(anonymous_id="geoanon003")
        self.assertEqual(row.region, "")
        self.assertEqual(row.city, "")
        # The read side renders blank as "Unknown" — never invents a place.
        detail = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        india = next(c for c in detail["locations"] if c["country"] == "IN")
        self.assertEqual(india["regions"][0]["region"], "Unknown")
        self.assertEqual(india["regions"][0]["cities"][0]["city"], "Unknown")

    @patch("authapp.services.visitor_service.get_client_ip_with_source",
           return_value=("203.0.113.9", "CF-Connecting-IP"))
    @patch("authapp.services.visitor_service.resolve_geo",
           return_value=geo_ok(region="Metro Manila", city="Manila"))
    def test_frontend_cannot_spoof_trusted_server_side_location(self, mock_geo, mock_ip):
        # A client trying to claim a location via the request body — the
        # serializer has no such field, so it is silently ignored, and the
        # real (mocked) server-resolved location wins regardless.
        self.ingest({
            "event_type": "video_start", "content_type": "video", "content_id": self.VID,
            "anonymous_id": "spoofer01", "session_id": "gs4",
            "country": "US", "region": "California", "city": "Los Angeles",
        }, country="PH")
        row = AnalyticsEvent.objects.get(anonymous_id="spoofer01")
        self.assertEqual(row.country, "PH")
        self.assertEqual(row.region, "Metro Manila")
        self.assertEqual(row.city, "Manila")

    # A genuinely routable address. NOT 203.0.113.x: Python's `ipaddress`
    # classifies the TEST-NET/documentation ranges as private, so the lookup
    # would (correctly) be skipped and this test would prove nothing.
    @patch("authapp.services.visitor_service.get_client_ip_with_source",
           return_value=("49.37.128.5", "CF-Connecting-IP"))
    @patch("authapp.utils.geolocation.requests.get")
    def test_geo_provider_is_called_once_per_ip_not_once_per_event(self, mock_get, mock_ip):
        """The external lookup is cached BY IP, so many events — across many
        requests and many sessions — cost one provider call, not one each.

        Patched at `requests.get` rather than at resolve_geo() on purpose:
        patching the function under test would bypass the very cache this is
        meant to prove. This counts real outbound HTTP.
        """
        mock_get.return_value = _FakeGeoResponse({
            "status": "success", "country": "India", "countryCode": "IN",
            "regionName": "Goa", "region": "GA", "city": "Panaji",
            "timezone": "Asia/Kolkata", "lat": 15.49, "lon": 73.82, "isp": "Example ISP",
        })

        for i in range(4):
            self.ingest({"event_type": "video_progress", "content_type": "video", "content_id": self.VID,
                         "anonymous_id": "cachetest", "session_id": "cache-session-1",
                         "metadata": {"percent": [25, 50, 75, 100][i]}})
        # A different visitor AND a different session, same address — still no
        # second call, which is what the per-session cache used to get wrong.
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "cachetest2", "session_id": "cache-session-2"})

        self.assertEqual(mock_get.call_count, 1,
                         "one real provider call per IP, not one per event/session")

        row = AnalyticsEvent.objects.filter(anonymous_id="cachetest2").first()
        self.assertEqual(row.city, "Panaji")
        self.assertEqual(row.region, "Goa")

    def test_country_click_attribution(self):
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "clicker_geo", "session_id": "gs5"}, country="TH")
        self.ingest({"event_type": "video_click", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": "clicker_geo", "session_id": "gs5", "client_event_id": "geo-click"}, country="TH")
        detail = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/", range="30d").data
        thailand = next(c for c in detail["locations"] if c["country"] == "TH")
        self.assertEqual(thailand["viewers"], 1)
        self.assertEqual(thailand["clicks"], 1)
        self.assertEqual(thailand["unique_clickers"], 1)


# ── DATE FILTERING ────────────────────────────────────────────────────────────
class DateFilterTests(AnalyticsTestBase):
    """Backdated via direct ORM creation (created_at=...), not the ingest API
    — ingest always stamps `timezone.now()` by design (a client must never be
    able to backdate its own analytics), so this is the only correct way to
    test range boundaries deterministically."""
    VID = "date_test_video"

    def _event(self, when, anon):
        return AnalyticsEvent.objects.create(
            event_type="video_start", content_type="video", content_id=self.VID,
            anonymous_id=anon, session_id=anon, created_at=when,
        )

    def setUp(self):
        super().setUp()
        now = timezone.now()
        self._event(now, "today1")
        self._event(now - timedelta(days=1, hours=1), "yesterday1")
        self._event(now - timedelta(days=5), "week1")
        self._event(now - timedelta(days=20), "month1")
        self._event(now - timedelta(days=45), "old1")

    def _views(self, **params):
        rows = self.admin_get("/api/admin-panel/analytics/videos/", **params).data
        row = next((r for r in rows if r["content_id"] == self.VID), None)
        return row["total_views"] if row else 0

    def test_today(self):
        self.assertEqual(self._views(range="today"), 1)

    def test_yesterday(self):
        self.assertEqual(self._views(range="yesterday"), 1)

    def test_last_7_days(self):
        self.assertEqual(self._views(range="7d"), 3)  # today, yesterday, week1

    def test_last_30_days(self):
        self.assertEqual(self._views(range="30d"), 4)  # everything except old1 (45d)

    def test_custom_date_range(self):
        now = timezone.localdate()
        start = (now - timedelta(days=6)).isoformat()
        end = now.isoformat()
        self.assertEqual(self._views(range="custom", start=start, end=end), 3)

    def test_calculations_do_not_use_lifetime_counters(self):
        # A tighter window must report fewer views than a wider one covering
        # the same events — proof the numbers are computed from event
        # timestamps each time, not read off a running total.
        self.assertLess(self._views(range="today"), self._views(range="30d"))


# ── CALCULATION correctness (isolated from the ingest/HTTP layer) ───────────
class CalculationTests(AnalyticsTestBase):
    def test_completion_rate_formula(self):
        from authapp.services import analytics_service as svc
        m = svc._reduce_video([
            ("video_start", None, "v1", {}), ("video_start", None, "v2", {}),
            ("video_complete", None, "v1", {}),
        ])
        self.assertEqual(m["completion_rate"], 50.0)

    def test_ctr_formula(self):
        from authapp.services import analytics_service as svc
        m = svc._reduce_video([
            ("video_start", None, "v1", {}), ("video_start", None, "v2", {}),
            ("video_click", None, "v1", {}),
        ])
        self.assertEqual(m["ctr"], 50.0)

    def test_average_watch_time_is_max_per_viewer_not_sum(self):
        from authapp.services import analytics_service as svc
        m = svc._reduce_video([
            ("video_progress", None, "v1", {"watched_seconds": 10}),
            ("video_progress", None, "v1", {"watched_seconds": 40}),  # same viewer, later ping
        ])
        self.assertEqual(m["avg_watch_seconds"], 40.0, "must take the max per viewer, not sum repeated pings")

    def test_zero_viewers_never_divides_by_zero(self):
        from authapp.services import analytics_service as svc
        m = svc._reduce_video([])
        self.assertEqual(m["completion_rate"], 0.0)
        self.assertEqual(m["ctr"], 0.0)
        self.assertEqual(m["avg_watch_seconds"], 0.0)
