#!/bin/bash
# Runs the media audit (authapp/management/commands/audit_media_files.py) on
# every deploy and prints the result to stdout, which Elastic Beanstalk
# captures into /var/log/eb-hooks.log and streams to CloudWatch. That log is
# the only practical way to see this output: SSM isn't registered on the
# instance and interactive SSH isn't available, so a report that only ever
# landed on local disk would be unreadable.
#
# Read-only and deliberately never fails the deploy — no --fail-on-missing,
# and an unconditional exit 0. A dangling media reference is something to
# know about, not a reason to block a release.
#
# Cheap by design: it is one storage existence check per file reference, and
# this database holds single digits of them. If that ever grows into the
# thousands (each one an S3 HeadObject call once S3 is live), move this to a
# scheduled job instead of running it per deploy.

LOG_PREFIX="[media-audit]"

cd /var/app/current || exit 0

VENV_ACTIVATE=$(ls /var/app/venv/*/bin/activate 2>/dev/null | head -n 1)
if [ -z "$VENV_ACTIVATE" ]; then
    echo "$LOG_PREFIX could not locate app venv, skipping audit"
    exit 0
fi
# shellcheck disable=SC1090
source "$VENV_ACTIVATE"

echo "$LOG_PREFIX starting $(date -u +%FT%TZ)"
python manage.py audit_media_files 2>&1 | sed "s/^/$LOG_PREFIX /"
echo "$LOG_PREFIX finished $(date -u +%FT%TZ)"

exit 0
