"""
authapp/tests_admin_audit.py
─────────────────────────────────────────────────────────────────────────────
FULL-ADMIN-AUDIT — proof that an admin cannot change something without the
database recording that they did.

The test that matters most is `test_an_endpoint_that_logs_nothing_is_logged`.
It drives the real FAQ admin endpoints, which contain no ActivityLog call of
their own and never did, and asserts a row exists anyway. That is the whole
claim: coverage no longer depends on whoever wrote the view remembering.

The rest defend the edges that make an audit trail trustworthy rather than
merely large:
  * a refused action is recorded as an attempt, not dropped (an audit trail
    that only keeps successes cannot show what someone tried to do);
  * secrets in a payload never reach the table, because staff read this;
  * a view that already logged in detail is not shadowed by a vague duplicate;
  * reads are not logged, or the rows that matter drown.
"""

import json
from io import BytesIO

from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from authapp.models import ActivityLog, User
from authapp.models.faq_models import FAQ
from authapp.models.promotion_models import Promotion


# The audit middleware is appended to MIDDLEWARE in settings, so it is active
# for these tests as it is in production; nothing here has to install it.
class AdminAuditMiddlewareTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="auditadmin@jackpotsworld.vip", password="pw-admin-1234", name="Audit Admin",
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])

        self.player = User.objects.create_user(
            email="auditplayer@jackpotsworld.vip", password="pw-player-1234", name="Audit Player",
        )

        self.client = APIClient()
        ActivityLog.objects.all().delete()  # migrations seed nothing here, but be explicit

    def _as_admin(self):
        self.client.force_authenticate(user=self.admin)

    # ── the point of the whole change ────────────────────────────────────────

    def test_an_endpoint_that_logs_nothing_is_logged(self):
        """
        The FAQ admin views contain no ActivityLog call. Before the
        middleware, creating and deleting an FAQ left no trace at all.
        """
        self._as_admin()

        res = self.client.post(
            "/api/admin-panel/faqs/",
            data=json.dumps({"category": "landing", "question": "Q?", "answer": "A."}),
            content_type="application/json",
        )
        self.assertIn(res.status_code, (200, 201), res.content)

        row = ActivityLog.objects.get()
        self.assertEqual(row.action, "admin_create")
        self.assertEqual(row.actor, self.admin)
        self.assertEqual(row.actor_type, "admin")
        self.assertEqual(row.method, "POST")
        self.assertEqual(row.endpoint, "/api/admin-panel/faqs/")
        self.assertEqual(row.status_code, res.status_code)
        self.assertEqual(row.meta["payload"]["question"], "Q?")

    def test_a_delete_is_recorded_with_the_object_it_removed(self):
        """A deleted row is gone; the audit row is the only thing left that
        says which one it was, so the URL kwargs have to survive."""
        faq = FAQ.objects.create(category="landing", question="Bye?", answer="Yes.")
        self._as_admin()

        res = self.client.delete(f"/api/admin-panel/faqs/{faq.pk}/")
        self.assertEqual(res.status_code, 204, res.content)

        row = ActivityLog.objects.get()
        self.assertEqual(row.action, "admin_delete")
        self.assertEqual(row.meta["url_kwargs"]["pk"], str(faq.pk))

    def test_an_edit_is_recorded_as_an_update(self):
        faq = FAQ.objects.create(category="landing", question="Old?", answer="Old.")
        self._as_admin()

        res = self.client.patch(
            f"/api/admin-panel/faqs/{faq.pk}/",
            data=json.dumps({"question": "New?"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200, res.content)

        row = ActivityLog.objects.get()
        self.assertEqual(row.action, "admin_update")
        self.assertEqual(row.meta["payload"]["question"], "New?")

    # ── what keeps the trail trustworthy ─────────────────────────────────────

    def test_a_refused_action_is_still_recorded(self):
        """
        An admin without permission, or one sending something invalid, still
        tried. A trail that kept only what succeeded would be unable to
        answer "did anyone attempt this?".
        """
        self._as_admin()

        res = self.client.post(
            "/api/admin-panel/faqs/",
            data=json.dumps({"category": "landing"}),  # missing question/answer
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400, res.content)

        row = ActivityLog.objects.get()
        self.assertEqual(row.status_code, 400)
        self.assertEqual(row.meta["outcome"], "failed")
        self.assertIn("failed", row.description)

    def test_secrets_in_a_payload_never_reach_the_table(self):
        """Staff read this table, so anything stored is something they can
        read. Password-ish keys are replaced before the row is written."""
        self._as_admin()

        self.client.post(
            "/api/admin-panel/faqs/",
            data=json.dumps({
                "question": "Q?", "answer": "A.", "category": "landing",
                "password": "hunter2", "new_password": "hunter3",
                "otp": "123456", "api_key": "sk-live-abc", "nested": {"token": "t0ken"},
            }),
            content_type="application/json",
        )

        payload = ActivityLog.objects.get().meta["payload"]
        for key in ("password", "new_password", "otp", "api_key"):
            self.assertEqual(payload[key], "***redacted***", key)
        self.assertEqual(payload["nested"]["token"], "***redacted***")
        # Non-secret fields are kept, or the row would say nothing.
        self.assertEqual(payload["question"], "Q?")

        blob = json.dumps(payload)
        for secret in ("hunter2", "hunter3", "123456", "sk-live-abc", "t0ken"):
            self.assertNotIn(secret, blob)

    def test_a_view_that_logs_in_detail_is_not_shadowed_by_a_duplicate(self):
        """
        Logout writes its own row. The middleware must see that and stay
        quiet, or every richly-logged action gains a vague twin.
        """
        self.client.force_authenticate(user=self.admin)
        res = self.client.post("/api/auth/logout/", data={}, format="json")
        self.assertEqual(res.status_code, 200, res.content)

        row = ActivityLog.objects.get()  # exactly one
        self.assertEqual(row.action, "admin_logout")
        self.assertNotEqual(row.meta.get("source"), "middleware")

    def test_taking_a_call_is_not_skipped_as_chat_noise(self):
        """
        The voice call endpoints are mounted under /live-chat/calls/, so a
        skip rule written as "ignore /live-chat/" silently drops answering,
        holding, transferring and ending calls — the "called" activity this
        feature was asked for. Only the read receipt is excluded.
        """
        from authapp.middleware.admin_audit import _SKIP_PATHS, _is_read_receipt

        for call_path in (
            "/api/admin-panel/live-chat/calls/7/accept/",
            "/api/admin-panel/live-chat/calls/7/end/",
            "/api/admin-panel/live-chat/calls/7/hold/",
            "/api/admin-panel/live-chat/calls/7/transfer/",
            "/api/admin-panel/live-chat/12/messages/",
        ):
            self.assertFalse(
                any(f in call_path for f in _SKIP_PATHS) or _is_read_receipt(call_path),
                f"{call_path} would not be audited",
            )

        self.assertTrue(_is_read_receipt("/api/admin-panel/live-chat/12/read/"))

    def test_a_file_upload_still_works_and_its_bytes_are_not_stored(self):
        """
        The audit reads the request body before the view does. For a file
        upload that would be doubly wrong — it would pull the whole upload
        into memory, and it could consume the stream the view needs, breaking
        every admin image upload on the platform.

        So multipart is never read: the row records that an upload happened
        and what type it was, and the view receives an untouched stream.
        """
        self._as_admin()
        # A real PNG: the model's ImageField runs Pillow over it, so a
        # hand-faked header is rejected before the view is reached and the
        # test would prove nothing about the middleware.
        buf = BytesIO()
        Image.new("RGB", (48, 48), "red").save(buf, format="PNG")
        png = SimpleUploadedFile("promo.png", buf.getvalue(), "image/png")

        res = self.client.post(
            "/api/admin-panel/promotions/",
            data={"country": "India", "title": "Audit Promo", "image": png},
            format="multipart",
        )
        self.assertIn(res.status_code, (200, 201), res.content)

        # The upload itself survived the middleware.
        promo = Promotion.objects.get(title="Audit Promo")
        self.assertTrue(promo.image.name, "the uploaded file never reached the view")

        row = ActivityLog.objects.get()
        self.assertEqual(row.action, "admin_create")
        self.assertEqual(row.endpoint, "/api/admin-panel/promotions/")
        # The shape is recorded; the bytes are not.
        self.assertIn("multipart/form-data", row.meta["payload"]["_content_type"])
        self.assertNotIn("PNG", json.dumps(row.meta))

    def test_an_oversized_payload_is_summarised_not_copied(self):
        """One audit row per action, not a second copy of a bulk import."""
        from django.test import RequestFactory
        from authapp.middleware.admin_audit import AdminAuditMiddleware

        big = json.dumps({"rows": ["x" * 200] * 2000})
        req = RequestFactory().post("/api/admin-panel/faqs/", data=big,
                                    content_type="application/json")
        captured = AdminAuditMiddleware(lambda r: None)._capture_payload(req)
        self.assertEqual(captured["_skipped"], "payload too large")
        self.assertGreater(captured["_bytes"], 64 * 1024)

    def test_reads_are_not_logged(self):
        """The panel polls its dashboards; logging reads would bury the
        writes under millions of rows that say nothing changed."""
        self._as_admin()
        self.client.get("/api/admin-panel/faqs/")
        self.assertEqual(ActivityLog.objects.count(), 0)

    def test_a_player_write_is_not_filed_as_admin_activity(self):
        """Non-staff go through the views that serve them; the net is for
        staff only, and must not relabel a player as an admin."""
        self.client.force_authenticate(user=self.player)
        self.client.post(
            "/api/admin-panel/faqs/",
            data=json.dumps({"question": "Q?", "answer": "A.", "category": "landing"}),
            content_type="application/json",
        )
        self.assertFalse(ActivityLog.objects.filter(actor_type="admin").exists())

    def test_an_unauthenticated_write_is_not_attributed_to_anyone(self):
        self.client.post(
            "/api/admin-panel/faqs/",
            data=json.dumps({"question": "Q?", "answer": "A."}),
            content_type="application/json",
        )
        self.assertEqual(ActivityLog.objects.count(), 0)

    def test_the_mark_does_not_leak_between_requests_on_a_reused_thread(self):
        """
        Worker threads are pooled. If the explicit-log mark survived a
        request, the next admin action on that thread would be silently
        skipped — the failure mode that would make this whole feature look
        like it worked while quietly losing rows.
        """
        self.client.force_authenticate(user=self.admin)
        # Request 1 logs explicitly (logout), which sets the mark.
        self.client.post("/api/auth/logout/", data={}, format="json")
        # Request 2, same thread, logs nothing of its own.
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            "/api/admin-panel/faqs/",
            data=json.dumps({"question": "Q?", "answer": "A.", "category": "landing"}),
            content_type="application/json",
        )

        self.assertTrue(
            ActivityLog.objects.filter(action="admin_create").exists(),
            "the second request was skipped because the first request's mark persisted",
        )

    def test_auditing_never_breaks_the_request_it_is_auditing(self):
        """
        An admin saving a form must not get a 500 because the audit write
        failed. The row is worth a lot; it is worth less than the operation.
        """
        self._as_admin()
        with override_settings():  # isolate the patch below to this test
            from unittest.mock import patch
            with patch.object(ActivityLog, "log", side_effect=RuntimeError("db down")):
                with self.assertLogs("authapp.middleware.admin_audit", level="ERROR"):
                    res = self.client.post(
                        "/api/admin-panel/faqs/",
                        data=json.dumps({"question": "Q?", "answer": "A.", "category": "landing"}),
                        content_type="application/json",
                    )
        self.assertIn(res.status_code, (200, 201))
        self.assertTrue(FAQ.objects.filter(question="Q?").exists())


class ActivityLogFieldTests(TestCase):
    """The columns log() accepted and threw away until now."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="fields@jackpotsworld.vip", password="pw-1234", name="Fields",
        )

    def test_endpoint_and_actor_type_are_stored_not_discarded(self):
        """
        reward_views and user_views have passed these since they were
        written; log() named them in its signature and never wrote them.
        """
        row = ActivityLog.log(
            action="profile_updated", actor=self.user,
            endpoint="/api/user/profile/", actor_type="user",
        )
        row.refresh_from_db()
        self.assertEqual(row.endpoint, "/api/user/profile/")
        self.assertEqual(row.actor_type, "user")

    def test_actor_type_is_derived_from_the_actor_when_not_given(self):
        """So every row can be split staff/player without re-reading the
        actor's privileges as they are *now*."""
        staff = User.objects.create_user(
            email="derived@jackpotsworld.vip", password="pw-1234", name="Derived",
        )
        staff.is_staff = True
        staff.save(update_fields=["is_staff"])

        self.assertEqual(ActivityLog.log(action="login", actor=staff).actor_type, "admin")
        self.assertEqual(ActivityLog.log(action="login", actor=self.user).actor_type, "user")
        # No actor at all (a blocked login attempt) stays null rather than
        # guessing.
        self.assertIsNone(ActivityLog.log(action="admin_login").actor_type)

    def test_the_actions_the_admin_log_filter_asks_for_are_all_valid_choices(self):
        """
        AdminActivityLogView filters on a hardcoded ADMIN_ACTIONS list. Three
        of those names were being written by views while missing from
        ACTION_CHOICES; this keeps the two lists from drifting apart again.
        """
        from authapp.views.admin_views import AdminActivityLogView  # noqa: F401
        import inspect

        src = inspect.getsource(AdminActivityLogView.get)
        valid = {a for a, _ in ActivityLog.ACTION_CHOICES}
        for name in ("user_banned", "user_unbanned", "rolling_points_added",
                     "admin_login", "admin_logout",
                     "admin_create", "admin_update", "admin_delete", "admin_action"):
            self.assertIn(f'"{name}"', src, f"{name} left the view's filter")
            self.assertIn(name, valid, f"{name} is written but is not a valid choice")
