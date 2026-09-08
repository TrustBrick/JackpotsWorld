"""
Andhar Bahar — the public page payload, the Back Office CRUD behind it, and
the FAQ system it shares with the landing and Affiliates pages.

The theme running through these is that NOTHING the page renders is hardcoded
in the frontend: every assertion below changes a row in the Back Office and
then reads the change back off the public endpoint, which is the only way to
prove the content is genuinely dynamic rather than merely fetched.
"""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models.andhar_bahar_models import (
    AndharBaharContent,
    AndharBaharEvent,
    AndharBaharHighlight,
    AndharBaharRegistration,
    AndharBaharStep,
)
from authapp.models.casino_models import Casino
from authapp.models.faq_models import FAQ
from authapp.models.landing_models import SectionMedia

User = get_user_model()


class AndharBaharTestBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="ab-admin@example.com", password="pw12345!", name="AB Admin",
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save()
        self.player = User.objects.create_user(
            email="ab-player@example.com", password="pw12345!", name="Player",
        )
        self.client = APIClient()

    def as_admin(self):
        self.client.force_authenticate(self.admin)

    def page(self):
        self.client.force_authenticate(None)
        res = self.client.get("/api/andhar-bahar/content/")
        self.assertEqual(res.status_code, 200, res.content[:300])
        return res.data


class AndharBaharPublicPageTests(AndharBaharTestBase):
    def test_the_page_is_public_and_arrives_in_one_payload(self):
        data = self.page()
        # One request carries every part of the page — see the serializer
        # module docstring for why.
        for key in ("is_published", "content", "highlights", "steps", "events", "faqs", "media"):
            self.assertIn(key, data)

    def test_seeded_content_ships_with_the_page(self):
        """Migration 0086 seeds highlights and steps, so a fresh install
        renders a complete page before an admin has touched anything."""
        data = self.page()
        self.assertTrue(data["highlights"], "expected seeded highlight cards")
        self.assertTrue(data["steps"], "expected seeded how-to-play steps")
        self.assertEqual(data["content"]["hero_title"], "Andhar Bahar")

    def test_no_seeded_copy_claims_an_outcome(self):
        """Guards the wording rule the whole page is written under: this
        business introduces members to venues, it does not promise results.

        A blunt substring check on purpose — it is meant to fail loudly if
        somebody seeds "guaranteed wins" into the defaults later.
        """
        data = self.page()
        blob = " ".join([
            str(data["content"]),
            " ".join(h["title"] + " " + h["description"] for h in data["highlights"]),
            " ".join(s["title"] + " " + s["description"] for s in data["steps"]),
        ]).lower()
        for banned in ("guaranteed", "guarantee", "sure win", "risk-free", "always win"):
            self.assertNotIn(banned, blob, f"seeded copy must not say {banned!r}")

    def test_only_public_events_are_listed(self):
        casino, _ = Casino.objects.get_or_create(
            country="India", name="Deltin AB", defaults={"is_active": True},
        )
        AndharBaharEvent.objects.create(
            name="Published Night", country="India", casino=casino,
            start_date=date.today() + timedelta(days=3), status="published", is_active=True,
        )
        AndharBaharEvent.objects.create(
            name="Draft Night", country="India", casino=casino,
            start_date=date.today() + timedelta(days=3), status="draft", is_active=True,
        )
        AndharBaharEvent.objects.create(
            name="Deactivated", country="India", casino=casino,
            start_date=date.today() + timedelta(days=3), status="published", is_active=False,
        )

        names = {e["name"] for e in self.page()["events"]}
        self.assertIn("Published Night", names)
        self.assertNotIn("Draft Night", names)
        self.assertNotIn("Deactivated", names)

    def test_computed_status_corrects_a_stale_stored_one(self):
        """An event whose dates have it under way reports "live" even though
        the stored column still says "published" — the same read-time
        correction Teen Patti and Poker apply, so a page is never wrong just
        because no scheduler has run."""
        AndharBaharEvent.objects.create(
            name="Happening Now", country="India",
            start_date=date.today() - timedelta(days=1),
            end_date=date.today() + timedelta(days=1),
            status="published", is_active=True,
        )
        row = next(e for e in self.page()["events"] if e["name"] == "Happening Now")
        self.assertEqual(row["status"], "published")
        self.assertEqual(row["computed_status"], "live")

    def test_unpublishing_the_page_returns_an_explanation_not_a_404(self):
        content = AndharBaharContent.load()
        content.is_published = False
        content.save()

        data = self.page()
        self.assertFalse(data["is_published"])
        self.assertIsNone(data["content"])
        self.assertEqual(data["events"], [])

    def test_section_switches_hide_their_own_sections(self):
        content = AndharBaharContent.load()
        content.show_highlights_section = False
        content.show_events_section = False
        content.save()

        data = self.page()
        self.assertTrue(data["is_published"])
        self.assertEqual(data["highlights"], [])
        self.assertEqual(data["events"], [])
        # The sections that were NOT switched off are unaffected.
        self.assertTrue(data["steps"])

    def test_inactive_highlights_and_steps_are_hidden(self):
        AndharBaharHighlight.objects.update(is_active=False)
        AndharBaharStep.objects.update(is_active=False)
        data = self.page()
        self.assertEqual(data["highlights"], [])
        self.assertEqual(data["steps"], [])

    def test_media_is_keyed_by_slot(self):
        # Created directly rather than through the API: the serializer's
        # "an active slot needs a file" rule is not what this asserts.
        SectionMedia.objects.create(section="andhar_bahar", slot="hero_card", label="AB", is_active=True)
        media = self.page()["media"]
        self.assertIn("hero_card", media)
        self.assertEqual(media["hero_card"]["label"], "AB")

    def test_event_filters_narrow_the_list(self):
        for country in ("India", "Sri Lanka"):
            AndharBaharEvent.objects.create(
                name=f"{country} Night", country=country,
                start_date=date.today() + timedelta(days=2),
                status="published", is_active=True,
            )
        self.client.force_authenticate(None)
        res = self.client.get("/api/andhar-bahar/events/", {"country": "india"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual([e["name"] for e in res.data], ["India Night"])

    def test_filter_options_only_offer_values_that_return_something(self):
        AndharBaharEvent.objects.create(
            name="Visible", country="India", city="Goa",
            start_date=date.today() + timedelta(days=2), status="published", is_active=True,
        )
        AndharBaharEvent.objects.create(
            name="Hidden", country="Nepal", city="Kathmandu",
            start_date=date.today() + timedelta(days=2), status="draft", is_active=True,
        )
        self.client.force_authenticate(None)
        res = self.client.get("/api/andhar-bahar/events/filters/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("India", res.data["countries"])
        self.assertNotIn("Nepal", res.data["countries"])


class AndharBaharAdminTests(AndharBaharTestBase):
    def test_content_is_editable_and_the_public_page_reflects_it(self):
        """THE POINT OF THE WHOLE FEATURE: an admin edit shows up on the
        public page with no code change."""
        self.as_admin()
        res = self.client.patch(
            "/api/admin-panel/andhar-bahar/content/",
            {"hero_title": "Andhar Bahar Live", "hero_cta_primary_label": "See Tables"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content[:300])

        data = self.page()
        self.assertEqual(data["content"]["hero_title"], "Andhar Bahar Live")
        self.assertEqual(data["content"]["hero_cta_primary_label"], "See Tables")

    def test_content_edits_are_attributed(self):
        self.as_admin()
        self.client.patch(
            "/api/admin-panel/andhar-bahar/content/",
            {"hero_subtitle": "Changed"}, format="json",
        )
        self.assertEqual(AndharBaharContent.load().updated_by_id, self.admin.id)

    def test_highlight_crud_round_trip(self):
        self.as_admin()
        res = self.client.post(
            "/api/admin-panel/andhar-bahar/highlights/",
            {"title": "New Card", "icon_name": "Flame", "description": "d", "order": 99},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        new_id = res.data["id"]
        self.assertIn("New Card", [h["title"] for h in self.page()["highlights"]])

        # self.page() reads the endpoint as an anonymous visitor (which is the
        # point of it), so the admin session has to be re-established before
        # the next write.
        self.as_admin()
        res = self.client.patch(
            f"/api/admin-panel/andhar-bahar/highlights/{new_id}/",
            {"title": "Renamed"}, format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("Renamed", [h["title"] for h in self.page()["highlights"]])

        self.as_admin()
        self.assertEqual(
            self.client.delete(f"/api/admin-panel/andhar-bahar/highlights/{new_id}/").status_code,
            204,
        )
        self.assertNotIn("Renamed", [h["title"] for h in self.page()["highlights"]])

    def test_reordering_changes_what_visitors_see_first(self):
        self.as_admin()
        first = AndharBaharHighlight.objects.order_by("order", "id").first()
        AndharBaharHighlight.objects.exclude(pk=first.pk).update(order=0)
        res = self.client.patch(
            f"/api/admin-panel/andhar-bahar/highlights/{first.pk}/",
            {"order": 999}, format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.page()["highlights"][-1]["id"], first.pk)

    def test_admin_sees_drafts_the_public_endpoint_hides(self):
        AndharBaharEvent.objects.create(
            name="Draft Only", country="India",
            start_date=date.today() + timedelta(days=5), status="draft", is_active=True,
        )
        self.as_admin()
        res = self.client.get("/api/admin-panel/andhar-bahar/events/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("Draft Only", [e["name"] for e in res.data])

    def test_an_end_date_before_the_start_is_rejected(self):
        self.as_admin()
        res = self.client.post(
            "/api/admin-panel/andhar-bahar/events/",
            {
                "name": "Backwards", "country": "India",
                "start_date": "2026-06-10", "end_date": "2026-06-01",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("end_date", res.data)

    def test_media_writes_are_locked_to_this_section(self):
        """The admin media endpoint forces section="andhar_bahar" on every
        write, so a row created here can never belong to Poker or Teen Patti
        even if the body says otherwise."""
        self.as_admin()
        # is_active=False because the serializer requires an ACTIVE slot to
        # carry a video or poster — an existing rule, and not what this test is
        # about. The section-locking is what is under test.
        res = self.client.post(
            "/api/admin-panel/andhar-bahar/media/",
            {"slot": "hero_card", "label": "AB", "section": "poker", "is_active": False},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        self.assertEqual(SectionMedia.objects.get(pk=res.data["id"]).section, "andhar_bahar")

    def test_every_admin_endpoint_is_admin_only(self):
        self.client.force_authenticate(self.player)
        for path in (
            "/api/admin-panel/andhar-bahar/content/",
            "/api/admin-panel/andhar-bahar/highlights/",
            "/api/admin-panel/andhar-bahar/steps/",
            "/api/admin-panel/andhar-bahar/events/",
            "/api/admin-panel/andhar-bahar/media/",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 403, path)

    def test_a_player_cannot_write_content(self):
        self.client.force_authenticate(self.player)
        res = self.client.patch(
            "/api/admin-panel/andhar-bahar/content/",
            {"hero_title": "Hacked"}, format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(AndharBaharContent.load().hero_title, "Andhar Bahar")


class AndharBaharRegistrationTests(AndharBaharTestBase):
    """Registration is INTEREST CAPTURE, mirroring Poker: no seat, no payment,
    no confirmation ID. What it records is that this member wants to be told
    about this event, and a host follows up from the Back Office table."""

    def setUp(self):
        super().setUp()
        self.casino, _ = Casino.objects.get_or_create(
            country="India", name="Deltin Reg", defaults={"is_active": True},
        )
        self.event = AndharBaharEvent.objects.create(
            name="Goa Andhar Bahar Night", country="India", casino=self.casino,
            start_date=date.today() + timedelta(days=7),
            status="published", is_active=True,
        )

    def register(self, as_user=None):
        self.client.force_authenticate(as_user)
        return self.client.post(f"/api/andhar-bahar/events/{self.event.pk}/register/", {}, format="json")

    def test_a_member_can_register_interest(self):
        res = self.register(self.player)
        self.assertEqual(res.status_code, 201, res.content[:300])
        self.assertTrue(res.data["created"])
        reg = AndharBaharRegistration.objects.get(event=self.event, user=self.player)
        self.assertEqual(reg.status, "new")

    def test_registering_twice_is_a_friendly_no_op_not_a_duplicate(self):
        """unique_together is the hard guard; get_or_create makes a
        double-submit or an impatient second tap read as "already registered"
        rather than an error."""
        self.assertEqual(self.register(self.player).status_code, 201)
        second = self.register(self.player)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data["created"])
        self.assertEqual(
            AndharBaharRegistration.objects.filter(event=self.event, user=self.player).count(), 1,
        )

    def test_registration_requires_a_signed_in_member(self):
        self.client.force_authenticate(None)
        res = self.client.post(f"/api/andhar-bahar/events/{self.event.pk}/register/", {}, format="json")
        self.assertIn(res.status_code, (401, 403))
        self.assertEqual(AndharBaharRegistration.objects.count(), 0)

    def test_a_draft_event_cannot_be_registered_for(self):
        """404, not 403: whether a non-public event exists is not a visitor's
        business."""
        draft = AndharBaharEvent.objects.create(
            name="Draft", country="India",
            start_date=date.today() + timedelta(days=7), status="draft", is_active=True,
        )
        self.client.force_authenticate(self.player)
        res = self.client.post(f"/api/andhar-bahar/events/{draft.pk}/register/", {}, format="json")
        self.assertEqual(res.status_code, 404)

    def test_a_finished_event_cannot_be_registered_for(self):
        """Registering interest in something already over only produces a call
        nobody wants."""
        past = AndharBaharEvent.objects.create(
            name="Last month", country="India",
            start_date=date.today() - timedelta(days=30),
            end_date=date.today() - timedelta(days=29),
            status="published", is_active=True,
        )
        self.client.force_authenticate(self.player)
        res = self.client.post(f"/api/andhar-bahar/events/{past.pk}/register/", {}, format="json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "event_completed")

    def test_the_event_card_reports_whether_this_member_registered(self):
        """`is_registered` rides on the event payload so the card can say
        "Registered" without a second request."""
        self.client.force_authenticate(self.player)
        before = self.client.get("/api/andhar-bahar/content/").data["events"]
        row = next(e for e in before if e["id"] == self.event.pk)
        self.assertFalse(row["is_registered"])
        self.assertTrue(row["can_register"])

        self.register(self.player)

        self.client.force_authenticate(self.player)
        after = self.client.get("/api/andhar-bahar/content/").data["events"]
        row = next(e for e in after if e["id"] == self.event.pk)
        self.assertTrue(row["is_registered"])
        self.assertFalse(row["can_register"])

    def test_an_anonymous_visitor_is_never_reported_as_registered(self):
        self.register(self.player)
        self.client.force_authenticate(None)
        row = next(
            e for e in self.client.get("/api/andhar-bahar/content/").data["events"]
            if e["id"] == self.event.pk
        )
        self.assertFalse(row["is_registered"])

    def test_my_registrations_is_scoped_to_the_requesting_member(self):
        other = User.objects.create_user(
            email="ab-other@example.com", password="pw12345!", name="Other",
        )
        self.register(self.player)
        self.register(other)

        self.client.force_authenticate(self.player)
        mine = self.client.get("/api/andhar-bahar/my-registrations/")
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(len(mine.data), 1)
        self.assertEqual(mine.data[0]["event"], self.event.pk)

    def test_a_member_never_sees_the_admin_note_on_their_own_registration(self):
        """`admin_note` is staff context about this member. The member's own
        serializer omits it entirely."""
        self.register(self.player)
        AndharBaharRegistration.objects.filter(user=self.player).update(
            admin_note="INTERNAL: chased twice, no answer",
        )
        self.client.force_authenticate(self.player)
        body = str(self.client.get("/api/andhar-bahar/my-registrations/").data)
        self.assertNotIn("INTERNAL", body)
        self.assertNotIn("admin_note", body)


class AndharBaharAdminRegistrationTests(AndharBaharTestBase):
    def setUp(self):
        super().setUp()
        self.event = AndharBaharEvent.objects.create(
            name="Admin Reg Night", country="India",
            start_date=date.today() + timedelta(days=5), status="published", is_active=True,
        )
        self.reg = AndharBaharRegistration.objects.create(event=self.event, user=self.player)

    def test_the_back_office_lists_registrations_with_the_member_behind_them(self):
        self.as_admin()
        res = self.client.get("/api/admin-panel/andhar-bahar/registrations/")
        self.assertEqual(res.status_code, 200)
        rows = res.data["results"] if isinstance(res.data, dict) else res.data
        row = next(r for r in rows if r["id"] == self.reg.pk)
        self.assertEqual(row["user_email"], self.player.email)
        self.assertEqual(row["event_name"], "Admin Reg Night")

    def test_an_admin_can_work_a_registration_through_its_statuses(self):
        self.as_admin()
        res = self.client.patch(
            f"/api/admin-panel/andhar-bahar/registrations/{self.reg.pk}/",
            {"status": "contacted", "admin_note": "Called, sending dates"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.reg.refresh_from_db()
        self.assertEqual(self.reg.status, "contacted")
        self.assertEqual(self.reg.admin_note, "Called, sending dates")

    def test_who_registered_for_what_cannot_be_rewritten(self):
        """Only status and the host's note are writable — the member and the
        event are facts, not fields."""
        other = User.objects.create_user(
            email="ab-other2@example.com", password="pw12345!", name="Other",
        )
        self.as_admin()
        res = self.client.patch(
            f"/api/admin-panel/andhar-bahar/registrations/{self.reg.pk}/",
            {"user": other.pk, "event": 9999}, format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.reg.refresh_from_db()
        self.assertEqual(self.reg.user_id, self.player.id)
        self.assertEqual(self.reg.event_id, self.event.pk)

    def test_registrations_can_be_filtered_for_the_host_working_them(self):
        self.as_admin()
        res = self.client.get(
            "/api/admin-panel/andhar-bahar/registrations/", {"status": "new"},
        )
        self.assertEqual(res.status_code, 200)
        rows = res.data["results"] if isinstance(res.data, dict) else res.data
        self.assertTrue(any(r["id"] == self.reg.pk for r in rows))

        res = self.client.get(
            "/api/admin-panel/andhar-bahar/registrations/", {"status": "closed"},
        )
        rows = res.data["results"] if isinstance(res.data, dict) else res.data
        self.assertFalse(any(r["id"] == self.reg.pk for r in rows))

    def test_the_registrations_table_is_admin_only(self):
        self.client.force_authenticate(self.player)
        self.assertEqual(
            self.client.get("/api/admin-panel/andhar-bahar/registrations/").status_code, 403,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/admin-panel/andhar-bahar/registrations/{self.reg.pk}/",
                {"status": "closed"}, format="json",
            ).status_code,
            403,
        )


class AndharBaharSignupCopyTests(AndharBaharTestBase):
    def test_the_hero_asks_the_visitor_to_sign_up(self):
        """The section exists to convert an interested player into a member who
        can be told where tables are live, so the hero has to actually ask."""
        content = self.page()["content"]
        self.assertIn("Andhar Bahar player", content["hero_subtitle"])
        blob = f"{content['hero_description']} {content['signup_prompt']}".lower()
        self.assertIn("sign up", blob)
        self.assertIn("live", blob)
        self.assertIn("event", blob)

    def test_the_primary_cta_points_at_the_sections_own_sign_up(self):
        content = self.page()["content"]
        self.assertEqual(content["hero_cta_primary_link"], "/andhar-bahar/sign-up")

    def test_the_signup_prompt_is_editable_from_the_back_office(self):
        self.as_admin()
        res = self.client.patch(
            "/api/admin-panel/andhar-bahar/content/",
            {"signup_prompt": "Custom prompt for our players."}, format="json",
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertEqual(self.page()["content"]["signup_prompt"], "Custom prompt for our players.")


class FaqTests(AndharBaharTestBase):
    def test_the_four_landing_questions_are_seeded_verbatim(self):
        """The compliance statement of what this business is NOT. Seeded by
        migration 0086 so making the FAQ editable did not change what the page
        says — see faq_models.py's docstring."""
        self.client.force_authenticate(None)
        res = self.client.get("/api/faqs/", {"category": "landing"})
        self.assertEqual(res.status_code, 200)
        questions = [f["question"] for f in res.data]
        self.assertIn("Is JackpotsWorld an online casino?", questions)
        answer = next(f["answer"] for f in res.data if f["question"] == "Is JackpotsWorld an online casino?")
        self.assertTrue(answer.startswith("No."))

    def test_the_public_list_is_scoped_to_its_category(self):
        self.client.force_authenticate(None)
        landing = self.client.get("/api/faqs/", {"category": "landing"}).data
        affiliate = self.client.get("/api/faqs/", {"category": "affiliate"}).data
        self.assertTrue(landing)
        self.assertTrue(affiliate)
        self.assertFalse(
            {f["id"] for f in landing} & {f["id"] for f in affiliate},
            "a question must not appear on two pages at once",
        )

    def test_an_unknown_category_returns_an_empty_list_not_an_error(self):
        """The frontend falls back to its built-in copy on an empty list, so
        an empty response is a safe outcome and a 400 would turn a typo into a
        broken section."""
        self.client.force_authenticate(None)
        res = self.client.get("/api/faqs/", {"category": "nope"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, [])

    def test_disabled_faqs_are_hidden_from_visitors(self):
        FAQ.objects.filter(category="landing").update(is_active=False)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/faqs/", {"category": "landing"}).data, [])

    def test_admin_crud_and_attribution(self):
        self.as_admin()
        res = self.client.post(
            "/api/admin-panel/faqs/",
            {"category": "landing", "question": "New question?", "answer": "New answer."},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        faq = FAQ.objects.get(pk=res.data["id"])
        self.assertEqual(faq.updated_by_id, self.admin.id)

        # A new row lands at the END of its category rather than sharing
        # order 0 with what is already there.
        self.assertGreater(faq.order, 0)

        self.client.force_authenticate(None)
        self.assertIn(
            "New question?",
            [f["question"] for f in self.client.get("/api/faqs/", {"category": "landing"}).data],
        )

    def test_blank_questions_and_answers_are_rejected(self):
        self.as_admin()
        for body in (
            {"category": "landing", "question": "   ", "answer": "a"},
            {"category": "landing", "question": "q", "answer": "  "},
        ):
            with self.subTest(body=body):
                self.assertEqual(
                    self.client.post("/api/admin-panel/faqs/", body, format="json").status_code,
                    400,
                )

    def test_reorder_applies_the_posted_sequence(self):
        self.as_admin()
        ids = list(
            FAQ.objects.filter(category="landing").order_by("order").values_list("id", flat=True)
        )
        reversed_ids = list(reversed(ids))
        res = self.client.post(
            "/api/admin-panel/faqs/reorder/", {"order": reversed_ids}, format="json",
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertEqual(res.data["updated"], len(ids))

        self.client.force_authenticate(None)
        public = [f["id"] for f in self.client.get("/api/faqs/", {"category": "landing"}).data]
        self.assertEqual(public, reversed_ids)

    def test_reorder_ignores_unknown_ids_rather_than_failing_wholesale(self):
        """The browser's list can be a moment stale if another admin deleted a
        row; rejecting the whole reorder for that is worse than applying the
        part that still makes sense."""
        self.as_admin()
        ids = list(FAQ.objects.filter(category="landing").values_list("id", flat=True))
        res = self.client.post(
            "/api/admin-panel/faqs/reorder/",
            {"order": ids + [999999, "not-a-number"]}, format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["updated"], len(ids))

    def test_reorder_rejects_a_malformed_body(self):
        self.as_admin()
        res = self.client.post("/api/admin-panel/faqs/reorder/", {"order": "nope"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_faq_admin_endpoints_are_admin_only(self):
        self.client.force_authenticate(self.player)
        self.assertEqual(self.client.get("/api/admin-panel/faqs/").status_code, 403)
        self.assertEqual(
            self.client.post("/api/admin-panel/faqs/reorder/", {"order": []}, format="json").status_code,
            403,
        )
