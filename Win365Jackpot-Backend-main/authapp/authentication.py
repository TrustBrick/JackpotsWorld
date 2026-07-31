"""
JWT authentication that also records session activity.

Drop-in replacement for rest_framework_simplejwt's JWTAuthentication, wired as
the project-wide DEFAULT_AUTHENTICATION_CLASSES. Behaviour is identical —
including returning 401 for expired/blacklisted tokens — with one addition:
every successfully authenticated request stamps the user's "last seen" time so
the refresh endpoint can enforce the inactivity timeout server-side.

See authapp/utils/session_activity.py for why this is cheap (throttled writes)
and why it can never reject a request on its own.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication

from authapp.utils import session_activity


class SessionActivityJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            user, _token = result
            try:
                session_activity.touch(getattr(user, "id", None))
            except Exception:
                pass
        return result
