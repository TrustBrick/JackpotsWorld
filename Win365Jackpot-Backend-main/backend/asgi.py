"""
ASGI config for backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# django_asgi_app must be constructed before importing anything that touches
# models/consumers (standard Channels caveat — app registry isn't ready yet).
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from authapp.routing import websocket_urlpatterns  # noqa: E402

# LIVE-CHAT: only the separate `daphne` process (see Procfile) actually
# serves this — the `web` gunicorn/WSGI process (backend/wsgi.py) is
# untouched and keeps handling every normal HTTP request exactly as before.
application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": URLRouter(websocket_urlpatterns),
})
