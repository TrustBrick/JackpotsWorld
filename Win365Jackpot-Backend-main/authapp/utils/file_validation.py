"""
authapp/utils/file_validation.py
─────────────────────────────────────────────────────────────────────────────
Shared validation for user-uploaded image files (avatar, KYC documents, etc.)
that are assigned directly from request.FILES rather than through a
serializer's ImageField (which would otherwise run this validation for free).
"""

from PIL import Image
from rest_framework import serializers

ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp",
}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB


def validate_uploaded_image(file_obj):
    """
    Raises serializers.ValidationError if the uploaded file is not an
    allowed image type/size. Returns the (rewound) file on success.
    """
    if not file_obj:
        return file_obj

    ext = file_obj.name.rsplit(".", 1)[-1].lower() if "." in file_obj.name else ""
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise serializers.ValidationError(
            f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}."
        )

    content_type = getattr(file_obj, "content_type", "") or ""
    if content_type and content_type.lower() not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise serializers.ValidationError("Unsupported file content type.")

    if file_obj.size > MAX_IMAGE_SIZE_BYTES:
        raise serializers.ValidationError(
            f"File too large. Max size is {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB."
        )

    try:
        file_obj.seek(0)
        Image.open(file_obj).verify()
    except Exception:
        raise serializers.ValidationError("File is not a valid image.")
    finally:
        file_obj.seek(0)

    return file_obj


ALLOWED_VIDEO_EXTENSIONS = {"mp4", "webm", "mov"}
ALLOWED_VIDEO_CONTENT_TYPES = {
    "video/mp4", "video/webm", "video/quicktime",
}
# Current production hero background video is ~37MB — this leaves headroom
# above it while still bounding the pathological case (an unedited 4K export)
# so an upload stays comfortably inside the deploy's ~60s request budget
# (see Procfile) instead of quietly crawling toward it.
MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024  # 50MB


def validate_uploaded_video(file_obj):
    """
    Raises serializers.ValidationError if the uploaded file is not an
    allowed video type/size. Returns the file on success.

    Unlike validate_uploaded_image, this cannot do a structural decode check
    — Pillow doesn't parse video containers and this app has no video
    processing dependency — so it only checks extension, content-type, and
    size. Shallower than the image validator by necessity, not oversight.
    """
    if not file_obj:
        return file_obj

    ext = file_obj.name.rsplit(".", 1)[-1].lower() if "." in file_obj.name else ""
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise serializers.ValidationError(
            f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}."
        )

    # Browsers routinely report a video's content-type as the generic
    # "application/octet-stream" fallback rather than a specific video/*
    # value, especially for files that arrived via a third-party download
    # tool with stripped/unusual metadata — confirmed live: a real .mp4
    # selected through a native file picker was rejected here even though
    # the extension and the file itself were perfectly valid. Extension is
    # already the primary, reliable gate for video (there is no structural
    # decode check possible — see this function's own docstring above), so
    # a generic/unrecognized content-type is treated the same as a missing
    # one and accepted; only a content-type that specifically names a
    # *different* format (e.g. "image/png") is still rejected.
    content_type = (getattr(file_obj, "content_type", "") or "").lower()
    if content_type and content_type != "application/octet-stream" and content_type not in ALLOWED_VIDEO_CONTENT_TYPES:
        raise serializers.ValidationError("Unsupported file content type.")

    if file_obj.size > MAX_VIDEO_SIZE_BYTES:
        raise serializers.ValidationError(
            f"File too large. Max size is {MAX_VIDEO_SIZE_BYTES // (1024 * 1024)}MB."
        )

    return file_obj
