import requests
from django.conf import settings


def verify_turnstile(token):
    if not token:
        return False

    # ✅ Skip verification in development
    if settings.DEBUG:
        return True

    try:
        response = requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={
                "secret": settings.TURNSTILE_SECRET_KEY,
                "response": token,
            },
            timeout=5
        )

        result = response.json()
        return result.get("success", False)

    except Exception as e:
        print("Turnstile verification error:", str(e))
        return False