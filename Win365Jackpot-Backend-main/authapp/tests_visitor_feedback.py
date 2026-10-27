"""VISITOR-FEEDBACK: the public feedback form and the Back Office list,
including "Publish as testimonial"."""

from django.core import mail
from django.core.cache import cache
from rest_framework.test import APITestCase

from authapp.models.landing_models import Testimonial
from authapp.models.user_model import User
from authapp.models.visitor_feedback_models import FeedbackPromptEvent, VisitorFeedback

PUBLIC = "/api/feedback/"
ADMIN = "/api/admin-panel/visitor-feedback/"


class VisitorFeedbackTests(APITestCase):
    def setUp(self):
        cache.clear()  # throttle counters
        self.admin = User.objects.create_user(
            email="fb-admin@example.com", password="pw12345!", name="Admin",
            is_staff=True, is_superuser=True,
        )
        self.member = User.objects.create_user(
            email="fb-member@example.com", password="pw12345!", name="Fb Member",
        )

    def _send(self, **overrides):
        payload = {"rating": 4, "category": "suggestion", "message": "Add more Macau packages",
                   "page_path": "/casino-in-macau", "language": "en", "country_code": "IN"}
        payload.update(overrides)
        return self.client.post(PUBLIC, payload, format="json")

    # ── public form ─────────────────────────────────────────────────────────

    def test_anonymous_visitor_can_leave_feedback(self):
        r = self._send()
        self.assertEqual(r.status_code, 201, r.data)
        fb = VisitorFeedback.objects.get()
        self.assertEqual((fb.rating, fb.category, fb.status), (4, "suggestion", "new"))
        self.assertEqual(fb.page_path, "/casino-in-macau")
        self.assertIsNone(fb.user)
        self.assertEqual(fb.name, "")

    def test_response_does_not_echo_the_row(self):
        r = self._send()
        self.assertEqual(set(r.data), {"message"})

    def test_rating_and_message_are_validated(self):
        self.assertEqual(self._send(rating=0).status_code, 400)
        self.assertEqual(self._send(rating=6).status_code, 400)
        self.assertEqual(self._send(message="x" * 2001).status_code, 400)
        self.assertFalse(VisitorFeedback.objects.exists())

    def test_a_prompted_rating_needs_no_comment(self):
        r = self._send(message="", trigger="registration")
        self.assertEqual(r.status_code, 201, r.data)
        fb = VisitorFeedback.objects.get()
        self.assertEqual((fb.message, fb.trigger), ("", "registration"))

    def test_trigger_defaults_to_manual_and_unknown_values_fall_back(self):
        self._send()
        self._send(trigger="something_new")
        self.assertEqual(list(VisitorFeedback.objects.values_list("trigger", flat=True)),
                         ["manual", "manual"])

    def test_client_cannot_set_status_or_testimonial(self):
        self._send(status="resolved", testimonial=1, admin_note="hi")
        fb = VisitorFeedback.objects.get()
        self.assertEqual((fb.status, fb.testimonial_id, fb.admin_note), ("new", None, ""))

    def test_honeypot_submission_is_dropped_silently(self):
        r = self._send(website="http://spam.example")
        self.assertEqual(r.status_code, 201)
        self.assertFalse(VisitorFeedback.objects.exists())

    def test_signed_in_member_gets_name_and_email_filled(self):
        self.client.force_authenticate(self.member)
        self._send()
        fb = VisitorFeedback.objects.get()
        self.assertEqual((fb.user, fb.name, fb.email), (self.member, "Fb Member", "fb-member@example.com"))

    def test_public_form_is_throttled(self):
        codes = [self._send().status_code for _ in range(6)]
        self.assertEqual(codes[:5], [201] * 5)
        self.assertEqual(codes[5], 429)

    # ── Back Office ─────────────────────────────────────────────────────────

    def test_admin_list_filters_and_summary(self):
        self._send(rating=5, category="compliment", message="Great concierge")
        self._send(rating=2, category="problem", message="Page was slow")
        self.client.force_authenticate(self.admin)

        r = self.client.get(ADMIN, {"category": "problem"})
        self.assertEqual([row["message"] for row in r.data["results"]], ["Page was slow"])
        r = self.client.get(ADMIN, {"q": "concierge"})
        self.assertEqual(r.data["count"], 1)
        r = self.client.get(ADMIN, {"rating": 5})
        self.assertEqual(r.data["count"], 1)

        s = self.client.get(ADMIN + "summary/").data
        self.assertEqual((s["total"], s["new"], s["average_rating"]), (2, 2, 3.5))
        self.assertEqual(s["by_rating"]["5"], 1)

    def test_page_helpful_thumbs_stay_out_of_the_star_average(self):
        self._send(rating=4, trigger="signup", message="")
        self._send(rating=5, trigger="page_helpful", message="")
        self._send(rating=1, trigger="page_helpful", message="")
        self.client.force_authenticate(self.admin)
        s = self.client.get(ADMIN + "summary/").data
        self.assertEqual((s["total"], s["average_rating"]), (3, 4.0))
        self.assertEqual(s["page_helpful"], {"yes": 1, "no": 1})
        self.assertEqual(s["by_trigger"], {"signup": {"count": 1, "average": 4.0}})
        r = self.client.get(ADMIN, {"trigger": "page_helpful"})
        self.assertEqual(r.data["count"], 2)
        self.assertEqual(r.data["results"][0]["trigger_label"], "Was this page helpful?")

    def test_feedback_without_text_cannot_be_published_unless_text_is_given(self):
        self._send(rating=5, message="")
        fb = VisitorFeedback.objects.get()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f"{ADMIN}{fb.id}/publish/", {}, format="json").status_code, 400)
        ok = self.client.post(f"{ADMIN}{fb.id}/publish/", {"text": "Lovely trip"}, format="json")
        self.assertEqual(ok.status_code, 201, ok.data)

    def test_admin_can_update_status_and_note_only(self):
        self._send()
        fb = VisitorFeedback.objects.get()
        self.client.force_authenticate(self.admin)
        r = self.client.patch(f"{ADMIN}{fb.id}/",
                              {"status": "resolved", "admin_note": "Done", "message": "edited"},
                              format="json")
        self.assertEqual(r.status_code, 200, r.data)
        fb.refresh_from_db()
        self.assertEqual((fb.status, fb.admin_note, fb.message),
                         ("resolved", "Done", "Add more Macau packages"))
        bad = self.client.patch(f"{ADMIN}{fb.id}/", {"status": "deleted"}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_publish_as_testimonial_once(self):
        self._send(rating=5, category="compliment", message="Best trip ever", name="Ravi K")
        fb = VisitorFeedback.objects.get()
        self.client.force_authenticate(self.admin)

        r = self.client.post(f"{ADMIN}{fb.id}/publish/", {"city": "Chennai"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        t = Testimonial.objects.get(pk=r.data["testimonial"])
        self.assertEqual((t.name, t.city, t.rating, t.text, t.is_active, t.country_code),
                         ("Ravi K", "Chennai", 5, "Best trip ever", True, "IN"))
        fb.refresh_from_db()
        self.assertEqual((fb.testimonial, fb.status), (t, "reviewed"))

        again = self.client.post(f"{ADMIN}{fb.id}/publish/", {}, format="json")
        self.assertEqual(again.status_code, 409)
        self.assertEqual(Testimonial.objects.filter(text="Best trip ever").count(), 1)

    def test_publish_uses_edits_and_a_default_name(self):
        self._send(message="good sevice")
        fb = VisitorFeedback.objects.get()
        self.client.force_authenticate(self.admin)
        r = self.client.post(f"{ADMIN}{fb.id}/publish/", {"text": "Good service"}, format="json")
        t = Testimonial.objects.get(pk=r.data["testimonial"])
        self.assertEqual((t.name, t.text), ("JackpotsWorld Guest", "Good service"))

    def test_admin_endpoints_refuse_non_staff(self):
        self._send()
        fb = VisitorFeedback.objects.get()
        self.assertEqual(self.client.get(ADMIN).status_code, 401)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(ADMIN).status_code, 403)
        self.assertEqual(self.client.get(ADMIN + "summary/").status_code, 403)
        self.assertEqual(self.client.post(f"{ADMIN}{fb.id}/publish/", {}).status_code, 403)
        self.assertFalse(Testimonial.objects.filter(text="Add more Macau packages").exists())


EVENT = "/api/feedback/prompt-event/"


class FeedbackAlertsAndPromptEventTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            email="fb-admin2@example.com", password="pw12345!", name="Admin",
            is_staff=True, is_superuser=True,
        )

    def _send(self, **overrides):
        payload = {"rating": 5, "trigger": "deposit", "message": ""}
        payload.update(overrides)
        return self.client.post(PUBLIC, payload, format="json")

    def test_new_moments_are_stored_not_folded_into_manual(self):
        for trigger in ("deposit", "withdrawal", "support_call"):
            self._send(trigger=trigger)
        self.assertEqual(sorted(VisitorFeedback.objects.values_list("trigger", flat=True)),
                         ["deposit", "support_call", "withdrawal"])

    def test_low_rating_emails_support(self):
        self._send(rating=1, trigger="withdrawal", message="Still waiting", page_path="/dashboard")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["support@jackpotsworld.vip"])
        self.assertIn("1/5", mail.outbox[0].subject)
        self.assertIn("Still waiting", mail.outbox[0].body)

    def test_good_rating_and_page_helpful_thumb_down_send_no_email(self):
        self._send(rating=4)
        self._send(rating=1, trigger="page_helpful")
        self.assertEqual(len(mail.outbox), 0)

    def test_a_failing_email_never_breaks_the_thank_you(self):
        from unittest import mock
        with mock.patch("django.core.mail.EmailMultiAlternatives.send", side_effect=OSError("smtp down")):
            r = self._send(rating=1)
        self.assertEqual(r.status_code, 201)
        self.assertEqual(VisitorFeedback.objects.count(), 1)

    def test_prompt_events_are_recorded_and_validated(self):
        self.assertEqual(self.client.post(EVENT, {"trigger": "deposit", "event": "shown"}, format="json").status_code, 204)
        self.assertEqual(self.client.post(EVENT, {"trigger": "nope", "event": "shown"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(EVENT, {"trigger": "deposit", "event": "x"}, format="json").status_code, 400)
        self.assertEqual(FeedbackPromptEvent.objects.count(), 1)

    def test_summary_reports_response_rate_per_moment(self):
        for _ in range(4):
            self.client.post(EVENT, {"trigger": "signup", "event": "shown"}, format="json")
        self.client.post(EVENT, {"trigger": "signup", "event": "dismissed"}, format="json")
        self._send(trigger="signup", rating=5)
        self.client.force_authenticate(self.admin)
        s = self.client.get(ADMIN + "summary/").data
        self.assertEqual(s["prompts"]["signup"],
                         {"shown": 4, "dismissed": 1, "answered": 1, "response_rate": 25})
