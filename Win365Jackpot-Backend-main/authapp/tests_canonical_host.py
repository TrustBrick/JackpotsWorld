"""
authapp/tests_canonical_host.py
─────────────────────────────────────────────────────────────────────────────
WWWRedirectMiddleware, and specifically the two things that are easy to get
wrong when quietening a noisy log:

  1. Quietening must not become allowing. A Host outside ALLOWED_HOSTS still
     has to be refused with a 400 — the point was to stop the traceback, not
     to start serving the site on a load-balancer IP.
  2. The signal must survive. If the ALB health checker ever shows up here it
     means the instance's private IP is missing from ALLOWED_HOSTS and the
     whole environment is about to go unhealthy, so that case has to stay
     visible in the log rather than being swallowed with the scans.
"""

from django.test import SimpleTestCase, override_settings


@override_settings(
    ALLOWED_HOSTS=["jackpotsworld.vip", "www.jackpotsworld.vip", "172.31.5.186"],
    ROOT_URLCONF="authapp.tests_canonical_host",
)
class CanonicalHostMiddlewareTests(SimpleTestCase):
    def test_an_unknown_host_is_refused_with_400_and_no_exception(self):
        """A load-balancer IP, which is what the internet scans all day."""
        with self.assertLogs("authapp.middleware.canonical_host", level="WARNING") as logs:
            res = self.client.get("/", HTTP_HOST="3.6.226.175")

        self.assertEqual(res.status_code, 400)
        # One line, not a stack trace.
        self.assertEqual(len(logs.output), 1)
        self.assertIn("3.6.226.175", logs.output[0])
        self.assertNotIn("Traceback", logs.output[0])

    def test_the_refusal_log_names_the_agent_so_a_real_fault_is_recognisable(self):
        """The health checker arriving here is an outage, not noise. It has to
        be distinguishable in the log from a scanner."""
        with self.assertLogs("authapp.middleware.canonical_host", level="WARNING") as logs:
            self.client.get("/", HTTP_HOST="10.0.0.9", HTTP_USER_AGENT="ELB-HealthChecker/2.0")

        self.assertIn("ELB-HealthChecker/2.0", logs.output[0])

    def test_quietening_did_not_become_allowing(self):
        """The whole risk of this change: a 400 must still be a 400."""
        self.assertEqual(self.client.get("/", HTTP_HOST="evil.example.com").status_code, 400)
        self.assertEqual(self.client.get("/", HTTP_HOST="3.6.226.175").status_code, 400)

    def test_a_giant_host_header_cannot_flood_the_log(self):
        with self.assertLogs("authapp.middleware.canonical_host", level="WARNING") as logs:
            self.client.get("/", HTTP_HOST="a" * 5000)

        self.assertLess(len(logs.output[0]), 1000)

    def test_an_allowed_host_still_passes_through(self):
        res = self.client.get("/", HTTP_HOST="jackpotsworld.vip")
        self.assertEqual(res.status_code, 200)

    def test_the_albs_health_check_host_still_passes(self):
        """The private IP settings.py appends from EC2 metadata. If this ever
        fails the environment goes unhealthy, so it is worth pinning."""
        res = self.client.get("/", HTTP_HOST="172.31.5.186")
        self.assertEqual(res.status_code, 200)

    def test_www_is_still_redirected_to_the_apex(self):
        res = self.client.get("/promotions/?a=1", HTTP_HOST="www.jackpotsworld.vip")
        self.assertEqual(res.status_code, 301)
        self.assertEqual(res["Location"], "http://jackpotsworld.vip/promotions/?a=1")


# A URLconf with one trivial view, so these tests exercise the middleware
# rather than the real routing table.
from django.http import HttpResponse  # noqa: E402
from django.urls import path  # noqa: E402


def _ok(request):
    return HttpResponse("ok")


urlpatterns = [
    path("", _ok),
    path("promotions/", _ok),
]
