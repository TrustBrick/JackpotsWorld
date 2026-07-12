"""
Passenger WSGI entry point for GoDaddy / cPanel "Setup Python App".

cPanel's Python App manager generates a virtualenv, adds this file's
directory to sys.path, and imports this module looking for a module-level
`application` callable — it does not run `manage.py` or activate the
virtualenv itself for us, so that has to happen here.
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()
