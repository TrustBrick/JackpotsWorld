"""
authapp/management/commands/backfill_admin_audit.py
─────────────────────────────────────────────────────────────────────────────
Fill in the admin audit trail for the period before middleware/admin_audit.py
existed.

WHY THERE IS NO BETTER SOURCE THAN THE DATABASE ITSELF
──────────────────────────────────────────────────────
Each candidate for "what did the admins do last month" was checked and ruled
out, the same way backfill_email_logs.py ruled out its alternatives:

  * **nginx / gunicorn access logs** would have method, path, status and time
    — but not *who*. The JWT travels in the Authorization header, which is not
    logged, so a request cannot be attributed to a person. They are also
    instance-local, and EB replaces instances on every deploy.
  * **CloudWatch** — the app log group has 7-day retention (see
    backfill_email_logs.py, which hit the same wall).
  * **ActivityLog itself** already holds the ~95 endpoints that logged by
    hand. Those rows are kept as they are; only the `actor_type` column,
    which did not exist when they were written, is derived and filled in.
  * **RDS binlogs / PITR snapshots** could in principle show row changes, but
    they carry the database user (one shared application account), not the
    admin who caused the change, so they cannot attribute either.

What *is* attributable is the `created_by` / `updated_by` / `reviewed_by` /
`approved_by` / `initiated_by` columns already carried by ~20 models. Each is
a statement that a named person did a named thing at a known time. That is an
audit record; it was simply never queryable from one place.

WHAT THIS DOES NOT RECOVER
──────────────────────────
Deletions, above all: a deleted row took its `created_by` with it, and nothing
remembers. Also every edit but the most recent, anything on a model with no
`*_by` column, and the endpoint/method/status of any of it. The result is a
floor, not a complete account.

Every row written is marked `meta.source = "backfill"` and described as
"Reconstructed", so a derived row is never mistaken for a witnessed one.

USAGE
─────
    python manage.py backfill_admin_audit --dry-run    # counts only
    python manage.py backfill_admin_audit              # write

Safe to re-run: `reference_id` is a deterministic key, so a second run adds
nothing.
"""

from django.core.management.base import BaseCommand

from authapp.services.audit_backfill import backfill


class Command(BaseCommand):
    help = "Reconstruct pre-middleware admin activity into authapp_activitylog."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be written without writing it.",
        )

    def handle(self, *args, **options):
        dry = options["dry_run"]
        if dry:
            self.stdout.write(self.style.WARNING("DRY RUN — nothing will be written\n"))

        res = backfill(dry_run=dry, stdout=self.stdout)

        self.stdout.write("")
        self.stdout.write("per source:")
        for key, n in sorted(res["per_model"].items(), key=lambda kv: -kv[1]):
            self.stdout.write(f"    {key:48s} {n:6d}")

        self.stdout.write("")
        self.stdout.write(f"  actor_type filled : {res['actor_type_filled']}")
        self.stdout.write(f"  reconstructed     : {res['reconstructed']}")
        self.stdout.write(f"  already present   : {res['skipped_existing']}")

        if dry:
            self.stdout.write(self.style.WARNING(
                "\nDry run — re-run without --dry-run to apply."))
        else:
            self.stdout.write(self.style.SUCCESS("\nDone."))
