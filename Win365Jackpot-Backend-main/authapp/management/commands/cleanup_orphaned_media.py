"""
authapp/management/commands/cleanup_orphaned_media.py
────────────────────────────────────────────────────────────────────────────
DESTRUCTIVE (deletes files from disk/storage). Sweeps the KYC-document and
avatar upload directories and deletes any file that no current DB row
points to.

Needed as a one-off because reset_platform_data (before this fix) deleted
KYCSubmission/User rows without deleting the files those rows pointed to
— the files were left behind on disk with nothing left in the database
referencing them. Re-running the (now-fixed) reset_platform_data won't
catch these, since the rows that used to point to them are already gone.
Safe to run any time afterward too, as a general orphan sweep.

    python manage.py cleanup_orphaned_media --dry-run   # list only
    python manage.py cleanup_orphaned_media              # prompts for confirmation
    python manage.py cleanup_orphaned_media --yes         # skips the prompt

Only scans MEDIA_ROOT/avatars and MEDIA_ROOT/kyc — every other media
subdirectory (events/, poker/, landing/, promotions/, spin/) holds
admin-managed site content, not user uploads, and is left untouched.
"""

import os

from django.conf import settings
from django.core.management.base import BaseCommand

from authapp.models import User, KYCSubmission

SCAN_DIRS = ["avatars", "kyc"]


def _referenced_paths():
    """Every file path (relative to MEDIA_ROOT) currently referenced by a DB row."""
    referenced = set()

    for f in User.objects.exclude(avatar="").values_list("avatar", flat=True):
        if f:
            referenced.add(f)

    for kyc in KYCSubmission.objects.all():
        for field_name in ("doc_front", "doc_back", "selfie", "id_proof_file"):
            f = getattr(kyc, field_name)
            if f:
                referenced.add(f.name)

    return referenced


class Command(BaseCommand):
    help = (
        "DESTRUCTIVE. Deletes files under media/avatars and media/kyc that "
        "no current KYCSubmission/User row references. Always run with "
        "--dry-run first."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--yes", action="store_true")

    def handle(self, *args, **options):
        referenced = _referenced_paths()
        media_root = settings.MEDIA_ROOT

        orphans = []
        for scan_dir in SCAN_DIRS:
            base = os.path.join(media_root, scan_dir)
            if not os.path.isdir(base):
                continue
            for root, _dirs, files in os.walk(base):
                for fname in files:
                    abs_path = os.path.join(root, fname)
                    rel_path = os.path.relpath(abs_path, media_root).replace(os.sep, "/")
                    if rel_path not in referenced:
                        orphans.append(abs_path)

        if not orphans:
            self.stdout.write(self.style.SUCCESS("No orphaned files found."))
            return

        self.stdout.write(self.style.WARNING(f"{len(orphans)} orphaned file(s) found:"))
        for path in orphans:
            self.stdout.write(f"  - {path}")

        if options["dry_run"]:
            self.stdout.write(self.style.NOTICE("\nDry run — no files deleted."))
            return

        if not options["yes"]:
            confirm = input("\nType DELETE to permanently remove these files: ")
            if confirm != "DELETE":
                self.stdout.write(self.style.NOTICE("Aborted — no files deleted."))
                return

        removed = 0
        for path in orphans:
            try:
                os.remove(path)
                removed += 1
            except OSError as exc:
                self.stdout.write(self.style.ERROR(f"Failed to delete {path}: {exc}"))

        self.stdout.write(self.style.SUCCESS(f"Deleted {removed} orphaned file(s)."))
