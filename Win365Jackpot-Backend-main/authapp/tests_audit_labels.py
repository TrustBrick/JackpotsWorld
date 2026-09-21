"""
authapp/tests_audit_labels.py
─────────────────────────────────────────────────────────────────────────────
The plain-language labels (services/audit_labels.py).

Two things are being defended:

  * **The actions people actually ask about** — picking up and ending calls,
    adding poker events, editing the landing page — read as sentences. These
    are the ones the feature was asked for by name.
  * **Specific paths beat general ones.** `/poker/sources/` has to be tested
    before `/poker/`. If that ordering is ever disturbed, every poker source
    edit quietly reports itself as a tournament edit, and an audit trail that
    confidently says the wrong thing is worse than one that says nothing.
"""

from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from authapp.models import ActivityLog, User
from authapp.services.audit_labels import describe

P = "/api/admin-panel"


class AuditLabelTests(TestCase):

    def test_the_call_actions_read_as_what_the_agent_did(self):
        cases = {
            ("POST", f"{P}/live-chat/calls/41/accept/"):  "Picked up a call",
            ("POST", f"{P}/live-chat/calls/41/end/"):     "Ended a call",
            ("POST", f"{P}/live-chat/calls/41/hold/"):    "Put a call on hold",
            ("POST", f"{P}/live-chat/calls/41/resume/"):  "Took a call off hold",
            ("POST", f"{P}/live-chat/calls/41/transfer/"): "Transferred a call",
            ("POST", f"{P}/live-chat/calls/41/reject/"):  "Rejected an incoming call",
            ("DELETE", f"{P}/live-chat/calls/41/"):       "Deleted a call from history",
            ("POST", f"{P}/live-chat/7/messages/"):       "Replied in live chat",
        }
        for (method, path), expected in cases.items():
            self.assertEqual(describe(method, path), expected, path)

    def test_poker_and_events_say_what_was_added_or_edited(self):
        self.assertEqual(describe("POST", f"{P}/poker/"), "Added a poker tournament")
        self.assertEqual(describe("PATCH", f"{P}/poker/12/"), "Updated a poker tournament")
        self.assertEqual(describe("DELETE", f"{P}/poker/12/"), "Deleted a poker tournament")
        self.assertEqual(describe("POST", f"{P}/events/"), "Added an event")
        self.assertEqual(describe("PATCH", f"{P}/events/3/"), "Updated an event")
        self.assertEqual(describe("POST", f"{P}/teen-patti/"), "Added a Teen Patti event")
        self.assertEqual(describe("POST", f"{P}/andhar-bahar/events/"),
                         "Added an Andhar Bahar event")

    def test_a_more_specific_path_wins_over_a_general_one(self):
        """The ordering guard. /poker/sources/ must not be read as /poker/."""
        self.assertEqual(describe("POST", f"{P}/poker/sources/"), "Added a poker source")
        self.assertEqual(describe("POST", f"{P}/poker/sources/2/sync/"),
                         "Synced a poker source")
        self.assertEqual(describe("PATCH", f"{P}/poker/registrations/9/"),
                         "Updated a poker registration")
        # and the general one still works
        self.assertEqual(describe("POST", f"{P}/poker/"), "Added a poker tournament")

    def test_landing_page_edits_are_named(self):
        self.assertEqual(describe("PUT", f"{P}/landing-settings/"),
                         "Updated the landing page settings")
        self.assertEqual(describe("POST", f"{P}/hero-stats/"),
                         "Added a landing page hero stat")
        self.assertEqual(describe("DELETE", f"{P}/testimonials/4/"), "Deleted a testimonial")
        self.assertEqual(describe("POST", f"{P}/promotions/"), "Added a promotion")

    def test_a_settings_endpoint_is_updated_not_added(self):
        """POST to a single settings record means saved, not 'created a
        second set of settings'."""
        for path in (f"{P}/landing-settings/", f"{P}/spin-settings/",
                     f"{P}/voice-call-settings/", f"{P}/support-settings/"):
            self.assertTrue(describe("POST", path).startswith("Updated"), path)

    def test_money_decisions_are_named(self):
        self.assertEqual(describe("POST", f"{P}/deposit-requests/5/approve/"),
                         "Approved a deposit request")
        self.assertEqual(describe("POST", f"{P}/withdrawal-requests/5/reject/"),
                         "Rejected a withdrawal")
        self.assertEqual(describe("POST", f"{P}/users/8/add-wallet/"),
                         "Credited a player wallet")
        self.assertEqual(describe("POST", f"{P}/kyc/3/update/"),
                         "Reviewed a KYC submission")

    def test_an_unknown_endpoint_is_left_alone_rather_than_guessed_at(self):
        """A wrong sentence is worse than a raw path: the raw path is
        obviously raw, and the wrong sentence is not."""
        self.assertIsNone(describe("POST", f"{P}/something-invented-next-year/"))
        self.assertIsNone(describe("POST", ""))
        self.assertIsNone(describe(None, None))

    def test_a_read_only_method_on_a_crud_path_has_no_verb(self):
        """GET is never audited, but describe() should not invent a verb for
        one if it is ever called with it."""
        self.assertIsNone(describe("GET", f"{P}/poker/"))


class RelabelCommandTests(TestCase):
    """
    The rewrite of rows recorded before the labels existed. Untestable from
    the local database (it has no middleware rows yet), so the rows are built
    here in the shape the middleware writes them.
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            email="relabel@jackpotsworld.vip", password="pw-1234", name="Relabel")
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])

        self.raw = ActivityLog.objects.create(
            actor=self.admin, action="admin_create", actor_type="admin",
            description=f"POST {P}/live-chat/calls/41/accept/",
            endpoint=f"{P}/live-chat/calls/41/accept/", method="POST",
            status_code=200, meta={"source": "middleware"},
        )
        # A hand-written row: richer than any endpoint mapping, must survive.
        self.handwritten = ActivityLog.objects.create(
            actor=self.admin, action="wallet_credit", actor_type="admin",
            description="Wallet credited 500.00", amount=500,
            endpoint=f"{P}/users/3/add-wallet/", method="POST", meta={},
        )

    def _run(self, *args):
        out = StringIO()
        call_command("relabel_admin_audit", *args, stdout=out)
        return out.getvalue()

    def test_it_rewrites_a_raw_request_line_into_a_sentence(self):
        self._run()
        self.raw.refresh_from_db()
        self.assertEqual(self.raw.description, "Picked up a call")

    def test_the_original_request_line_is_kept_not_thrown_away(self):
        self._run()
        self.raw.refresh_from_db()
        self.assertEqual(self.raw.meta["request"],
                         f"POST {P}/live-chat/calls/41/accept/")

    def test_a_hand_written_description_is_left_alone(self):
        """Those rows carry amounts and balances; an endpoint mapping would
        be a downgrade."""
        self._run()
        self.handwritten.refresh_from_db()
        self.assertEqual(self.handwritten.description, "Wallet credited 500.00")

    def test_running_it_twice_changes_nothing_the_second_time(self):
        self._run()
        first = ActivityLog.objects.get(pk=self.raw.pk).description
        out = self._run()
        self.assertEqual(ActivityLog.objects.get(pk=self.raw.pk).description, first)
        self.assertIn("relabelled : 0", out)

    def test_dry_run_writes_nothing(self):
        self._run("--dry-run")
        self.raw.refresh_from_db()
        self.assertTrue(self.raw.description.startswith("POST "))

    def test_an_unrecognised_endpoint_keeps_its_raw_line(self):
        row = ActivityLog.objects.create(
            actor=self.admin, action="admin_create", actor_type="admin",
            description=f"POST {P}/invented-later/", endpoint=f"{P}/invented-later/",
            method="POST", meta={"source": "middleware"},
        )
        out = self._run()
        row.refresh_from_db()
        self.assertEqual(row.description, f"POST {P}/invented-later/")
        self.assertIn("unmatched  : 1", out)
