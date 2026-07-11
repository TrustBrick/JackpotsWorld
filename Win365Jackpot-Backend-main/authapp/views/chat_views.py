from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from authapp.services.chat_service import get_chat_provider


class ChatMessageView(APIView):
    """POST /api/chat/message/ — public (the landing-page widget is pre-login).
    Stateless: the frontend sends the running conversation `history` on every
    call, so no chat-message persistence is needed server-side."""
    permission_classes = [AllowAny]

    def post(self, request):
        message = (request.data.get("message") or "").strip()
        history = request.data.get("history") or []
        if not message:
            return Response({"error": "message is required"}, status=400)

        result = get_chat_provider().get_response(message, history)
        return Response(result)
