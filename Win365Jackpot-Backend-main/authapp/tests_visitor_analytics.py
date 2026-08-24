"""Tests for the visitor / IP / location / click / video analytics pipeline.

Every test drives the real endpoints and asserts on real rows. Nothing here
stubs the system under test into agreeing with itself: where a lookup has to
be controlled, it is controlled at the OUTERMOST seam (the HTTP call the
provider client makes, or the IP the proxy layer reports), so the code paths
that actually matter — proxy-header handling, private-IP detection, caching,
persistence, aggregation — all run for real.

Mapped to the specification's numbered verification list:

   1 visitor id issued                 15 clicks counted once
   2 session created                   16 duplicate event ids ignored
   3 IP extracted correctly            17 video start recorded
   4 IPv4                              18 video progress recorded
   5 IPv6                              19 video completion recorded
   6 trusted proxy handling            20 unique viewers correct
   7 spoofed headers ignored           21 location tied to video events
   8 private IPs detected              22 admin filter by country
   9 private IPs never sent out        23 admin filter by city
  10 country saved                     24 normal users get 403
  11 region saved                      25 bots / health checks excluded
  12 city saved                        26 SPA route changes tracked
  13 geo failure doesn't break         27 analytics failure never breaks
  14 page views counted once              the site
"""
from datetime import timedelta
from itertools import count
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models.analytics_models import (
    AnalyticsEvent, Visitor, VisitorSession,
    GEO_STATUS_SUCCESS, GEO_STATUS_PRIVATE_IP, GEO_STATUS_FAILED,
)
from authapp.throttles import AnalyticsIngestThrottle

User = get_user_model()

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
INGEST_URL = "/api/analytics/event/"

# A genuinely routable client address. Deliberately NOT 203.0.113.x: Python's
# `ipaddress` classifies the TEST-NET/documentation ranges as private, so
# using one would silently take the private-IP branch and make several of
# these tests assert the opposite of what they claim to.
PUBLIC_IPV4 = "49.37.128.5"
PUBLIC_IPV6 = "2401:4900:1c80::1"
# Inside Cloudflare's published 104.16.0.0/13 — see utils/client_ip.py.
CLOUDFLARE_EDGE = "104.16.0.1"
# The private address the load balancer/nginx hop appears as.
INTERNAL_HOP = "10.0.0.5"

GEO_PAYLOAD = {
    "status": "success",
    "country": "India", "countryCode": "IN",
    "regionName": "Telangana", "region": "TG",
    "city": "Hyderabad", "timezone": "Asia/Kolkata",
    "lat": 17.38, "lon": 78.47, "isp": "Example Networks Ltd",
}


class FakeGeoResponse:
    def __init__(self, payload, status_code=200, headers=None):
        self._payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class VisitorAnalyticsBase(APITestCase):
    def setUp(self):
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

        throttle_patch = patch.object(AnalyticsIngestThrottle, "allow_request", return_value=True)
        throttle_patch.start()
        self.addCleanup(throttle_patch.stop)

        # Patched at requests.get — the provider's HTTP call — so everything
        # above it (private-IP short circuit, per-IP caching, field mapping,
        # persistence) runs for real.
        geo_patch = patch("authapp.utils.geolocation.requests.get")
        self.mock_geo = geo_patch.start()
        self.mock_geo.return_value = FakeGeoResponse(GEO_PAYLOAD)
        self.addCleanup(geo_patch.stop)

        self.member = User.objects.create_user(
            email="vmember@example.com", password="pw-Test-1", user_uid="VTESTME1",
        )
        self.admin = User.objects.create_user(
            email="vadmin@example.com", password="pw-Test-1", user_uid="VTESTAD1",
            is_staff=True, is_superuser=True,
        )

    def ingest(self, event, *, user=None, ua=BROWSER_UA, ip=PUBLIC_IPV4,
               via_cloudflare=True, xff=None, cf_country=None, extra_headers=None):
        """POST an event, simulating a chosen network path to the origin.

        via_cloudflare reproduces the real production topology documented in
        utils/client_ip.py: visitor -> Cloudflare -> ALB -> nginx -> gunicorn,
        where every hop APPENDS to X-Forwarded-For and Cloudflare sets
        CF-Connecting-IP to the true client.
        """
        self.client.force_authenticate(user=user)
        headers = {"HTTP_USER_AGENT": ua}
        if cf_country:
            headers["HTTP_CF_IPCOUNTRY"] = cf_country
        if xff is not None:
            headers["HTTP_X_FORWARDED_FOR"] = xff
        elif via_cloudflare and ip:
            headers["HTTP_X_FORWARDED_FOR"] = f"{ip}, {CLOUDFLARE_EDGE}, {INTERNAL_HOP}"
        if via_cloudflare and ip:
            headers["HTTP_CF_CONNECTING_IP"] = ip
        if extra_headers:
            headers.update(extra_headers)
        return self.client.post(INGEST_URL, event, format="json", **headers)

    def admin_get(self, url, **params):
        self.client.force_authenticate(user=self.admin)
        return self.client.get(url, params)

    def page_view(self, visitor_id, session_id, url="/", **kw):
        return self.ingest(
            {"event_type": "page_view", "url": url,
             "anonymous_id": visitor_id, "session_id": session_id},
            **kw,
        )


# ── 1, 2: visitor identity and sessions ──────────────────────────────────────
class VisitorIdentityTests(VisitorAnalyticsBase):
    def test_visitor_row_is_created_with_the_clients_visitor_id(self):
        self.page_view("visitoraaaa01", "sessionaaaa01")
        v = Visitor.objects.get(visitor_id="visitoraaaa01")
        self.assertIsNotNone(v.first_seen)
        self.assertIsNotNone(v.last_seen)
        self.assertEqual(v.device_type, "Desktop")
        self.assertEqual(v.browser, "Chrome")
        self.assertEqual(v.operating_system, "Windows")

    def test_visitor_session_is_created_and_linked(self):
        self.page_view("visitoraaaa02", "sessionaaaa02")
        v = Visitor.objects.get(visitor_id="visitoraaaa02")
        s = VisitorSession.objects.get(session_id="sessionaaaa02")
        self.assertEqual(s.visitor_id, v.id)
        self.assertEqual(v.sessions.count(), 1)

    def test_navigating_does_not_create_a_new_visitor_or_session(self):
        for path in ("/", "/events", "/poker"):
            self.page_view("visitoraaaa03", "sessionaaaa03", url=path)
        self.assertEqual(Visitor.objects.filter(visitor_id="visitoraaaa03").count(), 1)
        self.assertEqual(VisitorSession.objects.filter(session_id="sessionaaaa03").count(), 1)

    def test_a_different_browser_is_a_separate_visitor_and_session(self):
        self.page_view("visitoraaaa04", "sessionaaaa04")
        self.page_view("visitorbbbb04", "sessionbbbb04")
        self.assertEqual(Visitor.objects.count(), 2)
        self.assertEqual(VisitorSession.objects.count(), 2)

    def test_events_are_linked_to_their_visitor_and_session(self):
        self.page_view("visitoraaaa05", "sessionaaaa05")
        ev = AnalyticsEvent.objects.get(anonymous_id="visitoraaaa05")
        self.assertIsNotNone(ev.visitor_id)
        self.assertIsNotNone(ev.visitor_session_id)
        self.assertEqual(ev.visitor.visitor_id, "visitoraaaa05")

    def test_first_seen_is_preserved_while_last_seen_advances(self):
        self.page_view("visitoraaaa06", "sessionaaaa06")
        v = Visitor.objects.get(visitor_id="visitoraaaa06")
        original_first = v.first_seen

        # Backdate so the second visit is measurably later.
        Visitor.objects.filter(pk=v.pk).update(
            first_seen=original_first - timedelta(days=3),
            last_seen=original_first - timedelta(days=3),
        )
        self.page_view("visitoraaaa06", "sessionaaaa06", url="/events")

        v.refresh_from_db()
        self.assertLess(v.first_seen, v.last_seen, "first_seen must not be overwritten by a return visit")

    def test_session_expires_after_the_idle_window_and_a_new_one_starts(self):
        self.page_view("visitoraaaa07", "sessionaaaa07")
        s = VisitorSession.objects.get(session_id="sessionaaaa07")

        idle = timezone.now() - timedelta(minutes=90)
        VisitorSession.objects.filter(pk=s.pk).update(last_activity_at=idle, started_at=idle)

        # Same client-side session key, but the visit behind it has timed out.
        self.page_view("visitoraaaa07", "sessionaaaa07", url="/poker")

        v = Visitor.objects.get(visitor_id="visitoraaaa07")
        self.assertEqual(v.sessions.count(), 2, "an idle-expired visit must start a new session")

    def test_first_touch_acquisition_is_not_overwritten_by_a_later_visit(self):
        self.ingest({"event_type": "page_view", "url": "/?utm_source=facebook",
                     "anonymous_id": "visitoraaaa08", "session_id": "sessionaaaa08",
                     "utm_source": "facebook", "utm_campaign": "launch"})
        self.ingest({"event_type": "page_view", "url": "/events",
                     "anonymous_id": "visitoraaaa08", "session_id": "sessionbbbb08",
                     "utm_source": "newsletter"})
        v = Visitor.objects.get(visitor_id="visitoraaaa08")
        self.assertEqual(v.utm_source, "facebook")
        self.assertEqual(v.utm_campaign, "launch")


# ── 3-9: IP extraction, proxies, spoofing, private addresses ─────────────────
class ClientIpTests(VisitorAnalyticsBase):
    def test_ipv4_is_extracted_and_stored(self):
        self.page_view("ipvisitor0001", "ipsession0001", ip=PUBLIC_IPV4)
        v = Visitor.objects.get(visitor_id="ipvisitor0001")
        self.assertEqual(v.ip_address, PUBLIC_IPV4)

    def test_ipv6_is_extracted_and_stored(self):
        self.page_view("ipvisitor0002", "ipsession0002", ip=PUBLIC_IPV6)
        v = Visitor.objects.get(visitor_id="ipvisitor0002")
        self.assertEqual(v.ip_address, PUBLIC_IPV6)

    def test_stored_ip_is_a_bare_address_never_a_chain_or_url(self):
        self.page_view("ipvisitor0003", "ipsession0003", ip=PUBLIC_IPV4)
        v = Visitor.objects.get(visitor_id="ipvisitor0003")
        self.assertNotIn(",", v.ip_address)
        self.assertNotIn("http", v.ip_address)
        self.assertNotIn(" ", v.ip_address)

    def test_trusted_cloudflare_chain_yields_the_real_client(self):
        # The full production chain, every hop appending as it really does.
        self.page_view(
            "ipvisitor0004", "ipsession0004",
            xff=f"{PUBLIC_IPV4}, {CLOUDFLARE_EDGE}, {INTERNAL_HOP}",
            ip=PUBLIC_IPV4,
        )
        v = Visitor.objects.get(visitor_id="ipvisitor0004")
        self.assertEqual(v.ip_address, PUBLIC_IPV4)

    def test_spoofed_forwarded_header_is_ignored_behind_cloudflare(self):
        """A caller prepending a fake address must not be able to claim it.

        Cloudflare APPENDS to an inbound X-Forwarded-For rather than replacing
        it, so a forged value really does land in position 0 of the header the
        origin sees. Reading the chain left-to-right — the obvious
        implementation — would trust it. Reading right-to-left and then
        preferring CF-Connecting-IP (which Cloudflare overwrites on every
        proxied request) is what makes the forgery inert.
        """
        self.page_view(
            "ipvisitor0005", "ipsession0005",
            xff=f"6.6.6.6, {PUBLIC_IPV4}, {CLOUDFLARE_EDGE}, {INTERNAL_HOP}",
            ip=PUBLIC_IPV4,
        )
        v = Visitor.objects.get(visitor_id="ipvisitor0005")
        self.assertEqual(v.ip_address, PUBLIC_IPV4)
        self.assertNotEqual(v.ip_address, "6.6.6.6")

    def test_private_ip_is_detected_and_labelled_not_geolocated(self):
        # No proxy headers at all — REMOTE_ADDR is the test client's 127.0.0.1.
        self.page_view("ipvisitor0006", "ipsession0006", ip=None, via_cloudflare=False)
        v = Visitor.objects.get(visitor_id="ipvisitor0006")
        self.assertEqual(v.geo_status, GEO_STATUS_PRIVATE_IP)
        self.assertEqual(v.country_code, "")
        self.assertEqual(v.city, "")
        self.assertEqual(v.location_label(), "Local / Private Network")

    def test_private_ip_is_never_sent_to_the_geolocation_provider(self):
        self.page_view("ipvisitor0007", "ipsession0007", ip=None, via_cloudflare=False)
        self.assertEqual(
            self.mock_geo.call_count, 0,
            "a private address must never leave the building",
        )

    def test_rfc1918_addresses_are_treated_as_private(self):
        for addr in ("10.1.2.3", "172.16.5.4", "192.168.1.10"):
            with self.subTest(addr=addr):
                from authapp.utils.geolocation import is_private_ip
                self.assertTrue(is_private_ip(addr))

    @override_settings(ANALYTICS_STORE_IP=False)
    def test_ip_storage_can_be_disabled_without_losing_location(self):
        self.page_view("ipvisitor0008", "ipsession0008", ip=PUBLIC_IPV4)
        v = Visitor.objects.get(visitor_id="ipvisitor0008")
        self.assertIsNone(v.ip_address, "no address should be persisted when storage is off")
        # The address is still used transiently, so location still resolves.
        self.assertEqual(v.city, "Hyderabad")
        self.assertEqual(v.geo_status, GEO_STATUS_SUCCESS)


# ── 10-13: geolocation ───────────────────────────────────────────────────────
class GeolocationTests(VisitorAnalyticsBase):
    def test_country_region_and_city_are_saved(self):
        self.page_view("geovisitor001", "geosession001", ip=PUBLIC_IPV4)
        v = Visitor.objects.get(visitor_id="geovisitor001")
        self.assertEqual(v.country_code, "IN")
        self.assertEqual(v.country_name, "India")
        self.assertEqual(v.region, "Telangana")
        self.assertEqual(v.region_code, "TG")
        self.assertEqual(v.city, "Hyderabad")
        self.assertEqual(v.timezone_name, "Asia/Kolkata")
        self.assertEqual(v.isp, "Example Networks Ltd")
        self.assertEqual(v.geo_status, GEO_STATUS_SUCCESS)
        self.assertAlmostEqual(v.latitude, 17.38, places=2)
        self.assertAlmostEqual(v.longitude, 78.47, places=2)

    def test_location_is_attached_to_the_event_not_only_the_visitor(self):
        self.page_view("geovisitor002", "geosession002", ip=PUBLIC_IPV4)
        ev = AnalyticsEvent.objects.get(anonymous_id="geovisitor002")
        self.assertEqual(ev.country, "IN")
        self.assertEqual(ev.country_name, "India")
        self.assertEqual(ev.region, "Telangana")
        self.assertEqual(ev.city, "Hyderabad")

    def test_location_resolves_without_the_cloudflare_country_header(self):
        """The original defect, pinned.

        Country used to come ONLY from CF-IPCountry, which Cloudflare sends
        only when a zone has the "Add visitor location headers" Managed
        Transform switched on — off by default. With it absent, country was
        blank for every visitor, and the location report's `.exclude(country="")`
        then discarded every row, so the dashboard was empty even though
        region and city had resolved perfectly well.
        """
        self.page_view("geovisitor003", "geosession003", ip=PUBLIC_IPV4, cf_country=None)
        v = Visitor.objects.get(visitor_id="geovisitor003")
        self.assertEqual(v.country_code, "IN", "country must resolve from the provider alone")
        self.assertEqual(v.city, "Hyderabad")

    def test_cloudflare_country_header_is_used_when_present(self):
        self.page_view("geovisitor004", "geosession004", ip=PUBLIC_IPV4, cf_country="PH")
        v = Visitor.objects.get(visitor_id="geovisitor004")
        self.assertEqual(v.country_code, "PH")

    def test_failed_geolocation_leaves_fields_blank_and_records_why(self):
        self.mock_geo.return_value = FakeGeoResponse({"status": "fail", "message": "private range"})
        self.page_view("geovisitor005", "geosession005", ip=PUBLIC_IPV4)
        v = Visitor.objects.get(visitor_id="geovisitor005")
        self.assertEqual(v.geo_status, GEO_STATUS_FAILED)
        self.assertEqual(v.country_name, "")
        self.assertEqual(v.region, "")
        self.assertEqual(v.city, "")

    def test_failed_geolocation_never_fabricates_a_location(self):
        self.mock_geo.return_value = FakeGeoResponse({"status": "fail"})
        self.page_view("geovisitor006", "geosession006", ip=PUBLIC_IPV4)
        v = Visitor.objects.get(visitor_id="geovisitor006")
        for value in (v.country_name, v.region, v.city):
            self.assertNotIn(value, ("India", "Hyderabad", "Unknown"),
                             "a blank lookup must stay blank in the database")
        self.assertEqual(v.location_label(), "Unknown")

    def test_geolocation_failure_does_not_break_page_tracking(self):
        self.mock_geo.side_effect = RuntimeError("provider exploded")
        res = self.page_view("geovisitor007", "geosession007", ip=PUBLIC_IPV4)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["recorded"], 1)
        self.assertTrue(AnalyticsEvent.objects.filter(anonymous_id="geovisitor007").exists())

    def test_provider_rate_limit_does_not_stall_or_fabricate(self):
        self.mock_geo.return_value = FakeGeoResponse({}, status_code=429, headers={"X-Ttl": "42"})
        res = self.page_view("geovisitor008", "geosession008", ip=PUBLIC_IPV4)
        self.assertEqual(res.status_code, 201)
        v = Visitor.objects.get(visitor_id="geovisitor008")
        self.assertEqual(v.city, "")
        self.assertNotEqual(v.geo_status, GEO_STATUS_SUCCESS)

    def test_the_provider_is_called_once_per_ip_across_visitors(self):
        self.page_view("geovisitor009", "geosession009", ip=PUBLIC_IPV4)
        self.page_view("geovisitor010", "geosession010", ip=PUBLIC_IPV4)
        self.page_view("geovisitor011", "geosession011", ip=PUBLIC_IPV4)
        self.assertEqual(self.mock_geo.call_count, 1,
                         "the cache is keyed by IP, which is what the provider rate-limits")


# ── 14-16: counting exactly once ─────────────────────────────────────────────
class CountingTests(VisitorAnalyticsBase):
    def test_page_view_is_counted_once_per_navigation(self):
        self.page_view("countvisitor01", "countsession01", url="/")
        self.assertEqual(
            AnalyticsEvent.objects.filter(event_type="page_view", anonymous_id="countvisitor01").count(),
            1,
        )

    def test_spa_route_changes_each_produce_one_page_view(self):
        for path in ("/", "/events", "/poker"):
            self.page_view("countvisitor02", "countsession02", url=path)
        rows = AnalyticsEvent.objects.filter(event_type="page_view", anonymous_id="countvisitor02")
        self.assertEqual(rows.count(), 3)
        self.assertEqual(
            sorted(rows.values_list("url", flat=True)),
            ["/", "/events", "/poker"],
        )

    def test_click_is_recorded_with_its_element_details(self):
        self.ingest({
            "event_type": "click", "url": "/poker",
            "anonymous_id": "countvisitor03", "session_id": "countsession03",
            "element_id": "poker_cta", "element_type": "button",
            "element_label": "Play Poker", "destination_url": "/poker/join",
            "client_event_id": "click-evt-1",
        })
        ev = AnalyticsEvent.objects.get(event_type="click", anonymous_id="countvisitor03")
        self.assertEqual(ev.element_id, "poker_cta")
        self.assertEqual(ev.element_type, "button")
        self.assertEqual(ev.element_label, "Play Poker")
        self.assertEqual(ev.destination_url, "/poker/join")

    def test_a_retried_click_is_counted_once(self):
        payload = {
            "event_type": "click", "anonymous_id": "countvisitor04",
            "session_id": "countsession04", "element_id": "join_now",
            "client_event_id": "same-click-id",
        }
        self.ingest(payload)
        self.ingest(payload)  # a network retry / duplicate React fire
        self.ingest(payload)
        self.assertEqual(
            AnalyticsEvent.objects.filter(event_type="click", anonymous_id="countvisitor04").count(),
            1,
            "one physical click must never become three rows",
        )

    def test_two_genuinely_separate_clicks_both_count(self):
        for i in (1, 2):
            self.ingest({
                "event_type": "click", "anonymous_id": "countvisitor05",
                "session_id": "countsession05", "element_id": "join_now",
                "client_event_id": f"distinct-click-{i}",
            })
        self.assertEqual(
            AnalyticsEvent.objects.filter(event_type="click", anonymous_id="countvisitor05").count(),
            2,
            "de-duplication must not suppress real repeat engagement",
        )

    def test_duplicate_event_id_returns_success_without_a_second_row(self):
        payload = {
            "event_type": "video_start", "content_type": "video", "content_id": "dupvid",
            "anonymous_id": "countvisitor06", "session_id": "countsession06",
            "client_event_id": "dup-video-start",
        }
        first = self.ingest(payload)
        second = self.ingest(payload)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.data["recorded"], 1, "a duplicate reports success, not an error")
        self.assertEqual(AnalyticsEvent.objects.filter(client_event_id="dup-video-start").count(), 1)


# ── 17-21: video engagement ──────────────────────────────────────────────────
class VideoEngagementTests(VisitorAnalyticsBase):
    VID = "poker_championship"

    def watch(self, visitor, session, *, milestones=(25, 50, 75), complete=False, ip=PUBLIC_IPV4):
        self.ingest({"event_type": "video_start", "content_type": "video", "content_id": self.VID,
                     "anonymous_id": visitor, "session_id": session,
                     "metadata": {"title": "Poker Championship", "duration": 100},
                     "client_event_id": f"{visitor}-start"}, ip=ip)
        for m in milestones:
            self.ingest({"event_type": "video_progress", "content_type": "video", "content_id": self.VID,
                         "anonymous_id": visitor, "session_id": session,
                         "metadata": {"percent": m, "watched_seconds": m, "duration": 100},
                         "client_event_id": f"{visitor}-progress-{m}"}, ip=ip)
        if complete:
            self.ingest({"event_type": "video_complete", "content_type": "video", "content_id": self.VID,
                         "anonymous_id": visitor, "session_id": session,
                         "metadata": {"percent": 100, "watched_seconds": 100, "duration": 100},
                         "client_event_id": f"{visitor}-complete"}, ip=ip)

    def test_video_start_progress_and_completion_are_recorded(self):
        self.watch("vidvisitor0001", "vidsession0001", complete=True)
        rows = AnalyticsEvent.objects.filter(anonymous_id="vidvisitor0001")
        self.assertEqual(rows.filter(event_type="video_start").count(), 1)
        self.assertEqual(rows.filter(event_type="video_progress").count(), 3)
        self.assertEqual(rows.filter(event_type="video_complete").count(), 1)

    def test_progress_milestones_carry_position_and_duration(self):
        self.watch("vidvisitor0002", "vidsession0002", milestones=(50,))
        ev = AnalyticsEvent.objects.get(event_type="video_progress", anonymous_id="vidvisitor0002")
        self.assertEqual(ev.metadata["percent"], 50)
        self.assertEqual(ev.metadata["watched_seconds"], 50)
        self.assertEqual(ev.metadata["duration"], 100)

    def test_impression_pause_and_exit_are_recorded(self):
        for kind, meta in (
            ("video_impression", {}),
            ("video_pause", {"position": 30, "duration": 100}),
            ("video_exit", {"position": 62, "duration": 100}),
        ):
            self.ingest({"event_type": kind, "content_type": "video", "content_id": self.VID,
                         "anonymous_id": "vidvisitor0003", "session_id": "vidsession0003",
                         "metadata": meta})
        rows = AnalyticsEvent.objects.filter(anonymous_id="vidvisitor0003")
        self.assertEqual(rows.filter(event_type="video_impression").count(), 1)
        self.assertEqual(rows.filter(event_type="video_pause").count(), 1)
        self.assertEqual(rows.get(event_type="video_exit").metadata["position"], 62)

    def test_one_viewer_with_five_events_is_one_unique_viewer(self):
        """The headline miscount this replaces.

        start + 25 + 50 + 75 + complete is FIVE events describing ONE person
        watching ONE video. Counting rows instead of distinct visitors is what
        turned a single viewer into five.
        """
        self.watch("vidvisitor0004", "vidsession0004", complete=True)
        res = self.admin_get(
            f"/api/admin-panel/analytics/videos/{self.VID}/viewers/", range="30d",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["unique_viewers"], 1)
        self.assertEqual(res.data["completed"], 1)

    def test_unique_viewers_counts_distinct_people(self):
        self.watch("vidvisitor0005", "vidsession0005", complete=True)
        self.watch("vidvisitor0006", "vidsession0006", complete=False)
        self.watch("vidvisitor0007", "vidsession0007", complete=True)
        res = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/viewers/", range="30d")
        self.assertEqual(res.data["unique_viewers"], 3)
        self.assertEqual(res.data["completed"], 2)

    def test_video_viewers_are_broken_down_by_location(self):
        self.watch("vidvisitor0008", "vidsession0008", ip=PUBLIC_IPV4)
        res = self.admin_get(f"/api/admin-panel/analytics/videos/{self.VID}/viewers/", range="30d")
        india = next(c for c in res.data["by_country"] if c["country_code"] == "IN")
        self.assertEqual(india["viewers"], 1)
        self.assertEqual(india["country"], "India")
        self.assertEqual(india["cities"][0]["city"], "Hyderabad")

    def test_video_events_carry_the_viewers_location(self):
        self.watch("vidvisitor0009", "vidsession0009", ip=PUBLIC_IPV4)
        ev = AnalyticsEvent.objects.filter(
            event_type="video_start", anonymous_id="vidvisitor0009",
        ).get()
        self.assertEqual(ev.country, "IN")
        self.assertEqual(ev.city, "Hyderabad")
        self.assertEqual(ev.visitor.city, "Hyderabad")


# ── 22-23: admin filtering ───────────────────────────────────────────────────
class AdminFilteringTests(VisitorAnalyticsBase):
    def _seed_two_countries(self):
        self.page_view("filtervisitor1", "filtersession1", ip=PUBLIC_IPV4)  # IN / Hyderabad
        self.mock_geo.return_value = FakeGeoResponse({
            "status": "success", "country": "Sri Lanka", "countryCode": "LK",
            "regionName": "Western", "region": "1", "city": "Colombo",
            "timezone": "Asia/Colombo", "lat": 6.9, "lon": 79.8, "isp": "SLT",
        })
        self.page_view("filtervisitor2", "filtersession2", ip="112.134.1.1")

    def test_visitor_list_can_be_filtered_by_country(self):
        self._seed_two_countries()
        res = self.admin_get("/api/admin-panel/analytics/visitors/", range="30d", country="LK")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["total"], 1)
        self.assertEqual(res.data["results"][0]["visitor_id"], "filtervisitor2")

    def test_visitor_list_can_be_filtered_by_city(self):
        self._seed_two_countries()
        res = self.admin_get("/api/admin-panel/analytics/visitors/", range="30d", city="Hyderabad")
        self.assertEqual(res.data["total"], 1)
        self.assertEqual(res.data["results"][0]["visitor_id"], "filtervisitor1")

    def test_visitor_list_is_paginated(self):
        for i in range(7):
            self.page_view(f"pagevisitor{i:03d}", f"pagesession{i:03d}", ip=PUBLIC_IPV4)
        res = self.admin_get("/api/admin-panel/analytics/visitors/", range="30d", page=1, page_size=3)
        self.assertEqual(res.data["total"], 7)
        self.assertEqual(res.data["page_size"], 3)
        self.assertEqual(len(res.data["results"]), 3)
        self.assertEqual(res.data["total_pages"], 3)

    def test_visitor_locations_roll_up_country_region_city(self):
        self._seed_two_countries()
        res = self.admin_get("/api/admin-panel/analytics/visitor-locations/", range="30d")
        by_code = {c["country_code"]: c for c in res.data}
        self.assertEqual(by_code["IN"]["visitors"], 1)
        self.assertEqual(by_code["IN"]["regions"][0]["region"], "Telangana")
        self.assertEqual(by_code["IN"]["regions"][0]["cities"][0]["city"], "Hyderabad")
        self.assertEqual(by_code["LK"]["visitors"], 1)

    def test_unresolved_location_is_bucketed_not_dropped(self):
        """Totals must still add up when a lookup fails.

        The old report used `.exclude(country="")`, which silently removed
        unresolved rows — so the country breakdown could total fewer visitors
        than the visitor count, with no indication anything was missing.
        """
        self.mock_geo.return_value = FakeGeoResponse({"status": "fail"})
        self.page_view("unresolvedvis1", "unresolvedses1", ip=PUBLIC_IPV4)
        res = self.admin_get("/api/admin-panel/analytics/visitor-locations/", range="30d")
        total = sum(c["visitors"] for c in res.data)
        self.assertEqual(total, 1)
        self.assertEqual(res.data[0]["country"], "Unknown")

    def test_visitor_detail_returns_profile_and_timeline(self):
        self.page_view("detailvisitor1", "detailsession1", url="/")
        self.ingest({"event_type": "click", "url": "/", "anonymous_id": "detailvisitor1",
                     "session_id": "detailsession1", "element_id": "poker_cta",
                     "element_label": "Poker", "client_event_id": "detail-click"})
        self.page_view("detailvisitor1", "detailsession1", url="/poker")

        res = self.admin_get("/api/admin-panel/analytics/visitors/detailvisitor1/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["approximate_location"], "Hyderabad, Telangana, India")
        self.assertEqual(res.data["ip_address"], PUBLIC_IPV4)
        self.assertEqual(res.data["page_views"], 2)
        self.assertEqual(res.data["clicks"], 1)
        self.assertEqual(len(res.data["timeline"]), 3)
        self.assertEqual(
            sorted(p["url"] for p in res.data["pages_viewed"]), ["/", "/poker"],
        )

    def test_visitor_detail_404s_for_an_unknown_visitor(self):
        res = self.admin_get("/api/admin-panel/analytics/visitors/nosuchvisitor/")
        self.assertEqual(res.status_code, 404)

    def test_clicks_report_separates_clicks_from_unique_clickers(self):
        for i in range(3):
            self.ingest({"event_type": "click", "anonymous_id": "clickvisitor01",
                         "session_id": "clicksession01", "element_id": "poker_cta",
                         "element_label": "Poker CTA", "client_event_id": f"c-{i}"},
                        ip=PUBLIC_IPV4)
        self.ingest({"event_type": "click", "anonymous_id": "clickvisitor02",
                     "session_id": "clicksession02", "element_id": "poker_cta",
                     "element_label": "Poker CTA", "client_event_id": "c-other"},
                    ip=PUBLIC_IPV4)

        res = self.admin_get("/api/admin-panel/analytics/clicks/", range="30d")
        self.assertEqual(res.data["total_clicks"], 4)
        self.assertEqual(res.data["unique_clickers"], 2)
        element = next(e for e in res.data["by_element"] if e["element_id"] == "poker_cta")
        self.assertEqual(element["clicks"], 4)
        self.assertEqual(element["unique_clickers"], 2)
        self.assertEqual(element["element_label"], "Poker CTA")

    def test_clicks_can_be_filtered_by_country(self):
        self.ingest({"event_type": "click", "anonymous_id": "clickvisitor03",
                     "session_id": "clicksession03", "element_id": "a",
                     "client_event_id": "cf-1"}, ip=PUBLIC_IPV4)
        res = self.admin_get("/api/admin-panel/analytics/clicks/", range="30d", country="IN")
        self.assertEqual(res.data["total_clicks"], 1)
        res = self.admin_get("/api/admin-panel/analytics/clicks/", range="30d", country="LK")
        self.assertEqual(res.data["total_clicks"], 0)

    def test_visitors_overview_counts_are_real(self):
        self.page_view("overviewvis001", "overviewses001", url="/")
        self.page_view("overviewvis001", "overviewses001", url="/events")
        self.page_view("overviewvis002", "overviewses002", url="/")

        res = self.admin_get("/api/admin-panel/analytics/visitors/overview/", range="30d")
        self.assertEqual(res.data["visitors"], 2)
        self.assertEqual(res.data["new_visitors"], 2)
        self.assertEqual(res.data["returning_visitors"], 0)
        self.assertEqual(res.data["sessions"], 2)
        self.assertEqual(res.data["page_views"], 3)
        self.assertEqual(res.data["geo_resolved"], 2)


# ── 24: authorization ────────────────────────────────────────────────────────
class AdminAuthorizationTests(VisitorAnalyticsBase):
    VISITOR_ENDPOINTS = [
        "/api/admin-panel/analytics/visitors/",
        "/api/admin-panel/analytics/visitors/overview/",
        "/api/admin-panel/analytics/visitor-locations/",
        "/api/admin-panel/analytics/clicks/",
        "/api/admin-panel/analytics/diagnostic/",
    ]

    def test_anonymous_users_cannot_reach_visitor_analytics(self):
        self.client.force_authenticate(user=None)
        for url in self.VISITOR_ENDPOINTS:
            with self.subTest(url=url):
                self.assertIn(self.client.get(url).status_code, (401, 403))

    def test_normal_members_cannot_reach_visitor_analytics(self):
        self.client.force_authenticate(user=self.member)
        for url in self.VISITOR_ENDPOINTS:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)

    def test_normal_members_cannot_read_a_visitors_ip_or_location(self):
        self.page_view("privatevisitor", "privatesession", ip=PUBLIC_IPV4)
        self.client.force_authenticate(user=self.member)
        res = self.client.get("/api/admin-panel/analytics/visitors/privatevisitor/")
        self.assertEqual(res.status_code, 403)
        self.assertNotIn(PUBLIC_IPV4, str(res.data))

    def test_the_public_ingest_response_leaks_nothing_about_the_visitor(self):
        res = self.page_view("leakvisitor001", "leaksession001", ip=PUBLIC_IPV4)
        body = str(res.data)
        self.assertEqual(set(res.data.keys()), {"recorded"})
        for secret in (PUBLIC_IPV4, "Hyderabad", "Telangana", "India"):
            self.assertNotIn(secret, body)


# ── 25: bots and health checks ───────────────────────────────────────────────
class BotFilteringTests(VisitorAnalyticsBase):
    def test_crawlers_do_not_create_visitors(self):
        for ua in (
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
            "curl/8.4.0",
            "python-requests/2.31.0",
        ):
            with self.subTest(ua=ua):
                res = self.page_view("botvisitor0001", "botsession0001", ua=ua)
                self.assertEqual(res.data["recorded"], 0)
        self.assertEqual(Visitor.objects.count(), 0)
        self.assertEqual(AnalyticsEvent.objects.count(), 0)

    def test_health_checks_and_monitors_are_excluded(self):
        for ua in ("", "ELB-HealthChecker/2.0", "Pingdom.com_bot_version_1.4"):
            with self.subTest(ua=ua):
                res = self.page_view("botvisitor0002", "botsession0002", ua=ua)
                self.assertEqual(res.data["recorded"], 0)
        self.assertEqual(Visitor.objects.count(), 0)

    def test_real_browsers_are_not_excluded(self):
        real_browsers = [
            BROWSER_UA,
            ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
             "(KHTML, like Gecko) Version/17.1 Safari/605.1.15"),
            ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"),
            ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 "
             "(KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"),
        ]
        for i, ua in enumerate(real_browsers):
            with self.subTest(ua=ua[:40]):
                res = self.page_view(f"humanvisitor{i:02d}", f"humansession{i:02d}", ua=ua)
                self.assertEqual(res.data["recorded"], 1, "a real browser must never be filtered")
        self.assertEqual(Visitor.objects.count(), len(real_browsers))


# ── 27: analytics must never break the site ──────────────────────────────────
class ResilienceTests(VisitorAnalyticsBase):
    def test_a_visitor_resolution_failure_still_records_the_event(self):
        with patch("authapp.services.visitor_service.build_context", return_value=None):
            res = self.page_view("resilientvis01", "resilientses01", ip=PUBLIC_IPV4)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["recorded"], 1)
        ev = AnalyticsEvent.objects.get(anonymous_id="resilientvis01")
        self.assertIsNone(ev.visitor_id)
        self.assertEqual(ev.event_type, "page_view", "the event survives even without a visitor")

    def test_a_database_error_while_resolving_does_not_500(self):
        from django.db import DatabaseError
        with patch("authapp.services.visitor_service.Visitor.objects.get_or_create",
                   side_effect=DatabaseError("visitor table unavailable")):
            res = self.page_view("resilientvis02", "resilientses02", ip=PUBLIC_IPV4)
        self.assertEqual(res.status_code, 201, "analytics must degrade, never fail the request")

    def test_a_malformed_event_in_a_batch_does_not_lose_the_good_ones(self):
        res = self.ingest({"events": [
            {"event_type": "page_view", "anonymous_id": "batchvisitor01", "session_id": "batchses01"},
            {"event_type": "not_a_real_type", "anonymous_id": "batchvisitor01"},
            {"event_type": "click", "anonymous_id": "batchvisitor01", "session_id": "batchses01",
             "element_id": "x", "client_event_id": "batch-click"},
        ]})
        self.assertEqual(res.data["recorded"], 2)

    def test_one_batch_resolves_the_visitor_once(self):
        self.ingest({"events": [
            {"event_type": "page_view", "anonymous_id": "batchvisitor02", "session_id": "batchses02"},
            {"event_type": "video_start", "content_type": "video", "content_id": "v",
             "anonymous_id": "batchvisitor02", "session_id": "batchses02",
             "client_event_id": "b-start"},
            {"event_type": "video_progress", "content_type": "video", "content_id": "v",
             "anonymous_id": "batchvisitor02", "session_id": "batchses02",
             "metadata": {"percent": 25}, "client_event_id": "b-25"},
        ]}, ip=PUBLIC_IPV4)
        self.assertEqual(self.mock_geo.call_count, 1)
        self.assertEqual(AnalyticsEvent.objects.filter(anonymous_id="batchvisitor02").count(), 3)


# ── Traffic source ───────────────────────────────────────────────────────────
class TrafficSourceTests(VisitorAnalyticsBase):
    def test_no_referrer_is_direct(self):
        self.page_view("sourcevisitor1", "sourcesession1")
        self.assertEqual(Visitor.objects.get(visitor_id="sourcevisitor1").traffic_source, "Direct")

    def test_search_and_social_referrers_are_named(self):
        cases = {
            "https://www.google.com/search?q=poker": "Google",
            "https://m.facebook.com/": "Facebook",
            "https://l.instagram.com/": "Instagram",
        }
        for i, (referrer, expected) in enumerate(cases.items()):
            with self.subTest(referrer=referrer):
                self.ingest({"event_type": "page_view", "url": "/",
                             "anonymous_id": f"srcvisitor{i:03d}", "session_id": f"srcsession{i:03d}",
                             "referrer": referrer})
                v = Visitor.objects.get(visitor_id=f"srcvisitor{i:03d}")
                self.assertEqual(v.traffic_source, expected)

    def test_an_unrecognised_referrer_is_labelled_referral(self):
        self.ingest({"event_type": "page_view", "url": "/", "anonymous_id": "sourcevisitor2",
                     "session_id": "sourcesession2", "referrer": "https://somepartner.example/"})
        v = Visitor.objects.get(visitor_id="sourcevisitor2")
        self.assertTrue(v.traffic_source.startswith("Referral:"))
        self.assertIn("somepartner.example", v.traffic_source)

    def test_utm_source_outranks_the_referrer(self):
        self.ingest({"event_type": "page_view", "url": "/", "anonymous_id": "sourcevisitor3",
                     "session_id": "sourcesession3", "referrer": "https://www.google.com/",
                     "utm_source": "newsletter"})
        self.assertEqual(
            Visitor.objects.get(visitor_id="sourcevisitor3").traffic_source, "Newsletter",
        )


# ── Diagnostic + retention ───────────────────────────────────────────────────
class DiagnosticTests(VisitorAnalyticsBase):
    def test_diagnostic_reports_the_ip_source_and_provider(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            "/api/admin-panel/analytics/diagnostic/",
            HTTP_USER_AGENT=BROWSER_UA,
            HTTP_X_FORWARDED_FOR=f"{PUBLIC_IPV4}, {CLOUDFLARE_EDGE}, {INTERNAL_HOP}",
            HTTP_CF_CONNECTING_IP=PUBLIC_IPV4,
            HTTP_CF_IPCOUNTRY="IN",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["ip"], PUBLIC_IPV4)
        self.assertEqual(res.data["ip_source"], "CF-Connecting-IP")
        self.assertEqual(res.data["geo_provider"], "ip-api.com")
        self.assertTrue(res.data["cf_ipcountry_present"])
        self.assertEqual(res.data["city"], "Hyderabad")
        self.assertFalse(res.data["detected_as_bot"])

    def test_diagnostic_records_nothing(self):
        self.client.force_authenticate(user=self.admin)
        self.client.get("/api/admin-panel/analytics/diagnostic/", HTTP_USER_AGENT=BROWSER_UA)
        self.assertEqual(Visitor.objects.count(), 0)
        self.assertEqual(VisitorSession.objects.count(), 0)
        self.assertEqual(AnalyticsEvent.objects.count(), 0)

    def test_diagnostic_flags_a_missing_cloudflare_country_header(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/admin-panel/analytics/diagnostic/", HTTP_USER_AGENT=BROWSER_UA)
        self.assertFalse(res.data["cf_ipcountry_present"])
        self.assertIsNone(res.data["cf_ipcountry_header"])


class IpRetentionTests(VisitorAnalyticsBase):
    def test_pruning_clears_old_ips_but_keeps_location(self):
        self.page_view("retentionvis01", "retentionses01", ip=PUBLIC_IPV4)
        v = Visitor.objects.get(visitor_id="retentionvis01")
        self.assertEqual(v.ip_address, PUBLIC_IPV4)

        old = timezone.now() - timedelta(days=200)
        Visitor.objects.filter(pk=v.pk).update(last_seen=old)
        VisitorSession.objects.filter(visitor=v).update(last_activity_at=old)

        call_command("prune_analytics_ips")

        v.refresh_from_db()
        self.assertIsNone(v.ip_address, "the address must be forgotten")
        self.assertEqual(v.city, "Hyderabad", "derived location must survive pruning")
        self.assertEqual(v.country_code, "IN")
        self.assertIsNone(VisitorSession.objects.get(session_id="retentionses01").ip_address)

    def test_pruning_leaves_recent_visitors_alone(self):
        self.page_view("retentionvis02", "retentionses02", ip=PUBLIC_IPV4)
        call_command("prune_analytics_ips")
        self.assertEqual(
            Visitor.objects.get(visitor_id="retentionvis02").ip_address, PUBLIC_IPV4,
        )

    def test_dry_run_changes_nothing(self):
        self.page_view("retentionvis03", "retentionses03", ip=PUBLIC_IPV4)
        Visitor.objects.filter(visitor_id="retentionvis03").update(
            last_seen=timezone.now() - timedelta(days=200),
        )
        call_command("prune_analytics_ips", "--dry-run")
        self.assertEqual(
            Visitor.objects.get(visitor_id="retentionvis03").ip_address, PUBLIC_IPV4,
        )
