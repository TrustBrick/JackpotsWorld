# authapp/views/admin_views.py

from django.utils import timezone
from django.db.models import Q, Sum, Count
from django.contrib.auth.hashers import make_password
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework import status
from rest_framework.pagination import PageNumberPagination

from authapp.models import (
    User, AdminProfile, ActivityLog,
    WalletAccount, WalletTransaction,
    OTPRecord, PendingAdminCreation,
)
from authapp.serializers import (
    UserProfileSerializer,
    AdminProfileSerializer,
    ActivityLogSerializer,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_client_ip(request):
    x = request.META.get("HTTP_X_FORWARDED_FOR")
    return x.split(",")[0].strip() if x else request.META.get("REMOTE_ADDR")


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard
# ─────────────────────────────────────────────────────────────────────────────

from django.utils import timezone
from django.db.models import Q, Sum, Count, Max
from datetime import timedelta

class AdminStatsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        now = timezone.now()

        # ── Users ──────────────────────────────────────────────────
        total_users   = User.objects.filter(is_staff=False).count()
        active_users  = User.objects.filter(
            is_staff=False,
            last_login__gte=now - timedelta(hours=1)
        ).count()
        new_7d        = User.objects.filter(
            is_staff=False,
            date_joined__gte=now - timedelta(days=7)
        ).count()
        new_30d       = User.objects.filter(
            is_staff=False,
            date_joined__gte=now - timedelta(days=30)
        ).count()
        banned_users = User.objects.filter(is_staff=False, is_active=False).count()
        pending_kyc   = User.objects.filter(kyc_status="pending").count()
        verified_kyc  = User.objects.filter(kyc_status="approved").count()

        # ── Finance ────────────────────────────────────────────────
        total_deposited = WalletTransaction.objects.filter(
            transaction_type="DAC"
        ).aggregate(total=Sum("amount"))["total"] or 0

        total_won = WalletTransaction.objects.filter(
            transaction_type="WIN"
        ).aggregate(total=Sum("amount"))["total"] or 0

        total_withdrawn = WalletTransaction.objects.filter(
            transaction_type="WAC"
        ).aggregate(total=Sum("amount"))["total"] or 0

        total_lost = WalletTransaction.objects.filter(
            transaction_type="LAC"
        ).aggregate(total=Sum("amount"))["total"] or 0

        total_transferred = WalletTransaction.objects.filter(
            transaction_type="TAC"
        ).aggregate(total=Sum("amount"))["total"] or 0

        total_bonus = WalletTransaction.objects.filter(
            transaction_type__in=["LUB", "WBA", "MBA", "LUBNC", "LUBOT", "CBG", "CBGNC", "CBGOT"]
        ).aggregate(total=Sum("amount"))["total"] or 0

        total_otp = WalletTransaction.objects.filter(
            transaction_type__in=["CBGOT", "LUBOT"]
        ).aggregate(total=Sum("amount"))["total"] or 0

        total_rolling = WalletTransaction.objects.filter(
            transaction_type="ROP"
        ).aggregate(total=Sum("amount"))["total"] or 0

        # ── Current wallet balances (all users combined) ────────────
        wallet_balances = WalletAccount.objects.values("wallet_type").annotate(
            total=Sum("balance")
        )
        balances = {w["wallet_type"]: float(w["total"] or 0) for w in wallet_balances}

        # ── Transaction counts ─────────────────────────────────────
        tx_count_today = WalletTransaction.objects.filter(
            created_at__date=now.date()
        ).count()
        tx_count_30d = WalletTransaction.objects.filter(
            created_at__gte=now - timedelta(days=30)
        ).count()
        total_tx = WalletTransaction.objects.count()

        # ── VIP distribution ───────────────────────────────────────
        vip_distribution = {}
        for i in range(1, 9):
            vip_distribution[f"vip_{i}"] = User.objects.filter(
                is_staff=False, vip_level=i
            ).count()

        # ── Casino breakdown — top casinos by deposit volume ────────
        from authapp.models.offline_deposit import OfflineDepositLog
        casino_stats = (
            OfflineDepositLog.objects
            .values("casino_name")
            .annotate(
                visits=Count("id"),
                total_dep=Sum("total_deposited"),
            )
            .order_by("-total_dep")[:8]
        )
        casinos = [
            {
                "name":      c["casino_name"] or "Unknown",
                "visits":    c["visits"],
                "total_dep": float(c["total_dep"] or 0),
            }
            for c in casino_stats
        ]
        total_casino_visits = OfflineDepositLog.objects.count()
        unique_casinos      = OfflineDepositLog.objects.values("casino_name").distinct().count()

        return Response({
            "users": {
                "total":        total_users,
                "active_now":   active_users,   # logged in within last 1 hour
                "new_7d":       new_7d,
                "new_30d":      new_30d,
                "banned":       banned_users,
                "pending_kyc":  pending_kyc,
                "verified_kyc": verified_kyc,
            },
            "finance": {
                "total_deposited":   float(total_deposited),
                "total_won":         float(total_won),
                "total_withdrawn":   float(total_withdrawn),
                "total_lost":        float(total_lost),
                "total_transferred": float(total_transferred),
                "total_bonus":       float(total_bonus),
                "total_otp":         float(total_otp),
                "total_rolling_pts": float(total_rolling),
            },
            "wallet_balances": {
                "cash":           balances.get("C",  0),
                "non_cash":       balances.get("NC", 0),
                "otp":            balances.get("O",  0),
                "rolling_points": balances.get("RP", 0),
            },
            "transactions": {
                "total":     total_tx,
                "today":     tx_count_today,
                "last_30d":  tx_count_30d,
            },
            "vip_distribution": vip_distribution,
            "casinos": {
                "total_visits":   total_casino_visits,
                "unique_casinos": unique_casinos,
                "breakdown":      casinos,
            },
        })


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────
class AdminUserPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"

class AdminUserListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        search = request.query_params.get("q", "").strip()
        vip    = request.query_params.get("vip", "").strip()

        # ✅ FIX 3a: Removed kyc_status="approved" filter — it was hiding
        # banned users (whose KYC status may still be approved) and made
        # the admin unable to see/manage them at all.
        qs = User.objects.filter(is_staff=False).order_by("-date_joined")

        if search:
            qs = qs.filter(
                Q(email__icontains=search) |
                Q(name__icontains=search)  |
                Q(phone__icontains=search) |
                Q(user_uid__icontains=search)
            )

        if vip:
            qs = qs.filter(vip_level=vip)

        paginator = AdminUserPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = UserProfileSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


# ✅ FIX 3b: Removed the duplicate AdminUserDetailView class that appeared
# at the bottom of this file. Python silently uses the last definition,
# which was the stripped-down version that didn't handle is_banned /
# banned_at / banned_by / ban_reason — breaking the ban feature entirely.
class AdminUserDetailView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            user = User.objects.select_related("referred_by").get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        referred_users = (
            User.objects
            .filter(referred_by=user)
            .values("user_uid", "name")
        )

        data = UserProfileSerializer(user).data
        data["referred_by_uid"]  = user.referred_by.user_uid if user.referred_by else None
        data["referred_by_name"] = user.referred_by.name if user.referred_by else None
        data["referred_users"]   = [
            {"uid": r["user_uid"], "name": r["name"]}
            for r in referred_users
        ]

        return Response(data)

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        allowed = [
            "is_active",
            "kyc_status",
            "name",
            "phone",
            "country",
            "vip_level",
        ]

        for field in allowed:
            if field in request.data:
                setattr(user, field, request.data[field])

        user.save()

        action = "user_banned" if not user.is_active else "user_unbanned"
        ActivityLog.log(
            action=action,
            actor=request.user,
            target_user=user,
            ip_address=get_client_ip(request),
            description=f"{'Banned' if not user.is_active else 'Unbanned'} by {request.user.email}",
        )

        return Response(UserProfileSerializer(user).data)


# ─────────────────────────────────────────────────────────────────────────────
# Wallet (simple add — full logic is in admin_wallet_views.py)
# ─────────────────────────────────────────────────────────────────────────────

class AdminAddWalletView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        from authapp.views.admin_wallet_views import AdminWalletUpdateView
        request.data["user_id"] = pk
        return AdminWalletUpdateView().post(request)


class AdminAddBonusView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        amount = request.data.get("amount", 0)
        try:
            from decimal import Decimal
            amount = Decimal(str(amount))
        except Exception:
            return Response({"error": "Invalid amount."}, status=400)

        user.bonus_balance += amount
        user.save(update_fields=["bonus_balance"])

        ActivityLog.log(
            action="bonus_added", actor=request.user, 
            target_user=user,
            description=f"Bonus ${amount} added by admin.",
            ip_address=get_client_ip(request),
        )
        return Response({"message": "Bonus added.", "bonus_balance": user.bonus_balance})


# ─────────────────────────────────────────────────────────────────────────────
# VIP
# ─────────────────────────────────────────────────────────────────────────────

class AdminSetVIPView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        level = request.data.get("vip_level")
        if not level or not (1 <= int(level) <= 10):
            return Response({"error": "vip_level must be between 1 and 10."}, status=400)

        old_level  = user.vip_level
        user.vip_level = int(level)
        user.save(update_fields=["vip_level"])

        action = "vip_upgraded" if user.vip_level > old_level else "vip_downgraded"
        ActivityLog.log(
            action=action, actor=request.user,
            target_user=user,
            description=f"VIP changed from {old_level} to {user.vip_level}.",
            ip_address=get_client_ip(request),
        )
        return Response({"message": "VIP level updated.", "vip_level": user.vip_level})


# ─────────────────────────────────────────────────────────────────────────────
# Rewards
# ─────────────────────────────────────────────────────────────────────────────

class AdminCreateRewardView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        return Response({"message": "Reward created."}, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────────────────────
# Notifications
# ─────────────────────────────────────────────────────────────────────────────

class AdminSendNotificationView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        ActivityLog.log(
            action="notification_sent", actor=request.user,
            ip_address=get_client_ip(request),
        )
        return Response({"message": "Notification sent."})


# ─────────────────────────────────────────────────────────────────────────────
# Transactions
# ─────────────────────────────────────────────────────────────────────────────

WALLET_TYPE_MAP = {
    "cash":           "C",
    "non_cash":       "NC",
    "otp":            "O",
    "rolling_points": "RP",
    # pass-through raw keys too
    "c":  "C",
    "nc": "NC",
    "o":  "O",
    "rp": "RP",
}

class AdminTransactionListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        from authapp.serializers.wallet_serializers import WalletTransactionSerializer
        from django.core.paginator import Paginator

        q           = request.query_params.get("q", "").strip()
        txn_type    = request.query_params.get("transaction_type", "").strip().upper()
        wallet_raw  = request.query_params.get("wallet_type", "").strip()
        page        = int(request.query_params.get("page", 1))
        page_size   = int(request.query_params.get("page_size", 20))

        # Normalize wallet_type: accept "cash", "C", "non_cash", "NC", etc.
        wallet_type = WALLET_TYPE_MAP.get(wallet_raw.lower(), wallet_raw.upper()) if wallet_raw else ""

        qs = WalletTransaction.objects.select_related(
            "user", "wallet", "performed_by"
        ).order_by("-created_at")

        if txn_type:
            qs = qs.filter(transaction_type=txn_type)

        if wallet_type:
            qs = qs.filter(wallet__wallet_type=wallet_type)

        if q:
            qs = qs.filter(
                Q(transaction_reference__icontains=q) |
                Q(user__user_uid__icontains=q)        |
                Q(user__email__icontains=q)           |
                Q(user__name__icontains=q)
            )

        paginator = Paginator(qs, page_size)
        page_obj  = paginator.get_page(page)

        return Response({
            "count":   paginator.count,
            "results": WalletTransactionSerializer(page_obj.object_list, many=True).data,
        })


class AdminApproveTransactionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            txn = WalletTransaction.objects.get(pk=pk)
        except WalletTransaction.DoesNotExist:
            return Response({"error": "Transaction not found."}, status=404)

        txn.validation_status = "approved"
        txn.save(update_fields=["validation_status"])

        ActivityLog.log(
            action="transaction_approved", actor=request.user,
            ip_address=get_client_ip(request),
            meta={"txn_ref": txn.transaction_reference},
        )
        return Response({"message": "Transaction approved."})


# ─────────────────────────────────────────────────────────────────────────────
# KYC
# ─────────────────────────────────────────────────────────────────────────────

class AdminKYCListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        status_filter = request.query_params.get("status", "submitted")
        qs = User.objects.filter(kyc_status=status_filter).order_by("-date_joined")
        return Response(UserProfileSerializer(qs, many=True).data)


class AdminKYCUpdateView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        kyc_status = request.data.get("kyc_status")
        if kyc_status not in ["approved", "rejected", "pending", "submitted"]:
            return Response({"error": "Invalid kyc_status."}, status=400)

        user.kyc_status  = kyc_status
        user.is_verified = kyc_status == "approved"
        user.save(update_fields=["kyc_status", "is_verified"])

        action = "kyc_approved" if kyc_status == "approved" else "kyc_rejected"
        ActivityLog.log(
            action=action, actor=request.user,
            target_user=user, ip_address=get_client_ip(request),
        )
        return Response({"message": f"KYC {kyc_status}."})


# ─────────────────────────────────────────────────────────────────────────────
# Activity Logs
# ─────────────────────────────────────────────────────────────────────────────

class AdminActivityLogView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        log_type = request.query_params.get("type", "all")  # "user" | "admin" | "all"
        page     = int(request.query_params.get("page", 1))
        per      = int(request.query_params.get("page_size", 50))
        search   = request.query_params.get("q", "").strip()

        qs = ActivityLog.objects.select_related(
            "actor", "target_user"
        ).order_by("-created_at")

        # User logs = actions performed BY non-staff users ON themselves
        USER_ACTIONS = [
            "login", "logout", "register",
            "password_change", "otp_sent", "otp_verified",
            "profile_updated", "avatar_changed",
            "kyc_submitted",
        ]

        # Admin logs = financial + admin management actions
        ADMIN_ACTIONS = [
            "wallet_credit", "wallet_debit", "wallet_adjusted",
            "deposit_created", "withdrawal_created",
            "casino_visit_recorded", "casino_transfer",
            "bonus_added", "reward_created", "reward_claimed",
            "vip_upgraded", "vip_downgraded",
            "kyc_approved", "kyc_rejected",
            "user_banned", "user_unbanned",
            "admin_login", "admin_logout",
            "staff_created", "notification_sent",
            "rolling_points_added",
        ]

        if log_type == "user":
            qs = qs.filter(action__in=USER_ACTIONS)
        elif log_type == "admin":
            qs = qs.filter(action__in=ADMIN_ACTIONS)

        if search:
            qs = qs.filter(
                Q(target_user__email__icontains=search) |
                Q(actor__email__icontains=search) |
                Q(description__icontains=search) |
                Q(action__icontains=search)
            )

        total  = qs.count()
        offset = (page - 1) * per
        items  = qs[offset: offset + per]

        return Response({
            "count":   total,
            "page":    page,
            "results": ActivityLogSerializer(items, many=True).data,
        })


# ─────────────────────────────────────────────────────────────────────────────
# Staff
# ─────────────────────────────────────────────────────────────────────────────

class AdminStaffListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        profiles = AdminProfile.objects.select_related("user").filter(is_active=True)
        return Response(AdminProfileSerializer(profiles, many=True).data)

    def post(self, request):
        import random, string

        email      = request.data.get("email", "").strip()
        name       = request.data.get("name", "")
        password   = request.data.get("password", "")
        role       = request.data.get("role", "admin")
        mobile     = request.data.get("mobile", "")
        department = request.data.get("department", "")

        if not email or not password:
            return Response({"error": "Email and password are required."}, status=400)

        if User.objects.filter(email=email).exists():
            return Response({"error": "Email already registered."}, status=400)

        otp = "".join(random.choices(string.digits, k=6))
        PendingAdminCreation.objects.update_or_create(
            email=email,
            defaults={
                "name":         name,
                "password":     make_password(password),
                "role":         role,
                "mobile":       mobile,
                "department":   department,
                "otp":          otp,
                "expires_at":   timezone.now() + timezone.timedelta(minutes=10),
                "initiated_by": request.user,
            }
        )
        ActivityLog.log(
            action="staff_creation_initiated", actor=request.user,
            description=f"Staff creation initiated for {email}",
            ip_address=get_client_ip(request),
            meta={"email": email, "otp": otp},
        )
        return Response({"message": "OTP sent. Confirm to complete staff creation."})


class AdminStaffConfirmView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        email = request.data.get("email", "").strip()
        otp   = request.data.get("otp", "").strip()

        try:
            pending = PendingAdminCreation.objects.get(email=email)
        except PendingAdminCreation.DoesNotExist:
            return Response({"error": "No pending request for this email."}, status=404)

        if pending.otp != otp:
            return Response({"error": "Invalid OTP."}, status=400)

        if pending.expires_at < timezone.now():
            return Response({"error": "OTP has expired."}, status=400)

        user = User.objects.create(
            email=email,
            name=pending.name,
            password=pending.password,
            is_staff=True,
            is_active=True,
        )
        AdminProfile.objects.create(
            user=user,
            role=pending.role,
            mobile=pending.mobile,
            department=pending.department,
        )
        pending.delete()

        ActivityLog.log(
            action="staff_created", actor=request.user,
            description=f"Staff account created: {email}",
            ip_address=get_client_ip(request),
        )
        return Response({"message": f"Staff account created for {email}."})


class AdminStaffDetailView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            profile = AdminProfile.objects.select_related("user").get(user_id=pk)
        except AdminProfile.DoesNotExist:
            return Response({"error": "Staff not found."}, status=404)
        return Response(AdminProfileSerializer(profile).data)

    def patch(self, request, pk):
        try:
            profile = AdminProfile.objects.get(user_id=pk)
        except AdminProfile.DoesNotExist:
            return Response({"error": "Staff not found."}, status=404)

        allowed = ["role", "mobile", "department", "notes",
                   "can_edit_users", "can_manage_finance",
                   "can_approve_kyc", "can_send_notifs", "can_manage_vip"]
        for field in allowed:
            if field in request.data:
                setattr(profile, field, request.data[field])
        profile.save()
        return Response(AdminProfileSerializer(profile).data)


class AdminStaffRequestDeleteView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        return Response({"message": "Delete request submitted for review."})


class AdminStaffDeleteView(APIView):
    permission_classes = [IsAdminUser]

    def delete(self, request, pk):
        try:
            user = User.objects.get(pk=pk, is_staff=True)
        except User.DoesNotExist:
            return Response({"error": "Staff not found."}, status=404)

        user.is_active = False
        user.save(update_fields=["is_active"])
        ActivityLog.log(
            action="user_banned", actor=request.user,
            target_user=user, ip_address=get_client_ip(request),
            description="Staff account deactivated.",
        )
        return Response({"message": "Staff account deactivated."})


# ─────────────────────────────────────────────────────────────────────────────
# Deposits
# ─────────────────────────────────────────────────────────────────────────────

class AdminOfflineDepositsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        from authapp.serializers.wallet_serializers import WalletTransactionSerializer
        qs = WalletTransaction.objects.filter(
            transaction_type="DAC",
            validation_status="pending",
        ).select_related("user", "wallet").order_by("-created_at")
        return Response(WalletTransactionSerializer(qs, many=True).data)


class AdminDepositHistoryView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        from authapp.serializers.wallet_serializers import WalletTransactionSerializer
        qs = WalletTransaction.objects.filter(
            transaction_type="DAC"
        ).select_related("user", "wallet").order_by("-created_at")[:200]
        return Response(WalletTransactionSerializer(qs, many=True).data)


# ─────────────────────────────────────────────────────────────────────────────
# Spin Wheel
# ─────────────────────────────────────────────────────────────────────────────

class AdminSpinWheelConfigView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({"message": "Spin wheel config endpoint — model not yet wired."})

    def post(self, request):
        ActivityLog.log(
            action="spin_wheel_updated", actor=request.user,
            ip_address=get_client_ip(request),
        )
        return Response({"message": "Spin wheel updated."})


class AdminSpinPrizeImageView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        return Response({"message": "Image upload endpoint — storage not yet wired."})


# ─────────────────────────────────────────────────────────────────────────────
# Casino Visits
# ─────────────────────────────────────────────────────────────────────────────

class AdminCasinoVisitView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({"message": "Casino visits endpoint — model not yet wired."})

    def post(self, request):
        ActivityLog.log(
            action="casino_visit_recorded", actor=request.user,
            ip_address=get_client_ip(request),
        )
        return Response({"message": "Casino visit recorded."}, status=status.HTTP_201_CREATED)


class AdminCasinoVisitDeleteView(APIView):
    permission_classes = [IsAdminUser]

    def delete(self, request, pk):
        return Response({"message": f"Casino visit {pk} deleted."})