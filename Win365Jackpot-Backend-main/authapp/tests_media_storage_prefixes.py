"""Every file PublicMediaStorage writes must land where browsers can read it.

PublicMediaStorage returns plain unsigned S3 URLs, and the bucket policy grants
anonymous GetObject on a fixed list of prefixes only
(storage_backends.PUBLIC_MEDIA_PREFIXES, applied from
deploy/s3/media-bucket-policy.json). A field on default storage that uploads
anywhere else fails silently in production: the upload succeeds, the API
returns a URL, and every browser gets a 403. Local runs cannot show it —
FileSystemStorage serves every path — so this is where it has to be caught.
"""
import json
from pathlib import Path

from django.apps import apps
from django.db.models import FileField
from django.test import SimpleTestCase

from authapp.models.call_models import VoiceCallSettings
from authapp.storage_backends import PUBLIC_MEDIA_PREFIXES

# What actually gets applied to the bucket — see docs/MEDIA_ARCHITECTURE.md.
POLICY_FILE = Path(__file__).resolve().parent.parent / "deploy" / "s3" / "media-bucket-policy.json"


def _public_file_fields():
    """(label, upload_to) for every FileField/ImageField on default storage.

    A field that names its own storage (get_private_storage,
    get_call_recording_storage) is private by design and skipped: those files
    live under `private/` and are served presigned or through a view.
    deconstruct() is how Django itself tells the two apart for migrations —
    `storage` is only in its kwargs when it is not default_storage.
    """
    for model in apps.get_models():
        for field in model._meta.get_fields():
            if not isinstance(field, FileField):
                continue
            if "storage" in field.deconstruct()[3]:
                continue
            yield f"{model._meta.label}.{field.name}", field.upload_to


class PublicMediaPrefixTests(SimpleTestCase):
    def test_every_public_upload_lands_under_a_publicly_readable_prefix(self):
        uncovered = [
            f"{label} -> {upload_to!r}"
            for label, upload_to in _public_file_fields()
            # A callable upload_to cannot be checked statically, so it has to
            # be decided on purpose rather than waved through.
            if callable(upload_to) or not str(upload_to).startswith(PUBLIC_MEDIA_PREFIXES)
        ]
        self.assertEqual(
            uncovered, [],
            "These fields upload to S3 prefixes browsers cannot read, so their "
            "files would 403 in production. Add the prefix to "
            "authapp.storage_backends.PUBLIC_MEDIA_PREFIXES and to "
            "deploy/s3/media-bucket-policy.json, then apply it to the bucket "
            "(docs/MEDIA_ARCHITECTURE.md) — or give the field private storage "
            "if it should not be public:\n  " + "\n  ".join(uncovered),
        )

    def test_the_bucket_policy_file_grants_exactly_these_prefixes(self):
        # That file is what gets applied to the bucket, so it has to say what
        # the tuple says: a prefix missing from it 403s in every browser, and
        # an extra one publishes files nobody decided to publish.
        policy = json.loads(POLICY_FILE.read_text(encoding="utf-8"))
        granted = []
        for statement in policy["Statement"]:
            self.assertEqual(statement["Action"], "s3:GetObject", statement)
            resources = statement["Resource"]
            for arn in [resources] if isinstance(resources, str) else resources:
                # arn:aws:s3:::<bucket>/<prefix>*  ->  <prefix>
                granted.append(arn.split(":::", 1)[1].split("/", 1)[1].removesuffix("*"))
        self.assertEqual(sorted(granted), sorted(PUBLIC_MEDIA_PREFIXES))

    def test_hold_audio_is_readable_by_the_held_callers_browser(self):
        # The customer's engine plays it with a bare <audio src>: no token, no
        # cookie. A 403 there sends every held caller to the fallback beep.
        upload_to = VoiceCallSettings._meta.get_field("hold_audio").upload_to
        self.assertTrue(upload_to.startswith(PUBLIC_MEDIA_PREFIXES), upload_to)

    def test_no_public_prefix_reaches_private_files(self):
        # The other direction: a broad or sloppy entry ("", "p", "private/")
        # would publish KYC documents and call recordings.
        for prefix in PUBLIC_MEDIA_PREFIXES:
            self.assertTrue(prefix.endswith("/"), prefix)
            self.assertFalse("private/".startswith(prefix), prefix)
            self.assertFalse(prefix.startswith("private"), prefix)
