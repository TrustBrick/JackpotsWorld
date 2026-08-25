#!/bin/bash
# Ensures MEDIA_ROOT_DIR (set outside /var/app/current so it survives the
# next deploy — see settings.py) exists and is writable by the app's
# runtime user. Postdeploy hooks run as root, so this can chown even
# though the gunicorn workers run as a restricted user.
set -e

MEDIA_DIR="/var/app/media"
# Call recordings, kept in a SIBLING of the media directory rather than under
# it: /media/ is served with no permission check, and a recording's filename
# is a sequential call id. See VOICE_CALL_RECORDING_ROOT in settings.py — this
# path must match its default. It needs provisioning here for the same reason
# MEDIA_DIR does, and one more besides: /var/app is root-owned, so the webapp
# user cannot create this directory itself and the first upload would fail.
RECORDING_DIR="/var/app/call-recordings"
APP_USER="webapp"

for dir in "$MEDIA_DIR" "$RECORDING_DIR"; do
    mkdir -p "$dir"
    chown -R "$APP_USER:$APP_USER" "$dir"
    chmod -R u+rwX "$dir"
done
# Recordings are audio of customers: no group/other access, unlike media,
# which is public by design.
chmod 700 "$RECORDING_DIR"
