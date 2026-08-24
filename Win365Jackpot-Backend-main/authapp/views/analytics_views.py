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
    • AdminAnalyticsVisitorsOverviewView  — GET analytics/visitors/overview/
    • AdminAnalyticsVisitorsView          — GET analytics/visitors/
    • AdminAnalyticsVisitorDetailView     — GET analytics/visitors/<visitor_id>/
    • AdminAnalyticsVisitorLocationsView  — GET analytics/visitor-locations/
    • AdminAnalyticsClicksView            — GET analytics/clicks/
    • AdminAnalyticsVideoViewersView      — GET analytics/videos/<content_id>/viewers/
    • AdminAnalyticsDiagnosticView        — GET analytics/diagnostic/

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
from authapp.services import analytics_service, visitor_service
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

        # Validate everything first, then hand the whole batch to the service
        # in one call. record_batch resolves the visitor, session and location
        # ONCE for the request instead of once per event — see its docstring.
        valid = []
        for raw in events[:_MAX_BATCH]:
            if not isinstance(raw, dict):
                continue
            ser = AnalyticsEventIngestSerializer(data=raw)
            if not ser.is_valid():
                continue
            valid.append(ser.validated_data)

        recorded = analytics_service.record_batch(request, valid)

        # Deliberately the only thing this endpoint ever returns. No visitor
        # id, no session id, no IP, no country — a public response must not
        # become a way for anyone to read back what we resolved about them
        # (§3/§23).
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


class AdminAnalyticsLocationsView(_AdminAnalyticsBase):
    """LOCATION-ANALYTICS: country -> region -> city breakdown across every
    video combined (the dashboard's aggregate "Viewers by Country" panel).
    The per-video breakdown is already included in video_detail's response
    (AdminAnalyticsVideoDetailView) — no separate endpoint needed there."""
    def get(self, request):
        s, e = self._range(request)
        return Response(analytics_service.location_report(s, e))


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


# ── Admin: visitor analytics ─────────────────────────────────────────────────
# Every view below is gated on IsAdminOrSuperAdmin, inherited from
# _AdminAnalyticsBase. That gate is what makes it safe for these responses to
# carry visitor IP addresses and locations — see analytics_models.py's privacy
# posture. A normal member hitting any of these gets a 403, and there is no
# public counterpart to any of them.
class AdminAnalyticsVisitorsOverviewView(_AdminAnalyticsBase):
    """Top-line visitor KPIs for the window."""

    def get(self, request):
        s, e = self._range(request)
        return Response(analytics_service.visitors_overview(s, e))


def _visitor_filters(request):
    """The filter set shared by the visitor list and the location rollup, read
    from the querystring in one place so the two can never interpret the same
    URL differently."""
    return {
        "country": request.GET.get("country") or None,
        "region": request.GET.get("region") or None,
        "city": request.GET.get("city") or None,
        "device": request.GET.get("device") or None,
        "source": request.GET.get("source") or None,
        "search": request.GET.get("search") or None,
    }


class AdminAnalyticsVisitorsView(_AdminAnalyticsBase):
    """Paginated Recent Visitors table.

    Paginated at the service layer (never returns the whole table) and
    filterable by country/region/city/device/source, which is what §22/§23
    ask for.
    """

    def get(self, request):
        s, e = self._range(request)
        try:
            page = int(request.GET.get("page", 1))
            page_size = int(request.GET.get("page_size", analytics_service.DEFAULT_PAGE_SIZE))
        except (TypeError, ValueError):
            page, page_size = 1, analytics_service.DEFAULT_PAGE_SIZE
        return Response(analytics_service.visitor_list(
            s, e, page=page, page_size=page_size, **_visitor_filters(request),
        ))


class AdminAnalyticsVisitorDetailView(_AdminAnalyticsBase):
    """One visitor: profile, sessions, pages, and the chronological timeline.

    The date range is applied to the ACTIVITY (timeline/counts) only when the
    caller asks for one — opening a visitor from the list should show their
    whole history, not just the slice that happened to be in view.
    """

    def get(self, request, visitor_id):
        if request.GET.get("range") or request.GET.get("start"):
            s, e = self._range(request)
        else:
            s = e = None
        data = analytics_service.visitor_detail(visitor_id, s, e)
        if data is None:
            return Response({"detail": "Visitor not found."}, status=404)
        return Response(data)


class AdminAnalyticsVisitorLocationsView(_AdminAnalyticsBase):
    """Visitors by country -> region -> city, across ALL visitors.

    Deliberately separate from AdminAnalyticsLocationsView above, which
    reports where the VIDEO viewers were. Both are real, different questions;
    merging them would make one of the two numbers wrong.
    """

    def get(self, request):
        s, e = self._range(request)
        return Response(analytics_service.visitor_locations(s, e, **_visitor_filters(request)))


class AdminAnalyticsClicksView(_AdminAnalyticsBase):
    """Click analytics: totals, unique clickers, and breakdowns by element,
    page, country, city, device and day."""

    def get(self, request):
        s, e = self._range(request)
        return Response(analytics_service.clicks_report(
            s, e,
            country=request.GET.get("country") or None,
            city=request.GET.get("city") or None,
            device=request.GET.get("device") or None,
            page_path=request.GET.get("page_path") or None,
        ))


class AdminAnalyticsVideoViewersView(_AdminAnalyticsBase):
    """Unique viewers of one video, broken down by location."""

    def get(self, request, content_id):
        s, e = self._range(request)
        return Response(analytics_service.video_viewers(
            content_id, s, e,
            country=request.GET.get("country") or None,
            city=request.GET.get("city") or None,
            device=request.GET.get("device") or None,
        ))


class AdminAnalyticsDiagnosticView(_AdminAnalyticsBase):
    """ANALYTICS DIAGNOSTIC (§28) — what the tracking pipeline sees for the
    request that called it.

    Admin-only and READ-ONLY: it resolves nothing into the database, creates
    no Visitor and no session, and records no event. It exists to answer, from
    inside production, the questions this feature's original bug turned on and
    that nothing else could answer:

      • Which header did the client IP actually come from? (If this ever says
        REMOTE_ADDR in production, every visitor is being recorded as the load
        balancer.)
      • Is Cloudflare sending CF-IPCountry at all? `cf_ipcountry_present`
        false is exactly the condition that used to blank out the whole
        location report.
      • Did the geolocation provider answer, and which provider is configured?

    Because it reports on the CALLER's own request, an admin loading it sees
    their own address and location — which is the point: it is a wiring test,
    not a way to look up a visitor.
    """

    def get(self, request):
        return Response(visitor_service.diagnostic(
            request,
            visitor_key=request.GET.get("visitor_id", ""),
            session_key=request.GET.get("session_id", ""),
        ))
