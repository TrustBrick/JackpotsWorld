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


class VoiceCallStartRateThrottle(SimpleRateThrottle):
    """VOICE-CALL: caps how often one account may *initiate* a call.

    Per-user for the same reason LiveChatSendRateThrottle is: the endpoint
    requires IsAuthenticated, and keying on IP would throttle every player
    behind one office NAT together. Only call creation is throttled —
    accept/reject/end must always be able to get through, or a spammer could
    strand the other party in a call they cannot hang up.
    """
    scope = "voice-call-start"

    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class AnalyticsIngestThrottle(SimpleRateThrottle):
    """ANALYTICS: per-IP cap on the public event-ingest endpoint. The client
    already batches and only sends on milestones/intervals (never per second),
    so this is purely an abuse ceiling. Keyed per authenticated account when
    signed in, else per IP."""
    scope = "analytics-ingest"

    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class ChatMessageThrottle(SimpleRateThrottle):
    """CHATBOT: per-IP cap on the public FAQ-bot endpoint. It had no throttle
    at all before this — every other public AllowAny POST endpoint in this
    file does. Beyond the ordinary abuse-ceiling reason, this one matters more
    than most: an unthrottled, unauthenticated caller could otherwise hammer
    the escalation categories to mass-create SupportTicket rows. Always keyed
    by IP, not account — ChatMessageView deliberately runs no
    authentication_classes (see its own docstring), so request.user is never
    a real signed-in user by the time DRF's throttle check runs, regardless of
    the Bearer token the view itself later reads manually. Generous — a real
    conversation is nowhere near this rate — since a normal user typing
    quickly must never be blocked."""
    scope = "chat-message"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}
