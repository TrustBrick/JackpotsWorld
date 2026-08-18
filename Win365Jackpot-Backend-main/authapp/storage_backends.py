"""
authapp/storage_backends.py
─────────────────────────────────────────────────────────────────────────────
S3 storage backends, only ever instantiated when S3 is actually configured
(AWS_STORAGE_BUCKET_NAME set — see backend/settings.py's "Media storage"
section). Local dev and any environment that doesn't set that variable never
imports S3Boto3Storage's machinery at request time, only at class-definition
time here, which is harmless with no bucket configured.

Two backends, not one, because this app stores two very different kinds of
file under the same MEDIA_ROOT today:

  PublicMediaStorage  — hero videos, partner logos, promo banners, event/
    Teen Patti/Poker images, reward icons, etc. Already served with zero
    authentication under the current FileSystemStorage setup (rendered on
    unauthenticated public pages), so a stable, non-expiring, publicly
    readable URL is not a new exposure — it matches current behaviour
    exactly. Non-expiring is also load-bearing: an expiring/presigned URL
    embedded in a long-lived page (or a <video> mid-playback) would go dead
    on a timer, which is exactly the "URL expiration" failure mode called
    out as a video-cutoff suspect.

  PrivateMediaStorage — KYCSubmission's doc_front/doc_back/selfie/
    id_proof_file and SupportTicket.attachment. These are government ID
    photos, biometric selfies, and users' private support submissions —
    never intended to be publicly fetchable. Every current caller already
    accesses these exclusively through FieldFile.url (see
    authapp/views/user_kyc_views.py, admin_kyc_views.py), so switching this
    one field's storage to a private, presigned-URL backend is a complete,
    call-site-transparent fix: no view code changes, and the URL a client
    receives now expires (default 1 hour) instead of being a permanent
    public link.
"""
from django.conf import settings
from django.core.files.storage import default_storage

try:
    from storages.backends.s3boto3 import S3Boto3Storage
except ImportError:  # django-storages not installed — only reachable if
    S3Boto3Storage = None  # something tries to use S3 without the package.


def _s3_configured():
    return bool(getattr(settings, "AWS_STORAGE_BUCKET_NAME", ""))


if S3Boto3Storage is not None:

    class PublicMediaStorage(S3Boto3Storage):
        default_acl = None
        querystring_auth = False
        file_overwrite = False

    class PrivateMediaStorage(S3Boto3Storage):
        location = "private"
        default_acl = None
        querystring_auth = True
        querystring_expire = 3600
        file_overwrite = False
        custom_domain = False


def get_private_storage():
    """Storage for a FileField/ImageField that must never be publicly
    readable. Passed as `storage=` on the field itself; Django calls it once
    at class-definition time (see FileField.__init__) and requires a real
    Storage instance back — returning None is invalid, so the "S3 not
    configured" branch explicitly falls back to `default_storage`, i.e.
    whatever STORAGES["default"] resolves to (FileSystemStorage in local
    dev) — the exact same field, same upload_to, same validation, just not
    S3-backed and not yet on a dedicated private backend, because there's no
    public/private storage distinction to make until S3 is configured at all.
    """
    if _s3_configured() and S3Boto3Storage is not None:
        return PrivateMediaStorage()
    return default_storage
