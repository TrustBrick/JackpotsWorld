#!/bin/bash
# ONE-SHOT REMEDIATION — safe to delete once it has run in production.
#
# Clears the database references left dangling by the 2026-08-17 instance
# replacement, which destroyed every file in the instance-local media
# directory while the rows naming them survived in RDS. Until they are
# cleared, the API keeps emitting URLs for files that exist nowhere, and
# every visitor keeps requesting something that can never be served.
#
# Exists as a deploy hook only because this environment has no other way in:
# SSM isn't registered on the instance and interactive `eb ssh` is
# unavailable, so a management command cannot be run by hand. Output goes to
# stdout, which Elastic Beanstalk captures into /var/log/eb-hooks.log and
# streams to CloudWatch — the one place it is actually readable.
#
# Guarded by a marker in MEDIA_DIR (outside /var/app/current, so it survives
# this deploy and every future one): runs at most once, then every later
# deploy no-ops here. Both running instances execute this against the same
# RDS database; the command is idempotent and transactional, so whichever
# runs second simply finds nothing left to clear.
#
# Ordering matters and is not incidental. clear_dangling_media refuses to
# run against non-S3 storage without --allow-local-storage, precisely
# because on a multi-instance environment a file sitting on the *other*
# instance looks missing and its reference would be wrongly cleared. That
# flag is deliberately NOT passed here: if this somehow runs before the S3
# cutover, the command errors, the marker stays unwritten, and it retries on
# the next deploy rather than destroying good references.
#
# Never fails the deploy — a media cleanup must never keep the site down.

MEDIA_DIR="/var/app/media"
MARKER="$MEDIA_DIR/.dangling_media_cleared_v1"
LOG_PREFIX="[clear-dangling-media]"

if [ -f "$MARKER" ]; then
    exit 0
fi

cd /var/app/current || exit 0

VENV_ACTIVATE=$(ls /var/app/venv/*/bin/activate 2>/dev/null | head -n 1)
if [ -z "$VENV_ACTIVATE" ]; then
    echo "$LOG_PREFIX could not locate app venv, skipping"
    exit 0
fi
# shellcheck disable=SC1090
source "$VENV_ACTIVATE"

mkdir -p "$MEDIA_DIR"

# pipefail is load-bearing: without it the `if` would test sed's exit status
# (effectively always 0) rather than the management command's, and the marker
# would be written even when the command refused to run or failed — the same
# false-success that let the S3 backfill mark itself done before S3 existed.
set -o pipefail

echo "$LOG_PREFIX starting $(date -u +%FT%TZ)"
if python manage.py clear_dangling_media --apply 2>&1 | sed "s/^/$LOG_PREFIX /"; then
    touch "$MARKER"
    echo "$LOG_PREFIX completed — marker written, will not run again"
else
    echo "$LOG_PREFIX did not run (storage guard) or FAILED; will retry on next deploy"
fi

exit 0
