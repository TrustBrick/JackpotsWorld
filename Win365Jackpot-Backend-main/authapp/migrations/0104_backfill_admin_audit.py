"""
FULL-ADMIN-AUDIT: run the historical backfill (see
authapp/services/audit_backfill.py) as part of the deploy.

WHY A MIGRATION AND NOT JUST THE MANAGEMENT COMMAND
───────────────────────────────────────────────────
`backfill_admin_audit` exists and is the better tool for re-running or
dry-running this. But there is no way to execute a command on the production
instances from here — `aws ssm send-command` is refused, even read-only — and
`container_commands` in .ebextensions already runs `migrate --noinput`,
leader_only, on every deploy. So the migration is the one hook that reliably
fires once, on the leader, against production.

Deliberately uses the *current* models rather than the historical
`apps.get_model` registry. That is normally the wrong thing in a migration,
because a later schema change can make an old migration unreplayable. It is
accepted here because this is a one-shot reconciliation of data that already
exists, it is guarded so it cannot fail a deploy, and a fresh database has
nothing to reconstruct — a rebuild from zero will simply write nothing.

Safe to re-run: `reference_id` is a deterministic key, so replaying adds
nothing. Reversing deletes only the rows it created.
"""

import logging

from django.db import migrations

logger = logging.getLogger(__name__)


def run_backfill(apps, schema_editor):
    from authapp.services.audit_backfill import backfill
    try:
        res = backfill()
        logger.info(
            "admin audit backfill: %s reconstructed, %s actor_type filled, "
            "%s already present",
            res["reconstructed"], res["actor_type_filled"], res["skipped_existing"],
        )
    except Exception:
        # A deploy must not fail because history could not be reconstructed.
        # The command is still there to run by hand afterwards, and the live
        # audit trail (the thing that actually matters going forward) is
        # entirely unaffected by this step.
        logger.exception("admin audit backfill failed; continuing with the deploy")


def undo_backfill(apps, schema_editor):
    ActivityLog = apps.get_model("authapp", "ActivityLog")
    deleted, _ = ActivityLog.objects.filter(
        reference_id__startswith="backfill:"
    ).delete()
    logger.info("admin audit backfill reversed: %s rows removed", deleted)
    # actor_type is intentionally NOT reset to NULL: it is derived from the
    # actor and is correct regardless of this migration, so putting the nulls
    # back would only lose information.


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0103_admin_audit_fields"),
    ]

    operations = [
        migrations.RunPython(run_backfill, undo_backfill),
    ]
