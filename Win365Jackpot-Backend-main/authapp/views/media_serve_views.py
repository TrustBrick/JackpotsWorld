"""
authapp/views/media_serve_views.py
─────────────────────────────────────────────────────────────────────────────
Serves /media/... whenever storage is local disk — local dev, the
cPanel/Passenger deploy target, and any AWS EB deploy before
AWS_STORAGE_BUCKET_NAME is configured (see backend/settings.py, "AWS S3"
section). Once S3 is active, FieldFile.url points straight at S3 and this
view is never reached for that file.

Replaces django.views.static.serve, which backend/urls.py was previously
routing every /media/... request through. That view's own module docstring
says outright: "These are only to be used during development, and SHOULD
NOT be used in a production setting." Concretely, and confirmed by reading
that view's source (and django.http.FileResponse's) in this project's
installed Django version: it never inspects the incoming Range header and
never returns a 206 — every request, including one from a <video> element
seeking or resuming after a stall, gets the *entire* file back from byte 0
with a plain 200. A browser that asked for bytes 40000000-41000000 and gets
the whole file back starting at 0 does not treat that as "the same video,
just more of it" — it treats the stream as broken. That mismatch, not
anything in the frontend player code, is a direct, confirmed cause of video
playback stopping partway through or failing to resume.

Deliberately scoped to a single Range (bytes=start-end / bytes=start- /
bytes=-suffix_length): that covers what every real browser <video> element
actually sends. A request this can't satisfy falls back to a full 200
response rather than erroring — RFC 7233 explicitly allows ignoring a Range
header and answering the whole request, so an unusual client still gets a
correct (if less efficient) response instead of a broken one.
"""
import mimetypes
import os
import re

from django.http import FileResponse, Http404, HttpResponse, HttpResponseNotModified
from django.utils._os import safe_join
from django.utils.http import http_date, parse_http_date

_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


class _BoundedReader:
    """Wraps an open file so streaming stops at exactly `length` bytes from
    the current position. Deliberately exposes neither tell() nor seek() —
    FileResponse.set_headers() only auto-computes Content-Length from those,
    and a partial range must never be overwritten with the full file size."""

    def __init__(self, fileobj, length):
        self._f = fileobj
        self._remaining = length

    def read(self, chunk_size=None):
        if self._remaining <= 0:
            return b""
        read_size = self._remaining if chunk_size is None else min(chunk_size, self._remaining)
        data = self._f.read(read_size)
        self._remaining -= len(data)
        return data

    def close(self):
        self._f.close()


def _was_modified_since(header, mtime):
    try:
        if header is None:
            raise ValueError
        if int(mtime) > parse_http_date(header):
            raise ValueError
    except (ValueError, OverflowError):
        return True
    return False


def _parse_range(range_header, file_size):
    """Returns (start, end) inclusive, or None if absent/unsatisfiable."""
    match = _RANGE_RE.match(range_header) if range_header else None
    if not match:
        return None
    start_str, end_str = match.groups()
    try:
        if start_str:
            start = int(start_str)
            end = int(end_str) if end_str else file_size - 1
        elif end_str:
            # Suffix form ("bytes=-500"): the last N bytes of the file.
            start = max(file_size - int(end_str), 0)
            end = file_size - 1
        else:
            return None
    except ValueError:
        return None
    end = min(end, file_size - 1)
    if start < 0 or start > end or file_size == 0:
        return "unsatisfiable"
    return (start, end)


def serve_media(request, path, document_root=None):
    path = path.lstrip("/")
    fullpath = safe_join(document_root, path)
    if os.path.isdir(fullpath) or not os.path.exists(fullpath):
        raise Http404("Media file not found.")

    stat_result = os.stat(fullpath)
    file_size = stat_result.st_size

    if not _was_modified_since(request.META.get("HTTP_IF_MODIFIED_SINCE"), stat_result.st_mtime):
        return HttpResponseNotModified()

    content_type, encoding = mimetypes.guess_type(fullpath)
    content_type = content_type or "application/octet-stream"

    parsed_range = _parse_range(request.META.get("HTTP_RANGE", ""), file_size)

    if parsed_range == "unsatisfiable":
        response = HttpResponse(status=416)
        response["Content-Range"] = f"bytes */{file_size}"
        return response

    if parsed_range:
        start, end = parsed_range
        length = end - start + 1
        f = open(fullpath, "rb")
        f.seek(start)
        response = FileResponse(_BoundedReader(f, length), status=206, content_type=content_type)
        response["Content-Length"] = str(length)
        response["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    else:
        response = FileResponse(open(fullpath, "rb"), content_type=content_type)

    response["Accept-Ranges"] = "bytes"
    response["Last-Modified"] = http_date(stat_result.st_mtime)
    # Matches the S3 backend's AWS_S3_OBJECT_PARAMETERS (settings.py) so
    # caching behaviour doesn't change depending on which storage backend
    # happens to be active — see that setting's comment for why a day, not
    # "forever".
    response["Cache-Control"] = "max-age=86400"
    if encoding:
        response["Content-Encoding"] = encoding
    return response
