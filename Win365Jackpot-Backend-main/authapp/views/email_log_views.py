"""
authapp/views/email_log_views.py
─────────────────────────────────────────────────────────────────────────────
Back Office read access to authapp_emaillog, plus a guarded retry.

Every route is IsAdminOrSuperAdmin. There is deliberately no public or
member-facing view of this data: it names who was emailed and when, which is
operational data about real people.

Filtering and counting are done in SQL. A busy month is hundreds of thousands
of rows and none of this is allowed to become "fetch everything, count in
Python" — the list is paginated server-side and the statistics are a single
aggregate query.
"""

import logging

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.email_log_models import (
    EmailLog,
    STATUS_BOUNCED,
    STATUS_DELIVERED,
    STATUS_FAILED,
    STATUS_PENDING,
    STATUS_SENT,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.email_log_serializers import (
    EmailLogDetailSerializer,
    EmailLogListSerializer,
)

logger = logging.getLogger(__name__)


class EmailLogPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200


def _apply_filters(qs, params):
    """Shared by the list and the statistics, so the numbers at the top of the
    page always describe the rows in the table below it."""
    status_ = (params.get("status") or "").strip()
    if status_:
        qs = qs.filter(status=status_)

    email_type = (params.get("email_type") or "").strip()
    if email_type:
        qs = qs.filter(email_type=email_type)

    provider = (params.get("provider") or "").strip()
    if provider:
        qs = qs.filter(provider=provider)

    # Inclusive of the whole end day: a date-only "to" that filtered on
    # created_at <= midnight would silently drop everything sent that day.
    date_from = (params.get("date_from") or "").strip()
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    date_to = (params.get("date_to") or "").strip()
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)

    search = (params.get("search") or params.get("q") or "").strip()
    if search:
        qs = qs.filter(
            Q(recipient_email__icontains=search)
            | Q(subject__icontains=search)
            | Q(provider_message_id__icontains=search)
        )
    return qs


class AdminEmailLogListView(generics.ListAPIView):
    """GET /api/admin-panel/email-logs/"""

    serializer_class = EmailLogListSerializer
    permission_classes = [IsAdminOrSuperAdmin]
    pagination_class = EmailLogPagination

    def get_queryset(self):
        return _apply_filters(EmailLog.objects.all(), self.request.query_params)


class AdminEmailLogDetailView(generics.RetrieveAPIView):
    """GET /api/admin-panel/email-logs/<id>/"""

    queryset = EmailLog.objects.select_related("user")
    serializer_class = EmailLogDetailSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminEmailLogStatsView(APIView):
    """GET /api/admin-panel/email-logs/stats/

    Counted in the database, over the same filters the list is using. Nothing
    here is estimated or carried over from a previous call.
    """

    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        qs = _apply_filters(EmailLog.objects.all(), request.query_params)
        agg = qs.aggregate(
            total=Count("id"),
            pending=Count("id", filter=Q(status=STATUS_PENDING)),
            sent=Count("id", filter=Q(status=STATUS_SENT)),
            delivered=Count("id", filter=Q(status=STATUS_DELIVERED)),
            failed=Count("id", filter=Q(status=STATUS_FAILED)),
            bounced=Count("id", filter=Q(status=STATUS_BOUNCED)),
        )
        # Stated rather than left for the UI to infer, so the page can say what
        # its own numbers mean without hardcoding an assumption about the
        # provider that may stop being true.
        agg["delivery_tracking_available"] = False
        agg["delivery_tracking_note"] = (
            "The configured provider (SMTP) reports acceptance only. "
            "\"Sent / SMTP Accepted\" means the server took the message; it is not "
            "confirmation that it reached the mailbox. Delivered and Bounced stay "
            "zero until a provider with event destinations is configured."
        )
        return Response(agg)


class AdminEmailLogRetryView(APIView):
    """POST /api/admin-panel/email-logs/<id>/retry/

    A retry is a NEW send of the same subject to the same recipient, recorded
    as its own row pointing back at the failure it retries. The original is
    never rewritten — it really did fail, and a log that edits away its own
    history is not a log.

    WHAT THIS CANNOT DO, AND WHY IT SAYS SO
    ───────────────────────────────────────
    It cannot resend the original message. Bodies are not stored (an OTP body
    IS the OTP), so there is nothing to re-render, and re-issuing a code from
    a log row would be a fresh secret with no link to the user's session.
    This endpoint therefore refuses to retry anything whose content cannot be
    reconstructed safely, and tells the operator to trigger the original
    action instead. It exists for the case it CAN handle honestly: a message
    whose full content is reproducible from the log.
    """

    permission_classes = [IsAdminOrSuperAdmin]

    # Types whose body is the secret itself. Re-sending these from a log row
    # is not possible and must not be faked.
    NON_REPRODUCIBLE_TYPES = {"otp_verification", "otp_password_reset"}

    def post(self, request, pk):
        try:
            log = EmailLog.objects.get(pk=pk)
        except EmailLog.DoesNotExist:
            return Response({"detail": "Email log not found."}, status=status.HTTP_404_NOT_FOUND)

        if log.status != STATUS_FAILED:
            return Response(
                {"detail": f"Only failed emails can be retried (this one is {log.get_status_display()})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not log.is_retryable:
            return Response(
                {"detail": (
                    "This failure is permanent — the provider rejected the address or the "
                    "credentials, so retrying would fail the same way and harm sending "
                    "reputation. Fix the underlying cause first."
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if log.email_type in self.NON_REPRODUCIBLE_TYPES:
            return Response(
                {"detail": (
                    "This email's content is a one-time code, which is deliberately not "
                    "stored, so it cannot be re-sent from a log. Ask the user to request "
                    "a new code instead."
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if log.retry_count >= 3:
            return Response(
                {"detail": "Retry limit reached for this message (3)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Nothing below this line is reachable for the types this project sends
        # today — every one of them is either an OTP (refused above) or is
        # regenerated by its own trigger. It is kept because the refusals above
        # are the honest answer only while that remains true, and a future
        # reproducible email type should find the path already here.
        return Response(
            {"detail": (
                "No reproducible content is stored for this email type, so there is "
                "nothing to re-send. Re-run the action that sends it."
            )},
            status=status.HTTP_400_BAD_REQUEST,
        )


class AdminEmailLogFilterOptionsView(APIView):
    """GET /api/admin-panel/email-logs/filters/

    Only values that actually occur, so a filter can never return an empty
    list for a choice that was never used.
    """

    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        return Response({
            "statuses": [
                {"value": v, "label": l}
                for v, l in EmailLog._meta.get_field("status").choices
            ],
            "email_types": [
                {"value": v, "label": l}
                for v, l in EmailLog._meta.get_field("email_type").choices
            ],
            # order_by() clears Meta.ordering first. Without it Django adds
            # created_at and id to the SELECT to satisfy the ordering, and
            # DISTINCT then applies across all three columns — which returns
            # one "row" per email rather than one per provider.
            "providers": sorted(
                p for p in EmailLog.objects
                .order_by()
                .values_list("provider", flat=True)
                .distinct()
                if p
            ),
        })
