"""
authapp/management/commands/audit_media_files.py
────────────────────────────────────────────────────────────────────────────
Read-only. Finds every FileField/ImageField value in the database whose
underlying file is no longer present in storage — "dangling" references,
where the row still names a file that isn't there any more.

Written after production's EC2 instance was replaced (2026-08-17) and took
the entire local-disk media directory with it: the database rows survived
(RDS is separate) but every file they pointed at was gone, so the site
served URLs that 404'd. The public API could be swept from outside to find
those, but auth-gated media — user avatars, KYC documents, support
attachments, wheel reward images — is invisible from there. This closes
that gap by asking the database directly.

Checks through each field's own `storage`, not the filesystem, so it is
correct under either backend: local FileSystemStorage today, and S3
(PublicMediaStorage/PrivateMediaStorage — see authapp/storage_backends.py)
once AWS_STORAGE_BUCKET_NAME is configured. Note that against S3 this costs
one HeadObject call per file reference.

    python manage.py audit_media_files              # missing only
    python manage.py audit_media_files --verbose    # also list files that are fine
    python manage.py audit_media_files --json       # machine-readable
    python manage.py audit_media_files --fail-on-missing   # exit 1 if any are missing

Always exits 0 unless --fail-on-missing is passed, so it is safe to call
from a deploy hook without ever breaking a deployment.

Reads nothing but the columns it needs and writes nothing at all — it will
not delete a file, clear a reference, or modify a row.
"""
import json as json_lib

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import FileField

# Models whose rows identify a specific person. Reported by primary key
# only — never with an email or name attached — because this command's
# output is meant to be safe to send to a deploy log (on Elastic Beanstalk
# it lands in CloudWatch, which is far more widely readable than the
# database itself). A pk is all an admin needs to find the row in the Back
# Office anyway.
SENSITIVE_MODELS = {"User", "KYCSubmission", "SupportTicket"}

# First match wins; used only to make output human-readable.
LABEL_FIELD_CANDIDATES = ("name", "title", "label", "casino_name")


def _label_field_for(model):
    if model.__name__ in SENSITIVE_MODELS:
        return None
    field_names = {f.name for f in model._meta.get_fields() if hasattr(f, "attname")}
    for candidate in LABEL_FIELD_CANDIDATES:
        if candidate in field_names:
            return candidate
    return None


class Command(BaseCommand):
    help = (
        "Read-only. Reports database rows whose FileField/ImageField points at a "
        "file missing from storage. Works against local disk or S3."
    )

    def add_arguments(self, parser):
        parser.add_argument("--verbose", action="store_true", help="Also list references that resolve fine.")
        parser.add_argument("--json", action="store_true", help="Emit JSON instead of a human-readable report.")
        parser.add_argument(
            "--fail-on-missing", action="store_true",
            help="Exit 1 when dangling references exist. Off by default so deploy hooks stay safe.",
        )

    def _backend_name(self):
        """The configured default-media backend. Read from settings rather
        than type()-ing a field's storage, because that returns Django's lazy
        `DefaultStorage` wrapper — which would keep printing "DefaultStorage"
        even after the S3 cutover, exactly when knowing the real backend
        matters most."""
        return settings.STORAGES["default"]["BACKEND"]

    def handle(self, *args, **options):
        as_json = options["json"]
        missing, present = [], []
        field_count = model_count = 0

        for model in apps.get_models():
            file_fields = [f for f in model._meta.get_fields() if isinstance(f, FileField)]
            if not file_fields:
                continue
            model_count += 1
            label_field = _label_field_for(model)

            for field in file_fields:
                field_count += 1
                # _base_manager, not _default_manager: a model whose default
                # manager filters (e.g. to active rows) would otherwise hide
                # dangling references on the rows it excludes.
                qs = model._base_manager.exclude(**{field.name: ""}).exclude(**{f"{field.name}__isnull": True})

                columns = ["pk", field.name] + ([label_field] if label_field else [])
                for row in qs.values_list(*columns).iterator():
                    pk, file_name = row[0], row[1]
                    label = row[2] if label_field else None
                    if not file_name:
                        continue

                    try:
                        exists = field.storage.exists(file_name)
                        error = None
                    except Exception as exc:  # storage unreachable, bad key, permissions…
                        exists, error = False, f"{type(exc).__name__}: {exc}"

                    entry = {
                        "app": model._meta.app_label,
                        "model": model.__name__,
                        "pk": pk,
                        "field": field.name,
                        "file": file_name,
                        "label": label,
                    }
                    if error:
                        entry["error"] = error
                    (present if exists else missing).append(entry)

        if as_json:
            self.stdout.write(json_lib.dumps({
                "storage_backend": self._backend_name(),
                "models_scanned": model_count,
                "file_fields_scanned": field_count,
                "total_references": len(missing) + len(present),
                "missing_count": len(missing),
                "missing": missing,
                "present": present if options["verbose"] else [],
            }, indent=2, default=str))
            if missing and options["fail_on_missing"]:
                raise SystemExit(1)
            return

        backend = self._backend_name()
        total = len(missing) + len(present)
        self.stdout.write("")
        self.stdout.write(f"MEDIA AUDIT — storage backend: {backend}")
        self.stdout.write(
            f"Scanned {field_count} file field(s) across {model_count} model(s); "
            f"{total} file reference(s) in the database."
        )

        if not total:
            self.stdout.write(self.style.SUCCESS("No file references at all — nothing to check."))
            return

        if missing:
            self.stdout.write("")
            self.stdout.write(self.style.ERROR(f"MISSING — {len(missing)} reference(s) point at a file that is not in storage:"))
            for e in missing:
                who = f" {e['label']!r}" if e.get("label") else ""
                self.stdout.write(f"  {e['app']}.{e['model']} pk={e['pk']}{who} .{e['field']}")
                self.stdout.write(f"      {e['file']}")
                if e.get("error"):
                    self.stdout.write(self.style.WARNING(f"      (storage check failed: {e['error']})"))
        else:
            self.stdout.write(self.style.SUCCESS("\nNo dangling references — every referenced file is present."))

        if options["verbose"] and present:
            self.stdout.write("")
            self.stdout.write(f"PRESENT — {len(present)} reference(s) resolve correctly:")
            for e in present:
                who = f" {e['label']!r}" if e.get("label") else ""
                self.stdout.write(f"  {e['app']}.{e['model']} pk={e['pk']}{who} .{e['field']} -> {e['file']}")

        self.stdout.write("")
        summary = f"SUMMARY: {len(missing)} missing, {len(present)} present, {total} total."
        self.stdout.write(self.style.ERROR(summary) if missing else self.style.SUCCESS(summary))

        if missing and options["fail_on_missing"]:
            raise SystemExit(1)
