from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.authentication import JWTAuthentication

from authapp.services.chat_service import get_chat_provider
from authapp.throttles import ChatMessageThrottle


def _optional_authenticated_user(request):
    """Best-effort auth for a public endpoint: if a valid access token is
    present, return the user; otherwise (missing/expired/invalid token)
    return None instead of raising — this view must never 401 an anonymous
    or stale-session visitor."""
    header = request.META.get("HTTP_AUTHORIZATION", "")
    if not header.startswith("Bearer "):
        return None
    try:
        result = JWTAuthentication().authenticate(request)
    except Exception:
        return None
    return result[0] if result else None


class ChatMessageView(APIView):
    """POST /api/chat/message/ — public (the landing-page widget is pre-login).
    Stateless: the frontend sends the running conversation `history` on every
    call, so no chat-message persistence is needed server-side.

    Authentication is optional: if the caller is signed in (valid Bearer
    token), the Customer Support workflow can read that user's own
    wallet/transaction/KYC data to answer precisely and can auto-create a
    SupportTicket for escalations. Signed-out callers get generic answers."""
    permission_classes = [AllowAny]
    authentication_classes = []  # handled manually below — never 401 here
    throttle_classes = [ChatMessageThrottle]

    def post(self, request):
        message = (request.data.get("message") or "").strip()
        history = request.data.get("history") or []
        if not message:
            return Response({"error": "message is required"}, status=400)

        user = _optional_authenticated_user(request)
        result = get_chat_provider().get_response(message, history, user)
        return Response(result)
