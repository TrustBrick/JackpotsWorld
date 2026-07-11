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
DEBUG = config('DEBUG', cast=bool)


ALLOWED_HOSTS = [
    'api.win365jackpot.com',   # 🔥 ADD THIS
    'win365jackpot.com',
    'www.win365jackpot.com',
    '13.233.214.143',
    '127.0.0.1',
    'localhost'
]

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
DATABASES = {
    'default': {
        'ENGINE':   'django.db.backends.mysql',
        'NAME':     config('DB_NAME'),
        'USER':     config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST':     config('DB_HOST'),
        'PORT':     config('DB_PORT', default='3306', cast=int),
        'OPTIONS':  { 'charset': 'utf8mb4' },
    }
}
# ── Email ─────────────────────────────────────────────────────────────────────
EMAIL_BACKEND       = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST          = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT          = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS       = True
EMAIL_HOST_USER     = config('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL  = config('DEFAULT_FROM_EMAIL', default=EMAIL_HOST_USER)

# ── Static & Media ────────────────────────────────────────────────────────────
STATIC_URL  = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_URL   = '/media/'
MEDIA_ROOT  = os.path.join(BASE_DIR, 'media')

STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = [
    'https://win365jackpot.com',
    'https://www.win365jackpot.com',
    'https://api.win365jackpot.com',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
]

CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = [
    "https://win365jackpot.com",
    "https://www.win365jackpot.com",
    "http://13.233.214.143",
    "http://127.0.0.1",
    'http://localhost:5173'
]

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
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
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

SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True

X_FRAME_OPTIONS = "DENY"

TURNSTILE_SECRET_KEY = config("TURNSTILE_SECRET_KEY", default="")

# ── Events / Poker content sync ──────────────────────────────────────────────
# Best-effort RSS aggregator (authapp/services/event_sync_service.py,
# authapp/services/poker_sync_service.py). Comma-separated feed URLs; empty by
# default since curated seed data (migration 0005) already keeps these
# sections populated — add real feed URLs here to enable auto-sync, run via
# `python manage.py sync_events` / `sync_poker` (cron / Windows Task Scheduler).
EVENT_RSS_FEEDS = [u.strip() for u in config("EVENT_RSS_FEEDS", default="").split(",") if u.strip()]
POKER_RSS_FEEDS = [u.strip() for u in config("POKER_RSS_FEEDS", default="").split(",") if u.strip()]