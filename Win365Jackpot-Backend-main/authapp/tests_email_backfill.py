"""
authapp/tests_email_backfill.py
─────────────────────────────────────────────────────────────────────────────
The importable half of backfill_email_logs: turning a real RFC822 message from
the Sent folder into the fields an EmailLog needs.

The IMAP conversation itself is not tested here — that is a network protocol
against a mailbox this checkout has no credentials for. What IS tested is every
decision the command makes about a message once it has one, because those are
the parts that can quietly produce wrong history.
"""

from email.utils import format_datetime

from django.test import SimpleTestCase
from django.utils import timezone

from authapp.management.commands.backfill_email_logs import (
    classify_subject,
    parse_message,
)
from authapp.models.email_log_models import (
    TYPE_AFFILIATE_APPROVAL,
    TYPE_AFFILIATE_REGISTRATION_ALERT,
    TYPE_OTHER,
    TYPE_OTP_VERIFICATION,
)


def _raw(subject="Test", to="player@example.com", frm="jackpotsworld26@gmail.com",
         date=None, message_id="<abc123@mail.gmail.com>", extra=""):
    date = date or format_datetime(timezone.now())
    return (
        f"From: {frm}\r\n"
        f"To: {to}\r\n"
        f"Subject: {subject}\r\n"
        f"Date: {date}\r\n"
        f"Message-ID: {message_id}\r\n"
        f"{extra}"
        f"\r\nbody text\r\n"
    ).encode()


class ClassifySubjectTests(SimpleTestCase):
    def test_the_real_subjects_this_app_sends_are_recognised(self):
        self.assertEqual(
            classify_subject("Your JackpotsWorld Verification Code")[0],
            TYPE_OTP_VERIFICATION,
        )
        self.assertEqual(
            classify_subject("Affiliate Onboarding Completed Successfully")[0],
            TYPE_AFFILIATE_APPROVAL,
        )
        self.assertEqual(
            classify_subject("New Affiliate Registration — Approval Required | JackpotsWorld")[0],
            TYPE_AFFILIATE_REGISTRATION_ALERT,
        )

    def test_an_otp_is_flagged_ambiguous_because_both_flows_shared_a_subject(self):
        """send_otp_email_html used one subject for signup and password reset,
        so the flow is genuinely unrecoverable. The importer must say so rather
        than pick one."""
        email_type, ambiguous = classify_subject("Your JackpotsWorld Verification Code")
        self.assertEqual(email_type, TYPE_OTP_VERIFICATION)
        self.assertTrue(ambiguous)

    def test_a_non_ambiguous_type_is_not_flagged(self):
        self.assertFalse(classify_subject("Affiliate Onboarding Completed Successfully")[1])

    def test_an_unrecognised_subject_falls_back_to_other_rather_than_guessing(self):
        email_type, ambiguous = classify_subject("Some future email nobody has written yet")
        self.assertEqual(email_type, TYPE_OTHER)
        self.assertFalse(ambiguous)

    def test_a_missing_subject_does_not_crash(self):
        self.assertEqual(classify_subject(None)[0], TYPE_OTHER)
        self.assertEqual(classify_subject("")[0], TYPE_OTHER)


class ParseMessageTests(SimpleTestCase):
    def test_the_fields_a_log_row_needs_are_extracted(self):
        parsed = parse_message(_raw(subject="Your JackpotsWorld Verification Code"))
        self.assertEqual(parsed["recipient_email"], "player@example.com")
        self.assertEqual(parsed["from_email"], "jackpotsworld26@gmail.com")
        self.assertEqual(parsed["subject"], "Your JackpotsWorld Verification Code")
        self.assertEqual(parsed["email_type"], TYPE_OTP_VERIFICATION)
        self.assertEqual(parsed["message_id"], "<abc123@mail.gmail.com>")

    def test_the_real_send_date_is_preserved_and_timezone_aware(self):
        """The whole point of a backfill is that rows land on the day they were
        sent, not the day they were imported."""
        parsed = parse_message(_raw(date="Tue, 12 Aug 2026 09:30:00 +0000"))
        self.assertIsNotNone(parsed["sent_at"])
        self.assertEqual(parsed["sent_at"].year, 2026)
        self.assertEqual(parsed["sent_at"].month, 8)
        self.assertEqual(parsed["sent_at"].day, 12)
        self.assertTrue(timezone.is_aware(parsed["sent_at"]))

    def test_every_recipient_is_captured_not_just_the_first(self):
        parsed = parse_message(_raw(to="a@example.com, b@example.com, c@example.com"))
        self.assertEqual(parsed["recipient_email"], "a@example.com")
        self.assertEqual(parsed["all_recipients"],
                         ["a@example.com", "b@example.com", "c@example.com"])

    def test_a_display_name_is_stripped_to_the_address(self):
        parsed = parse_message(_raw(to="Player One <player@example.com>"))
        self.assertEqual(parsed["recipient_email"], "player@example.com")

    def test_an_encoded_subject_is_decoded(self):
        # RFC 2047, which Gmail uses for any non-ASCII subject.
        encoded = "=?utf-8?q?New_Affiliate_Registration_=E2=80=94_Approval_Required?="
        parsed = parse_message(_raw(subject=encoded))
        self.assertIn("New Affiliate Registration", parsed["subject"])
        self.assertEqual(parsed["email_type"], TYPE_AFFILIATE_REGISTRATION_ALERT)

    def test_a_message_with_no_recipient_is_rejected_rather_than_imported_blank(self):
        raw = (
            b"From: jackpotsworld26@gmail.com\r\n"
            b"Subject: Draft with no To\r\n"
            b"Message-ID: <draft@mail.gmail.com>\r\n"
            b"\r\nbody\r\n"
        )
        self.assertIsNone(parse_message(raw))

    def test_a_missing_date_is_left_empty_rather_than_defaulted_to_now(self):
        raw = (
            b"From: jackpotsworld26@gmail.com\r\n"
            b"To: player@example.com\r\n"
            b"Subject: No date header\r\n"
            b"Message-ID: <nodate@mail.gmail.com>\r\n"
            b"\r\nbody\r\n"
        )
        parsed = parse_message(raw)
        self.assertIsNone(parsed["sent_at"])

    def test_a_date_header_without_an_offset_is_made_aware_not_crashed_on(self):
        """USE_TZ is on, so a naive datetime has to be given a timezone. The
        obvious way to write this (django.utils.timezone.utc) was removed in
        Django 5.0 and would raise AttributeError on the first such message,
        killing the whole import."""
        parsed = parse_message(_raw(date="Tue, 12 Aug 2026 09:30:00"))
        self.assertIsNotNone(parsed["sent_at"])
        self.assertTrue(timezone.is_aware(parsed["sent_at"]))
        self.assertEqual(parsed["sent_at"].hour, 9)

    def test_an_unparseable_date_does_not_crash_the_import(self):
        parsed = parse_message(_raw(date="not a date at all"))
        self.assertIsNone(parsed["sent_at"])

    def test_an_overlong_subject_is_truncated_to_the_column_width(self):
        parsed = parse_message(_raw(subject="x" * 900))
        self.assertLessEqual(len(parsed["subject"]), 500)
