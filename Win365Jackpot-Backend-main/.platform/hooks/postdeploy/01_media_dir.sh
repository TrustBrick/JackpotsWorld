#!/bin/bash
# Ensures MEDIA_ROOT_DIR (set outside /var/app/current so it survives the
# next deploy — see settings.py) exists and is writable by the app's
# runtime user. Postdeploy hooks run as root, so this can chown even
# though the gunicorn workers run as a restricted user.
set -e

MEDIA_DIR="/var/app/media"
APP_USER="webapp"

mkdir -p "$MEDIA_DIR"
chown -R "$APP_USER:$APP_USER" "$MEDIA_DIR"
chmod -R u+rwX "$MEDIA_DIR"
