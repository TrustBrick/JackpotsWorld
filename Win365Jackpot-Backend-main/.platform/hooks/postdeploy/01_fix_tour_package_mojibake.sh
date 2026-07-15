#!/bin/bash
# One-off: runs the fix_tour_package_mojibake management command once after
# deploy. Never allowed to fail the deployment itself — any error here is
# logged and swallowed, since this only touches display text, not app
# health. Remove this file (and the management command) after it has run
# successfully once against production.

{
  . /opt/elasticbeanstalk/deployment/env 2>/dev/null

  VENV_DIR=$(find /var/app/venv -mindepth 1 -maxdepth 1 -type d | head -1)
  if [ -z "$VENV_DIR" ]; then
    echo "fix_tour_package_mojibake: no venv found, skipping"
  else
    source "$VENV_DIR/bin/activate"
    cd /var/app/current
    python manage.py fix_tour_package_mojibake
  fi
} > /var/log/fix_tour_package_mojibake.log 2>&1 || true
