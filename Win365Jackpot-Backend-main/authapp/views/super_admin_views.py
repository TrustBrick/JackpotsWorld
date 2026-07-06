# authapp/views/super_admin_views.py
from django.contrib.auth import get_user_model
from django.db.models import Q, Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from authapp.permissions.super_admin_permissions import IsSuperAdmin, IsAdminOrSuperAdmin
from authapp.models.super_admin_models import AdminWallet, SuperAdminTransaction
from authapp.serializers.super_admin_serializers import (
    AdminWalletSerializer,
    AdminWalletCreditSerializer,
    AdminWalletDebitSerializer,
    AdminTransferToUserSerializer,
    SuperAdminTransactionSerializer,
    CreateAdminSerializer,
)
from authapp.services.super_admin_service import (
    credit_admin_wallet,
    debit_admin_wallet,
    admin_transfer_to_user,
)

User = get_user_model()


def _get_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


# ─────────────────────────────────────────────────────────────────────────────
# AdminWallet balance
# ─────────────────────────────────────────────────────────────────────────────

class AdminWalletBalanceView(APIView):
    """
    GET /super-admin/wallet/balance/
    Accessible by SuperAdmin AND regular Admins (read-only).
    """
    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        wallet = AdminWallet.get()
        return Response(AdminWalletSerializer(wallet).data)


# ─────────────────────────────────────────────────────────────────────────────
# SuperAdmin credit AdminWallet
# ─────────────────────────────────────────────────────────────────────────────

class AdminWalletCreditView(APIView):
    """
    POST /super-admin/wallet/credit/
    Only SuperAdmin (is_superuser=True) can add funds.
    Body: { wallet_type, amount, note }
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        ser = AdminWalletCreditSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)

        AdminWallet.objects.get_or_create(pk=1)

        result = credit_admin_wallet(
            actor=request.user,
            wallet_type=ser.validated_data["wallet_type"],
            amount=ser.validated_data["amount"],
            note=ser.validated_data.get("note", ""),
        )
        return Response({"message": "AdminWallet credited.", **result})


# ─────────────────────────────────────────────────────────────────────────────
# SuperAdmin debit AdminWallet
# ─────────────────────────────────────────────────────────────────────────────

class AdminWalletDebitView(APIView):
    """
    POST /super-admin/wallet/debit/
    Only SuperAdmin can debit.
    Body: { wallet_type, amount, note }
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        ser = AdminWalletDebitSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)

        AdminWallet.objects.get_or_create(pk=1)

        try:
            result = debit_admin_wallet(
                actor=request.user,
                wallet_type=ser.validated_data["wallet_type"],
                amount=ser.validated_data["amount"],
                note=ser.validated_data.get("note", ""),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)

        return Response({"message": "AdminWallet debited.", **result})


# ─────────────────────────────────────────────────────────────────────────────
# Admin transfers from AdminWallet to a User
# ─────────────────────────────────────────────────────────────────────────────

class AdminTransferToUserView(APIView):
    """
    POST /super-admin/wallet/transfer/
    Both admins (is_staff=True) and superadmin can transfer to users.
    Body: { user_id, wallet_type, transaction_type, amount, note }
    """
    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request):
        ser = AdminTransferToUserSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)

        try:
            target_user = User.objects.get(pk=ser.validated_data["user_id"])
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        # Cannot transfer to any staff / superuser account
        if target_user.is_staff or target_user.is_superuser:
            return Response({"error": "Cannot transfer to a staff account."}, status=400)

        AdminWallet.objects.get_or_create(pk=1)

        try:
            result = admin_transfer_to_user(
                actor=request.user,
                target_user=target_user,
                wallet_type=ser.validated_data["wallet_type"],
                amount=ser.validated_data["amount"],
                txn_type=ser.validated_data["transaction_type"],
                note=ser.validated_data.get("note", ""),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)

        return Response({"message": "Transfer successful.", **result})


# ─────────────────────────────────────────────────────────────────────────────
# SuperAdminTransaction history
# ─────────────────────────────────────────────────────────────────────────────

class SuperAdminTransactionListView(APIView):
    """
    GET /super-admin/wallet/history/
    Full ledger — SA_CREDIT / SA_DEBIT / ADM_TRANSFER.
    Filterable by txn_type, wallet_type, q, page.
    """
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        qs = SuperAdminTransaction.objects.select_related(
            "performed_by", "target_user"
        ).order_by("-created_at")

        txn_type    = request.query_params.get("txn_type",    "").strip().upper()
        wallet_type = request.query_params.get("wallet_type", "").strip().upper()
        q           = request.query_params.get("q",           "").strip()
        page        = max(int(request.query_params.get("page",      1)),  1)
        per         = max(int(request.query_params.get("page_size", 20)), 1)

        if txn_type:
            qs = qs.filter(txn_type=txn_type)
        if wallet_type:
            qs = qs.filter(wallet_type=wallet_type)
        if q:
            qs = qs.filter(
                Q(reference__icontains=q) |
                Q(performed_by__email__icontains=q) |
                Q(target_user_uid__icontains=q) |
                Q(note__icontains=q)
            )

        total  = qs.count()
        offset = (page - 1) * per
        items  = qs[offset: offset + per]

        return Response({
            "count":     total,
            "page":      page,
            "page_size": per,
            "results":   SuperAdminTransactionSerializer(items, many=True).data,
        })


# ─────────────────────────────────────────────────────────────────────────────
# SuperAdmin dashboard stats
# ─────────────────────────────────────────────────────────────────────────────

class SuperAdminStatsView(APIView):
    """
    GET /super-admin/stats/
    High-level numbers for the dashboard.
    """
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        wallet = AdminWallet.get()

        total_credited = SuperAdminTransaction.objects.filter(
            txn_type="SA_CREDIT"
        ).aggregate(t=Sum("amount"))["t"] or 0

        total_debited = SuperAdminTransaction.objects.filter(
            txn_type="SA_DEBIT"
        ).aggregate(t=Sum("amount"))["t"] or 0

        total_transferred = SuperAdminTransaction.objects.filter(
            txn_type="ADM_TRANSFER"
        ).aggregate(t=Sum("amount"))["t"] or 0

        # Regular users only (not staff, not superuser)
        total_users = User.objects.filter(
            is_staff=False,
            is_superuser=False
        ).count()

        # Admins = is_staff=True, is_superuser=False (excludes the superuser)
        total_admins = User.objects.filter(
            is_staff=True,
            is_superuser=False
        ).count()

        return Response({
            "admin_wallet": {
                "cash":     float(wallet.cash_balance),
                "non_cash": float(wallet.non_cash_balance),
                "otp":      float(wallet.otp_balance),
            },
            "totals": {
                "credited":    float(total_credited),
                "debited":     float(total_debited),
                "transferred": float(total_transferred),
            },
            "counts": {
                "users":  total_users,
                "admins": total_admins,
            },
        })


# ─────────────────────────────────────────────────────────────────────────────
# SuperAdmin: create admin account
# ─────────────────────────────────────────────────────────────────────────────

class SuperAdminCreateAdminView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        ser = CreateAdminSerializer(data=request.data)
        if not ser.is_valid():
            return Response({
                "success": False,
                "error": "Validation failed.",
                "details": ser.errors
            }, status=400)

        try:
            user = ser.save()

            from authapp.models.user_model import AdminProfile
            AdminProfile.objects.create(user=user, role="admin")

            from authapp.models import ActivityLog
            ActivityLog.log(
                actor=request.user,
                action="staff_created",
                target_user=user,
                description=f"Admin account created by SuperAdmin. UID={user.user_uid}",
                ip_address=_get_ip(request),
            )

            return Response({
                "success":  True,
                "message":  "Admin account created successfully.",
                "user_uid": user.user_uid,
                "email":    user.email,
                "name":     user.name,
            }, status=201)

        except Exception as e:
            return Response({
                "success": False,
                "error": str(e)
            }, status=500)

# ─────────────────────────────────────────────────────────────────────────────
# SuperAdmin: list admin accounts
# ─────────────────────────────────────────────────────────────────────────────

class SuperAdminListAdminsView(APIView):
    """
    GET /super-admin/admins/
    Lists all staff admin accounts (is_staff=True, is_superuser=False).
    The superuser itself is excluded from this list.
    Supports ?q= search by name, email, uid.
    """
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        q = request.query_params.get("q", "").strip()

        # is_superuser=False ensures the superuser account never appears here
        qs = User.objects.filter(
            is_staff=True,
            is_superuser=False,
        ).order_by("-date_joined")

        if q:
            qs = qs.filter(
                Q(email__icontains=q) |
                Q(user_uid__icontains=q) |
                Q(name__icontains=q)
            )

        data = [
            {
                "id":          u.id,
                "user_uid":    u.user_uid,
                "email":       u.email,
                "name":        u.name,
                "is_active":   u.is_active,
                "date_joined": u.date_joined,
                "last_login":  u.last_login,
            }
            for u in qs
        ]
        return Response({"count": len(data), "results": data})


# ─────────────────────────────────────────────────────────────────────────────
# SuperAdmin: deactivate admin account
# ─────────────────────────────────────────────────────────────────────────────

class SuperAdminDeleteAdminView(APIView):
    """
    DELETE /super-admin/admins/<int:pk>/
    Soft-deactivates a staff admin account.
    The is_superuser=False guard ensures the superuser can never
    accidentally deactivate themselves through this endpoint.
    """
    permission_classes = [IsSuperAdmin]

    def delete(self, request, pk):
        # Prevent deactivating self
        if request.user.pk == pk:
            return Response({"error": "You cannot deactivate your own account."}, status=400)

        try:
            admin_user = User.objects.get(
                pk=pk,
                is_staff=True,
                is_superuser=False,   # can never touch the superuser row
            )
        except User.DoesNotExist:
            return Response({"error": "Admin not found."}, status=404)

        if not admin_user.is_active:
            return Response({"error": "Admin is already deactivated."}, status=400)

        admin_user.is_active = False
        admin_user.save(update_fields=["is_active"])

        from authapp.models import ActivityLog
        ActivityLog.log(
            actor=request.user,
            action="staff_created",
            target_user=admin_user,
            description=f"Admin account deactivated by SuperAdmin. UID={admin_user.user_uid}",
            ip_address=_get_ip(request),
        )

        return Response({"message": f"Admin {admin_user.email} has been deactivated."})


# ─────────────────────────────────────────────────────────────────────────────
# SuperAdmin: reactivate admin account
# ─────────────────────────────────────────────────────────────────────────────

class SuperAdminReactivateAdminView(APIView):
    """
    POST /super-admin/admins/<int:pk>/reactivate/
    Reactivates a previously deactivated staff admin account.
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        try:
            admin_user = User.objects.get(
                pk=pk,
                is_staff=True,
                is_superuser=False,
            )
        except User.DoesNotExist:
            return Response({"error": "Admin not found."}, status=404)

        if admin_user.is_active:
            return Response({"error": "Admin is already active."}, status=400)

        admin_user.is_active = True
        admin_user.save(update_fields=["is_active"])

        from authapp.models import ActivityLog
        ActivityLog.log(
            actor=request.user,
            action="staff_created",
            target_user=admin_user,
            description=f"Admin account reactivated by SuperAdmin. UID={admin_user.user_uid}",
            ip_address=_get_ip(request),
        )

        return Response({"message": f"Admin {admin_user.email} has been reactivated."})