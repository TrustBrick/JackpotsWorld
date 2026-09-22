"""
authapp/tests_whatsapp_enquiry_leads.py
─────────────────────────────────────────────────────────────────────────────
WHATSAPP-LEADS: the half of the flow that records a press even when no details
are given, and the button identity behind it.

Kept separate from tests_whatsapp_enquiry.py, which defends the capture form
itself. That file's guarantees are unchanged and must stay unchanged; these
are the additions.

What is being defended here:

  * **A press is recorded even when the visitor gives nothing.** Someone who
    dismisses the form still told you which button they reached for, and that
    was previously thrown away entirely — the gap this exists to close.
  * **A lead says which button in words.** `button_label` and `section` are
    resolved from the Back Office row, so a renamed or retired button does not
    turn old leads into an unreadable slug.
  * **Those words cannot be set by the client**, because Back Office reads
    them to decide what to chase.
  * **An unknown slug is still recorded.** A button can ship before its Back
    Office row exists, and refusing leads in that window would lose exactly
    the enquiries a new button was built to attract.
  * **Repeat presses do not become repeat leads**, but a real second enquiry
    still does.
  * **No status a host can set implies a message was sent or received.**
"""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models import User, WhatsAppEnquiry
from authapp.models.landing_models import EnquiryMessage
from authapp.models.whatsapp_enquiry_models import (
    STATUS_CLICKED, STATUS_NEW, STATUS_CONTACTED, STATUS_MESSAGE_RECEIVED,
)

CLICK = "/api/whatsapp-enquiries/click/"
CREATE = "/api/whatsapp-enquiries/"
ADMIN = "/api/admin-panel/whatsapp-enquiries/"


class ClickRecordingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # The throttle counts per IP in the shared cache, which survives
        # between tests in one process — several presses per test is the whole
        # subject here, so without this the later tests fail on 429 rather
        # than on anything they are actually checking.
        cache.clear()
        WhatsAppEnquiry.objects.all().delete()
        EnquiryMessage.objects.update_or_create(
            key="vietnam_trip",
            defaults={
                "label": "ENQUIRE – VIETNAM TRIP",
                "description": "Offline Casino Destinations",
                "template": "Hi! I am interested in the Vietnam trip.",
            },
        )

    # ── the gap this closes ──────────────────────────────────────────────────

    def test_a_press_with_no_details_is_still_recorded(self):
        """The visitor who declines the form. Previously left no trace at
        all — not even which button they wanted."""
        res = self.client.post(CLICK, {
            "source": "vietnam_trip",
            "page_path": "/destinations",
            "anonymous_id": "v-abc",
            "session_key": "s-1",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)

        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.source, "vietnam_trip")
        self.assertEqual(row.status, STATUS_CLICKED)
        self.assertEqual(row.name, "")       # nothing was claimed about them
        self.assertEqual(row.whatsapp_number, "")

    def test_a_click_row_says_which_button_in_words(self):
        self.client.post(CLICK, {"source": "vietnam_trip", "session_key": "s-1",
                                 "anonymous_id": "v-abc"}, format="json")
        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.button_label, "ENQUIRE – VIETNAM TRIP")
        self.assertEqual(row.section, "Offline Casino Destinations")

    def test_the_client_cannot_choose_what_the_button_is_called(self):
        """Back Office reads these to decide what to chase, so a crafted POST
        must not be able to write them."""
        self.client.post(CLICK, {
            "source": "vietnam_trip",
            "button_label": "URGENT VIP WHALE",
            "section": "Fake section",
            "session_key": "s-1", "anonymous_id": "v-abc",
        }, format="json")
        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.button_label, "ENQUIRE – VIETNAM TRIP")
        self.assertEqual(row.section, "Offline Casino Destinations")

    def test_an_unknown_button_is_recorded_not_refused(self):
        """A button can ship before its Back Office row. Losing the lead in
        that window would be the worse failure."""
        res = self.client.post(CLICK, {"source": "brand_new_button",
                                       "session_key": "s-9",
                                       "anonymous_id": "v-z"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.source, "brand_new_button")
        self.assertEqual(row.button_label, "")   # honest about not knowing

    def test_campaign_attribution_is_kept(self):
        self.client.post(CLICK, {
            "source": "vietnam_trip", "session_key": "s-1", "anonymous_id": "v-abc",
            "utm_source": "google", "utm_medium": "cpc",
            "utm_campaign": "vietnam-oct", "referrer": "https://google.com/",
        }, format="json")
        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.utm_campaign, "vietnam-oct")
        self.assertEqual(row.utm_source, "google")
        self.assertEqual(row.referrer, "https://google.com/")

    # ── duplicates ───────────────────────────────────────────────────────────

    def test_pressing_the_same_button_twice_is_one_lead(self):
        body = {"source": "vietnam_trip", "session_key": "s-1", "anonymous_id": "v-abc"}
        self.client.post(CLICK, body, format="json")
        self.client.post(CLICK, body, format="json")
        self.client.post(CLICK, body, format="json")

        self.assertEqual(WhatsAppEnquiry.objects.count(), 1)
        self.assertEqual(WhatsAppEnquiry.objects.get().click_count, 3)

    def test_a_different_button_is_a_different_lead(self):
        self.client.post(CLICK, {"source": "vietnam_trip", "session_key": "s-1",
                                 "anonymous_id": "v-abc"}, format="json")
        self.client.post(CLICK, {"source": "cruise_package", "session_key": "s-1",
                                 "anonymous_id": "v-abc"}, format="json")
        self.assertEqual(WhatsAppEnquiry.objects.count(), 2)

    def test_coming_back_in_a_later_session_is_a_new_enquiry(self):
        """March and June are two enquiries. Collapsing them would bury the
        second, which is the one worth acting on."""
        self.client.post(CLICK, {"source": "vietnam_trip", "session_key": "s-1",
                                 "anonymous_id": "v-abc"}, format="json")
        self.client.post(CLICK, {"source": "vietnam_trip", "session_key": "s-2",
                                 "anonymous_id": "v-abc"}, format="json")
        self.assertEqual(WhatsAppEnquiry.objects.count(), 2)

    def test_filling_the_form_completes_the_click_rather_than_duplicating_it(self):
        """One press, one row — even though it touched two endpoints."""
        self.client.post(CLICK, {"source": "vietnam_trip", "session_key": "s-1",
                                 "anonymous_id": "v-abc"}, format="json")
        self.client.post(CREATE, {
            "name": "Priya", "whatsapp_number": "+919876543210",
            "source": "vietnam_trip", "session_key": "s-1", "anonymous_id": "v-abc",
        }, format="json")

        self.assertEqual(WhatsAppEnquiry.objects.count(), 1)
        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.name, "Priya")
        self.assertEqual(row.status, STATUS_NEW)
        self.assertEqual(row.button_label, "ENQUIRE – VIETNAM TRIP")

    def test_a_worked_lead_is_never_demoted_by_a_later_press(self):
        """A host has already contacted them; a fresh tap must not drag the
        row back to 'clicked' and lose that."""
        self.client.post(CLICK, {"source": "vietnam_trip", "session_key": "s-1",
                                 "anonymous_id": "v-abc"}, format="json")
        row = WhatsAppEnquiry.objects.get()
        row.status = STATUS_CONTACTED
        row.save(update_fields=["status"])

        self.client.post(CLICK, {"source": "vietnam_trip", "session_key": "s-1",
                                 "anonymous_id": "v-abc"}, format="json")
        row.refresh_from_db()
        self.assertEqual(row.status, STATUS_CONTACTED)
        self.assertEqual(WhatsAppEnquiry.objects.count(), 2)  # the new press is its own row

    # ── members ──────────────────────────────────────────────────────────────

    def test_a_members_press_is_tied_to_their_account(self):
        member = User.objects.create_user(
            email="member@jackpotsworld.vip", password="pw-1234", name="Member",
        )
        self.client.force_authenticate(user=member)
        self.client.post(CLICK, {"source": "vietnam_trip", "session_key": "s-1"},
                         format="json")
        self.assertEqual(WhatsAppEnquiry.objects.get().user, member)


class EmailAndCaptureToggleTests(TestCase):
    """
    The optional email, and the per-button switch that decides whether a
    logged-out visitor is asked for anything.

    The toggle's DEFAULT is the load-bearing part: every button must keep
    behaving exactly as it does today until somebody deliberately turns one
    on, or shipping this changes the live site by accident.
    """

    def setUp(self):
        self.client = APIClient()
        cache.clear()
        WhatsAppEnquiry.objects.all().delete()
        self.button, _ = EnquiryMessage.objects.update_or_create(
            key="email_toggle_btn",
            defaults={"label": "Vietnam", "description": "Destinations",
                      "template": "Hi!"},
        )

    # ── the toggle ───────────────────────────────────────────────────────────

    def test_capture_is_off_by_default(self):
        """Shipping this must not put a form in front of any existing button."""
        self.assertFalse(EnquiryMessage.objects.get(key="email_toggle_btn").capture_details)

    def test_every_existing_button_is_off(self):
        """Not just new rows — the migration's default applies to the buttons
        already live."""
        self.assertFalse(
            EnquiryMessage.objects.filter(capture_details=True).exists(),
            "a button is set to ask guests for details; that must be opt-in",
        )

    def test_the_site_is_told_whether_a_button_asks(self):
        """The gate cannot decide what to do without this, and must not have
        to make a second request at the moment of a click to find out."""
        res = self.client.get("/api/enquiry-messages/")
        self.assertEqual(res.status_code, 200, res.content)
        rows = res.json()
        row = next(r for r in rows if r["key"] == "email_toggle_btn")
        self.assertIn("capture_details", row)
        self.assertIs(row["capture_details"], False)

    def test_the_public_endpoint_still_leaks_nothing_else(self):
        res = self.client.get("/api/enquiry-messages/")
        row = next(r for r in res.json() if r["key"] == "email_toggle_btn")
        self.assertEqual(set(row.keys()),
                         {"key", "template", "placeholders", "capture_details"})

    def test_staff_can_turn_it_on(self):
        admin = User.objects.create_user(
            email="toggle-admin@jackpotsworld.vip", password="pw-1234", name="T")
        admin.is_staff = True
        admin.is_superuser = True
        admin.save(update_fields=["is_staff", "is_superuser"])
        self.client.force_authenticate(user=admin)

        res = self.client.patch(
            f"/api/admin-panel/enquiry-messages/{self.button.id}/",
            {"capture_details": True}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.button.refresh_from_db()
        self.assertTrue(self.button.capture_details)

    # ── email ────────────────────────────────────────────────────────────────

    def test_a_guest_can_volunteer_an_email(self):
        self.client.post(CREATE, {
            "name": "Priya", "whatsapp_number": "+919876543210",
            "email": "priya@example.com", "source": "email_toggle_btn",
        }, format="json")
        self.assertEqual(WhatsAppEnquiry.objects.get().email, "priya@example.com")

    def test_email_is_optional(self):
        """The number answers a WhatsApp enquiry; requiring an address would
        cost leads to collect something that may never be used."""
        res = self.client.post(CREATE, {
            "name": "Priya", "whatsapp_number": "+919876543210",
            "source": "email_toggle_btn",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(WhatsAppEnquiry.objects.get().email, "")

    def test_a_member_gets_their_account_email_without_typing_it(self):
        member = User.objects.create_user(
            email="ravi@jackpotsworld.vip", password="pw-1234", name="Ravi")
        member.phone = "+919812345678"
        member.save(update_fields=["phone"])
        self.client.force_authenticate(user=member)

        self.client.post(CREATE, {"source": "email_toggle_btn"}, format="json")
        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.email, "ravi@jackpotsworld.vip")
        self.assertEqual(row.name, "Ravi")
        self.assertEqual(row.whatsapp_number, "+919812345678")

    def test_what_a_member_types_still_wins_over_their_account(self):
        """They may be enquiring on behalf of a different address."""
        member = User.objects.create_user(
            email="ravi2@jackpotsworld.vip", password="pw-1234", name="Ravi")
        self.client.force_authenticate(user=member)
        self.client.post(CREATE, {
            "name": "Ravi", "whatsapp_number": "+919812345678",
            "email": "different@example.com", "source": "email_toggle_btn",
        }, format="json")
        self.assertEqual(WhatsAppEnquiry.objects.get().email, "different@example.com")

    def test_an_invalid_email_is_refused_rather_than_stored(self):
        res = self.client.post(CREATE, {
            "name": "Priya", "whatsapp_number": "+919876543210",
            "email": "not-an-email", "source": "email_toggle_btn",
        }, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("email", res.json())


class StatusHonestyTests(TestCase):
    """Nothing may claim a WhatsApp message was sent or received."""

    def setUp(self):
        self.client = APIClient()
        WhatsAppEnquiry.objects.all().delete()
        self.admin = User.objects.create_user(
            email="waadmin@jackpotsworld.vip", password="pw-1234", name="WA Admin",
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])
        self.enquiry = WhatsAppEnquiry.objects.create(
            name="Priya", whatsapp_number="+919876543210", source="vietnam_trip",
        )

    def test_staff_cannot_mark_a_lead_as_message_received(self):
        """There is no WhatsApp Cloud API in this project, so nothing can
        witness an inbound message. A host asserting one would make the column
        describe opinion rather than fact."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f"{ADMIN}{self.enquiry.id}/",
                                {"status": STATUS_MESSAGE_RECEIVED}, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        self.enquiry.refresh_from_db()
        self.assertNotEqual(self.enquiry.status, STATUS_MESSAGE_RECEIVED)

    def test_staff_cannot_claim_the_visitor_clicked(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f"{ADMIN}{self.enquiry.id}/",
                                {"status": STATUS_CLICKED}, format="json")
        self.assertEqual(res.status_code, 400, res.content)

    def test_staff_can_still_record_what_they_did(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f"{ADMIN}{self.enquiry.id}/",
                                {"status": STATUS_CONTACTED, "admin_note": "Called"},
                                format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.status, STATUS_CONTACTED)

    def test_no_code_path_sets_message_received(self):
        """A guard against the status being wired up by accident later."""
        import subprocess, pathlib
        root = pathlib.Path(__file__).resolve().parent
        hits = []
        for path in list(root.glob("views/*.py")) + list(root.glob("services/*.py")):
            text = path.read_text(encoding="utf-8", errors="replace")
            if "STATUS_MESSAGE_RECEIVED" in text or '"message_received"' in text:
                hits.append(path.name)
        self.assertEqual(hits, [], f"message_received is set somewhere: {hits}")


class AdminFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        WhatsAppEnquiry.objects.all().delete()
        self.admin = User.objects.create_user(
            email="wafilter@jackpotsworld.vip", password="pw-1234", name="WA Filter",
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])
        self.member = User.objects.create_user(
            email="waplayer@jackpotsworld.vip", password="pw-1234", name="Player",
        )
        WhatsAppEnquiry.objects.create(name="A", whatsapp_number="+911", source="vietnam_trip",
                                       utm_campaign="vietnam-oct")
        WhatsAppEnquiry.objects.create(name="B", whatsapp_number="+912", source="cruise_package")
        WhatsAppEnquiry.objects.create(name="C", whatsapp_number="+913", source="vietnam_trip",
                                       user=self.member)
        self.client.force_authenticate(user=self.admin)

    def _ids(self, query):
        res = self.client.get(f"{ADMIN}?{query}")
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        return [r["name"] for r in (body.get("results", body) if isinstance(body, dict) else body)]

    def test_filter_by_button(self):
        self.assertCountEqual(self._ids("source=vietnam_trip"), ["A", "C"])

    def test_filter_by_campaign(self):
        self.assertEqual(self._ids("campaign=vietnam-oct"), ["A"])

    def test_filter_guest_versus_member(self):
        self.assertCountEqual(self._ids("who=guest"), ["A", "B"])
        self.assertEqual(self._ids("who=member"), ["C"])

    def test_a_visitor_still_cannot_read_the_list(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(ADMIN).status_code, (401, 403))
