#prod

from pathlib import Path
import os

from datetime import timedelta

from decouple import config

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import sys
sys.path.insert(0, BASE_DIR)


# ── Security ──────────────────────────────────────────────────────────────────
SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG', default=False, cast=bool)


ALLOWED_HOSTS = config(
    'ALLOWED_HOSTS',
    default='jackpotsworld.vip,www.jackpotsworld.vip,127.0.0.1,localhost'
).split(',')

# The ALB's health check hits this instance directly using its private IP as
# the Host header (not the public domain), which ALLOWED_HOSTS would
# otherwise reject with DisallowedHost — causing the target to be marked
# unhealthy no matter what health check path is configured. Fetch this
# instance's own private IP via the EC2 metadata service (IMDSv2) and allow
# it. Silently no-ops outside EC2 (e.g. local dev), since 169.254.169.254 is
# unreachable there.
def _ec2_private_ip():
    import urllib.request
    try:
        token_req = urllib.request.Request(
            'http://169.254.169.254/latest/api/token',
            method='PUT',
            headers={'X-aws-ec2-metadata-token-ttl-seconds': '21600'},
        )
        token = urllib.request.urlopen(token_req, timeout=1).read().decode()
        ip_req = urllib.request.Request(
            'http://169.254.169.254/latest/meta-data/local-ipv4',
            headers={'X-aws-ec2-metadata-token': token},
        )
        return urllib.request.urlopen(ip_req, timeout=1).read().decode()
    except Exception:
        return None


_private_ip = _ec2_private_ip()
if _private_ip:
    ALLOWED_HOSTS.append(_private_ip)

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'authapp',
]

MIDDLEWARE = [
    'authapp.middleware.canonical_host.WWWRedirectMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

AUTH_USER_MODEL = 'authapp.User'
ROOT_URLCONF    = 'backend.urls'
WSGI_APPLICATION = 'backend.wsgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

CORS_ALLOW_HEADERS = [
    'accept',
    'authorization',
    'content-type',
    'origin',
    'x-requested-with',
]

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

# ── Database ──────────────────────────────────────────────────────────────────
# MySQL only — no SQLite fallback, in dev or prod. All reads/writes go
# through the Django ORM (see authapp/models/*); credentials always come
# from environment variables, never hardcoded here.
#
# DB_SSL_CA (optional) — path to a CA bundle, e.g. AWS RDS's
# certs/global-bundle.pem (bundled in this repo). Only set this in
# production .env when connecting to RDS; leave it unset for local/GoDaddy
# MySQL, which don't require or offer a matching CA chain — PyMySQL only
# enables TLS at all if ssl_ca is actually provided.
#
# A relative value is resolved against BASE_DIR rather than the process's
# current working directory — on Elastic Beanstalk that cwd differs between
# the .ebextensions container_commands step (a staging directory) and the
# actual Gunicorn worker (not guaranteed to be /var/app/current either), so
# anchoring to BASE_DIR (derived from this file's own location) is the only
# path that's correct in every context.
_DB_OPTIONS = {'charset': 'utf8mb4'}
_db_ssl_ca = config('DB_SSL_CA', default='')
if _db_ssl_ca:
    if not os.path.isabs(_db_ssl_ca):
        _db_ssl_ca = os.path.join(BASE_DIR, _db_ssl_ca)
    _DB_OPTIONS['ssl_ca'] = _db_ssl_ca

DATABASES = {
    'default': {
        'ENGINE':   'django.db.backends.mysql',
        'NAME':     config('DB_NAME'),
        'USER':     config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST':     config('DB_HOST'),
        'PORT':     config('DB_PORT', default='3306', cast=int),
        'OPTIONS':  _DB_OPTIONS,
        # Django has no built-in connection pool (that's a separate layer
        # like ProxySQL, not available on shared GoDaddy hosting) — this is
        # its standard substitute: each Passenger worker process keeps its
        # DB connection open and reuses it across requests for up to
        # DB_CONN_MAX_AGE seconds instead of reconnecting every request.
        'CONN_MAX_AGE': config('DB_CONN_MAX_AGE', default=60, cast=int),
        # Pings a reused connection before handing it to a request and
        # transparently reconnects if MySQL (or a shared-host idle timeout)
        # already dropped it — without this, a stale reused connection
        # surfaces as a random request failure instead of just reconnecting.
        'CONN_HEALTH_CHECKS': True,
    }
}
# ── Email ─────────────────────────────────────────────────────────────────────
# All values here come from environment variables (.env) — never hardcode
# real credentials in this file. For Gmail specifically, EMAIL_HOST_USER must
# be a full @gmail.com address and EMAIL_HOST_PASSWORD must be a 16-character
# App Password (myaccount.google.com/apppasswords), which requires 2-Step
# Verification to be enabled on that account — a regular account password
# will always be rejected by Gmail with "535 5.7.8 Username and Password not
# accepted" (BadCredentials), regardless of how correct this config is.
EMAIL_BACKEND       = config('EMAIL_BACKEND', default='django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST          = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT          = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS       = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_USE_SSL       = config('EMAIL_USE_SSL', default=False, cast=bool)
EMAIL_TIMEOUT       = config('EMAIL_TIMEOUT', default=10, cast=int)
EMAIL_HOST_USER     = config('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL  = config('DEFAULT_FROM_EMAIL', default=EMAIL_HOST_USER)

# ── Static & Media ────────────────────────────────────────────────────────────
STATIC_URL  = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_URL   = '/media/'
MEDIA_ROOT  = os.path.join(BASE_DIR, 'media')

STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Passenger imports this module once per worker process — make sure every
# directory the app writes to exists before anything tries to use it, so a
# fresh deploy never 500s on a missing staticfiles/media/logs folder.
for _dir in (STATIC_ROOT, MEDIA_ROOT, os.path.join(BASE_DIR, 'logs')):
    os.makedirs(_dir, exist_ok=True)

# ── Frontend (React SPA) ──────────────────────────────────────────────────────
# jackpotsworld.vip is served entirely by this one Django app — there's no
# api. subdomain and no separate Apache-served document root. The built
# React app (`npm run build` → dist/) is expected to live in a sibling
# directory next to this project; Whitenoise serves every file found there
# from the site root (dist/assets/x.js -> /assets/x.js, favicon.ico ->
# /favicon.ico, etc.), and the catch-all route in backend/urls.py serves
# dist/index.html for any client-side route Whitenoise doesn't recognize as
# a real file (e.g. /dashboard). See DEPLOYMENT.md.
FRONTEND_DIST_DIR = config(
    'FRONTEND_DIST_DIR',
    default=os.path.join(BASE_DIR, '..', 'jackpotsworld_frontend_dist')
)
if not os.path.isabs(FRONTEND_DIST_DIR):
    FRONTEND_DIST_DIR = os.path.join(BASE_DIR, FRONTEND_DIST_DIR)
if os.path.isdir(FRONTEND_DIST_DIR):
    WHITENOISE_ROOT = FRONTEND_DIST_DIR

# Hashed asset filenames (Vite's default) are safe to cache for a long time —
# a new deploy ships new filenames. HTML/manifest-type files still get
# revalidated on every request since WHITENOISE_ROOT files default to a
# short max-age unless overridden per-file, which is fine here.
WHITENOISE_MAX_AGE = 0 if DEBUG else 60 * 60 * 24 * 365

# ── CORS ──────────────────────────────────────────────────────────────────────
# Same-origin now that the SPA and API share jackpotsworld.vip, so CORS
# mostly matters for non-browser or future cross-origin clients. Kept
# configurable rather than removed outright.
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='https://jackpotsworld.vip,https://www.jackpotsworld.vip'
).split(',')

CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='https://jackpotsworld.vip,https://www.jackpotsworld.vip'
).split(',')

if DEBUG:
    # Vite dev server — only ever added locally, never in production
    CORS_ALLOWED_ORIGINS += ['http://127.0.0.1:5173', 'http://localhost:5173']
    CSRF_TRUSTED_ORIGINS += ['http://127.0.0.1:5173', 'http://localhost:5173']

# ── REST Framework ────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_THROTTLE_RATES': {
        'login': '10/min',
        'admin-login': '10/min',
        'otp-send': '5/min',
        'otp-verify': '10/min',
        'register': '10/min',
        'check-user': '20/min',
    },
}

# ── JWT ───────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME":    timedelta(hours=24),
    "REFRESH_TOKEN_LIFETIME":   timedelta(days=30),
    "ROTATE_REFRESH_TOKENS":    True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# ── Cache ─────────────────────────────────────────────────────────────────────
# Login rate-limiting (DEFAULT_THROTTLE_RATES below) and the email
# lockout/failed-attempt tracking (authapp/otp/otp_utils.py) both read and
# write through this cache. LocMemCache is per-process — under Passenger's
# multiple worker processes each worker tracks its own attempt count, so an
# attacker effectively gets N attempts *per worker*, not N total. A
# DB-backed cache table is shared across every process (and we already have
# MySQL), so production uses that instead. Run `python manage.py
# createcachetable` once first — already wired into scripts/deploy.sh.
if DEBUG:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.db.DatabaseCache",
            "LOCATION": "django_cache",
        }
    }

# ── Misc ──────────────────────────────────────────────────────────────────────
LANGUAGE_CODE    = 'en-us'
TIME_ZONE        = 'UTC'
USE_I18N         = True
USE_TZ           = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# cPanel's own "Force HTTPS Redirect" toggle (Domains page) handles the
# HTTP → HTTPS redirect at the Apache layer, so this stays off by default to
# avoid a redirect loop if that toggle and this setting disagree. Flip
# SECURE_SSL_REDIRECT=True via env only after confirming HTTPS works and, if
# your host proxies through another layer, also set USE_X_FORWARDED_PROTO.
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=False, cast=bool)
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

if config('USE_X_FORWARDED_PROTO', default=False, cast=bool):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"

X_FRAME_OPTIONS = "DENY"

# HSTS tells browsers to only ever hit this domain over HTTPS, even if a
# user types http:// or follows an old http:// link — but it's a promise
# with real teeth (browsers cache it, and long durations are hard to walk
# back), so it stays off until SECURE_SSL_REDIRECT is confirmed working in
# production. Enable via env once HTTPS is verified (see DEPLOYMENT.md).
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=0, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = config('SECURE_HSTS_INCLUDE_SUBDOMAINS', default=False, cast=bool)
SECURE_HSTS_PRELOAD = config('SECURE_HSTS_PRELOAD', default=False, cast=bool)

TURNSTILE_SECRET_KEY = config("TURNSTILE_SECRET_KEY", default="")

# MULTILINGUAL-CHAT: local-preview feature flag — hard master switch. False
# (the default, and production's implicit value since the var is unset there)
# means every code path this feature touches behaves exactly as before it
# existed. Day-to-day on/off once this is True is controlled separately via
# the SupportSettings admin toggle (authapp/models/support_settings_models.py).
ENABLE_MULTILINGUAL_CHAT = config("ENABLE_MULTILINGUAL_CHAT", default=False, cast=bool)

# MULTILINGUAL-CHAT: only read when SupportSettings.translation_provider is
# switched to "openai" in Admin → Support Settings. Empty/unset by default —
# add OPENAI_API_KEY=... to your local .env only (never .env.production/AWS).
OPENAI_API_KEY = config("OPENAI_API_KEY", default="")
OPENAI_TRANSLATE_MODEL = config("OPENAI_TRANSLATE_MODEL", default="gpt-4o-mini")

# ── Events / Poker content sync ──────────────────────────────────────────────
# Best-effort RSS aggregator (authapp/services/event_sync_service.py,
# authapp/services/poker_sync_service.py). Comma-separated feed URLs; empty by
# default since curated seed data (migration 0005) already keeps these
# sections populated — add real feed URLs here to enable auto-sync, run via
# `python manage.py sync_events` / `sync_poker` (cron / Windows Task Scheduler).
EVENT_RSS_FEEDS = [u.strip() for u in config("EVENT_RSS_FEEDS", default="").split(",") if u.strip()]

# ── Logging ───────────────────────────────────────────────────────────────────
# Without an explicit config, app-level logger.error() calls (e.g. OTP email
# failures in authapp/otp/otp_utils.py) only surface via Python's bare
# "lastResort" stderr handler — unformatted and easy to miss. This gives the
# `authapp` logger tree a proper leveled, timestamped console handler so SMTP
# and other backend failures are actually visible in the server logs.
#
# The "file" handler is best-effort: on Elastic Beanstalk, .ebextensions
# container_commands (which run os.makedirs below, via a privileged deploy
# user) can create logs/ just fine, but the actual Gunicorn worker at
# runtime runs as a less-privileged user that isn't guaranteed write access
# to that same directory — crashing every worker on boot with a
# PermissionError if we unconditionally wire up a file handler. CloudWatch
# already captures anything written to stdout/stderr on that platform, so
# probe for real write access first and silently fall back to console-only
# logging if it's not there, rather than let a logging handler take the
# whole app down.
_LOGS_DIR = os.path.join(BASE_DIR, "logs")
_django_log_path = os.path.join(_LOGS_DIR, "django.log")
try:
    with open(_django_log_path, "a"):
        pass
    _file_logging_available = True
except OSError:
    _file_logging_available = False

_log_handlers = ["console", "file"] if _file_logging_available else ["console"]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        **({
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": _django_log_path,
                "maxBytes": 5 * 1024 * 1024,
                "backupCount": 5,
                "formatter": "verbose",
            },
        } if _file_logging_available else {}),
    },
    "loggers": {
        "authapp": {
            "handlers": _log_handlers,
            "level": "INFO",
            "propagate": False,
        },
        "django": {
            "handlers": _log_handlers,
            "level": "WARNING",
            "propagate": False,
        },
    },
}
POKER_RSS_FEEDS = [u.strip() for u in config("POKER_RSS_FEEDS", default="").split(",") if u.strip()]