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


def _is_admin(user):
    return user.is_authenticated and user.is_staff


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


def _serialize_kyc(kyc):
    u = kyc.user
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
        "is_banned":    getattr(u, "is_banned", False),
        "ban_reason":   getattr(u, "ban_reason", ""),
        "banned_at":    getattr(u, "banned_at", None),

        # KYC submission details
        "full_name":       kyc.full_name,
        "date_of_birth":   kyc.date_of_birth,
        "document_type":   kyc.document_type,
        "document_number": kyc.document_number,
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

        qs = KYCSubmission.objects.select_related(
            "user", "reviewed_by"
        ).order_by("-submitted_at")

        if status_filter == "banned":
            # Show all KYC records where the user is currently banned
            qs = qs.filter(user__is_banned=True)
        elif status_filter in ("pending", "approved", "rejected"):
            qs = qs.filter(status=status_filter)

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
            return Response({"message": f"KYC rejected for {user.email}"})

        # ── Ban ──────────────────────────────────────────────────────────────
        elif action == "ban":
            user.is_banned   = True
            user.is_active   = False
            user.ban_reason  = reason
            user.banned_at   = now
            user.banned_by   = request.user
            user.save(update_fields=["is_banned", "is_active", "ban_reason", "banned_at", "banned_by"])

            kyc.reviewed_at = now
            kyc.reviewed_by = request.user
            kyc.save(update_fields=["reviewed_at", "reviewed_by"])

            ActivityLog.log(
                action="user_banned",
                actor=request.user,
                target_user=user,
                description=f"User banned: {user.email}. Reason: {reason}",
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            return Response({"message": f"{user.email} has been banned"})

        # ── Unban ─────────────────────────────────────────────────────────────
        elif action == "unban":
            user.is_banned  = False
            user.is_active  = True
            user.ban_reason = ""
            user.banned_at  = None
            user.banned_by  = None
            user.save(update_fields=["is_banned", "is_active", "ban_reason", "banned_at", "banned_by"])

            ActivityLog.log(
                action="user_unbanned",
                actor=request.user,
                target_user=user,
                description=f"User unbanned: {user.email}",
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            return Response({"message": f"{user.email} has been unbanned"})

        return Response({"error": "Invalid action. Use: approve | reject | ban | unban"}, status=400)