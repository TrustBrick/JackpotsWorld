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
