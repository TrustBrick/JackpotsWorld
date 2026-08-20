"""
authapp/views/analytics_views.py
─────────────────────────────────────────────────────────────────────────────
ANALYTICS: the ingest endpoint, the trackable-link redirect, and the read-only
Admin dashboard endpoints.

  Public (api/):
    • AnalyticsEventIngestView   — POST /api/analytics/event/
    • CampaignClickRedirectView  — GET  /api/analytics/click/<tracking_id>/

  Admin (api/admin-panel/, IsAdminOrSuperAdmin):
    • AdminAnalyticsOverviewView     — GET analytics/overview/
    • AdminAnalyticsUrlsView         — GET analytics/urls/
    • AdminAnalyticsVideosView       — GET analytics/videos/
    • AdminAnalyticsVideoDetailView  — GET analytics/videos/<content_id>/
    • AdminAnalyticsCampaignsView    — GET analytics/campaigns/
    • AdminAnalyticsMemberView       — GET analytics/members/<user_id>/
    • AdminCampaignListCreateView / AdminCampaignDetailView — campaign CRUD

Identity is derived server-side (see analytics_service.record_event): a client
can never attribute an event to another member, and the admin endpoints are all
gated on the existing IsAdminOrSuperAdmin, so a normal member gets 403.
"""
from django.contrib.auth import get_user_model
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.analytics_models import Campaign
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.analytics_serializers import (
    AnalyticsEventIngestSerializer, CampaignSerializer,
)
from authapp.services import analytics_service
from authapp.throttles import AnalyticsIngestThrottle

User = get_user_model()

# Bound how many events one request may carry, so a single POST can't be used
# to bulk-insert. The client batches a handful (a page view + a few video
# milestones), never dozens.
_MAX_BATCH = 50


class AnalyticsEventIngestView(APIView):
    """Accepts one event object or {"events": [...]} and records each. Ingest
    is best-effort: a malformed event in a batch is skipped, never 400s the
    whole request, so one bad frame can't lose the good ones. Bots are dropped
    inside record_event and simply don't count toward `recorded`."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnalyticsIngestThrottle]

    def post(self, request):
        payload = request.data
        if isinstance(payload, dict) and "events" in payload:
            events = payload.get("events")
        else:
            events = [payload]
        if not isinstance(events, list):
            return Response({"error": "events must be a list"}, status=400)

        recorded = 0
        for raw in events[:_MAX_BATCH]:
            if not isinstance(raw, dict):
                continue
            ser = AnalyticsEventIngestSerializer(data=raw)
            if not ser.is_valid():
                continue
            d = ser.validated_data
            ev = analytics_service.record_event(
                request,
                event_type=d["event_type"],
                content_type=d["content_type"],
                content_id=d["content_id"],
                url=d["url"],
                referrer=d["referrer"],
                source=d["source"],
                utm=ser.to_utm(),
                metadata=d["metadata"],
                anonymous_id=d["anonymous_id"],
                session_id=d["session_id"],
            )
            if ev is not None:
                recorded += 1
        return Response({"recorded": recorded}, status=201 if recorded else 200)


def _safe_destination(url):
    """Only a same-site path or an http(s) absolute URL is allowed — never
    javascript:/data:/protocol-relative. destination_url is admin-set, so this
    is defense in depth against a bad value ever being stored."""
    url = (url or "").strip()
    if url.startswith("/") and not url.startswith("//"):
        return url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return "/"


class CampaignClickRedirectView(APIView):
    """A trackable campaign link: records a url_click, then 302s to the
    campaign's backend-controlled destination. The redirect happens even if
    recording fails — a broken analytics write must never break a real link."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, tracking_id):
        campaign = Campaign.objects.filter(tracking_id=tracking_id).first()
        dest = "/"
        if campaign is not None:
            if campaign.status != Campaign.STATUS_ENDED:
                try:
                    analytics_service.record_click(
                        request, campaign,
                        session_id=request.GET.get("sid", ""),
                        anonymous_id=request.GET.get("aid", ""),
                    )
                except Exception:  # pragma: no cover - best effort
                    pass
            dest = _safe_destination(campaign.destination_url)
        return HttpResponseRedirect(dest)


# ── Admin dashboard (read-only) ──────────────────────────────────────────────
class _AdminAnalyticsBase(APIView):
    permission_classes = [IsAdminOrSuperAdmin]

    def _range(self, request):
        return analytics_service.resolve_range(
            request.GET.get("range"), request.GET.get("start"), request.GET.get("end"),
        )


class AdminAnalyticsOverviewView(_AdminAnalyticsBase):
    def get(self, request):
        s, e = self._range(request)
        return Response(analytics_service.overview(s, e))


class AdminAnalyticsUrlsView(_AdminAnalyticsBase):
    def get(self, request):
        s, e = self._range(request)
        return Response(analytics_service.urls_report(s, e))


class AdminAnalyticsVideosView(_AdminAnalyticsBase):
    def get(self, request):
        s, e = self._range(request)
        return Response(analytics_service.videos_report(s, e))


class AdminAnalyticsVideoDetailView(_AdminAnalyticsBase):
    def get(self, request, content_id):
        s, e = self._range(request)
        return Response(analytics_service.video_detail(s, e, content_id))


class AdminAnalyticsCampaignsView(_AdminAnalyticsBase):
    def get(self, request):
        s, e = self._range(request)
        return Response(analytics_service.campaigns_report(s, e))


class AdminAnalyticsMemberView(_AdminAnalyticsBase):
    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        if request.GET.get("range") or request.GET.get("start"):
            s, e = self._range(request)
            return Response(analytics_service.member_engagement(user, s, e))
        return Response(analytics_service.member_engagement(user))


class AdminCampaignListCreateView(generics.ListCreateAPIView):
    queryset = Campaign.objects.all()
    serializer_class = CampaignSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminCampaignDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Campaign.objects.all()
    serializer_class = CampaignSerializer
    permission_classes = [IsAdminOrSuperAdmin]
