"""
authapp/views/user_kyc_views.py
────────────────────────────────────────────────────────────────────────────
User-facing KYC endpoints.

Endpoints:
  POST /api/kyc/submit/   — submit KYC documents (multipart/form-data)
  GET  /api/kyc/status/   — get current KYC status + reject reason
"""

import requests as http_req
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from authapp.models.kyc_model import KYCSubmission
from authapp.utils.file_validation import validate_uploaded_image


def _get_real_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _geo_lookup(ip):
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


class UserKYCSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        # Block resubmission if already approved
        if user.kyc_status == "approved":
            return Response({"error": "KYC already approved."}, status=400)

        ip  = _get_real_ip(request)
        geo = _geo_lookup(ip)

        # Pull form fields
        full_name       = request.data.get("full_name", user.name).strip()
        date_of_birth   = request.data.get("date_of_birth") or None
        document_type   = request.data.get("document_type", "").strip()
        document_number = request.data.get("document_number", "").strip()
        doc_front       = request.FILES.get("doc_front")
        doc_back        = request.FILES.get("doc_back")
        selfie          = request.FILES.get("selfie")
        id_proof_type   = request.data.get("id_proof_type", "").strip()
        id_proof_file   = request.FILES.get("id_proof_file")

        if not document_type or not document_number:
            return Response({"error": "Document type and number are required."}, status=400)

        if not doc_front or not selfie:
            return Response({"error": "Front document image and selfie are required."}, status=400)

        for f in (doc_front, doc_back, selfie, id_proof_file):
            if f:
                try:
                    validate_uploaded_image(f)
                except Exception as exc:
                    detail = exc.detail if hasattr(exc, "detail") else str(exc)
                    return Response({"error": str(detail)}, status=400)

        defaults = {
            "kyc_type":        "affiliate" if hasattr(user, "affiliate_profile") else "player",
            "full_name":       full_name,
            "date_of_birth":   date_of_birth,
            "document_type":   document_type,
            "document_number": document_number,
            "ip_address":      ip,
            "id_proof_type":   id_proof_type,
            "user_agent":      request.META.get("HTTP_USER_AGENT", ""),
            "geo_country":     geo.get("country", ""),
            "geo_city":        geo.get("city", ""),
            "geo_region":      geo.get("regionName", ""),
            "geo_isp":         geo.get("isp", ""),
            "geo_lat":         geo.get("lat"),
            "geo_lon":         geo.get("lon"),
            "status":          "pending",
            "reject_reason":   "",
        }

        # Only update file fields if new files were uploaded
        if doc_front:
            defaults["doc_front"] = doc_front
        if doc_back:
            defaults["doc_back"] = doc_back
        if selfie:
            defaults["selfie"] = selfie
        if id_proof_file:
            defaults["id_proof_file"] = id_proof_file

        kyc, created = KYCSubmission.objects.update_or_create(
            user=user,
            defaults=defaults,
        )

        user.kyc_status = "pending"
        user.save(update_fields=["kyc_status"])

        return Response({
            "message": "KYC submitted successfully. Under review.",
            "kyc_status": user.kyc_status,
        })


class UserKYCStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        try:
            kyc = KYCSubmission.objects.get(user=user)
            return Response({
                "kyc_status":    user.kyc_status,
                "is_verified":   user.is_verified,
                "reject_reason": kyc.reject_reason,
                "submitted_at":  kyc.submitted_at,
                "reviewed_at":   kyc.reviewed_at,
                "doc_front_url": kyc.doc_front.url if kyc.doc_front else None,
                "doc_back_url":  kyc.doc_back.url  if kyc.doc_back  else None,
                "selfie_url":    kyc.selfie.url     if kyc.selfie    else None,
                "id_proof_type":     kyc.id_proof_type,
                "id_proof_file_url": kyc.id_proof_file.url if kyc.id_proof_file else None,
            })
        except KYCSubmission.DoesNotExist:
            return Response({
                "kyc_status":    user.kyc_status,
                "is_verified":   user.is_verified,
                "reject_reason": "",
                "submitted_at":  None,
                "reviewed_at":   None,
            })