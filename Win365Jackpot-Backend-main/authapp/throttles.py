"""
authapp/throttles.py
─────────────────────────────────────────────────────────────────────────────
Per-IP scoped throttles for the unauthenticated (AllowAny) auth endpoints.
Rates are configured in backend/settings.py REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'].
"""

from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    scope = "login"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class AdminLoginRateThrottle(SimpleRateThrottle):
    scope = "admin-login"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class OTPSendRateThrottle(SimpleRateThrottle):
    scope = "otp-send"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class OTPVerifyRateThrottle(SimpleRateThrottle):
    scope = "otp-verify"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class RegisterRateThrottle(SimpleRateThrottle):
    scope = "register"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class CheckUserRateThrottle(SimpleRateThrottle):
    scope = "check-user"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class LiveChatSendRateThrottle(SimpleRateThrottle):
    """Per-user (not per-IP) — this endpoint requires IsAuthenticated, so
    keying on the account itself avoids throttling every user behind the
    same NAT/office IP together."""
    scope = "live-chat-send"

    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}
