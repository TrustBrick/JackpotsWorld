"""
authapp/views/casino_wallet_views.py

New endpoint:
  GET /api/admin-panel/wallet/casino-wallets/
      ?user_id=<id>&casino_name=<name>
  → Returns C, NC, O wallet balances for the selected casino
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model

from authapp.models.casino_wallet_models import CasinoWalletAccount

User = get_user_model()

CASINO_WALLET_TYPES = ["C", "NC", "O"]


class CasinoWalletBalanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (request.user.is_authenticated and request.user.is_staff):
            return Response({"error": "Forbidden"}, status=403)

        user_id     = request.query_params.get("user_id")
        casino_name = request.query_params.get("casino_name", "").strip()

        if not user_id or not casino_name:
            return Response({"error": "user_id and casino_name are required"}, status=400)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        # Return all 3 wallet types; create with 0 balance if missing
        wallets = []
        for wt in CASINO_WALLET_TYPES:
            acct, _ = CasinoWalletAccount.objects.get_or_create(
                user=user,
                casino_name=casino_name,
                wallet_type=wt,
                defaults={"balance": 0},
            )
            wallets.append({
                "wallet_type": acct.wallet_type,
                "balance":     float(acct.balance),
                "updated_at":  acct.updated_at.isoformat() if acct.updated_at else None,
            })

        return Response({
            "casino_name": casino_name,
            "user_id":     str(user.id),
            "wallets":     wallets,
        })