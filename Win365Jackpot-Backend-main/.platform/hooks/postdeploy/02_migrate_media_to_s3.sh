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
# No-ops immediately if AWS_STORAGE_BUCKET_NAME isn't set yet (the command
# checks this itself) — safe to ship and deploy before S3 is configured at
# all, which is exactly the intended rollout order: deploy this code first,
# let this hook backfill existing media into S3 while the app is still
# serving everything from local disk, confirm the backfill succeeded, and
# only then flip AWS_STORAGE_BUCKET_NAME to actually cut traffic over.

MEDIA_DIR="/var/app/media"
MARKER="$MEDIA_DIR/.s3_migration_done"
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
    if python manage.py migrate_media_to_s3; then
        touch "$MARKER"
        echo "$(date -u +%FT%TZ) — media migration completed"
    else
        echo "$(date -u +%FT%TZ) — media migration FAILED, will retry on next deploy"
    fi
} >> "$LOG" 2>&1

exit 0
