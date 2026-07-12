# Deploying to GoDaddy cPanel — jackpotsworld.vip (single domain)

**One** Apache Passenger Python app owns the entire `jackpotsworld.vip` domain. Django serves the DRF API *and* the built React SPA from the same origin — there is no `api.`, `admin.`, or `superadmin.` subdomain and no separate Apache-served frontend document root. This matters because shared GoDaddy hosting gives you no root/vhost access to hand-split routing between Apache and Passenger, so the split happens inside Django instead, using Whitenoise.

No *existing* business logic, models, serializers, views, or UI were changed except where explicitly noted (audit-log additions, a `settings_changed` log action, and closing two failed-login logging gaps — all additive, none change what a request returns). Two-Factor Authentication and the Super Admin IP allowlist are genuinely new, explicitly-requested capabilities layered on top — new models/views/UI, not modifications to what already existed.

## How the single-domain routing works

Passenger is mounted at the domain root, so **every** request for `jackpotsworld.vip` — HTML page loads, JS/CSS assets, and API calls — goes through Django:

1. `WhiteNoiseMiddleware` checks the request path against two sources before Django's URL resolver even runs:
   - `STATIC_ROOT` (Django's own `/static/...` — admin CSS, DRF browsable API assets — via `collectstatic`)
   - `WHITENOISE_ROOT` = the React build's `dist/` folder, served **from the site root** (`dist/assets/index-xyz.js` → `/assets/index-xyz.js`, `dist/favicon.ico` → `/favicon.ico`, etc.)
2. If neither matches, Django's URL resolver runs normally: `/admin/`, `/api/...`, `/admin-panel/...`, `/super-admin/...`, `/media/...`, `/healthz/` all resolve to their real views, exactly as before.
3. Anything left over (an actual React Router client-side route, e.g. `/dashboard`, `/admin-panel`, `/super-admin`) falls through to a catch-all view that returns the SPA's `index.html`, letting React Router take over client-side. A bad `/api/...` URL still correctly 404s — it does **not** fall through to the SPA.

The one intentional behavior change: the root `/` used to return a small JSON health-check (`{"status":"ok",...}`). It's been moved to `/healthz/` since `/` now has to serve the frontend.

## Portals & access control (Super Admin / Admin) — no subdomains needed

The Super Admin and Admin dashboards are **not** separate deployments — they're existing React routes (`/super-admin`, `/admin-panel`) in the same SPA, backed by existing API prefixes (`/api/super-admin/...`, `/admin-panel/...`, `/api/admin-panel/...`) in the same Django app. Standing up real `admin.jackpotsworld.vip` / `superadmin.jackpotsworld.vip` subdomains was considered and deliberately not done — it would mean provisioning separate cPanel Python apps, separate SSL certs, and cross-subdomain session sharing for zero actual isolation benefit, since it's the same codebase and same database either way. Access control already happens at the only boundary that matters — the API — not at the DNS layer:

- **Enforcement is `is_superuser`/`is_staff`-based, already in place, verified during this pass**: `authapp/permissions/super_admin_permissions.py`'s `IsSuperAdmin` requires `request.user.is_superuser`; `IsAdminOrSuperAdmin` requires `request.user.is_staff`. Every view in `super_admin_views.py` uses one of these. `admin_views.py` uses DRF's `IsAdminUser` (`is_staff`) plus capability add-ons (`HasFinanceAccess`, `HasVIPAccess`, etc. in `authapp/permissions/admin_role_permissions.py`) that fail closed if a staff user has no `AdminProfile` or an inactive one.
- **Unauthorized access is already blocked**: a plain user hitting a super-admin API endpoint gets a 403 from `IsSuperAdmin`, full stop — there's no separate "portal" to breach.
- **"Redirect unauthenticated users to the correct login page"**: this is JWT-based (`rest_framework_simplejwt`), not session/cookie auth, so there's no server-side redirect to speak of — `AdminPanel.jsx`/`SuperAdminPanel.jsx` already re-validate their token against the API on load and render their own in-place login screen if that fails. Unchanged by this pass.
- **Sessions/cookies across domains**: not applicable — single origin, no cross-domain cookie sharing needed.

If you later decide you genuinely want isolated subdomains (e.g. for a WAF rule that only applies to `/admin*` traffic), that's a bigger, separate change — flag it and we can scope it properly rather than bolt it on here.

## Default Super Admin / Admin accounts

`python manage.py create_default_admins` (in `authapp/management/commands/`) seeds one Super Admin (`is_staff=True, is_superuser=True`) and one Admin (`is_staff=True, is_superuser=False`) account, each with a matching `AdminProfile`. It's already wired into `scripts/deploy.sh`, right after `migrate`.

- **Idempotent**: only creates an account if no `User` with that email exists yet (case-insensitive check). It never touches or resets an existing account's password, even if the env var changes later — safe to leave in `.env` and re-run on every deploy.
- **Env-driven, nothing hardcoded**: `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` / `SUPERADMIN_NAME`, `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`. Leave an `*_EMAIL` blank to skip seeding that one entirely.
- **Password handling**: run through Django's `AUTH_PASSWORD_VALIDATORS` (rejects short/common/all-numeric passwords with a clear `CommandError`) and stored via `User.objects.create_user()`, which calls `set_password()` — PBKDF2 hash, never plaintext. Verified during this pass: the stored value has the `pbkdf2_sha256$...` prefix.
- **To run manually** (e.g. outside a deploy): `python manage.py create_default_admins` from inside the activated virtualenv.

## Security additions this pass

- **Rate limiting on login** already existed (`DEFAULT_THROTTLE_RATES` in `settings.py`: `login`/`admin-login` at 10/min, plus a 15-minute email-based lockout after repeated failures) — but it read/wrote through `LocMemCache`, which is **per-process**. Under Passenger's multiple worker processes, that meant an attacker effectively got N attempts *per worker*, not N total. Fixed by switching production `CACHES` to a MySQL-backed `DatabaseCache` table (shared across every process), gated on `DEBUG` so local dev keeps the simpler in-memory cache. Requires `python manage.py createcachetable` once — already in `scripts/deploy.sh` (idempotent — Django's own command skips a table that already exists).
- **Audit logging gaps closed**: `LoginView` and `SuperAdminLoginView` logged successful logins but not failed attempts (`AdminLoginView` already did) — both now log `success: False` on bad credentials, matching the existing pattern. Admin-configurable settings (`BonusConfig`, `SpinConfig`, `SpinSettings`) had zero audit trail — all three now call `ActivityLog.log(action="settings_changed", ...)` on create/update/delete. New `ActivityLog.ACTION_CHOICES` entry: `settings_changed` (migration `0029`).
- **Security headers**: added `SECURE_REFERRER_POLICY = "same-origin"` (always on) and env-gated HSTS (`SECURE_HSTS_SECONDS`/`_INCLUDE_SUBDOMAINS`/`_PRELOAD`, default off — see the env var table for when to turn it on). `SECURE_BROWSER_XSS_FILTER`, `SECURE_CONTENT_TYPE_NOSNIFF`, and `X_FRAME_OPTIONS=DENY` already existed.
- **www → apex redirect**: new `WWWRedirectMiddleware` (`authapp/middleware/canonical_host.py`), first in `MIDDLEWARE`, 301-redirects any `www.<host>` request to the bare apex domain with the full path/query preserved. Verified with a live request in this pass.
- **Two-Factor Authentication and IP allowlisting for Super Admin** — see the dedicated sections below. Both were previously flagged as optional/future work; this pass implements them fully (backend + enrollment UI), verified end-to-end against a real browser and a real local MySQL database.

## Two-Factor Authentication (Super Admin)

TOTP-based 2FA (Google Authenticator, Authy, 1Password, etc.), available to any Super Admin from the new **Security** tab in the Super Admin panel. Not mandatory — each Super Admin opts in individually.

**How it works:**
1. **Enroll** (`Security` tab → `Enable 2FA`): `POST /api/super-admin/2fa/setup/` generates a TOTP secret and returns a QR code (`qrcode` + Pillow, rendered server-side as a base64 PNG — no frontend QR library needed) plus the raw secret for manual entry. 2FA is **not** enabled yet at this point.
2. **Confirm**: entering the 6-digit code your authenticator app now shows calls `POST /api/super-admin/2fa/confirm/`, which verifies it, flips `is_enabled=True`, and returns 8 one-time backup codes — shown exactly once, never retrievable again (only hashes are stored, via `TwoFactorBackupCode.generate_set`).
3. **Login** now happens in two steps once 2FA is enabled: `POST /api/auth/super-admin-login/` checks the password and, if 2FA is on, returns `{"requires_2fa": true, "pending_token": "..."}` instead of tokens — no JWT is issued yet. `pending_token` is a stateless, signed, 5-minute-expiry token (`django.core.signing.TimestampSigner`, no DB/cache row needed). The frontend then shows a code-entry screen and calls `POST /api/auth/super-admin-verify-2fa/` with `{pending_token, code}`; only on success are real JWTs issued. `code` accepts either a live TOTP code or an unused backup code interchangeably.
4. **Disable / regenerate backup codes** both require the current password **and** a valid code — a stolen/leaked JWT alone can't turn 2FA off (`TwoFactorDisableView`, `TwoFactorRegenerateBackupCodesView`).

Every enable/disable is logged to `ActivityLog` (`two_factor_enabled`/`two_factor_disabled` — migration `0031`), and failed 2FA code attempts during login are logged the same way failed passwords already are.

**Verified this pass**, both via direct API calls against a real local MySQL database and a full live-browser run: enroll → confirm → login requiring 2FA → wrong code rejected → correct code accepted → backup code accepted and marked one-time-use (reuse rejected) → disable requires correct password+code → login no longer requires 2FA after disabling.

**No new env vars for 2FA itself** — it's fully self-service per Super Admin account, nothing to configure at deploy time.

## Super Admin IP allowlist (optional)

`SUPERADMIN_IP_ALLOWLIST` — comma-separated IPs and/or CIDR ranges (e.g. `203.0.113.5,198.51.100.0/24`). Blank (default) means unrestricted, matching how every other env-driven setting in this project defaults to off until configured.

Enforced in **three** places, not just at login, so a stolen/leaked JWT doesn't bypass it:
1. `SuperAdminLoginView` — rejects a login attempt outright (403) from a disallowed IP, before even checking the password.
2. `SuperAdminVerify2FAView` — same check on the second login step.
3. `IsSuperAdmin` permission class — checked on **every** authenticated Super Admin API request, so an already-issued token used from outside the allowlist is rejected too.

Parsed once at process start from the env var (`authapp/utils/ip_allowlist.py`), same as `ALLOWED_HOSTS` — changing it requires a Passenger restart. **Verified this pass**: login blocked from a disallowed IP, allowed from an allowlisted IP/CIDR, and an already-issued token rejected when replayed from a disallowed IP but accepted from an allowlisted one.

If you enable this, know your own current IP first (`curl ifconfig.me` or similar) and include it — there's no recovery UI if every Super Admin locks themselves out; you'd need server/DB access to clear the env var.

## Database — MySQL, production-ready

**MySQL is the only database this project ever talks to — there is no SQLite anywhere, in dev or prod.** `backend/settings.py` has exactly one `DATABASES` entry (`django.db.backends.mysql`) and no fallback branch. Every read/write goes through the Django ORM (`authapp/models/*.py`).

- **Credentials**: 100% environment-variable driven via `python-decouple` (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`) — nothing hardcoded in `settings.py`.
- **Password hashing**: the custom `User` model extends Django's `AbstractBaseUser` and only ever writes passwords through `set_password()` (PBKDF2) — confirmed at every call site, including the new `create_default_admins` command.
- **Driver**: `PyMySQL` (pure Python), shimmed as `MySQLdb` in `backend/__init__.py`, instead of `mysqlclient` — shared hosting won't give you a C compiler or MySQL dev headers.
- **Connection reuse**: `CONN_MAX_AGE` (default 60s, via `DB_CONN_MAX_AGE`) + `CONN_HEALTH_CHECKS = True`.
- **Indexes & constraints**: extensive throughout the model layer (`WalletAccount` unique-together on `(user, wallet_type)`, `WalletTransaction.transaction_reference` unique+indexed, composite indexes on `User`, `Notification`, etc.).
- **Migrations**: all 31 migrations are consistent with the current models and were verified applied end-to-end against a real local MySQL instance.

---

## 1. Final project structure

```
jackpotsworld_api/                  ← cPanel "Application Root" for the (only) Python app
├── authapp/
│   ├── management/commands/
│   │   └── create_default_admins.py   ← seeds Super Admin/Admin from env vars
│   ├── middleware/
│   │   └── canonical_host.py          ← www -> apex redirect
│   ├── models/two_factor_models.py    ← TwoFactorAuth, TwoFactorBackupCode
│   ├── views/two_factor_views.py      ← 2FA setup/confirm/disable/regenerate endpoints
│   └── utils/
│       ├── ip_allowlist.py            ← SUPERADMIN_IP_ALLOWLIST enforcement
│       └── two_factor.py              ← TOTP verify + pending-login-token helpers
├── backend/
│   ├── __init__.py                 (PyMySQL shim)
│   ├── settings.py                 (updated — FRONTEND_DIST_DIR / WHITENOISE_ROOT / DB / cache / security headers)
│   ├── urls.py                     (updated — SPA catch-all + /healthz/)
│   ├── wsgi.py
│   └── asgi.py
├── scripts/
│   └── deploy.sh                   ← run this on every deploy (pip install, migrate, cache table, seed admins, collectstatic, restart)
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

GoDaddy prefixes everything with your cPanel username — actual names will look like `youruser_jackpotdb`. This is the **only** database the app will ever use (no SQLite, in dev or prod).

1. **MySQL Database Wizard** → Create Database → e.g. `jackpotdb`
2. Create Database User → e.g. `jackpotuser` + a strong generated password
3. Add User to Database → grant **ALL PRIVILEGES**
4. `DB_HOST` stays `localhost`, `DB_PORT` stays `3306`

That's it — the app creates its own tables via Django migrations (step 7), you don't need to run any SQL by hand.

## 4. Environment variables (`.env` on the server, inside `jackpotsworld_api/`)

Copy `.env.example` → `.env` and fill in real values:

```
SECRET_KEY=<output of get_random_secret_key(), see below>
DEBUG=False
ALLOWED_HOSTS=jackpotsworld.vip,www.jackpotsworld.vip
CORS_ALLOWED_ORIGINS=https://jackpotsworld.vip,https://www.jackpotsworld.vip
CSRF_TRUSTED_ORIGINS=https://jackpotsworld.vip,https://www.jackpotsworld.vip
SECURE_SSL_REDIRECT=False        # flip to True after HTTPS is verified working (step 10)
USE_X_FORWARDED_PROTO=False

# HSTS — leave at 0 until HTTPS is verified working, then e.g. 31536000 (1 year)
SECURE_HSTS_SECONDS=0
SECURE_HSTS_INCLUDE_SUBDOMAINS=False
SECURE_HSTS_PRELOAD=False

FRONTEND_DIST_DIR=/home/<cpaneluser>/jackpotsworld_frontend_dist

# MySQL — from the cPanel MySQL Database Wizard (step 3). No SQLite fallback exists.
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

# Default Super Admin / Admin accounts — see "Default Super Admin / Admin
# accounts" above. Leave an *_EMAIL blank to skip seeding that one.
SUPERADMIN_EMAIL=<superadmin@jackpotsworld.vip, or leave blank>
SUPERADMIN_PASSWORD=<a strong password>
SUPERADMIN_NAME=Super Admin
ADMIN_EMAIL=<admin@jackpotsworld.vip, or leave blank>
ADMIN_PASSWORD=<a strong password>
ADMIN_NAME=Admin

# Optional — see "Super Admin IP allowlist" above. Leave blank to leave the
# Super Admin portal unrestricted.
SUPERADMIN_IP_ALLOWLIST=

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
```

## 7. Initialize the backend — first deploy and every deploy after

```bash
nano .env                              # first deploy only — paste in step 4's values, save (Ctrl+O, Ctrl+X)
bash scripts/deploy.sh                 # pip install, migrate, cache table, seed default admins, collectstatic, restart Passenger
```

`scripts/deploy.sh` is what makes this "automatic": one command, safe to re-run on every deploy — `migrate` only applies what's new, `createcachetable`/`create_default_admins` are both idempotent, `collectstatic --noinput` overwrites in place, and it ends by touching `tmp/restart.txt` so Passenger reloads the app (step 9).

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
- `mkdir -p tmp && touch tmp/restart.txt` from inside `jackpotsworld_api/` (this is what `scripts/deploy.sh` already does for you)

## 10. SSL / HTTPS

Only one certificate to manage (no `api.`/`admin.`/`superadmin.` subdomains):

1. cPanel → **SSL/TLS Status** → run **AutoSSL** for `jackpotsworld.vip` and `www.jackpotsworld.vip` (usually automatic already).
2. cPanel → **Domains** → enable **Force HTTPS Redirect**.
3. Once confirmed working, optionally set `SECURE_SSL_REDIRECT=True` in `.env` for defense-in-depth at the Django layer too, and later `SECURE_HSTS_SECONDS=31536000` once you're confident. Restart (step 9) after each change.

---

## Final checklist

**Core routing & SSL**
- [ ] DNS: `jackpotsworld.vip` A record + `www` resolve to the GoDaddy server (no `api`/`admin`/`superadmin` subdomains needed)
- [ ] SSL valid (padlock, no warnings) on `jackpotsworld.vip` and `www.jackpotsworld.vip`
- [ ] Force HTTPS redirect enabled
- [ ] `https://www.jackpotsworld.vip/anything` 301-redirects to `https://jackpotsworld.vip/anything` (validates `WWWRedirectMiddleware`)
- [ ] `https://jackpotsworld.vip` loads the React app
- [ ] Refreshing on a deep client route (e.g. `/dashboard`) does **not** 404 (validates the Django SPA catch-all)
- [ ] `https://jackpotsworld.vip/healthz/` returns `{"status": "ok", ...}`
- [ ] A deliberately-bad API URL, e.g. `https://jackpotsworld.vip/api/does-not-exist/`, returns a real 404 — **not** the SPA's HTML with a 200

**Database**
- [ ] `python manage.py showmigrations authapp` on the server shows every migration as `[X]` applied (all 31)
- [ ] A file upload (e.g. KYC/avatar) saves and is reachable at `https://jackpotsworld.vip/media/...`
- [ ] `jackpotsworld_api/logs/django.log` has no unexpected errors after a smoke test

**Admin accounts & RBAC**
- [ ] `python manage.py create_default_admins` output on first deploy shows `Created superadmin account: ...` and `Created admin account: ...`; running it again shows `already exists ... leaving it untouched`
- [ ] Log in at `/super-admin` with the seeded Super Admin credentials — full access
- [ ] Log in at `/admin-panel` with the seeded Admin credentials — limited access (no super-admin-only actions)
- [ ] The Admin account, when tested against a super-admin-only API endpoint directly (e.g. via curl with its token), gets a 403
- [ ] `https://jackpotsworld.vip/admin/` (Django admin, not the React admin panel) loads the login page with styled CSS (validates `collectstatic` + Whitenoise)

**Security**
- [ ] A deliberately wrong password at `/api/login/`, `/api/admin-panel/login/`... shows up in `ActivityLog` with `success: False`
- [ ] 11 failed logins for the same email within a few minutes returns 429 "Too many failed attempts" (validates the lockout, and that it's enforced globally now via the DB cache table, not per-worker)
- [ ] Changing a Bonus/Spin setting in the admin panel creates a new `ActivityLog` row with `action="settings_changed"`
- [ ] Response headers on any page include `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- [ ] Hitting a bad `/api/...` or `/admin/...` URL shows a plain Django 404, not a Python traceback (confirms `DEBUG=False`)
- [ ] Gmail App Password and DB password are freshly generated, not the ones from the dev `.env`
- [ ] `SUPERADMIN_PASSWORD`/`ADMIN_PASSWORD` are strong, unique, and not reused from anywhere else

**Two-Factor Authentication**
- [ ] Super Admin panel → Security tab → Enable 2FA → scan QR with an authenticator app → confirm code → 8 backup codes shown once
- [ ] Log out and back in with that account — a "Two-factor verification" step appears before the dashboard loads
- [ ] A wrong 6-digit code is rejected; the correct current code succeeds
- [ ] A backup code works once; reusing the same one is rejected
- [ ] Disabling 2FA requires the current password AND a valid code — a wrong password alone is rejected
- [ ] After disabling, logging in no longer prompts for a 2FA code

**Super Admin IP allowlist (if configured)**
- [ ] With `SUPERADMIN_IP_ALLOWLIST` set, logging in from an IP outside the list returns 403 "Access denied from this location"
- [ ] Logging in from an allowlisted IP/CIDR works normally
- [ ] A valid Super Admin token used from outside the allowlist is rejected on API calls, not just at login
