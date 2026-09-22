"""
authapp/tests_whatsapp_enquiry.py
─────────────────────────────────────────────────────────────────────────────
WHATSAPP-CAPTURE: the lead captured on the near side of the wa.me handoff.

What is being defended:

  * **An anonymous visitor can enquire.** Requiring an account would defeat a
    public enquiry form, so the endpoint is AllowAny and the throttle is what
    protects the lead list.
  * **A signed-in member is not interrogated.** Their name and number come
    from their account, so the frontend can skip the form entirely for them —
    if this broke, members would be asked to retype details we already hold.
  * **Staff cannot be impersonated and the visitor cannot set staff fields.**
    `status`, `admin_note`, `user` and `submitted_ip` are all derived, never
    accepted.
  * **Numbers are normalised, not rejected.** People paste "+91 (0) 98765
    43210". Refusing that costs a real lead over punctuation.
"""

from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models import User, WhatsAppEnquiry

CREATE = "/api/whatsapp-enquiries/"
ADMIN = "/api/admin-panel/whatsapp-enquiries/"


class WhatsAppEnquiryCreateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        WhatsAppEnquiry.objects.all().delete()

    def test_an_anonymous_visitor_can_leave_a_lead(self):
        res = self.client.post(CREATE, {
            "name": "Priya",
            "whatsapp_number": "+919876543210",
            "message": "Interested in the Macau package",
            "source": "tour_package_named",
            "page_path": "/",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)

        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.name, "Priya")
        self.assertEqual(row.whatsapp_number, "+919876543210")
        self.assertEqual(row.source, "tour_package_named")
        self.assertEqual(row.status, "new")
        self.assertIsNone(row.user)

    def test_a_pasted_number_is_cleaned_rather_than_refused(self):
        """People paste what their contacts app gives them. Losing a lead
        over brackets and spaces would be absurd."""
        res = self.client.post(CREATE, {
            "name": "Ravi",
            "whatsapp_number": " +91 98765-43210 ",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(WhatsAppEnquiry.objects.get().whatsapp_number, "+919876543210")

    def test_a_trunk_prefix_in_brackets_is_dropped(self):
        """"+91 (0) 98765 43210" means +919876543210. Keeping the zero
        produces a number nobody can dial, which for a lead list is the same
        as losing the lead."""
        res = self.client.post(CREATE, {
            "name": "Ravi",
            "whatsapp_number": "+91 (0) 98765 43210",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(WhatsAppEnquiry.objects.get().whatsapp_number, "+919876543210")

    def test_a_bare_leading_zero_is_left_alone(self):
        """Only the bracketed form is unambiguous. In plenty of numbering
        plans a leading zero is a real digit, so stripping it would corrupt
        good numbers to tidy up bad ones."""
        res = self.client.post(CREATE, {
            "name": "Ravi", "whatsapp_number": "0987654321",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(WhatsAppEnquiry.objects.get().whatsapp_number, "0987654321")

    def test_an_unusable_number_is_refused_with_a_field_error(self):
        res = self.client.post(CREATE, {"name": "Someone", "whatsapp_number": "abc"},
                               format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("whatsapp_number", res.json())
        self.assertFalse(WhatsAppEnquiry.objects.exists())

    def test_a_missing_name_is_refused(self):
        res = self.client.post(CREATE, {"whatsapp_number": "+919876543210"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("name", res.json())

    def test_the_visitor_cannot_set_staff_fields(self):
        """status and admin_note are the desk's record of what it did. A
        form that could set them would be a form that could lie."""
        res = self.client.post(CREATE, {
            "name": "Trickster",
            "whatsapp_number": "+919876543210",
            "status": "closed",
            "admin_note": "already handled, ignore",
            "submitted_ip": "1.2.3.4",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)

        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.status, "new")
        self.assertEqual(row.admin_note, "")
        self.assertNotEqual(row.submitted_ip, "1.2.3.4")

    def test_the_response_does_not_leak_stored_fields(self):
        res = self.client.post(CREATE, {"name": "Priya", "whatsapp_number": "+919876543210"},
                               format="json")
        body = res.json()
        self.assertEqual(set(body), {"id", "message"})
        self.assertNotIn("submitted_ip", body)


class SignedInMemberTests(TestCase):
    """The member dashboard buttons record silently — no form."""

    def setUp(self):
        self.client = APIClient()
        self.member = User.objects.create_user(
            email="member@jackpotsworld.vip", password="pw-1234", name="Anita Rao",
        )
        self.member.phone = "+919812345678"
        self.member.save(update_fields=["phone"])
        WhatsAppEnquiry.objects.all().delete()

    def test_a_member_need_not_send_a_name_or_number(self):
        self.client.force_authenticate(user=self.member)
        res = self.client.post(CREATE, {"source": "member_package_purchase"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)

        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.user, self.member)
        self.assertEqual(row.name, "Anita Rao")
        self.assertEqual(row.whatsapp_number, "+919812345678")

    def test_what_the_member_actually_types_wins_over_their_account(self):
        """Someone may be enquiring about a number that is not the one on
        their account."""
        self.client.force_authenticate(user=self.member)
        res = self.client.post(CREATE, {
            "name": "Anita (work)", "whatsapp_number": "+919000000000",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)

        row = WhatsAppEnquiry.objects.get()
        self.assertEqual(row.whatsapp_number, "+919000000000")
        self.assertEqual(row.user, self.member)


class AdminReadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="waadmin@jackpotsworld.vip", password="pw-1234", name="WA Admin",
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])
        WhatsAppEnquiry.objects.all().delete()
        self.lead = WhatsAppEnquiry.objects.create(
            name="Priya", whatsapp_number="+919876543210",
            message="Macau package", source="tour_package_named",
        )

    def test_a_visitor_cannot_read_the_lead_list(self):
        res = self.client.get(ADMIN)
        self.assertIn(res.status_code, (401, 403))

    def test_staff_can_read_the_lead_list(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(ADMIN)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        rows = body["results"] if isinstance(body, dict) and "results" in body else body
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["whatsapp_number"], "+919876543210")

    def test_staff_can_mark_a_lead_contacted(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f"{ADMIN}{self.lead.pk}/",
                                {"status": "contacted", "admin_note": "Called back"},
                                format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.status, "contacted")
        self.assertEqual(self.lead.admin_note, "Called back")

    def test_staff_cannot_rewrite_what_the_visitor_said(self):
        """The visitor's own words are a record, not a draft."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f"{ADMIN}{self.lead.pk}/",
                                {"name": "Someone else", "message": "changed"},
                                format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.name, "Priya")
        self.assertEqual(self.lead.message, "Macau package")

    def test_the_list_can_be_searched_by_number(self):
        WhatsAppEnquiry.objects.create(name="Other", whatsapp_number="+911111111111")
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(ADMIN, {"q": "9876543210"})
        body = res.json()
        rows = body["results"] if isinstance(body, dict) and "results" in body else body
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Priya")
