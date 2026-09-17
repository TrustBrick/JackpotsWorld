"""
authapp/tests_email_logs.py
─────────────────────────────────────────────────────────────────────────────
What these tests are really defending:

  1. No email escapes logging — including one sent by code that has never
     heard of the email service. That is the whole premise of putting the
     logging in the backend, and it is the first thing that would rot.
  2. "Sent" never silently becomes "Delivered". The current provider cannot
     confirm delivery, so nothing in this codebase may write that state.
  3. A failure keeps the provider's own words, because "why didn't it arrive"
     is the question this table exists to answer.

The SMTP conversation itself is stubbed: these tests are about what gets
recorded, not about whether Python can talk to Gmail.
"""

import smtplib
from unittest import mock

from django.core import mail
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.email_log_models import (
    EmailLog,
    STATUS_DELIVERED,
    STATUS_FAILED,
    STATUS_PENDING,
    STATUS_SENT,
    TYPE_AFFILIATE_APPROVAL,
    TYPE_OTHER,
    TYPE_OTP_PASSWORD_RESET,
    TYPE_OTP_VERIFICATION,
)
from authapp.models.user_model import User
from authapp.services.email_service import send_email

BACKEND = "authapp.email_backend.LoggingEmailBackend"
SMTP_BASE = "django.core.mail.backends.smtp.EmailBackend"


def _stub_transport(send_result=True, send_exc=None, open_exc=None):
    """Patch out the socket work, leaving the logging behaviour under test.

    open()/close() become no-ops and the parent's single-message _send is
    replaced, which is exactly the seam LoggingEmailBackend wraps.
    """
    def fake_open(self):
        # Django's send_messages bails out early unless `connection` is truthy
        # after open() returns, so a stub that only returns True would make
        # _send unreachable and every row would sit at PENDING.
        self.connection = mock.MagicMock()
        return True

    patches = []
    if open_exc is not None:
        patches.append(mock.patch(f"{SMTP_BASE}.open", autospec=True, side_effect=open_exc))
    else:
        patches.append(mock.patch(f"{SMTP_BASE}.open", autospec=True, side_effect=fake_open))
    patches.append(mock.patch(f"{SMTP_BASE}.close", autospec=True, return_value=None))
    if send_exc is not None:
        patches.append(mock.patch(f"{SMTP_BASE}._send", autospec=True, side_effect=send_exc))
    else:
        patches.append(mock.patch(f"{SMTP_BASE}._send", autospec=True, return_value=send_result))
    return patches


class _TransportCase(APITestCase):
    """Runs a block with the SMTP transport stubbed."""

    def run_with_transport(self, fn, **kwargs):
        patches = _stub_transport(**kwargs)
        for p in patches:
            p.start()
        try:
            return fn()
        finally:
            for p in reversed(patches):
                p.stop()


@override_settings(EMAIL_BACKEND=BACKEND, EMAIL_HOST="smtp.gmail.com")
class EmailLoggingTests(_TransportCase):
    def test_a_successful_send_is_logged_as_sent_not_delivered(self):
        self.run_with_transport(lambda: send_email(
            subject="Welcome", body="hello", to="player@example.com",
            email_type=TYPE_AFFILIATE_APPROVAL, triggered_by="test",
        ))

        log = EmailLog.objects.get()
        self.assertEqual(log.status, STATUS_SENT)
        self.assertIsNotNone(log.sent_at)
        # The point of the whole exercise: SMTP acceptance is not delivery.
        self.assertIsNone(log.delivered_at)
        self.assertNotEqual(log.status, STATUS_DELIVERED)

    def test_an_email_sent_without_the_service_is_still_logged(self):
        """The guarantee. A future developer using plain send_mail(), with no
        knowledge of this system, still produces a row — typed `other`, which
        is honest about the fact that nothing declared what it was."""
        self.run_with_transport(lambda: mail.send_mail(
            "Ad-hoc subject", "body", "from@example.com", ["someone@example.com"],
        ))

        log = EmailLog.objects.get()
        self.assertEqual(log.status, STATUS_SENT)
        self.assertEqual(log.email_type, TYPE_OTHER)
        self.assertEqual(log.recipient_email, "someone@example.com")

    def test_the_provider_is_recorded_per_row(self):
        self.run_with_transport(lambda: send_email(
            subject="s", body="b", to="a@example.com",
        ))
        self.assertEqual(EmailLog.objects.get().provider, "gmail-smtp")

    def test_the_rfc_message_id_is_stored_but_no_provider_id_is_invented(self):
        self.run_with_transport(lambda: send_email(
            subject="s", body="b", to="a@example.com",
        ))
        log = EmailLog.objects.get()
        # Our own Message-ID is real and useful for tracing.
        self.assertTrue(log.message_id.startswith("<"))
        # The provider's id is not something SMTP hands back, so it stays empty
        # rather than being filled with the one above.
        self.assertEqual(log.provider_message_id, "")

    def test_the_body_is_never_stored(self):
        self.run_with_transport(lambda: send_email(
            subject="Your JackpotsWorld Verification Code",
            body="Your code is 123456",
            to="a@example.com", email_type=TYPE_OTP_VERIFICATION,
        ))
        log = EmailLog.objects.get()
        blob = f"{log.subject} {log.error_message} {log.smtp_response} {log.metadata}"
        self.assertNotIn("123456", blob)

    def test_user_and_trigger_are_attributed(self):
        user = User.objects.create_user(email="u@example.com", password="pw12345!", name="U")
        self.run_with_transport(lambda: send_email(
            subject="s", body="b", to="u@example.com",
            email_type=TYPE_AFFILIATE_APPROVAL, user=user, triggered_by="SomeView",
        ))
        log = EmailLog.objects.get()
        self.assertEqual(log.user_id, user.id)
        self.assertEqual(log.triggered_by, "SomeView")


@override_settings(EMAIL_BACKEND=BACKEND, EMAIL_HOST="smtp.gmail.com")
class EmailFailureTests(_TransportCase):
    def test_an_smtp_error_is_logged_as_failed_with_the_servers_own_words(self):
        exc = smtplib.SMTPResponseException(535, b"5.7.8 Username and Password not accepted")
        with self.assertRaises(smtplib.SMTPResponseException):
            self.run_with_transport(
                lambda: send_email(subject="s", body="b", to="a@example.com"),
                send_exc=exc,
            )

        log = EmailLog.objects.get()
        self.assertEqual(log.status, STATUS_FAILED)
        self.assertIsNotNone(log.failed_at)
        self.assertIn("535", log.smtp_response)
        self.assertIn("Username and Password not accepted", log.smtp_response)
        self.assertIn("SMTPResponseException", log.error_message)

    def test_a_refused_recipient_records_the_per_address_reason(self):
        exc = smtplib.SMTPRecipientsRefused({
            "ghost@example.com": (550, b"5.1.1 No such user here"),
        })
        with self.assertRaises(smtplib.SMTPRecipientsRefused):
            self.run_with_transport(
                lambda: send_email(subject="s", body="b", to="ghost@example.com"),
                send_exc=exc,
            )

        log = EmailLog.objects.get()
        self.assertEqual(log.status, STATUS_FAILED)
        self.assertIn("ghost@example.com", log.smtp_response)
        self.assertIn("550", log.smtp_response)
        self.assertIn("No such user here", log.smtp_response)

    def test_a_connection_failure_before_send_still_marks_the_row_failed(self):
        """open() raising means _send() is never reached. Without the
        send_messages guard the row would be stranded at PENDING forever."""
        with self.assertRaises(OSError):
            self.run_with_transport(
                lambda: send_email(subject="s", body="b", to="a@example.com"),
                open_exc=OSError("connection refused"),
            )

        log = EmailLog.objects.get()
        self.assertEqual(log.status, STATUS_FAILED)
        self.assertIn("connection refused", log.error_message)

    def test_a_permanent_failure_is_not_offered_as_retryable(self):
        exc = smtplib.SMTPRecipientsRefused({"x@example.com": (550, b"5.1.1 No such user")})
        with self.assertRaises(smtplib.SMTPRecipientsRefused):
            self.run_with_transport(
                lambda: send_email(subject="s", body="b", to="x@example.com"),
                send_exc=exc,
            )
        self.assertFalse(EmailLog.objects.get().is_retryable)

    def test_a_transient_failure_is_offered_as_retryable(self):
        exc = smtplib.SMTPResponseException(421, b"4.7.0 Try again later")
        with self.assertRaises(smtplib.SMTPResponseException):
            self.run_with_transport(
                lambda: send_email(subject="s", body="b", to="x@example.com"),
                send_exc=exc,
            )
        self.assertTrue(EmailLog.objects.get().is_retryable)

    def test_a_logging_failure_never_stops_the_email(self):
        """The safety property. If the audit write breaks, the email still
        goes — an OTP that does not arrive is worse than a missing log row."""
        with mock.patch(
            "authapp.models.email_log_models.EmailLog.objects.create",
            side_effect=Exception("db down"),
        ):
            sent = self.run_with_transport(lambda: send_email(
                subject="s", body="b", to="a@example.com",
            ))
        self.assertEqual(sent, 1)
        self.assertEqual(EmailLog.objects.count(), 0)


@override_settings(EMAIL_BACKEND=BACKEND, EMAIL_HOST="smtp.gmail.com")
class EmailTypeCoverageTests(_TransportCase):
    def test_each_real_email_type_lands_with_its_own_label(self):
        for email_type in (
            TYPE_OTP_VERIFICATION, TYPE_OTP_PASSWORD_RESET,
            TYPE_AFFILIATE_APPROVAL, TYPE_OTHER,
        ):
            self.run_with_transport(lambda t=email_type: send_email(
                subject=f"subject {t}", body="b", to="a@example.com", email_type=t,
            ))

        self.assertEqual(EmailLog.objects.count(), 4)
        self.assertEqual(
            set(EmailLog.objects.values_list("email_type", flat=True)),
            {TYPE_OTP_VERIFICATION, TYPE_OTP_PASSWORD_RESET, TYPE_AFFILIATE_APPROVAL, TYPE_OTHER},
        )


@override_settings(EMAIL_BACKEND=BACKEND, EMAIL_HOST="smtp.gmail.com")
class EmailLogAdminApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="mailadmin@example.com", password="pw12345!")
        self.member = User.objects.create_user(email="member@example.com", password="pw12345!", name="M")
        EmailLog.objects.create(
            recipient_email="one@example.com", subject="Your OTP",
            email_type=TYPE_OTP_VERIFICATION, status=STATUS_SENT, provider="gmail-smtp",
        )
        # Transient (4xx) on purpose: a 5xx here would be caught by the
        # permanent-failure guard, which runs before the one-time-code guard,
        # and the OTP refusal below would never be exercised.
        EmailLog.objects.create(
            recipient_email="two@example.com", subject="Verify Account",
            email_type=TYPE_OTP_VERIFICATION, status=STATUS_FAILED, provider="gmail-smtp",
            smtp_response="421 4.7.0 Try again later", error_message="SMTPResponseException",
        )
        EmailLog.objects.create(
            recipient_email="three@example.com", subject="Welcome",
            email_type=TYPE_AFFILIATE_APPROVAL, status=STATUS_SENT, provider="gmail-smtp",
        )

    def test_a_member_cannot_read_email_logs(self):
        self.client.force_authenticate(self.member)
        for url in (
            "/api/admin-panel/email-logs/",
            "/api/admin-panel/email-logs/stats/",
            "/api/admin-panel/email-logs/filters/",
        ):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN, url)

    def test_an_anonymous_visitor_cannot_read_email_logs(self):
        self.assertIn(
            self.client.get("/api/admin-panel/email-logs/").status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_an_admin_sees_the_list_newest_first(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/admin-panel/email-logs/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 3)
        self.assertEqual(res.data["results"][0]["recipient_email"], "three@example.com")

    def test_filter_by_status(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/admin-panel/email-logs/?status=failed")
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["recipient_email"], "two@example.com")

    def test_filter_by_email_type(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(f"/api/admin-panel/email-logs/?email_type={TYPE_AFFILIATE_APPROVAL}")
        self.assertEqual(res.data["count"], 1)

    def test_search_by_recipient(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/admin-panel/email-logs/?search=two@example.com")
        self.assertEqual(res.data["count"], 1)

    def test_search_by_subject(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/admin-panel/email-logs/?search=Welcome")
        self.assertEqual(res.data["count"], 1)

    def test_pagination_is_server_side(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/admin-panel/email-logs/?page_size=2")
        self.assertEqual(res.data["count"], 3)
        self.assertEqual(len(res.data["results"]), 2)
        self.assertIsNotNone(res.data["next"])

    def test_statistics_are_counted_in_the_database(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/admin-panel/email-logs/stats/")
        self.assertEqual(res.data["total"], 3)
        self.assertEqual(res.data["sent"], 2)
        self.assertEqual(res.data["failed"], 1)
        self.assertEqual(res.data["delivered"], 0)
        self.assertEqual(res.data["bounced"], 0)
        # The page must be able to say what it does not know.
        self.assertFalse(res.data["delivery_tracking_available"])

    def test_statistics_honour_the_same_filters_as_the_list(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/admin-panel/email-logs/stats/?status=failed")
        self.assertEqual(res.data["total"], 1)
        self.assertEqual(res.data["failed"], 1)

    def test_detail_explains_what_the_status_actually_proves(self):
        self.client.force_authenticate(self.admin)
        sent = EmailLog.objects.filter(status=STATUS_SENT).first()
        res = self.client.get(f"/api/admin-panel/email-logs/{sent.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("not", res.data["status_explanation"].lower())
        self.assertIn("accepted", res.data["status_explanation"].lower())

    def test_detail_surfaces_the_failure_reason(self):
        self.client.force_authenticate(self.admin)
        failed = EmailLog.objects.get(status=STATUS_FAILED)
        res = self.client.get(f"/api/admin-panel/email-logs/{failed.id}/")
        self.assertIn("421", res.data["smtp_response"])

    def test_retrying_a_one_time_code_is_refused_with_a_reason(self):
        self.client.force_authenticate(self.admin)
        failed = EmailLog.objects.get(status=STATUS_FAILED)  # an OTP type
        res = self.client.post(f"/api/admin-panel/email-logs/{failed.id}/retry/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("one-time code", res.data["detail"])

    def test_retrying_a_successful_email_is_refused(self):
        self.client.force_authenticate(self.admin)
        sent = EmailLog.objects.filter(status=STATUS_SENT).first()
        res = self.client.post(f"/api/admin-panel/email-logs/{sent.id}/retry/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_member_cannot_retry(self):
        self.client.force_authenticate(self.member)
        failed = EmailLog.objects.get(status=STATUS_FAILED)
        res = self.client.post(f"/api/admin-panel/email-logs/{failed.id}/retry/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_filter_options_only_offer_providers_that_occur(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/admin-panel/email-logs/filters/")
        self.assertEqual(res.data["providers"], ["gmail-smtp"])
        self.assertTrue(any(s["value"] == STATUS_PENDING for s in res.data["statuses"]))
