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
    # LIVE-CHAT: 'daphne' must be listed before 'django.contrib.staticfiles'
    # — Channels patches `runserver` to be ASGI-aware (serves both HTTP and
    # WebSocket locally, no separate process needed for dev) only when
    # daphne is registered first. Harmless to WSGI production (cPanel) since
    # that deployment never imports/serves ASGI at all.
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'channels',
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
# LIVE-CHAT: only used by the separate `daphne` process (see Procfile) that
# serves /ws/ on AWS EB — the WSGI app above still handles every normal HTTP
# request in production exactly as before this feature existed.
ASGI_APPLICATION = 'backend.asgi.application'

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
# Defaults to BASE_DIR/media for local dev. On EB, MEDIA_ROOT_DIR points
# outside /var/app/current (see .platform/hooks/postdeploy) because that
# whole directory is replaced on every deploy — anything saved under
# BASE_DIR/media would silently vanish on the next deploy otherwise.
#
# Only consulted by FileSystemStorage, i.e. only when AWS_STORAGE_BUCKET_NAME
# below is unset — local dev and this variable are unaffected by S3 either way.
MEDIA_ROOT = config('MEDIA_ROOT_DIR', default=os.path.join(BASE_DIR, 'media'))

# ── AWS S3 (persistent media storage) ───────────────────────────────────────
# Local disk (the FileSystemStorage fallback below) survives an in-place code
# deploy (MEDIA_ROOT_DIR is kept outside /var/app/current, see above) but NOT
# instance replacement or horizontal scaling — confirmed via `aws
# elasticbeanstalk describe-environment-resources` that this environment runs
# behind a Load Balancer with an Auto Scaling Group provisioned, so the
# instance currently serving a request is not guaranteed to be the one a file
# was originally saved to. That mismatch — not anything in the upload code
# path — is the root cause of media that "disappears" or loads inconsistently
# depending on which page/instance answers the request.
#
# Entirely opt-in via AWS_STORAGE_BUCKET_NAME: unset (the default everywhere
# until deliberately configured), nothing below changes and every environment
# — including local dev and the separate cPanel/Passenger deploy target (see
# DEPLOYMENT.md) — keeps using local disk exactly as before this section
# existed.
#
# No static access keys anywhere here on purpose: boto3's default credential
# chain picks up the EC2 instance's own IAM role automatically, so the app
# never holds a long-lived S3 credential. See authapp/storage_backends.py for
# why this is two backends (PublicMediaStorage/PrivateMediaStorage) rather
# than one.
AWS_STORAGE_BUCKET_NAME = config('AWS_STORAGE_BUCKET_NAME', default='')
AWS_S3_REGION_NAME = config('AWS_S3_REGION_NAME', default='ap-south-1')
AWS_S3_ADDRESSING_STYLE = 'virtual'
AWS_S3_SIGNATURE_VERSION = 's3v4'
AWS_S3_OBJECT_PARAMETERS = {
    # A full day, not "forever": Django's storage backend renames on a key
    # collision rather than overwriting (file_overwrite=False on both
    # backends in storage_backends.py) — so under normal use, a media
    # *replacement* always gets a new URL instead of invalidating a cached
    # old one, which is what actually satisfies "replaced media must not
    # show a stale version". The one narrow case that still reuses a key is
    # delete-then-re-upload-with-the-identical-original-filename (see the
    # post_delete/pre_save cleanup in authapp/signals/media_cleanup.py) —
    # a day keeps that edge case's stale-cache window bounded rather than
    # picking a value so long the exception never meaningfully expires.
    'CacheControl': 'max-age=86400',
}

# staticfiles is deliberately plain StaticFilesStorage, NOT whitenoise's
# CompressedManifestStaticFilesStorage, because plain storage is what this
# app has actually been running all along: the legacy STATICFILES_STORAGE
# setting that used to name the manifest backend was removed in Django 5.1
# (this project is on 5.2), so Django silently ignored it and fell back to
# the default non-manifest storage. Naming the manifest backend here would
# not be "keeping" the old config — it would switch manifest hashing on for
# the very first time. That was tried and immediately broke production: with
# manifest storage active, every {% static %} lookup must resolve through
# staticfiles.json or it raises ValueError, and Django's own admin templates
# 500'd on `Missing staticfiles manifest entry for 'admin/css/base.css'` —
# which also failed the load balancer's /admin/login/ health check and marked
# the whole environment unhealthy. Whitenoise still serves these files fine
# via its middleware; it just serves them unhashed, exactly as before.
#
# Only the 'default' (media) entry differs by environment — that's the actual
# S3 switch this block exists for.
_STATICFILES_BACKEND = {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}

if AWS_STORAGE_BUCKET_NAME:
    STORAGES = {
        'default': {'BACKEND': 'authapp.storage_backends.PublicMediaStorage'},
        'staticfiles': _STATICFILES_BACKEND,
    }
else:
    STORAGES = {
        'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
        'staticfiles': _STATICFILES_BACKEND,
    }

# Passenger imports this module once per worker process — make sure every
# directory the app writes to exists before anything tries to use it, so a
# fresh deploy never 500s on a missing staticfiles/media/logs folder. Skips
# MEDIA_ROOT when S3 is active since nothing ever writes to it in that mode.
_local_dirs = [STATIC_ROOT, os.path.join(BASE_DIR, 'logs')]
if not AWS_STORAGE_BUCKET_NAME:
    _local_dirs.append(MEDIA_ROOT)
for _dir in _local_dirs:
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
        # SimpleJWT's JWTAuthentication plus a "last seen" stamp — see
        # SESSION_IDLE_TIMEOUT_MINUTES below. Auth behaviour is unchanged.
        'authapp.authentication.SessionActivityJWTAuthentication',
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
        'live-chat-send': '30/min',
    },
}

# ── Session inactivity timeout ────────────────────────────────────────────────
# Single source of truth for how long a session survives without activity.
# Must stay in step with IDLE_TIMEOUT_MS in the frontend's
# src/config/session.js — the SPA logs an idle user out at the same instant
# their access token dies, so the two should never disagree.
#
# It drives two independent guards:
#   1. ACCESS_TOKEN_LIFETIME below, so an access token is worthless once the
#      idle window has passed (expired token -> 401, standard SimpleJWT).
#   2. authapp.utils.session_activity, which records when each user was last
#      seen and lets /api/auth/token/refresh/ refuse to resurrect a session
#      that has been idle longer than this. Without it, a leaked refresh
#      token would still mint fresh access tokens for REFRESH_TOKEN_LIFETIME.
SESSION_IDLE_TIMEOUT_MINUTES = config('SESSION_IDLE_TIMEOUT_MINUTES', default=15, cast=int)

# Last-seen writes are throttled (see session_activity.THROTTLE_SECONDS), so
# the stored timestamp lags real activity slightly. This grace period keeps
# that lag from ever expiring a session a minute early.
SESSION_IDLE_GRACE_SECONDS = config('SESSION_IDLE_GRACE_SECONDS', default=120, cast=int)

# ── JWT ───────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    # Matches the inactivity window on purpose — a token that outlives the
    # client-side timeout would let anyone who copied it out of localStorage
    # keep using the session long after the user was "logged out".
    "ACCESS_TOKEN_LIFETIME":    timedelta(minutes=SESSION_IDLE_TIMEOUT_MINUTES),
    # The outer bound for "Remember me". An active session renews well inside
    # it via rotation; an idle one is cut by the idle check above long before
    # this matters.
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
            # MAX_ENTRIES MATTERS HERE, AND THE DEFAULT IS DANGEROUS.
            #
            # Django's DatabaseCache defaults to MAX_ENTRIES=300 with
            # CULL_FREQUENCY=3, meaning that once 300 rows exist, every
            # subsequent write deletes ONE THIRD OF THE ENTIRE CACHE —
            # indiscriminately, oldest-expiry first, across all users of it.
            #
            # This cache is not just a performance nicety in this project. It
            # holds the login throttle counters and the 15-minute failed-login
            # account lockout (see DEPLOYMENT.md and authapp/otp/otp_utils.py),
            # which were deliberately moved here from LocMemCache precisely so
            # they would be shared across worker processes. A cull that evicts
            # those rows silently resets an attacker's failed-attempt count.
            #
            # VISITOR-ANALYTICS makes the ceiling much easier to hit: the
            # geolocation cache stores one entry per distinct visitor IP, so a
            # few hundred visitors would push the table past 300 and start
            # culling continuously. Raised well above any plausible working
            # set, and tunable without a deploy.
            "OPTIONS": {
                "MAX_ENTRIES": config("CACHE_MAX_ENTRIES", default=50000, cast=int),
                # Cull 5% at a time rather than 33%, so even if the ceiling is
                # ever reached the blast radius is small.
                "CULL_FREQUENCY": config("CACHE_CULL_FREQUENCY", default=20, cast=int),
            },
        }
    }

# LIVE-CHAT: channel layer for Django Channels (real-time chat push).
#
# IMPORTANT — InMemoryChannelLayer cannot deliver this feature's messages,
# in *any* deployment, including a single-instance one. Chat messages are
# persisted over REST (authapp/views/live_chat_views.py), which runs in the
# gunicorn/Passenger **WSGI** process, while the WebSocket consumers that
# must receive the push live in the separate **daphne** process (Procfile).
# InMemoryChannelLayer is a plain per-process dict: a group_send() issued
# from the WSGI worker lands in that worker's own memory, where no consumer
# is subscribed, and is silently dropped. The recipient then sees nothing
# until they reload and re-fetch the thread over REST — exactly the
# "message only arrives after a refresh" bug.
#
# So Redis is not a scaling nicety here, it is the transport that connects
# the two processes. Set REDIS_URL to enable real-time push.
#
# LIVE_CHAT_REALTIME below is the single source of truth for "can this
# deployment actually push?", and is surfaced to the browser via
# /api/live-chat/start/ so the client doesn't spend ~60s failing a
# WebSocket handshake on hosts that never serve /ws/ (the cPanel/Passenger
# deploy runs WSGI only — see .cpanel.yml/passenger_wsgi.py). Clients fall
# back to short-interval incremental polling, which stays correct either
# way.
_redis_url = config('REDIS_URL', default='')
# `socket_timeout` MUST be strictly greater than channels_redis's own
# `RedisChannelLayer.brpop_timeout` (hardcoded to 5s — it issues a BRPOP with
# that block duration while a consumer idles waiting for a push). Passing a
# bare URL string for "hosts" — the obvious way to write this — leaves
# redis-py's client-side socket read timeout at ITS OWN default, which is
# ALSO exactly 5s. Those two 5-second clocks then race on every single idle
# period: Redis genuinely has nothing to report and is about to reply `nil`
# at t=5.000s, but redis-py's own socket read gives up at essentially the
# same instant and raises TimeoutError first, almost every time, since the
# client's timer has no network round-trip to wait out and typically fires
# a hair earlier. channels_redis's receive loop does not catch this
# exception, so it kills the whole ASGI application instance for that
# connection — which is why this looked like "the WebSocket connects, then
# dies a few seconds later, forever, for every client" rather than a clean
# failure: nginx sees "recv() failed... while proxying upgraded connection"
# because daphne itself crashed handling that connection's receive loop.
# "hosts" has to move from a bare string to channels_redis's
# {"address": ...} form to carry this — see decode_hosts()/create_pool() in
# channels_redis/utils.py, which pop "address" and forward every other key
# straight into redis.asyncio.ConnectionPool.from_url()'s kwargs.
_redis_socket_timeout = config('REDIS_SOCKET_TIMEOUT', default=20, cast=int)
if _redis_url:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [{"address": _redis_url, "socket_timeout": _redis_socket_timeout}],
                # Drop rather than block forever if a consumer stops
                # reading — a wedged socket must never stall the REST
                # request that is trying to broadcast.
                "capacity": 500,
                "expiry": 10,
            },
        }
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }

# True only when cross-process push can actually work.
#
# Redis makes it work on any topology. Without Redis, the sole safe case is
# `manage.py runserver`, where Channels serves HTTP and WebSocket from one
# process so the in-memory layer really is shared.
#
# This keys off the running command rather than DEBUG on purpose: DEBUG says
# nothing about process topology. The AWS EB deploy runs gunicorn and daphne
# as separate processes (see Procfile) whether DEBUG is on or off, so
# treating DEBUG as "realtime works" would advertise a WebSocket that
# connects perfectly and then silently delivers nothing — the browser would
# stop polling in favour of it and messages would once again only show up
# after a refresh, which is the exact failure this flag exists to prevent.
_single_process_dev_server = 'runserver' in sys.argv
LIVE_CHAT_REALTIME = bool(_redis_url) or _single_process_dev_server

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

# EB's load balancer terminates HTTPS and forwards plain HTTP to the app
# instance — without this, Django thinks every request is HTTP, so
# SESSION_COOKIE_SECURE/CSRF_COOKIE_SECURE above silently drop cookies.
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

# ── SEO ───────────────────────────────────────────────────────────────────────
# Canonical public origin, used to build absolute URLs in /sitemap.xml
# (authapp/views/seo_views.py). Override per-environment so a dev or staging
# deploy doesn't publish a sitemap full of production URLs — a sitemap whose
# <loc> entries point at a different host is rejected outright by Search
# Console. Must match SITE_URL in the frontend's src/config/seo.js.
SITE_BASE_URL = config("SITE_BASE_URL", default="https://jackpotsworld.vip")

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
# ── VOICE-CALL (WebRTC in-app support calling) ────────────────────────────────
# Signaling rides the existing Channels/Redis layer (see CHANNEL_LAYERS above);
# audio never touches this server. These settings only configure what the
# browser needs in order to negotiate a peer connection, plus the server-side
# ring timeout.
#
# Everything comes from the environment. No STUN/TURN credential is ever
# hardcoded here or committed — TURN in particular is a metered, abusable
# resource, and a leaked static credential is a bill, not just an exposure.
#
# STUN alone is enough for local development and for most home/office
# networks. TURN is the fallback for symmetric NAT and restrictive corporate
# firewalls, where a direct peer-to-peer path cannot be established at all;
# without it those users get a call that rings, connects and then carries no
# audio. Configure it in production.
# Several STUN hosts, not one. A browser only needs a single reachable server
# to learn its own public address, but if that one host is blocked, rate
# limited or slow on the caller's network it gathers no server-reflexive
# candidate at all — and a peer with only host candidates can never connect to
# anyone outside its own LAN. Extra entries cost nothing (ICE queries them in
# parallel and uses whichever answers) and remove that single point of failure.
_DEFAULT_STUN_URLS = (
    "stun:stun.l.google.com:19302,"
    "stun:stun1.l.google.com:19302,"
    "stun:stun2.l.google.com:19302,"
    "stun:stun.cloudflare.com:3478"
)
# A blank value means "unset", not "no STUN servers". Without this, copying
# .env.example's empty `WEBRTC_STUN_URLS=` into a real .env would leave every
# browser with host candidates only — calls would work on a shared LAN and fail
# everywhere else, which is a miserable thing to debug from the symptom.
WEBRTC_STUN_URLS = [
    u.strip()
    for u in (config("WEBRTC_STUN_URLS", default="").strip() or _DEFAULT_STUN_URLS).split(",")
    if u.strip()
]
WEBRTC_TURN_URLS = [
    u.strip() for u in config("WEBRTC_TURN_URLS", default="").split(",") if u.strip()
]
# .strip() is load-bearing, not tidiness. These are pasted into a console by
# hand, and a credential copied from a terminal line like "username: jwturn"
# very easily carries a leading space. coturn then rejects it as a different
# user entirely, and the symptom is a relay that authenticates from the server
# but not from the app - which reads as a broken relay rather than a stray
# character. The URL list below is already stripped per entry; this is the
# other half of that.
WEBRTC_TURN_USERNAME = config("WEBRTC_TURN_USERNAME", default="").strip()
WEBRTC_TURN_CREDENTIAL = config("WEBRTC_TURN_CREDENTIAL", default="").strip()

# Optional shared secret for time-limited TURN credentials (coturn's
# `use-auth-secret` / RFC 5766 REST API). When set, the ICE endpoint mints a
# short-lived username/password per request instead of handing out the static
# WEBRTC_TURN_USERNAME/CREDENTIAL pair, so a credential scraped from one
# browser stops working within the TTL. Leave blank to use static credentials.
WEBRTC_TURN_STATIC_AUTH_SECRET = config("WEBRTC_TURN_STATIC_AUTH_SECRET", default="").strip()
WEBRTC_TURN_CREDENTIAL_TTL = config("WEBRTC_TURN_CREDENTIAL_TTL", default=3600, cast=int)

# How long an unanswered call rings before the backend marks it "missed".
# Enforced from CallSession.ring_expires_at, never from a browser timer.
VOICE_CALL_RING_TIMEOUT_SECONDS = config(
    "VOICE_CALL_RING_TIMEOUT_SECONDS", default=30, cast=int,
)

# How long a caller may wait when every agent is already on a call. The 30s
# ring window above is the right length for "is anyone going to pick this
# up", and much too short for "wait your turn" - a queued caller given only
# 30s is hung up on before an agent could plausibly finish.
VOICE_CALL_QUEUE_TIMEOUT_SECONDS = config(
    "VOICE_CALL_QUEUE_TIMEOUT_SECONDS", default=180, cast=int,
)

# Calling requires cross-process push to work: the REST process that creates
# the call must be able to reach the daphne process holding both browsers'
# sockets. That is exactly what LIVE_CHAT_REALTIME already answers, so the
# call feature reuses it rather than introducing a second, drift-prone flag.
VOICE_CALL_ENABLED = config("VOICE_CALL_ENABLED", default=True, cast=bool)

REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["voice-call-start"] = config(
    "VOICE_CALL_START_RATE", default="6/min",
)

# ── Call recording ───────────────────────────────────────────────────────────
# The agent's browser mixes both sides of the audio and uploads it when the
# call ends; there is no media server in the path to record from. This flag is
# reported to both browsers by the config endpoint, so turning it off stops the
# agent recording *and* removes the "this call is recorded" notice the customer
# sees — the two must never disagree.
#
# Recordings are stored on the private backend (see CallSession.recording) and
# are only ever served through CallRecordingView, which re-authorises per
# request. Operators in jurisdictions that require explicit consent rather than
# notice should keep this off until that consent flow exists.
VOICE_CALL_RECORDING_ENABLED = config(
    "VOICE_CALL_RECORDING_ENABLED", default=True, cast=bool,
)
# Where recordings land when S3 is not configured. A SIBLING of MEDIA_ROOT, not
# a subdirectory of it: authapp/views/media_serve_views.serve_media publishes
# everything under MEDIA_ROOT with no permission check, and a recording's path
# contains a sequential call id, so anything inside MEDIA_ROOT would be
# enumerable by anyone. Sitting next to it (rather than under BASE_DIR) also
# keeps recordings outside /var/app/current on Elastic Beanstalk, so a deploy
# does not delete them. See authapp/storage_backends.get_call_recording_storage.
# Blank means "unset" here too: an empty value would otherwise resolve to the
# process's working directory, scattering call audio wherever the app happens
# to have been started from.
VOICE_CALL_RECORDING_ROOT = (
    config("VOICE_CALL_RECORDING_ROOT", default="").strip()
    or os.path.join(os.path.dirname(MEDIA_ROOT.rstrip(os.sep)), "call-recordings")
)
# Opus at MediaRecorder's default bitrate runs ~1 MB per 10 minutes, so this is
# roughly a two-hour ceiling — generous for a support call, and a hard stop on
# a browser trying to push something large through an authenticated endpoint.
VOICE_CALL_RECORDING_MAX_BYTES = config(
    "VOICE_CALL_RECORDING_MAX_BYTES", default=25 * 1024 * 1024, cast=int,
)

# ANALYTICS: per-IP/account ceiling on the public event-ingest endpoint. The
# client batches and only sends on milestones/intervals, so this is generous —
# purely an abuse cap.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["analytics-ingest"] = config(
    "ANALYTICS_INGEST_RATE", default="120/min",
)

# ── Visitor analytics: IP storage, retention, session window ──────────────────
# Visitor IP addresses are personal data in several jurisdictions, so the two
# knobs that govern them are explicit settings rather than constants buried in
# a module. See authapp/models/analytics_models.py's privacy posture for the
# full access/retention story.
#
# ANALYTICS_STORE_IP=False keeps the whole location pipeline working — the
# address is still used transiently to resolve country/region/city — while
# persisting no address at all. Set it if the site's privacy policy forbids
# retaining addresses; nothing else in the analytics system depends on the
# stored value.
ANALYTICS_STORE_IP = config("ANALYTICS_STORE_IP", default=True, cast=bool)

# How long a stored address is kept before `manage.py prune_analytics_ips`
# blanks it. The derived country/region/city are NOT touched by pruning, so
# historical location analytics survive intact. 90 days matches the retention
# already applied elsewhere in this project's audit trail.
ANALYTICS_IP_RETENTION_DAYS = config("ANALYTICS_IP_RETENTION_DAYS", default=90, cast=int)

# A visit ends after this much inactivity. The client's sessionStorage id
# already dies with the tab; this is the server-side half, so a tab left open
# overnight starts a new session rather than reporting one 14-hour visit.
# Deliberately independent of SESSION_IDLE_MINUTES for logged-in accounts —
# that one is a security timeout, this one is a reporting convention, and
# tying them together would mean a security decision silently reshaping the
# analytics.
ANALYTICS_SESSION_IDLE_MINUTES = config(
    "ANALYTICS_SESSION_IDLE_MINUTES", default=30, cast=int,
)

# CHATBOT: per-IP ceiling on the public FAQ-bot endpoint (previously
# unthrottled — see authapp/throttles.py's ChatMessageThrottle). Generous: a
# real typed conversation is nowhere near this rate.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["chat-message"] = config(
    "CHAT_MESSAGE_RATE", default="60/min",
)
