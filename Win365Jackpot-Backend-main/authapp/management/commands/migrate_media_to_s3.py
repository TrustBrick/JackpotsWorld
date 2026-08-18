"""
authapp/management/commands/migrate_media_to_s3.py
────────────────────────────────────────────────────────────────────────────
One-time backfill: copies every file currently under local MEDIA_ROOT into
the S3 bucket, at the same relative path existing DB rows already store —
so switching STORAGES["default"] over to S3 (AWS_STORAGE_BUCKET_NAME, see
backend/settings.py) doesn't strand every media URL that predates the
switch. Never touches local disk — copy-only, nothing is deleted here.

Idempotent and safe to re-run: skips any file that already exists at its
destination key, so an interrupted run (or a second deploy before cutover)
just picks up where it left off rather than re-uploading everything.

No-ops cleanly if AWS_STORAGE_BUCKET_NAME isn't set — safe to ship and run
automatically (see .platform/hooks/postdeploy/02_migrate_media_to_s3.sh)
before S3 is actually the active storage backend.

kyc/ and support/attachments/ go through PrivateMediaStorage (S3 key
prefixed "private/"), matching KYCSubmission/SupportTicket's storage=
kwarg (authapp/storage_backends.get_private_storage) — everything else
through PublicMediaStorage, matching every other model's default storage.
Classification is by path prefix here rather than by querying each model,
which also catches any orphaned file no current DB row references (an
orphan is still worth preserving during a migration; cleanup is a separate,
deliberate step — see cleanup_orphaned_media.py).

    python manage.py migrate_media_to_s3 --dry-run   # list only
    python manage.py migrate_media_to_s3              # copies
"""
import os

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

PRIVATE_PREFIXES = ("kyc/", "support/attachments/")


class Command(BaseCommand):
    help = "One-time copy of local MEDIA_ROOT into the configured S3 bucket. Copy-only, idempotent, no-ops if S3 isn't configured."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        if not getattr(settings, "AWS_STORAGE_BUCKET_NAME", ""):
            self.stdout.write(self.style.NOTICE("AWS_STORAGE_BUCKET_NAME is not set — nothing to migrate to. Exiting."))
            return

        from authapp.storage_backends import PublicMediaStorage, PrivateMediaStorage
        public_storage = PublicMediaStorage()
        private_storage = PrivateMediaStorage()

        media_root = settings.MEDIA_ROOT
        if not os.path.isdir(media_root):
            self.stdout.write(self.style.NOTICE(f"MEDIA_ROOT ({media_root}) doesn't exist locally — nothing to migrate."))
            return

        dry_run = options["dry_run"]
        copied = skipped = failed = 0

        for root, _dirs, files in os.walk(media_root):
            for fname in files:
                abs_path = os.path.join(root, fname)
                rel_path = os.path.relpath(abs_path, media_root).replace(os.sep, "/")

                is_private = rel_path.startswith(PRIVATE_PREFIXES)
                storage = private_storage if is_private else public_storage

                try:
                    if storage.exists(rel_path):
                        skipped += 1
                        continue
                except Exception as exc:
                    failed += 1
                    self.stdout.write(self.style.ERROR(f"Could not check {rel_path}: {exc}"))
                    continue

                if dry_run:
                    self.stdout.write(f"  would copy: {rel_path} ({'private' if is_private else 'public'})")
                    copied += 1
                    continue

                try:
                    with open(abs_path, "rb") as fh:
                        storage.save(rel_path, File(fh))
                    copied += 1
                except Exception as exc:
                    failed += 1
                    self.stdout.write(self.style.ERROR(f"Failed to copy {rel_path}: {exc}"))

        verb = "Would copy" if dry_run else "Copied"
        self.stdout.write(self.style.SUCCESS(f"{verb} {copied}, skipped {skipped} (already present), {failed} failed."))
        if failed:
            self.stdout.write(self.style.WARNING("Some files failed — safe to re-run, already-copied files will be skipped."))
