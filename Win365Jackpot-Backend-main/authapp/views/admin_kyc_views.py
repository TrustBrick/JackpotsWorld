"""
authapp/views/admin_kyc_views.py
────────────────────────────────────────────────────────────────────────────
Admin KYC management views.

Endpoints:
  GET  /admin-panel/kyc/                  — list KYC submissions
  POST /admin-panel/kyc/<pk>/update/      — approve / reject / ban / unban
"""

import requests as http_req
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from authapp.models import User, ActivityLog
from authapp.models.kyc_model import KYCSubmission
from authapp.services.notification_service import notify_generic


def _is_admin(user):
    from authapp.permissions.admin_role_permissions import _has_capability
    return user.is_authenticated and user.is_staff and _has_capability(user, "can_approve_kyc")


def _geo_lookup(ip):
    """Free IP geolocation — no API key needed."""
    try:
        r = http_req.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "country,city,regionName,isp,lat,lon,status"},
            timeout=3,
        )
        data = r.json()
        if data.get("status") == "success":
            return data
    except Exception:
        pass
    return {}


def _latest_ban_log(user):
    """
    Ban/unban metadata (reason, actor, timestamp) is stored in ActivityLog
    rather than on the User model — the dedicated is_banned/ban_reason/
    banned_at/banned_by fields were removed. This looks up the most recent
    ban-related entry so the admin UI can still show why/when.
    """
    return (
        ActivityLog.objects
        .filter(target_user=user, action__in=["user_banned", "user_unbanned"])
        .order_by("-created_at")
        .first()
    )


def _serialize_kyc(kyc):
    u = kyc.user
    is_banned = not u.is_active
    ban_log = _latest_ban_log(u) if is_banned else None
    return {
        # User identity
        "id":           kyc.pk,
        "user_id":      u.pk,
        "user_uid":     u.user_uid,
        "email":        u.email,
        "name":         u.name,
        "phone":        u.phone,
        "date_joined":  u.date_joined,

        # KYC status flags
        "kyc_status":   u.kyc_status,
        "is_verified":  u.is_verified,
        "is_active":    u.is_active,
        "is_banned":    is_banned,
        "ban_reason":   (ban_log.description or "") if ban_log else "",
        "banned_at":    ban_log.created_at if ban_log else None,

        # KYC submission details
        "kyc_type":        kyc.kyc_type,
        "full_name":       kyc.full_name,
        "date_of_birth":   kyc.date_of_birth,
        "document_type":   kyc.document_type,
        "document_number": kyc.document_number,
        "id_proof_type":     kyc.id_proof_type,
        "id_proof_file_url": kyc.id_proof_file.url if kyc.id_proof_file else None,
        "submitted_at":    kyc.submitted_at,
        "reject_reason":   kyc.reject_reason,
        "status":          kyc.status,

        # Network / Geo
        "ip_address":  kyc.ip_address,
        "geo_country": kyc.geo_country,
        "geo_city":    kyc.geo_city,
        "geo_region":  kyc.geo_region,
        "geo_isp":     kyc.geo_isp,
        "geo_lat":     kyc.geo_lat,
        "geo_lon":     kyc.geo_lon,
        "user_agent":  kyc.user_agent,

        # Document URLs (None-safe)
        "doc_front_url": kyc.doc_front.url  if kyc.doc_front  else None,
        "doc_back_url":  kyc.doc_back.url   if kyc.doc_back   else None,
        "selfie_url":    kyc.selfie.url     if kyc.selfie     else None,

        # Review meta
        "reviewed_at":  kyc.reviewed_at,
        "reviewed_by":  kyc.reviewed_by.email if kyc.reviewed_by else None,
    }


# ─── List ─────────────────────────────────────────────────────────────────────

class AdminKYCListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)

        status_filter = request.query_params.get("status", "pending")
        type_filter   = request.query_params.get("type", "all")

        qs = KYCSubmission.objects.select_related(
            "user", "reviewed_by"
        ).order_by("-submitted_at")

        if status_filter == "banned":
            # Show all KYC records where the user is currently banned
            qs = qs.filter(user__is_active=False)
        elif status_filter in ("pending", "approved", "rejected"):
            qs = qs.filter(status=status_filter)

        if type_filter in ("player", "affiliate"):
            qs = qs.filter(kyc_type=type_filter)

        return Response([_serialize_kyc(k) for k in qs])


# ─── Update (approve / reject / ban / unban) ──────────────────────────────────

class AdminKYCUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=403)

        try:
            kyc = KYCSubmission.objects.select_related("user").get(pk=pk)
        except KYCSubmission.DoesNotExist:
            return Response({"error": "KYC record not found"}, status=404)

        user   = kyc.user
        action = request.data.get("action", "")   # approve | reject | ban | unban
        reason = request.data.get("reason", "").strip()
        now    = timezone.now()

        # ── Approve ──────────────────────────────────────────────────────────
        if action == "approve":
            user.kyc_status  = "approved"
            user.is_verified = True
            user.is_active   = True
            user.save(update_fields=["kyc_status", "is_verified", "is_active"])

            kyc.status      = "approved"
            kyc.reviewed_at = now
            kyc.reviewed_by = request.user
            kyc.reject_reason = ""
            kyc.save(update_fields=["status", "reviewed_at", "reviewed_by", "reject_reason"])

            ActivityLog.log(
                action="kyc_approved",
                actor=request.user,
                target_user=user,
                description=f"KYC approved for {user.email}",
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            notify_generic(
                user, "KYC Approved ✅",
                "Your KYC documents have been verified and approved.",
                icon="security",
            )
            return Response({"message": f"KYC approved for {user.email}"})

        # ── Reject ───────────────────────────────────────────────────────────
        elif action == "reject":
            user.kyc_status  = "rejected"
            user.is_verified = False
            user.save(update_fields=["kyc_status", "is_verified"])

            kyc.status        = "rejected"
            kyc.reviewed_at   = now
            kyc.reviewed_by   = request.user
            kyc.reject_reason = reason
            kyc.save(update_fields=["status", "reviewed_at", "reviewed_by", "reject_reason"])

            ActivityLog.log(
                action="kyc_rejected",
                actor=request.user,
                target_user=user,
                description=f"KYC rejected for {user.email}. Reason: {reason}",
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            notify_generic(
                user, "KYC Rejected",
                f"Your KYC submission was rejected. Reason: {reason}" if reason else "Your KYC submission was rejected.",
                icon="security",
            )
            return Response({"message": f"KYC rejected for {user.email}"})

        # ── Ban ──────────────────────────────────────────────────────────────
        elif action == "ban":
            user.is_active = False
            user.save(update_fields=["is_active"])

            kyc.reviewed_at = now
            kyc.reviewed_by = request.user
            kyc.save(update_fields=["reviewed_at", "reviewed_by"])

            ActivityLog.log(
                action="user_banned",
                actor=request.user,
                target_user=user,
                description=reason,
                meta={"reason": reason},
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            return Response({"message": f"{user.email} has been banned"})

        # ── Unban ─────────────────────────────────────────────────────────────
        elif action == "unban":
            user.is_active = True
            user.save(update_fields=["is_active"])

            ActivityLog.log(
                action="user_unbanned",
                actor=request.user,
                target_user=user,
                description=f"User unbanned: {user.email}",
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            return Response({"message": f"{user.email} has been unbanned"})

        return Response({"error": "Invalid action. Use: approve | reject | ban | unban"}, status=400)