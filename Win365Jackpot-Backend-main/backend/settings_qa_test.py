"""
backend/settings_qa_test.py
─────────────────────────────────────────────────────────────────────────────
Dedicated, disposable test configuration for the QA runner (manage.py qa_run).

  • Isolated test database `test_jw_qa` (the jackpots_dev account holds
    ALL PRIVILEGES ON `test\\_%`), so the QA runner never touches dev/prod
    data and can run alongside the ordinary `test_jackpotsworld_dev` suite
    without contention.
  • In-process LocMemCache so throttle/lockout paths work without the
    production MySQL DatabaseCache table.

Usage:
    python manage.py qa_run --settings=backend.settings_qa_test
"""
from backend.settings import *  # noqa: F401,F403

# Separate test DB name — never the real one.
DATABASES["default"] = {**DATABASES["default"], "TEST": {"NAME": "test_jw_qa"}}  # noqa: F405

CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
}

# Never let the QA runner reach a real payment/email/SMS provider.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
