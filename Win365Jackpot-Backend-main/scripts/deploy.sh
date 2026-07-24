#!/usr/bin/env bash
# Run this from inside jackpotsworld_api/ on the cPanel server, with the
# app's virtualenv already activated (copy the "Enter to the virtual
# environment" command from Setup Python App first — see DEPLOYMENT.md).
#
#   source /home/<cpaneluser>/virtualenv/jackpotsworld_api/3.11/bin/activate
#   cd /home/<cpaneluser>/jackpotsworld_api
#   bash scripts/deploy.sh
#
# Safe to re-run on every deploy: migrate only applies whatever's new,
# collectstatic --noinput overwrites in place, and the restart trigger just
# tells Passenger to reload the app on its next request.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== pip install =="
pip install --upgrade pip
pip install -r requirements.txt

echo "== migrate =="
python manage.py migrate --noinput

echo "== cache table (login throttle/lockout storage — safe to re-run) =="
python manage.py createcachetable

echo "== seed default admin accounts (safe to re-run — idempotent) =="
python manage.py create_default_admins

echo "== collectstatic =="
python manage.py collectstatic --noinput

echo "== restart Passenger =="
mkdir -p tmp
touch tmp/restart.txt

echo "Done. Passenger will reload this app on its next request."
