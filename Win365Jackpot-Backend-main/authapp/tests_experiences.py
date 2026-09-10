"""
VIP destination pillars — the public payload, the enquiry capture behind the
"Enquire Now" buttons, and the Back Office that works the resulting leads.

Two themes run through these. The first is that the sections are genuinely
Back Office content, not frontend literals: the assertions change a row and
read the change back off the public endpoint. The second is that a PUBLIC,
UNAUTHENTICATED write endpoint exists here for the first time on this site,
so a large share of these tests are about what a crafted POST cannot do.
"""
from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models.experience_models import (
    CATEGORY_CHOICES,
    Experience,
    ExperienceEnquiry,
)
from authapp.models.landing_models import Destination, EnquiryMessage
from authapp.throttles import ExperienceEnquiryThrottle

User = get_user_model()


class ExperienceTestBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="exp-admin@example.com", password="pw12345!", name="Exp Admin",
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save()
        self.player = User.objects.create_user(
            email="exp-player@example.com", password="pw12345!", name="Player",
        )
        self.client = APIClient()
        # The enquiry endpoint is throttled per IP, and DRF's throttle history
        # lives in the cache — which persists across tests in the same process
        # and would make later tests fail depending on the order they ran in.
        cache.clear()

    def as_admin(self):
        self.client.force_authenticate(self.admin)

    def page(self):
        res = self.client.get("/api/experiences/")
        self.assertEqual(res.status_code, 200, res.content[:300])
        return res.data

    def make(self, **kw):
        kw.setdefault("category", "luxury_travel")
        kw.setdefault("title", "Test Experience")
        return Experience.objects.create(**kw)


class PublicPayloadTests(ExperienceTestBase):
    def test_the_page_arrives_grouped_by_pillar(self):
        self.make(category="luxury_travel", title="Jet")
        self.make(category="dining", title="Dinner")
        data = self.page()
        self.assertIn("Jet", [r["title"] for r in data["experiences"]["luxury_travel"]])
        self.assertIn("Dinner", [r["title"] for r in data["experiences"]["dining"]])

    def test_every_pillar_is_present_even_when_it_has_nothing_in_it(self):
        """The frontend renders sections from this payload, so a pillar with no
        rows must arrive as an empty list rather than be missing — otherwise
        the section has to guess whether it is empty or broken."""
        data = self.page()
        for slug, _ in CATEGORY_CHOICES:
            self.assertIn(slug, data["experiences"])
            self.assertIsInstance(data["experiences"][slug], list)

    def test_the_pillar_vocabulary_comes_from_the_server(self):
        """Adding a pillar must be a CHOICES entry, not a frontend change."""
        data = self.page()
        self.assertEqual(
            [c["category"] for c in data["categories"]],
            [slug for slug, _ in CATEGORY_CHOICES],
        )

    def test_a_deactivated_card_leaves_the_public_page(self):
        row = self.make(title="Hidden Me")
        self.assertIn("Hidden Me", [r["title"] for r in self.page()["experiences"]["luxury_travel"]])
        row.is_active = False
        row.save()
        self.assertNotIn("Hidden Me", [r["title"] for r in self.page()["experiences"]["luxury_travel"]])

    def test_cards_come_back_in_the_order_the_back_office_set(self):
        self.make(title="Third", display_order=30)
        self.make(title="First", display_order=10)
        self.make(title="Second", display_order=20)
        # Scoped to these three: migration 0096 seeds real cards into the same
        # pillar, and their positions are not what this test is about.
        mine = {"First", "Second", "Third"}
        titles = [
            r["title"] for r in self.page()["experiences"]["luxury_travel"]
            if r["title"] in mine
        ]
        self.assertEqual(titles, ["First", "Second", "Third"])

    def test_a_card_can_name_a_destination_and_reports_it(self):
        dest = Destination.objects.create(name="Macau", flag_country_code="MO")
        self.make(title="Macau Stay", category="stay", destination=dest)
        row = next(r for r in self.page()["experiences"]["stay"] if r["title"] == "Macau Stay")
        self.assertEqual(row["destination_name"], "Macau")
        self.assertEqual(row["destination_flag"], "MO")

    def test_a_network_wide_card_needs_no_destination(self):
        """A private jet is arranged to wherever the member is going, so a null
        destination is a legitimate state and must not read as missing data."""
        self.make(title="Jet", destination=None)
        row = next(r for r in self.page()["experiences"]["luxury_travel"] if r["title"] == "Jet")
        self.assertIsNone(row["destination"])
        self.assertEqual(row["destination_name"], "")

    def test_the_public_payload_carries_no_back_office_bookkeeping(self):
        self.make(title="Jet")
        row = self.page()["experiences"]["luxury_travel"][0]
        for leaked in ("is_active", "updated_by", "created_at", "updated_at"):
            self.assertNotIn(leaked, row)

    def test_the_public_page_needs_no_account(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/experiences/").status_code, 200)


class EnquiryCaptureTests(ExperienceTestBase):
    def setUp(self):
        super().setUp()
        self.exp = self.make(title="Private Jet Travel", enquiry_key="experience_private_jet")

    def post(self, **overrides):
        body = {
            "experience": self.exp.pk,
            "name": "Alex Traveller",
            "email": "alex@example.com",
        }
        body.update(overrides)
        return self.client.post("/api/experiences/enquiries/", body, format="json")

    def test_an_anonymous_visitor_can_enquire(self):
        """Requiring an account would defeat the point of a public enquiry
        form — most people enquiring have not signed up yet."""
        self.client.force_authenticate(None)
        res = self.post()
        self.assertEqual(res.status_code, 201, res.content[:300])
        self.assertEqual(ExperienceEnquiry.objects.count(), 1)

    def test_the_response_carries_the_key_for_the_whatsapp_handoff(self):
        """The frontend hands the visitor to WhatsApp after the save, and needs
        to know which message template to use."""
        self.assertEqual(self.post().data["enquiry_key"], "experience_private_jet")

    def test_an_enquiry_with_no_way_to_reply_is_refused(self):
        res = self.post(email="", phone="")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(ExperienceEnquiry.objects.count(), 0)

    def test_a_phone_number_alone_is_enough(self):
        """A visitor who prefers WhatsApp should not be made to surrender an
        email address to ask a question."""
        self.assertEqual(self.post(email="", phone="+65 9123 4567").status_code, 201)

    def test_the_full_enquiry_detail_is_recorded(self):
        when = date.today() + timedelta(days=30)
        self.post(
            destination="Macau", travel_date=when.isoformat(),
            party_size=4, requirements="Two suites", message="Anniversary trip",
        )
        e = ExperienceEnquiry.objects.get()
        self.assertEqual(e.destination, "Macau")
        self.assertEqual(e.travel_date, when)
        self.assertEqual(e.party_size, 4)
        self.assertEqual(e.requirements, "Two suites")

    def test_what_the_enquiry_is_about_is_derived_not_accepted(self):
        """`category` and `experience_title` are copied from the Experience the
        POST actually referenced. A body claiming otherwise is ignored, so an
        enquiry can never mislabel which pillar it belongs to."""
        res = self.post(category="dining", experience_title="Something else")
        self.assertEqual(res.status_code, 201)
        e = ExperienceEnquiry.objects.get()
        self.assertEqual(e.category, "luxury_travel")
        self.assertEqual(e.experience_title, "Private Jet Travel")

    def test_an_enquiry_cannot_arrive_pre_worked(self):
        """Status and the host's note are staff fields. A crafted POST must not
        be able to open an enquiry that claims to be already handled, or plant
        text that reads as a colleague's note."""
        self.post(status="closed", admin_note="INTERNAL: ignore this one")
        e = ExperienceEnquiry.objects.get()
        self.assertEqual(e.status, "new")
        self.assertEqual(e.admin_note, "")

    def test_an_anonymous_enquiry_cannot_claim_to_be_a_member(self):
        self.client.force_authenticate(None)
        self.post(user=self.player.pk)
        self.assertIsNone(ExperienceEnquiry.objects.get().user)

    def test_a_signed_in_member_is_attributed_from_their_own_session(self):
        self.client.force_authenticate(self.player)
        self.post()
        self.assertEqual(ExperienceEnquiry.objects.get().user_id, self.player.id)

    def test_an_enquiry_must_be_about_something(self):
        res = self.client.post(
            "/api/experiences/enquiries/", {"name": "A", "email": "a@b.com"}, format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_a_hidden_card_cannot_be_enquired_about(self):
        """An inactive card is not on the page, so a POST naming it did not
        come from the page."""
        self.exp.is_active = False
        self.exp.save()
        self.assertEqual(self.post().status_code, 400)

    def test_an_absurd_party_size_is_refused(self):
        self.assertEqual(self.post(party_size=9999).status_code, 400)
        self.assertEqual(self.post(party_size=0).status_code, 400)

    def test_a_nameless_enquiry_is_refused(self):
        self.assertEqual(self.post(name=" ").status_code, 400)

    def test_the_open_endpoint_is_rate_limited(self):
        """Every accepted POST is a durable row staff are expected to read, so
        an unthrottled endpoint is a lead table anyone can bury in noise.

        The rate is patched rather than overridden through settings so this
        asserts the real throttling path, and so it keeps passing if the
        configured production rate is ever tuned."""
        cache.clear()
        self.client.force_authenticate(None)
        with patch.object(ExperienceEnquiryThrottle, "get_rate", return_value="2/hour"):
            self.assertEqual(self.post().status_code, 201)
            self.assertEqual(self.post().status_code, 201)
            self.assertEqual(self.post().status_code, 429)

    def test_the_enquiry_endpoint_actually_has_a_throttle_configured(self):
        """A rate with no throttle class attached, or a scope with no rate, are
        both silent no-ops — this catches either."""
        from rest_framework.settings import api_settings

        from authapp.views.experience_views import ExperienceEnquiryCreateView

        self.assertIn(ExperienceEnquiryThrottle, ExperienceEnquiryCreateView.throttle_classes)
        self.assertIn(
            ExperienceEnquiryThrottle.scope, api_settings.DEFAULT_THROTTLE_RATES,
        )


class AdminEnquiryTests(ExperienceTestBase):
    def setUp(self):
        super().setUp()
        self.exp = self.make(title="Cruise Journeys", category="luxury_travel")
        self.enquiry = ExperienceEnquiry.objects.create(
            experience=self.exp, category="luxury_travel",
            experience_title="Cruise Journeys",
            name="Alex Traveller", email="alex@example.com", destination="Macau",
        )

    def test_the_back_office_lists_the_lead_with_its_detail(self):
        self.as_admin()
        res = self.client.get("/api/admin-panel/experience-enquiries/")
        self.assertEqual(res.status_code, 200)
        rows = res.data["results"] if isinstance(res.data, dict) else res.data
        row = next(r for r in rows if r["id"] == self.enquiry.pk)
        self.assertEqual(row["name"], "Alex Traveller")
        self.assertEqual(row["experience_title"], "Cruise Journeys")
        self.assertEqual(row["category_label"], "Luxury Travel")

    def test_a_host_can_work_the_lead_through_its_statuses(self):
        self.as_admin()
        res = self.client.patch(
            f"/api/admin-panel/experience-enquiries/{self.enquiry.pk}/",
            {"status": "contacted", "admin_note": "Called, sending options"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.status, "contacted")
        self.assertEqual(self.enquiry.admin_note, "Called, sending options")

    def test_what_somebody_asked_for_cannot_be_rewritten(self):
        self.as_admin()
        res = self.client.patch(
            f"/api/admin-panel/experience-enquiries/{self.enquiry.pk}/",
            {"name": "Someone Else", "destination": "Dubai", "category": "dining"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.enquiry.refresh_from_db()
        self.assertEqual(self.enquiry.name, "Alex Traveller")
        self.assertEqual(self.enquiry.destination, "Macau")
        self.assertEqual(self.enquiry.category, "luxury_travel")

    def test_an_enquiry_cannot_be_deleted(self):
        """A lead is a record of a real person asking. Working it means moving
        it to contacted or closed, not erasing it."""
        self.as_admin()
        res = self.client.delete(f"/api/admin-panel/experience-enquiries/{self.enquiry.pk}/")
        self.assertEqual(res.status_code, 405)
        self.assertTrue(ExperienceEnquiry.objects.filter(pk=self.enquiry.pk).exists())

    def test_leads_can_be_filtered_and_searched(self):
        self.as_admin()

        def ids(**params):
            res = self.client.get("/api/admin-panel/experience-enquiries/", params)
            rows = res.data["results"] if isinstance(res.data, dict) else res.data
            return [r["id"] for r in rows]

        self.assertIn(self.enquiry.pk, ids(status="new"))
        self.assertNotIn(self.enquiry.pk, ids(status="closed"))
        self.assertIn(self.enquiry.pk, ids(category="luxury_travel"))
        self.assertNotIn(self.enquiry.pk, ids(category="dining"))
        self.assertIn(self.enquiry.pk, ids(q="alex@example.com"))
        self.assertIn(self.enquiry.pk, ids(q="Macau"))
        self.assertNotIn(self.enquiry.pk, ids(q="zzzznope"))

    def test_the_lead_list_is_admin_only(self):
        self.client.force_authenticate(self.player)
        self.assertEqual(
            self.client.get("/api/admin-panel/experience-enquiries/").status_code, 403,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/admin-panel/experience-enquiries/{self.enquiry.pk}/",
                {"status": "closed"}, format="json",
            ).status_code,
            403,
        )

    def test_the_visitors_ip_is_never_served_to_anyone(self):
        """It exists to rate-limit the endpoint, not to be read by staff."""
        self.enquiry.submitted_ip = "203.0.113.9"
        self.enquiry.save()
        self.as_admin()
        body = str(self.client.get("/api/admin-panel/experience-enquiries/").data)
        self.assertNotIn("203.0.113.9", body)
        self.assertNotIn("submitted_ip", body)

    def test_an_enquiry_survives_the_card_it_came_from_being_deleted(self):
        """Tidying a card in Back Office must not silently destroy the leads it
        produced — the person still asked."""
        self.exp.delete()
        self.enquiry.refresh_from_db()
        self.assertIsNone(self.enquiry.experience_id)
        self.assertEqual(self.enquiry.experience_title, "Cruise Journeys")
        self.assertEqual(self.enquiry.category, "luxury_travel")


class AdminExperienceCrudTests(ExperienceTestBase):
    def test_an_admin_can_create_and_edit_a_pillar_card(self):
        self.as_admin()
        res = self.client.post(
            "/api/admin-panel/experiences/",
            {"category": "stay", "title": "Harbour Suites", "display_order": 5},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        pk = res.data["id"]

        res = self.client.patch(
            f"/api/admin-panel/experiences/{pk}/", {"subtitle": "Edited"}, format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Experience.objects.get(pk=pk).subtitle, "Edited")

    def test_a_new_card_appears_on_the_public_page_with_no_code_change(self):
        self.as_admin()
        self.client.post(
            "/api/admin-panel/experiences/",
            {"category": "dining", "title": "Chef's Table", "is_active": True},
            format="json",
        )
        self.client.force_authenticate(None)
        titles = [r["title"] for r in self.page()["experiences"]["dining"]]
        self.assertIn("Chef's Table", titles)

    def test_the_admin_list_can_be_filtered_to_one_pillar(self):
        self.make(category="stay", title="A Stay")
        self.make(category="dining", title="A Dinner")
        self.as_admin()
        res = self.client.get("/api/admin-panel/experiences/", {"category": "stay"})
        rows = res.data["results"] if isinstance(res.data, dict) else res.data
        titles = [r["title"] for r in rows]
        self.assertIn("A Stay", titles)
        self.assertNotIn("A Dinner", titles)
        # And the filter really is filtering, not just returning everything.
        self.assertTrue(all(r["category"] == "stay" for r in rows))

    def test_editing_records_who_did_it(self):
        self.as_admin()
        pk = self.client.post(
            "/api/admin-panel/experiences/",
            {"category": "stay", "title": "Audited"}, format="json",
        ).data["id"]
        self.assertEqual(Experience.objects.get(pk=pk).updated_by_id, self.admin.id)

    def test_pillar_cards_are_admin_only(self):
        row = self.make()
        self.client.force_authenticate(self.player)
        self.assertEqual(self.client.get("/api/admin-panel/experiences/").status_code, 403)
        self.assertEqual(
            self.client.post(
                "/api/admin-panel/experiences/",
                {"category": "stay", "title": "Nope"}, format="json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(f"/api/admin-panel/experiences/{row.pk}/").status_code, 403,
        )

    def test_there_is_no_public_write_path_to_a_pillar_card(self):
        self.client.force_authenticate(None)
        res = self.client.post(
            "/api/experiences/", {"category": "stay", "title": "Injected"}, format="json",
        )
        self.assertIn(res.status_code, (401, 403, 405))
        self.assertFalse(Experience.objects.filter(title="Injected").exists())


class SeededCopyTests(ExperienceTestBase):
    """The seeded rows are the public claim surface on first install, so they
    get the same scrutiny the landing copy does."""

    def test_the_two_pillars_the_brief_requires_are_seeded(self):
        titles = set(Experience.objects.values_list("title", flat=True))
        self.assertIn("Private Jet Travel", titles)
        self.assertIn("Cruise Journeys", titles)

    def test_no_seeded_row_names_a_partner_price_or_availability(self):
        """Migration 0096 seeds SERVICE descriptions. Naming a hotel, an
        operator or a price would be inventing a business relationship."""
        for row in Experience.objects.all():
            self.assertEqual(row.partner, "", f"{row.title} names a partner")
            self.assertEqual(row.city, "", f"{row.title} claims a city")
            self.assertIsNone(row.destination_id, f"{row.title} claims a destination")

    def test_no_seeded_copy_claims_ownership_or_a_licence(self):
        blob = " ".join(
            f"{r.title} {r.subtitle} {r.description}" for r in Experience.objects.all()
        ).lower()
        for phrase in (
            "we own", "our fleet", "our hotel", "our restaurant", "our ship",
            "our aircraft", "licensed", "guaranteed", "best price", "cheapest",
        ):
            self.assertNotIn(phrase, blob, f"seeded copy claims: {phrase}")

    def test_the_casino_introduction_does_not_claim_we_provide_the_gaming(self):
        """The venue provides the gaming; JackpotsWorld provides the
        introduction. The landing wording guard enforces the same distinction
        on the hero copy."""
        row = Experience.objects.get(title="Casino Introductions")
        self.assertIn("introduction", row.description.lower())
        self.assertNotIn("we provide the gaming", row.description.lower())

    def test_every_seeded_card_can_hand_off_to_whatsapp(self):
        """A card whose enquiry_key names no EnquiryMessage row would fall back
        to a blank message, so the button would open an empty composer."""
        keys = set(EnquiryMessage.objects.values_list("key", flat=True))
        for row in Experience.objects.exclude(enquiry_key=""):
            self.assertIn(row.enquiry_key, keys, f"{row.title} has a dangling enquiry key")

    def test_the_overview_band_is_seeded_with_casinos_leading(self):
        """The brief is explicit that offline casinos must not be reduced by
        the new pillars, so the band opens with them rather than burying them
        among the others."""
        band = list(
            Experience.objects.filter(category="overview", is_active=True)
            .order_by("display_order", "id")
            .values_list("title", flat=True)
        )
        self.assertEqual(len(band), 6)
        self.assertEqual(band[0], "Offline Casinos")
        for expected in ("Luxury Travel", "Hotels & Resorts", "VIP Concierge",
                         "Events", "Dining & Entertainment"):
            self.assertIn(expected, band)

    def test_every_overview_card_actually_goes_somewhere(self):
        """A signpost with no destination is just a picture. These cards have no
        enquiry button, so the CTA link is the only thing they do."""
        for row in Experience.objects.filter(category="overview"):
            self.assertTrue(row.cta_link, f"{row.title} points nowhere")

    def test_overview_cards_are_not_enquiry_targets(self):
        """They send the visitor to a section that has its own enquiry buttons,
        rather than opening a form about 'Events' in the abstract."""
        for row in Experience.objects.filter(category="overview"):
            self.assertEqual(row.enquiry_key, "", f"{row.title} claims an enquiry key")

    def test_the_overview_band_is_editable_like_any_other_card(self):
        """It reuses Experience precisely so the six signposts are Back Office
        content — including where each one points."""
        self.as_admin()
        row = Experience.objects.filter(category="overview").first()
        res = self.client.patch(
            f"/api/admin-panel/experiences/{row.pk}/",
            {"title": "Casino Floors", "cta_link": "/poker"}, format="json",
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.client.force_authenticate(None)
        card = next(
            r for r in self.page()["experiences"]["overview"] if r["id"] == row.pk
        )
        self.assertEqual(card["title"], "Casino Floors")
        self.assertEqual(card["cta_link"], "/poker")

    def test_seeding_is_idempotent(self):
        """The migration uses get_or_create, so running it a second time — a
        replayed deploy, a squashed history — must not double every card."""
        import importlib

        from django.apps import apps as django_apps

        seed = importlib.import_module("authapp.migrations.0096_seed_experiences").seed
        before = Experience.objects.count()
        seed(django_apps, None)
        self.assertEqual(Experience.objects.count(), before)
