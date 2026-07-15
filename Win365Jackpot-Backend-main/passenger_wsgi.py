# -*- coding: utf-8 -*-
"""
Passenger WSGI entry point for GoDaddy / cPanel "Setup Python App".

cPanel's Python App manager generates a virtualenv, adds this file's
directory to sys.path, and imports this module looking for a module-level
`application` callable -- it does not run `manage.py` or activate the
virtualenv itself for us, so that has to happen here.

Keep this file plain ASCII: some GoDaddy/cPanel Passenger setups run an
initial low-level parse of this exact file with something that behaves
like Python 2's tokenizer before handing off to the real interpreter, and
that step chokes on non-ASCII bytes with no encoding declared (PEP 263)
even when the app itself is correctly configured for Python 3.
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()
