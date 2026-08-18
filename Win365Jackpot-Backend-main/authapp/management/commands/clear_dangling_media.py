"""
authapp/management/commands/clear_dangling_media.py
────────────────────────────────────────────────────────────────────────────
Clears database references to media files that no longer exist in storage,
so the API stops emitting URLs that 404. The companion write-side to
audit_media_files.py, which finds the same rows read-only.

Needed because a dangling reference is not self-healing: the row keeps
naming a file that is gone, every serializer keeps building an absolute URL
for it, and every visitor keeps requesting something that cannot be served.
Clearing the reference lets each section fall back to whatever it already
does for "no media configured" — which every consumer of these fields
already handles, since these are all null=True/blank=True columns.

Dry-run by default. Nothing is written without --apply.

    python manage.py clear_dangling_media                 # report only
    python manage.py clear_dangling_media --apply         # actually clear
    python manage.py clear_dangling_media --apply --only landing/foo.jpg

⚠ MULTI-INSTANCE HAZARD — read before running against local-disk storage.
`storage.exists()` answers for the storage the *running process* can see.
Under FileSystemStorage on a load-balanced environment with more than one
instance, each instance has its own media directory: a file uploaded through
instance A is genuinely absent on instance B, and running this there would
clear a reference whose file is perfectly fine. That is unrecoverable — the
file stays on the other instance but nothing points at it any more.

So this refuses to run against a non-S3 default backend unless
--allow-local-storage is passed explicitly. Under S3 there is exactly one
shared source of truth and the check is trustworthy, which is why the
correct order is: migrate to S3 → verify → cut over → only then run this.

Never deletes a file. It only ever sets a reference to "", and only for
references whose file is already missing.
"""
from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import FileField

S3_BACKEND_MARKER = "storage_backends"


class Command(BaseCommand):
    help = (
        "Clears DB references to media files missing from storage so the API stops "
        "serving URLs that 404. Dry-run unless --apply."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Actually write. Without this, reports only.")
        parser.add_argument(
            "--only", action="append", default=[], metavar="KEY",
            help="Restrict to these exact stored file names. Repeatable. Safest option.",
        )
        parser.add_argument(
            "--allow-local-storage", action="store_true",
            help="Permit running against non-S3 storage. See the multi-instance hazard in this module's docstring.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        only = set(options["only"])
        backend = settings.STORAGES["default"]["BACKEND"]
        is_s3 = S3_BACKEND_MARKER in backend

        if not is_s3 and not options["allow_local_storage"]:
            raise CommandError(
                f"Default storage is {backend}, not S3. On a multi-instance environment a file "
                f"present on another instance would look missing here and its reference would be "
                f"wrongly cleared. Re-run after the S3 cutover, or pass --allow-local-storage if "
                f"you are certain this process sees the authoritative media directory."
            )

        self.stdout.write(f"Default storage backend: {backend}")
        if only:
            self.stdout.write(f"Restricted to {len(only)} explicit key(s).")

        dangling = []
        for model in apps.get_models():
            file_fields = [f for f in model._meta.get_fields() if isinstance(f, FileField)]
            if not file_fields:
                continue
            for field in file_fields:
                # _base_manager so a model whose default manager filters rows
                # can't hide dangling references on the rows it excludes.
                qs = (model._base_manager
                      .exclude(**{field.name: ""})
                      .exclude(**{f"{field.name}__isnull": True}))
                for pk, file_name in qs.values_list("pk", field.name).iterator():
                    if not file_name:
                        continue
                    if only and file_name not in only:
                        continue
                    try:
                        if field.storage.exists(file_name):
                            continue
                    except Exception as exc:
                        # An unreachable backend must never be read as "the file
                        # is gone" — that would clear every reference at once.
                        self.stdout.write(self.style.ERROR(
                            f"  storage error on {model.__name__}.{field.name} pk={pk}: "
                            f"{type(exc).__name__}: {exc} — skipping"
                        ))
                        continue
                    dangling.append((model, field.name, pk, file_name))

        if not dangling:
            self.stdout.write(self.style.SUCCESS("No dangling media references found."))
            return

        self.stdout.write(f"\n{len(dangling)} dangling reference(s):")
        for model, field_name, pk, file_name in dangling:
            self.stdout.write(f"  {model._meta.app_label}.{model.__name__}.{field_name} pk={pk} -> {file_name}")

        if not apply_changes:
            self.stdout.write(self.style.WARNING("\nDry run — nothing written. Re-run with --apply to clear these."))
            return

        cleared = 0
        with transaction.atomic():
            for model, field_name, pk, _file_name in dangling:
                # update() rather than save(): it touches exactly this column,
                # skips auto_now/save() side effects, and cannot trip a
                # validator on some unrelated field of a legacy row.
                cleared += model._base_manager.filter(pk=pk).update(**{field_name: ""})

        self.stdout.write(self.style.SUCCESS(f"\nCleared {cleared} dangling reference(s)."))
        self.stdout.write("Re-upload the originals through the Back Office to restore them.")
