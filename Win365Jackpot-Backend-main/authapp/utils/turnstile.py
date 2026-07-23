import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def verify_turnstile(token, remote_ip=None):
    """Validate a Cloudflare Turnstile token server-side.

    Always re-verifies with Cloudflare regardless of the client's IP/network —
    the token itself (not the caller's IP) is what's checked, so this works
    correctly even when the user's network changes between page load and
    submit. Passing `remote_ip` just lets Cloudflare cross-check it against
    the IP the challenge was originally solved from, per their docs.
    """
    if not token:
        return False

    # Skip verification in development so local work doesn't need a
    # production-registered site key.
    if settings.DEBUG:
        return True

    try:
        payload = {
            "secret": settings.TURNSTILE_SECRET_KEY,
            "response": token,
        }
        if remote_ip:
            payload["remoteip"] = remote_ip

        response = requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data=payload,
            timeout=5,
        )
        result = response.json()
        return result.get("success", False)

    except Exception:
        logger.exception("Turnstile verification error")
        return False