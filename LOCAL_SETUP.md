# Running JackpotsWorld locally

Local development runs **two processes** side by side:

| Process | Directory | URL |
|---|---|---|
| Django API (`manage.py runserver`) | `Win365Jackpot-Backend-main/` | http://127.0.0.1:8000 |
| React SPA (Vite dev server) | `Win365Jackpot-Frontend-main/` | http://localhost:5173 |

**Open the app at http://localhost:5173, not port 8000.** In production a single Django app serves both the API and the built SPA from one origin (see [DEPLOYMENT.md](DEPLOYMENT.md)); locally the two are split so Vite can do hot module reload. Django's SPA catch-all serves a built `dist/` folder that doesn't exist in dev, so `http://127.0.0.1:8000/` correctly returns 404. That is expected, not a broken install.

## Prerequisites

- **Python 3.12**
- **Node 18+** (Vite 5)
- **MySQL 8** running locally — required, not optional. `settings.py` hardcodes the MySQL engine and there is no SQLite fallback.

## 1. Database

Create the schema and a dedicated local account. Run this as a MySQL user that can create databases and grant privileges (`-p` prompts for the password interactively — don't put it on the command line):

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS jackpotdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'jackpot'@'localhost' IDENTIFIED BY 'CHOOSE-A-LOCAL-PASSWORD'; GRANT ALL PRIVILEGES ON jackpotdb.* TO 'jackpot'@'localhost'; FLUSH PRIVILEGES;"
```

Successful `CREATE`/`GRANT` statements print nothing. Silence means it worked.

Use a dedicated `jackpot` account rather than `root` so the password that ends up in `.env` is a throwaway scoped to one local database.

## 2. Backend environment

Create `Win365Jackpot-Backend-main/.env` (gitignored). Generate a secret key with:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

```ini
SECRET_KEY=<paste the generated key>
DEBUG=True

ALLOWED_HOSTS=127.0.0.1,localhost
CORS_ALLOWED_ORIGINS=http://localhost:5173
CSRF_TRUSTED_ORIGINS=http://localhost:5173

SECURE_SSL_REDIRECT=False
USE_X_FORWARDED_PROTO=False
SECURE_HSTS_SECONDS=0

DB_NAME=jackpotdb
DB_USER=jackpot
DB_PASSWORD=<the password from step 1>
DB_HOST=127.0.0.1
DB_PORT=3306
DB_CONN_MAX_AGE=60
DB_SSL_CA=

# Prints OTP / verification emails to the runserver terminal instead of
# sending them, so no real SMTP account is needed. EMAIL_HOST_USER and
# EMAIL_HOST_PASSWORD have no defaults in settings.py and must be present
# even though the console backend ignores their values.
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
EMAIL_HOST_USER=dev@example.com
EMAIL_HOST_PASSWORD=unused-locally
DEFAULT_FROM_EMAIL=dev@example.com

TURNSTILE_SECRET_KEY=
SITE_BASE_URL=http://localhost:5173
EVENT_RSS_FEEDS=
POKER_RSS_FEEDS=
REDIS_URL=
```

`SECRET_KEY`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `EMAIL_HOST_USER`, and `EMAIL_HOST_PASSWORD` have **no defaults** — Django refuses to start if any is missing. [`.env.example`](Win365Jackpot-Backend-main/.env.example) documents every supported key.

### What `DEBUG=True` changes locally

Four things matter for day-to-day dev:

1. **CORS/CSRF** — `http://localhost:5173` and `http://127.0.0.1:5173` are appended to the allowed origins automatically ([settings.py](Win365Jackpot-Backend-main/backend/settings.py)), on top of whatever `.env` sets.
2. **Turnstile is bypassed entirely** — `verify_turnstile()` returns `True` before making any network call ([authapp/utils/turnstile.py](Win365Jackpot-Backend-main/authapp/utils/turnstile.py)), so login and registration work without a real Cloudflare key.
3. **Cache** — `LocMemCache` instead of the MySQL-backed `DatabaseCache`, so `manage.py createcachetable` is **not** needed locally (it is required in production, where per-process caching would weaken login rate limiting).
4. **Media files** — `/media/...` is served by Django's dev static server.

## 3. Backend install and migrate

From `Win365Jackpot-Backend-main/`. Name the virtualenv `venv` — [`.claude/launch.json`](.claude/launch.json) points at `venv\Scripts\python.exe`:

```bash
python -m venv venv
```

```bash
venv\Scripts\python.exe -m pip install -r requirements.txt
```

```bash
venv\Scripts\python.exe manage.py migrate
```

`migrate` is enough to get a usable database. Django's own data migrations seed the landing-page content — VIP tiers, destinations, testimonials, promotions, the country list, commission plans, and wheel rewards — so the app renders with real content on a completely fresh database. **You do not need the SQL dump to develop.**

## 4. Frontend

Create `Win365Jackpot-Frontend-main/.env` (gitignored). This file is required: `.env.production` points at the live API, and without a dev `.env` every `import.meta.env.VITE_API_URL` read is `undefined` and every fetch silently targets the wrong URL.

```ini
VITE_API_URL=http://127.0.0.1:8000
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

That site key is Cloudflare's public "always passes" test key. The backend ignores the token anyway while `DEBUG=True`.

```bash
npm install
```

## 5. Run both

Two terminals. Backend, from `Win365Jackpot-Backend-main/`:

```bash
venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Frontend, from `Win365Jackpot-Frontend-main/`:

```bash
npm run dev
```

Then open http://localhost:5173.

Verify the backend independently at http://127.0.0.1:8000/healthz/, which returns `{"status": "ok", ...}`. The Django admin is at http://127.0.0.1:8000/admin/ once you have a superuser.

## Optional extras

### Admin accounts

For the in-app Admin / Super Admin panels (`/admin-panel`, `/super-admin`), add to `.env` and re-run:

```ini
SUPERADMIN_EMAIL=you@example.com
SUPERADMIN_PASSWORD=<a password that passes Django's validators>
SUPERADMIN_NAME=Super Admin
```

```bash
venv\Scripts\python.exe manage.py create_default_admins
```

Idempotent — it never touches an existing account's password, so it is safe to re-run. See the "Default Super Admin / Admin accounts" section of [DEPLOYMENT.md](DEPLOYMENT.md) for details. For Django's own `/admin/` site instead, use `manage.py createsuperuser`.

### Production data dump

[`scripts/data/jackpotdb_dump.sql`](Win365Jackpot-Backend-main/scripts/data/jackpotdb_dump.sql) holds a capture of real production data. Only import it if you specifically need those records — it rewrites the dump's `INSERT`s as `REPLACE INTO`, overwriting rows the seed migrations already created:

```bash
venv\Scripts\python.exe scripts\import_dump.py
```

It reads `DB_*` from the **environment**, not from `.env`, and is idempotent via a marker table. See the module docstring in [`import_dump.py`](Win365Jackpot-Backend-main/scripts/import_dump.py) for what it deliberately skips and why.

### Live chat real-time push

**Works locally with no Redis.** `LIVE_CHAT_REALTIME` is true whenever `runserver` is the running command, because Channels then serves HTTP and WebSocket from a single process and the `InMemoryChannelLayer` really is shared between the REST view that broadcasts and the consumer that receives.

`REDIS_URL` only matters for deployments that split gunicorn and daphne into separate processes, where an in-memory layer would silently drop every broadcast. Leave it blank locally.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `UndefinedValueError: <KEY> not found` on startup | That key is missing from `.env` and has no default — see step 2 |
| `Access denied for user 'jackpot'@'localhost'` | Step 1 wasn't run, or `DB_PASSWORD` doesn't match what `CREATE USER` set |
| `http://127.0.0.1:8000/` returns 404 | Expected — use port 5173. Only a built `dist/` makes port 8000 serve the SPA |
| Frontend loads but every API call fails | Backend isn't running, or `VITE_API_URL` is missing. Vite only reads `.env` at startup, so restart `npm run dev` after editing it |
| CORS errors in the console | `DEBUG` isn't `True`, or the browser is on an origin other than `localhost:5173` / `127.0.0.1:5173` |
| Logged out after ~15 minutes | Working as designed. Raise `SESSION_IDLE_TIMEOUT_MINUTES` in `.env`; keep the frontend's `IDLE_TIMEOUT_MS` in `src/config/session.js` in step with it |
| OTP email never arrives | With the console backend it is printed in the runserver terminal, not sent |

## Notes

- Both `.env` files are gitignored, so they survive branch switches but never follow the repo to another machine — each developer creates their own.
- `venv/`, `node_modules/`, and `dist/` are gitignored too.
- Nothing here touches the deployment path. [DEPLOYMENT.md](DEPLOYMENT.md) covers cPanel/AWS, where `DEBUG=False`, MySQL-backed caching, `collectstatic`, and a built frontend `dist/` all apply instead.
