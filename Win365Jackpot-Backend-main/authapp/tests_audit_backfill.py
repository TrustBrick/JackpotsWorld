"""
authapp/tests_audit_backfill.py
─────────────────────────────────────────────────────────────────────────────
The historical backfill (services/audit_backfill.py).

Three properties carry the weight here, and each one is a way the feature
could look like it worked while being useless or actively misleading:

  * **The real timestamp survives.** If the reconstructed rows all landed at
    "now", the trail would say every historical action happened during the
    deploy — wrong in the column the table is most often sorted by, and not
    obviously wrong from a glance.
  * **Re-running changes nothing.** The migration and the command both call
    this, so it will be run more than once. Duplicate audit rows would inflate
    the record of what someone did.
  * **Reconstructed rows stay distinguishable from observed ones.** A derived
    row presented as a witnessed one corrupts the thing the table exists for.
"""

import datetime

from django.test import TestCase
from django.utils import timezone

from authapp.models import ActivityLog, User
from authapp.models.faq_models import FAQ
from authapp.services.audit_backfill import backfill


class AuditBackfillTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="backfill-admin@jackpotsworld.vip", password="pw-1234", name="BF Admin",
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])

        self.player = User.objects.create_user(
            email="backfill-player@jackpotsworld.vip", password="pw-1234", name="BF Player",
        )

        self.then = timezone.make_aware(datetime.datetime(2026, 4, 1, 9, 30, 0))
        faq = FAQ.objects.create(category="landing", question="Historic?",
                                 answer="Yes.", updated_by=self.admin)
        # auto_now on updated_at, so the historical value has to be forced.
        FAQ.objects.filter(pk=faq.pk).update(updated_at=self.then)
        self.faq = faq

        ActivityLog.objects.all().delete()

    # ── the three load-bearing properties ────────────────────────────────────

    def test_the_original_timestamp_is_kept_not_the_backfill_time(self):
        backfill()
        row = ActivityLog.objects.get(reference_id__startswith="backfill:authapp_faq:")
        self.assertEqual(row.created_at, self.then)
        self.assertNotEqual(row.created_at.date(), timezone.now().date())

    def test_running_it_twice_adds_nothing(self):
        first = backfill()
        before = ActivityLog.objects.count()
        second = backfill()

        self.assertEqual(ActivityLog.objects.count(), before)
        self.assertEqual(second["reconstructed"], 0)
        self.assertGreaterEqual(second["skipped_existing"], first["reconstructed"])

    def test_a_reconstructed_row_says_that_it_is_reconstructed(self):
        backfill()
        row = ActivityLog.objects.get(reference_id__startswith="backfill:authapp_faq:")

        self.assertEqual(row.meta["source"], "backfill")
        self.assertTrue(row.description.startswith("Reconstructed"))
        self.assertIn("updated_by", row.meta["basis"])
        # Observed-only reads must be able to exclude these.
        self.assertFalse(
            ActivityLog.objects.exclude(meta__source="backfill")
            .filter(pk=row.pk).exists()
        )

    # ── attribution and honesty about what is not known ──────────────────────

    def test_it_does_not_invent_a_request_it_never_saw(self):
        """endpoint/method/status were never captured for historical actions,
        so they stay NULL rather than being guessed at."""
        backfill()
        row = ActivityLog.objects.get(reference_id__startswith="backfill:authapp_faq:")
        self.assertIsNone(row.endpoint)
        self.assertIsNone(row.method)
        self.assertIsNone(row.status_code)

    def test_it_attributes_to_the_right_admin(self):
        backfill()
        row = ActivityLog.objects.get(reference_id__startswith="backfill:authapp_faq:")
        self.assertEqual(row.actor, self.admin)
        self.assertEqual(row.actor_type, "admin")
        self.assertEqual(row.action, "admin_update")

    def test_a_record_touched_by_a_player_is_not_reported_as_admin_activity(self):
        FAQ.objects.create(category="landing", question="By a player?",
                           answer="x", updated_by=self.player)
        backfill()
        self.assertFalse(
            ActivityLog.objects.filter(actor=self.player).exists(),
            "a non-staff actor was written into the admin trail",
        )

    def test_actor_type_is_filled_in_on_rows_that_predate_the_column(self):
        """The ~95 hand-written log calls recorded the actor but never said
        whether they were staff; that is derivable, so it gets filled in."""
        old_admin = ActivityLog.objects.create(action="wallet_credit", actor=self.admin)
        old_player = ActivityLog.objects.create(action="login", actor=self.player)
        ActivityLog.objects.filter(pk__in=[old_admin.pk, old_player.pk]).update(
            actor_type=None)

        backfill()

        old_admin.refresh_from_db()
        old_player.refresh_from_db()
        self.assertEqual(old_admin.actor_type, "admin")
        self.assertEqual(old_player.actor_type, "user")

    def test_dry_run_writes_nothing_but_reports_the_same_count(self):
        dry = backfill(dry_run=True)
        self.assertEqual(ActivityLog.objects.count(), 0)

        real = backfill()
        self.assertEqual(real["reconstructed"], dry["reconstructed"])
        self.assertEqual(ActivityLog.objects.count(), real["reconstructed"])
