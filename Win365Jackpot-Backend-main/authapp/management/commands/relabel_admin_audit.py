"""
authapp/management/commands/relabel_admin_audit.py
─────────────────────────────────────────────────────────────────────────────
Rewrite the description of already-recorded middleware rows into plain
language, using services/audit_labels.py.

Rows written before the labels existed read "POST
/api/admin-panel/live-chat/calls/41/accept/". The endpoint and method were
always stored, so the sentence can be produced from what is already there —
nothing is inferred that the row did not already contain.

ONLY TOUCHES ROWS IT WROTE ITSELF
─────────────────────────────────
Restricted to `meta.source = "middleware"`. The ~95 hand-written log calls
describe their own actions far better than any endpoint mapping could ("Wallet
credited 500.00 to player@x.com", with amounts and balances), and the
reconstructed backfill rows say "Reconstructed: ..." for a reason. Rewriting
either would replace good text with worse text.

The original request line is kept in `meta.request`, so nothing is lost and
the rewrite can be audited afterwards.

    python manage.py relabel_admin_audit --dry-run
    python manage.py relabel_admin_audit

Safe to re-run: a row already carrying meta.request is skipped.
"""

from django.core.management.base import BaseCommand

from authapp.models import ActivityLog
from authapp.services.audit_labels import describe

BATCH = 500


class Command(BaseCommand):
    help = "Rewrite middleware audit descriptions into plain language."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--limit", type=int, default=0,
                            help="Stop after this many rows (0 = no limit).")

    def handle(self, *args, **options):
        dry = options["dry_run"]
        limit = options["limit"]
        if dry:
            self.stdout.write(self.style.WARNING("DRY RUN — nothing will be written\n"))

        qs = (ActivityLog.objects
              .filter(meta__source="middleware", endpoint__isnull=False)
              .exclude(meta__has_key="request")
              .order_by("id"))

        changed, unmatched, samples = [], 0, []
        for row in qs.iterator(chunk_size=BATCH):
            phrase = describe(row.method, row.endpoint)
            if not phrase:
                unmatched += 1
                continue
            if row.status_code and row.status_code >= 400:
                phrase = f"{phrase} (failed: HTTP {row.status_code})"
            if len(samples) < 12:
                samples.append((row.description, phrase))
            row.meta = {**(row.meta or {}), "request": f"{row.method} {row.endpoint}"}
            row.description = phrase
            changed.append(row)
            if limit and len(changed) >= limit:
                break

        if samples:
            self.stdout.write("examples:")
            for before, after in samples:
                self.stdout.write(f"    {(before or '')[:52]:52s} ->  {after}")
            self.stdout.write("")

        if not dry and changed:
            for i in range(0, len(changed), BATCH):
                ActivityLog.objects.bulk_update(
                    changed[i:i + BATCH], ["description", "meta"], batch_size=BATCH)

        self.stdout.write(f"  relabelled : {len(changed)}")
        self.stdout.write(f"  unmatched  : {unmatched} (left as the raw request line)")
        self.stdout.write(
            self.style.WARNING("\nDry run — re-run without --dry-run to apply.")
            if dry else self.style.SUCCESS("\nDone.")
        )
