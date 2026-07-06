import logging
import requests
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from authapp.models.register_models import Registration

from authapp.serializers.register_serializers import (
    RegistrationCreateSerializer,
    RegistrationDetailSerializer,
    RegistrationListSerializer,
)

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def get_client_ip(request):
    """Extract real IP address, handling proxies and load balancers."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def resolve_geolocation(ip: str) -> dict:
    """
    Resolve IP → geo data using ip-api.com (free, no key needed, 1000 req/min).
    Falls back to empty dict on failure.
    """
    if not ip or ip in ("127.0.0.1", "::1", "localhost"):
        return {}
    try:
        url = f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city,lat,lon,isp,timezone"
        resp = requests.get(url, timeout=3)
        data = resp.json()
        if data.get("status") == "success":
            return {
                "geo_country": data.get("country", ""),
                "geo_region": data.get("regionName", ""),
                "geo_city": data.get("city", ""),
                "geo_latitude": data.get("lat"),
                "geo_longitude": data.get("lon"),
                "geo_isp": data.get("isp", ""),
                "geo_timezone": data.get("timezone", ""),
            }
    except Exception as exc:
        logger.warning("Geolocation lookup failed for IP %s: %s", ip, exc)
    return {}


# ──────────────────────────────────────────────────────────────────────────────
# Public endpoint — Registration
# ──────────────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    """
    POST /api/register/

    Accepts registration form data, enriches it with:
    - Client IP address
    - Geo-location (country, city, region, lat/lng, ISP, timezone)
    - User-Agent string

    Returns 201 on success with the registration ID.
    """
    serializer = RegistrationCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ip = get_client_ip(request)
    geo = resolve_geolocation(ip)
    user_agent = request.META.get("HTTP_USER_AGENT", "")

    registration = serializer.save(
        ip_address=ip or None,
        user_agent=user_agent,
        **geo,
    )

    logger.info(
        "New registration: %s from %s (%s, %s) — destination: %s, package: %s | "
        "VIP deals: %s, Pro tips: %s",
        registration.full_name,
        ip,
        geo.get("geo_city", "?"),
        geo.get("geo_country", "?"),
        registration.destination,
        registration.package,
        registration.interested_in_vip_deals,
        registration.interested_in_pro_tips,
    )

    return Response(
        {
            "id": registration.id,
            "message": "Registration successful. Our team will contact you shortly.",
        },
        status=status.HTTP_201_CREATED,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Admin-only endpoints
# ──────────────────────────────────────────────────────────────────────────────

class RegistrationPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


@api_view(["GET"])
@permission_classes([IsAdminUser])
def registration_list(request):
    """
    GET /api/admin/registrations/

    Returns paginated list of all registrations.
    Supports query params:
      - ?destination=Bali
      - ?country=India
      - ?interested_vip=true
      - ?interested_tips=true
    """
    qs = Registration.objects.all()

    destination = request.query_params.get("destination")
    if destination:
        qs = qs.filter(destination__icontains=destination)

    country = request.query_params.get("country")
    if country:
        qs = qs.filter(country__icontains=country)

    if request.query_params.get("interested_vip") == "true":
        qs = qs.filter(interested_in_vip_deals=True)

    if request.query_params.get("interested_tips") == "true":
        qs = qs.filter(interested_in_pro_tips=True)

    paginator = RegistrationPagination()
    page = paginator.paginate_queryset(qs, request)
    serializer = RegistrationListSerializer(page, many=True)
    return paginator.get_paginated_response(serializer.data)


@api_view(["GET", "DELETE"])
@permission_classes([IsAdminUser])
def registration_detail(request, pk):
    """
    GET  /api/admin/registrations/{id}/  — Full detail view
    DELETE /api/admin/registrations/{id}/ — Delete a registration
    """
    try:
        registration = Registration.objects.get(pk=pk)
    except Registration.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        serializer = RegistrationDetailSerializer(registration)
        return Response(serializer.data)

    registration.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def registration_stats(request):
    """
    GET /api/admin/registrations/stats/

    Returns aggregate stats for dashboard use.
    """
    from django.db.models import Count

    total = Registration.objects.count()
    vip_deals_opted_in = Registration.objects.filter(interested_in_vip_deals=True).count()
    pro_tips_opted_in = Registration.objects.filter(interested_in_pro_tips=True).count()
    by_destination = (
        Registration.objects.values("destination")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    by_country = (
        Registration.objects.values("country")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    by_package = (
        Registration.objects.values("package")
        .annotate(count=Count("id"))
        .order_by("-count")
    )

    return Response(
        {
            "total_registrations": total,
            "interested_in_vip_deals": vip_deals_opted_in,
            "interested_in_pro_tips": pro_tips_opted_in,
            "top_destinations": list(by_destination),
            "top_countries": list(by_country),
            "packages": list(by_package),
        }
    )