#!/bin/bash
# One-off: runs the fix_db_mojibake management command once after deploy.
# Never allowed to fail the deployment itself -- any error here is logged
# and swallowed, since this only touches display text, not app health.
# Remove this file (and the management command) after it has run
# successfully once against production (verify via the relevant API
# endpoints, not this log -- there's no reliable way to fetch it back).

{
  . /opt/elasticbeanstalk/deployment/env 2>/dev/null

  VENV_DIR=$(find /var/app/venv -mindepth 1 -maxdepth 1 -type d | head -1)
  if [ -z "$VENV_DIR" ]; then
    echo "fix_db_mojibake: no venv found, skipping"
  else
    source "$VENV_DIR/bin/activate"
    cd /var/app/current
    python manage.py fix_db_mojibake
  fi
} > /var/log/fix_db_mojibake.log 2>&1 || true
