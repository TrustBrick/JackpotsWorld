# Deploying to GoDaddy cPanel — jackpotsworld.vip (single domain)

**One** Apache Passenger Python app owns the entire `jackpotsworld.vip` domain. Django serves the DRF API *and* the built React SPA from the same origin — there is no `api.` subdomain and no separate Apache-served frontend document root. This matters because shared GoDaddy hosting gives you no root/vhost access to hand-split routing between Apache and Passenger, so the split happens inside Django instead, using Whitenoise.

No business logic, models, serializers, views, or UI were changed. Every change below is deployment/routing-only.

## How the single-domain routing works

Passenger is mounted at the domain root, so **every** request for `jackpotsworld.vip` — HTML page loads, JS/CSS assets, and API calls — goes through Django:

1. `WhiteNoiseMiddleware` (already first-ish in `MIDDLEWARE`) checks the request path against two sources before Django's URL resolver even runs:
   - `STATIC_ROOT` (Django's own `/static/...` — admin CSS, DRF browsable API assets — via `collectstatic`)
   - `WHITENOISE_ROOT` = the React build's `dist/` folder, served **from the site root** (`dist/assets/index-xyz.js` → `/assets/index-xyz.js`, `dist/favicon.ico` → `/favicon.ico`, etc.)
2. If neither matches, Django's URL resolver runs normally: `/admin/`, `/api/...`, `/admin-panel/...`, `/media/...`, `/healthz/` all resolve to their real views, exactly as before.
3. Anything left over (an actual React Router client-side route, e.g. `/dashboard`, `/login`) falls through to a catch-all view that returns the SPA's `index.html`, letting React Router take over client-side. A bad `/api/...` URL still correctly 404s — it does **not** fall through to the SPA (see the `backend/urls.py` comment for why that needed an explicit exclusion).

The one intentional behavior change: the root `/` used to return a small JSON health-check (`{"status":"ok",...}`). It's been moved to `/healthz/` (still fully functional, just relocated) since `/` now has to serve the frontend.

## What changed in this pass (on top of the earlier deployment-readiness pass)

- `backend/urls.py`: removed `path('', home)`; added `path('healthz/', healthz)`; added a Whitenoise-backed `spa_index` catch-all view, placed last, with reserved-prefix exclusions (`api/`, `admin/`, `admin-panel/`, `static/`, `media/`, `healthz/`) so broken API calls still 404 instead of returning the SPA shell.
- `backend/settings.py`: `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS` no longer include an `api.` subdomain — just `jackpotsworld.vip` and `www.jackpotsworld.vip`. Added `FRONTEND_DIST_DIR` (env-configurable, defaults to a sibling `jackpotsworld_frontend_dist/` folder) wired into `WHITENOISE_ROOT`, plus `WHITENOISE_MAX_AGE` for long-cached hashed assets.
- `Win365Jackpot-Frontend-main/.env.production`: `VITE_API_URL` → `https://jackpotsworld.vip` (same-origin).
- Removed `Win365Jackpot-Frontend-main/public/.htaccess` — Apache no longer serves the frontend directly, so an SPA rewrite rule at the Apache layer no longer applies (Django's catch-all view does that job now).

---

## 1. Final project structure

```
jackpotsworld_api/                  ← cPanel "Application Root" for the (only) Python app
├── authapp/
├── backend/
│   ├── __init__.py                 (PyMySQL shim)
│   ├── settings.py                 (updated — FRONTEND_DIST_DIR / WHITENOISE_ROOT)
│   ├── urls.py                     (updated — SPA catch-all + /healthz/)
│   ├── wsgi.py
│   └── asgi.py
├── media/                          (auto-created; uploads live here)
├── staticfiles/                    (auto-created; Django admin's own static, via collectstatic)
├── logs/                           (auto-created; django.log)
├── manage.py
├── passenger_wsgi.py
├── requirements.txt
├── .env                            ← create on server from .env.example, NOT committed
└── .env.example

jackpotsworld_frontend_dist/        ← sibling folder, NOT web-exposed directly.
├── index.html                        Just the `npm run build` output, read straight off
├── assets/...                        disk by Django/Whitenoise. Rebuild + re-upload here
├── favicon.ico                       on every frontend change, then restart Passenger.
└── ...
```

Both folders live under your cPanel home directory (`/home/<cpaneluser>/`), as siblings.

## 2. cPanel → Setup Python App (the only app you need)

| Field | Value |
|---|---|
| Python version | **3.11** (any 3.10+ works — pick the highest 3.10/3.11/3.12 GoDaddy offers) |
| Application root | `jackpotsworld_api` |
| Application URL | `jackpotsworld.vip` — leave the path/URI blank so it mounts at the domain **root**, not a subpath |
| Application startup file | `passenger_wsgi.py` |
| Application Entry point | `application` |

Mounting at the bare domain (no URI suffix) tells Apache to hand this domain's entire request stream to Passenger — `public_html` for `jackpotsworld.vip` is effectively unused; you don't need to touch it.

## 3. cPanel → MySQL Database Wizard

GoDaddy prefixes everything with your cPanel username — actual names will look like `youruser_jackpotdb`.

1. **MySQL Database Wizard** → Create Database → e.g. `jackpotdb`
2. Create Database User → e.g. `jackpotuser` + a strong generated password
3. Add User to Database → grant **ALL PRIVILEGES**
4. `DB_HOST` stays `localhost`, `DB_PORT` stays `3306`

## 4. Environment variables (`.env` on the server, inside `jackpotsworld_api/`)

Copy `.env.example` → `.env` and fill in real values:

```
SECRET_KEY=<output of get_random_secret_key(), see below>
DEBUG=False
ALLOWED_HOSTS=jackpotsworld.vip,www.jackpotsworld.vip
CORS_ALLOWED_ORIGINS=https://jackpotsworld.vip,https://www.jackpotsworld.vip
CSRF_TRUSTED_ORIGINS=https://jackpotsworld.vip,https://www.jackpotsworld.vip
SECURE_SSL_REDIRECT=False        # flip to True after HTTPS is verified working (step 8)
USE_X_FORWARDED_PROTO=False

FRONTEND_DIST_DIR=/home/<cpaneluser>/jackpotsworld_frontend_dist

DB_NAME=youruser_jackpotdb
DB_USER=youruser_jackpotuser
DB_PASSWORD=<the password you set in step 3>
DB_HOST=localhost
DB_PORT=3306
DB_CONN_MAX_AGE=60

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_HOST_USER=<sender gmail address>
EMAIL_HOST_PASSWORD=<16-char Gmail App Password>
DEFAULT_FROM_EMAIL=<sender gmail address>

TURNSTILE_SECRET_KEY=<your real key>
```

Generate the `SECRET_KEY` once you have a Python shell (see step 6):
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

**Rotate credentials before go-live:** the dev `.env` in this repo has a live-looking Gmail App Password and a DB password (`Root@123`) sitting in it. They aren't in git history, but treat them as burned anyway — generate fresh ones for production rather than reusing them.

## 5. Terminal commands — get the backend onto the server

From cPanel's **Terminal** (or SSH):

```bash
cd ~
# Option A: git (if the backend repo is on GitHub/GitLab)
git clone <YOUR_BACKEND_REPO_URL> jackpotsworld_api

# Option B: no git access — zip Win365Jackpot-Backend-main locally
# (exclude venv/), upload via File Manager, Extract in place as jackpotsworld_api/
```

## 6. Install dependencies

Go to **Setup Python App** → your app → copy the "Enter to the virtual environment" command it shows you (it will look like the line below, with your real username/version):

```bash
source /home/<cpaneluser>/virtualenv/jackpotsworld_api/3.11/bin/activate
cd /home/<cpaneluser>/jackpotsworld_api
pip install --upgrade pip
pip install -r requirements.txt
```

## 7. Initialize the backend

Still inside the activated virtualenv:

```bash
nano .env                              # paste in step 4's values, save (Ctrl+O, Ctrl+X)
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser       # optional, for /admin/ access
```

## 8. Build and deploy the frontend

From your local machine (Node needed) or cPanel Terminal if Node is available there:

```bash
cd Win365Jackpot-Frontend-main
npm install
npm run build          # outputs dist/
```

Upload the **contents** of `dist/` (not the folder itself) into `/home/<cpaneluser>/jackpotsworld_frontend_dist/` via File Manager or SFTP — a plain folder next to `jackpotsworld_api/`, not inside `public_html`.

Every time you rebuild the frontend, re-upload here and restart Passenger (step 9) — Whitenoise scans `WHITENOISE_ROOT` at process start.

## 9. Restart Passenger

Any time you change backend code, `.env`, run migrations, or redeploy the frontend build:

- cPanel → **Setup Python App** → your app → click **Restart**, **or**
- `mkdir -p tmp && touch tmp/restart.txt` from inside `jackpotsworld_api/`

## 10. SSL / HTTPS

Only one certificate to manage now (no `api.` subdomain):

1. cPanel → **SSL/TLS Status** → run **AutoSSL** for `jackpotsworld.vip` and `www.jackpotsworld.vip` (usually automatic already).
2. cPanel → **Domains** → enable **Force HTTPS Redirect**.
3. Once confirmed working, optionally set `SECURE_SSL_REDIRECT=True` in `.env` and restart (step 9) for defense-in-depth at the Django layer too.

---

## Final checklist

- [ ] DNS: `jackpotsworld.vip` A record + `www` resolve to the GoDaddy server (no `api` subdomain needed anymore — remove it from DNS if it existed from an earlier attempt)
- [ ] SSL valid (padlock, no warnings) on `jackpotsworld.vip` and `www.jackpotsworld.vip`
- [ ] Force HTTPS redirect enabled
- [ ] `https://jackpotsworld.vip` loads the React app
- [ ] Refreshing on a deep client route (e.g. `/dashboard`) does **not** 404 (validates the Django SPA catch-all)
- [ ] `https://jackpotsworld.vip/healthz/` returns `{"status": "ok", ...}`
- [ ] `https://jackpotsworld.vip/admin/` loads the Django admin login with styled CSS (validates `collectstatic` + Whitenoise)
- [ ] A deliberately-bad API URL, e.g. `https://jackpotsworld.vip/api/does-not-exist/`, returns a real 404 — **not** the SPA's HTML with a 200
- [ ] Register/login flow works end-to-end from the live frontend against the live API (same-origin now, JWT issued/stored/used)
- [ ] A file upload (e.g. KYC/avatar) saves and is reachable at `https://jackpotsworld.vip/media/...`
- [ ] A hashed JS asset (view page source → `/assets/index-*.js`) loads with a 200 and long `Cache-Control`
- [ ] `jackpotsworld_api/logs/django.log` has no unexpected errors after a smoke test
- [ ] Hitting a bad `/api/...` or `/admin/...` URL shows a plain Django 404, not a Python traceback (confirms `DEBUG=False`)
- [ ] Gmail App Password and DB password are freshly generated, not the ones from the dev `.env`
