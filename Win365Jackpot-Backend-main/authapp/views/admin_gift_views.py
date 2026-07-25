"""
authapp/views/admin_gift_views.py
─────────────────────────────────────────────────────────────────────────────
WALLET-REQUESTS / GIFTS-REWARDS: new module — safe to delete entirely to
remove the feature.

Gift CREATION deliberately reuses the existing, already-working
AdminCreateBonusView (POST /api/admin-panel/wallet/bonus/) in
authapp/views/gift_level_views.py — untouched, not duplicated. That view
already creates UserGift rows with status="pending" (immediately claimable,
no draft/approval step, per product decision), deducts the Admin Bonus
Wallet, and logs to ActivityLog.

This module only adds what didn't exist yet: a cross-user admin list (the
existing UserGiftListView is scoped to request.user) and the Expire /
Cancel / Reissue actions. Claiming itself (UserClaimGiftView, which already
credits the Non-Cash wallet only) is untouched.
"""
from django.db.models import Q, Sum
from rest_framework import serializers
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models import ActivityLog
from authapp.models.gift_level_models import UserGift
from authapp.permissions.admin_role_permissions import HasFinanceAccess
from authapp.serializers.gift_level_serializers import UserGiftSerializer

PAGE_SIZE = 20


def _client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


class AdminGiftListSerializer(UserGiftSerializer):
    """Adds the recipient's identity on top of the existing UserGiftSerializer
    — nothing about the base fields is changed, this just extends it for
    the admin cross-user table."""
    user_uid = serializers.CharField(source="user.user_uid", read_only=True)
    user_name = serializers.CharField(source="user.name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)

    class Meta(UserGiftSerializer.Meta):
        fields = UserGiftSerializer.Meta.fields + ["user_uid", "user_name", "user_email"]


class _AdminGiftBase(APIView):
    """Gift creation moves real money out of the Admin Bonus Wallet, so
    these views are gated the same way as every other finance-affecting
    admin surface in this codebase."""
    permission_classes = [IsAdminUser, HasFinanceAccess]


class AdminGiftListView(_AdminGiftBase):
    def get(self, request):
        q = (request.GET.get("q") or "").strip()
        status_filter = (request.GET.get("status") or "").strip().lower()
        gift_type_filter = (request.GET.get("gift_type") or "").strip()
        page = max(1, int(request.GET.get("page", 1) or 1))

        qs = UserGift.objects.select_related("user", "created_by").order_by("-created_at")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if gift_type_filter:
            qs = qs.filter(gift_type=gift_type_filter)
        if q:
            qs = qs.filter(
                Q(user__name__icontains=q) | Q(user__email__icontains=q) | Q(user__user_uid__icontains=q)
                | Q(description__icontains=q)
            )

        count = qs.count()
        start = (page - 1) * PAGE_SIZE
        page_items = qs[start:start + PAGE_SIZE]

        return Response({
            "count": count, "page": page, "page_size": PAGE_SIZE,
            "results": AdminGiftListSerializer(page_items, many=True).data,
            "summary": {
                "pending": qs.filter(status="pending").count(),
                "claimed": qs.filter(status="claimed").count(),
                "expired": qs.filter(status="expired").count(),
                "revoked": qs.filter(status="revoked").count(),
                "total_amount": qs.aggregate(t=Sum("amount"))["t"] or 0,
            },
        })


class AdminGiftExpireView(_AdminGiftBase):
    def post(self, request, pk):
        gift = UserGift.objects.filter(pk=pk).first()
        if not gift:
            return Response({"error": "Gift not found."}, status=404)
        if gift.status != "pending":
            return Response({"error": f"Only pending gifts can be expired (current status: {gift.status})."}, status=400)

        gift.status = "expired"
        gift.save(update_fields=["status"])

        ActivityLog.log(
            actor=request.user, target_user=gift.user, action="gift_expired",
            amount=gift.amount, description=f"Gift #{gift.id} ({gift.gift_type}) manually expired by admin",
            reference_id=str(gift.id), ip_address=_client_ip(request),
        )
        return Response({"message": "Gift expired.", "gift": UserGiftSerializer(gift).data})


class AdminGiftCancelView(_AdminGiftBase):
    def post(self, request, pk):
        gift = UserGift.objects.filter(pk=pk).first()
        if not gift:
            return Response({"error": "Gift not found."}, status=404)
        if gift.status != "pending":
            return Response({"error": f"Only pending gifts can be cancelled (current status: {gift.status})."}, status=400)

        gift.status = "revoked"
        note = (request.data.get("note") or "").strip()
        if note:
            gift.note = (gift.note + "\n" if gift.note else "") + f"Cancelled: {note}"
        gift.save(update_fields=["status", "note"])

        ActivityLog.log(
            actor=request.user, target_user=gift.user, action="gift_cancelled",
            amount=gift.amount, description=f"Gift #{gift.id} ({gift.gift_type}) cancelled by admin" + (f": {note}" if note else ""),
            reference_id=str(gift.id), ip_address=_client_ip(request),
        )
        return Response({"message": "Gift cancelled.", "gift": UserGiftSerializer(gift).data})


class AdminGiftReissueView(_AdminGiftBase):
    """Creates a fresh, immediately-claimable gift for the same user, same
    amount/type/description, with a new expiry — for a gift that expired or
    was cancelled and the admin wants to grant again. Does NOT touch the
    original row. Reuses UserGift.objects.create exactly like
    AdminCreateBonusView already does — no new creation path invented."""

    def post(self, request, pk):
        original = UserGift.objects.filter(pk=pk).first()
        if not original:
            return Response({"error": "Gift not found."}, status=404)
        if original.status not in ("expired", "revoked"):
            return Response({"error": f"Only expired or cancelled gifts can be reissued (current status: {original.status})."}, status=400)

        expires_at = request.data.get("expires_at") or None

        new_gift = UserGift.objects.create(
            user=original.user,
            amount=original.amount,
            gift_type=original.gift_type,
            description=original.description,
            note=f"Reissued from gift #{original.id}",
            expires_at=expires_at,
            status="pending",
            created_by=request.user,
        )

        ActivityLog.log(
            actor=request.user, target_user=original.user, action="gift_reissued",
            amount=new_gift.amount, description=f"Gift #{new_gift.id} reissued from #{original.id} ({original.gift_type})",
            reference_id=str(new_gift.id), ip_address=_client_ip(request),
        )
        return Response({"message": "Gift reissued.", "gift": UserGiftSerializer(new_gift).data}, status=201)
