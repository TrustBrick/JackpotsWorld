#!/bin/bash
# One-time backfill of local MEDIA_ROOT into S3 (see authapp/management/
# commands/migrate_media_to_s3.py for what this actually copies and why).
# Guarded by a marker file in MEDIA_DIR (outside /var/app/current, so it
# survives this deploy and every future one) — runs at most once, then
# every subsequent deploy's postdeploy hook is a no-op here.
#
# Deliberately never fails the deploy itself: this app's site coming back
# up must never depend on a media backfill succeeding. If the migration
# command errors, the marker is NOT written, so the next deploy retries it
# automatically (the command is idempotent — already-copied files are
# skipped, not re-uploaded).
#
# --require-s3 is what makes that guarantee real. Without it the command
# exits 0 when AWS_STORAGE_BUCKET_NAME is unset, which is indistinguishable
# from "migrated successfully" — and that is exactly what happened on
# 2026-08-18: a deploy that ran before S3 was configured wrote the marker,
# so the real backfill was permanently skipped afterwards and the cutover
# went live against an empty bucket. With the flag, "S3 isn't configured
# yet" is an error, the marker stays unwritten, and the migration still
# happens on the first deploy after the bucket is actually set.
#
# MARKER is versioned for the same reason: bump the suffix whenever the
# migration's meaning changes, so a marker written by an older, broken
# revision can't suppress the corrected one.

MEDIA_DIR="/var/app/media"
MARKER="$MEDIA_DIR/.s3_migration_done_v2"
LOG="/var/log/s3_migration.log"

if [ -f "$MARKER" ]; then
    exit 0
fi

cd /var/app/current || exit 0

VENV_ACTIVATE=$(ls /var/app/venv/*/bin/activate 2>/dev/null | head -n 1)
if [ -z "$VENV_ACTIVATE" ]; then
    echo "$(date -u +%FT%TZ) — could not locate app venv, skipping media migration this deploy" >> "$LOG"
    exit 0
fi
# shellcheck disable=SC1090
source "$VENV_ACTIVATE"

{
    echo "$(date -u +%FT%TZ) — starting media migration to S3"
    if python manage.py migrate_media_to_s3 --require-s3; then
        touch "$MARKER"
        echo "$(date -u +%FT%TZ) — media migration completed"
    else
        echo "$(date -u +%FT%TZ) — media migration did not run (S3 unconfigured) or FAILED; will retry on next deploy"
    fi
} >> "$LOG" 2>&1

exit 0
