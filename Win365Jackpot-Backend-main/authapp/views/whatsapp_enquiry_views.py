"""
WHATSAPP-CAPTURE views.

POST /api/whatsapp-enquiries/ is the near side of the wa.me handoff: the
visitor leaves a name and a number, the row is written, and only then does
the frontend open WhatsApp. It must therefore be fast and it must not be
able to block the handoff — the frontend opens WhatsApp whether or not this
call succeeds, because a lost lead is better than a visitor who tapped
WhatsApp and got nothing.

The Back Office reads the same rows through the admin endpoints below.
"""

import logging

from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models import WhatsAppEnquiry
from authapp.models.landing_models import EnquiryMessage
from authapp.models.whatsapp_enquiry_models import (
    STATUS_CLICKED,
    STATUS_NEW,
    UPGRADEABLE_STATUSES,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.whatsapp_enquiry_serializers import (
    WhatsAppEnquiryAdminSerializer,
    WhatsAppEnquiryClickSerializer,
    WhatsAppEnquiryCreateSerializer,
)
from authapp.throttles import WhatsAppEnquiryThrottle
from authapp.utils.client_ip import get_client_ip

logger = logging.getLogger(__name__)


def resolve_button(source):
    """
    (button_label, section) for a button slug, from the Back Office row that
    owns it. ("", "") when the slug matches nothing.

    Looked up rather than accepted from the client because these two strings
    are what Back Office reads to decide which enquiry to chase — if a caller
    could set them, the lead list would describe whatever a crafted POST
    claimed rather than a button that exists.

    An unknown slug is NOT an error. See SOURCE_MAX in the model: a button can
    ship before anyone adds its Back Office row, and refusing the lead in that
    window would lose exactly the enquiries a new button was built to attract.
    The raw slug is still stored either way.
    """
    slug = (source or "").strip()
    if not slug:
        return "", ""
    row = EnquiryMessage.objects.filter(key=slug).only("label", "description").first()
    if row is None:
        return "", ""
    return (row.label or "")[:120], (row.description or "")[:200]


# Context a row carries but never asserts. Bounded here so one oversized
# referrer or pasted campaign string cannot make the lead list unreadable.
_CONTEXT_LIMITS = {
    "referrer": 500,
    "utm_source": 150, "utm_medium": 150, "utm_campaign": 150,
    "utm_content": 150, "utm_term": 150,
    "anonymous_id": 64, "session_key": 64,
}


def _context_fields(data):
    """Campaign/identity context from a request body, trimmed to fit."""
    out = {}
    for field, limit in _CONTEXT_LIMITS.items():
        value = data.get(field)
        if value:
            out[field] = str(value).strip()[:limit]
    return out


def identity_lookup(*, user, anonymous_id, source, session_key):
    """
    The key a repeat press resolves to.

    One row per (who, which button, which session). The reasoning:

      * Not one row per press — a visitor who taps twice because the first tap
        did not visibly do anything is one enquiry, and a lead list where that
        reads as two is a list nobody trusts.
      * Not one row per person per button forever — somebody asking about
        Vietnam in March and again in June is genuinely two enquiries, and
        collapsing them would bury the second, which is the one worth acting
        on. The session is the natural line between "still deciding" and
        "came back".

    `click_count` keeps the raw press count either way, so nothing is lost by
    not inserting.
    """
    lookup = {"source": (source or "").strip(), "session_key": (session_key or "").strip()}
    if user is not None:
        lookup["user"] = user
    else:
        lookup["user"] = None
        lookup["anonymous_id"] = (anonymous_id or "").strip()
    return lookup


class WhatsAppEnquiryCreateView(generics.CreateAPIView):
    """POST /api/whatsapp-enquiries/ — a visitor asking to be contacted.

    ANONYMOUS ON PURPOSE, and throttled for exactly that reason: requiring an
    account would defeat a public enquiry form, and every accepted POST is a
    durable row a host is expected to read.

    Everything forgeable is derived here rather than accepted. `user` comes
    from the request's own authentication if any, `submitted_ip` and
    `user_agent` from the request, and `status` is always the default. The
    create serializer does not expose those fields at all, so this is belt and
    braces rather than the only guard.
    """

    permission_classes = [AllowAny]
    throttle_classes = [WhatsAppEnquiryThrottle]
    serializer_class = WhatsAppEnquiryCreateSerializer

    def create(self, request, *args, **kwargs):
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)

        # A signed-in member has already told us who they are. Asking them to
        # retype it in front of a WhatsApp button is friction for no gain, so
        # the account fills the gaps and the frontend can skip the form
        # entirely for them. Only blanks are filled — anything the visitor
        # actually typed wins, because someone may be enquiring on behalf of
        # a different number to the one on their account.
        user = request.user if request.user and request.user.is_authenticated else None
        if user is not None:
            if not (data.get("name") or "").strip():
                data["name"] = (getattr(user, "name", "") or user.email or "Member")[:120]
            if not (data.get("whatsapp_number") or "").strip():
                account_number = (getattr(user, "phone", "") or "").strip()
                if account_number:
                    data["whatsapp_number"] = account_number
            # Same rule as the two above: fill the gap from the account, never
            # overwrite what the visitor actually typed. Somebody may be
            # enquiring on behalf of a different address to the one they signed
            # up with, and the one they just typed is the one they want used.
            if not (data.get("email") or "").strip():
                account_email = (getattr(user, "email", "") or "").strip()
                if account_email:
                    data["email"] = account_email

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        label, section = resolve_button(serializer.validated_data.get("source"))
        now = timezone.now()

        # WHATSAPP-LEADS: a press of this button in this session may already
        # have been recorded as a bare `clicked` row (the visitor reached the
        # form, or skipped it and came back). Complete that row rather than
        # leaving a click and a form side by side describing one enquiry.
        existing = self._pending_click(request, serializer.validated_data, user)
        if existing is not None:
            for field, value in serializer.validated_data.items():
                setattr(existing, field, value)
            existing.button_label = label
            existing.section = section
            existing.status = STATUS_NEW
            existing.last_clicked_at = now
            existing.save()
            enquiry = existing
        else:
            enquiry = serializer.save(
                user=user,
                submitted_ip=get_client_ip(request),
                user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:1000],
                button_label=label,
                section=section,
                status=STATUS_NEW,
                first_clicked_at=now,
                last_clicked_at=now,
                **_context_fields(request.data),
            )

        # Thin on purpose: an id and a line the visitor can be shown. Nothing
        # about other enquiries, and no echo of the stored staff fields.
        return Response(
            {"id": enquiry.id, "message": "Thank you — we will be in touch on WhatsApp."},
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _pending_click(request, data, user):
        """An un-worked row for this (who, button, session), or None."""
        session_key = (request.data.get("session_key") or "").strip()
        anonymous_id = (request.data.get("anonymous_id") or "").strip()
        if not session_key and user is None and not anonymous_id:
            # Nothing to match on: treat it as a fresh enquiry rather than
            # risk attaching these details to a stranger's row.
            return None
        lookup = identity_lookup(
            user=user, anonymous_id=anonymous_id,
            source=data.get("source", ""), session_key=session_key,
        )
        return (
            WhatsAppEnquiry.objects
            .filter(**lookup, status__in=UPGRADEABLE_STATUSES)
            .order_by("-id")
            .first()
        )


class WhatsAppEnquiryClickView(APIView):
    """
    POST /api/whatsapp-enquiries/click/ — somebody pressed a WhatsApp button.

    WHY THIS EXISTS ALONGSIDE THE FORM
    A visitor who presses "Continue without giving details", or who is shown no
    form at all, previously left nothing behind — not even which button they
    reached for. That is the single most useful thing about the press: it says
    what they wanted. This records it.

    A row written here claims only that a button was pressed. No name, no
    number, and status `clicked` so the lead list never presents it as
    somebody who asked to be contacted.

    MUST NOT SLOW THE HANDOFF. The frontend fires this with `keepalive` and
    does not wait for it; WhatsApp opens regardless, and the request may be cut
    off in flight. So nothing here may be load-bearing for the visitor, and the
    response is deliberately trivial.
    """

    permission_classes = [AllowAny]
    throttle_classes = [WhatsAppEnquiryThrottle]

    def post(self, request):
        serializer = WhatsAppEnquiryClickSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user if request.user and request.user.is_authenticated else None
        label, section = resolve_button(data.get("source"))
        now = timezone.now()

        lookup = identity_lookup(
            user=user,
            anonymous_id=data.get("anonymous_id", ""),
            source=data.get("source", ""),
            session_key=data.get("session_key", ""),
        )

        with transaction.atomic():
            existing = (
                WhatsAppEnquiry.objects
                .select_for_update()
                .filter(**lookup, status__in=UPGRADEABLE_STATUSES)
                .order_by("-id")
                .first()
            )
            if existing is not None:
                # Same button, same session: one intent. Count the press and
                # leave everything the visitor already told us alone.
                existing.click_count += 1
                existing.last_clicked_at = now
                existing.save(update_fields=["click_count", "last_clicked_at", "updated_at"])
                return Response({"id": existing.id, "recorded": True},
                                status=status.HTTP_200_OK)

            enquiry = WhatsAppEnquiry.objects.create(
                **lookup,
                button_label=label,
                section=section,
                email=data.get("email", ""),
                message=data.get("message", ""),
                page_path=data.get("page_path", ""),
                destination_number=data.get("destination_number", ""),
                country_code=data.get("country_code", ""),
                status=STATUS_CLICKED,
                click_count=1,
                first_clicked_at=now,
                last_clicked_at=now,
                submitted_ip=get_client_ip(request),
                user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:1000],
                **{k: v for k, v in _context_fields(data).items()
                   if k not in ("anonymous_id", "session_key")},
            )

        return Response({"id": enquiry.id, "recorded": True},
                        status=status.HTTP_201_CREATED)


# ── Back Office ──────────────────────────────────────────────────────────────

class AdminWhatsAppEnquiryListView(generics.ListAPIView):
    """GET /api/admin-panel/whatsapp-enquiries/ — the lead list.

    Filterable by `status` and searchable by `q` across name, number and
    message, because the two questions asked of this list are "who is waiting"
    and "did this person contact us before".
    """

    serializer_class = WhatsAppEnquiryAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        qs = WhatsAppEnquiry.objects.select_related("user").all()
        p = self.request.query_params

        status_filter = (p.get("status") or "").strip()
        if status_filter:
            qs = qs.filter(status=status_filter)

        # Which button. Exact, because the slug is a known vocabulary and a
        # partial match would silently mix "cruise_package" with anything
        # else containing it.
        source = (p.get("source") or "").strip()
        if source:
            qs = qs.filter(source=source)

        campaign = (p.get("campaign") or "").strip()
        if campaign:
            qs = qs.filter(utm_campaign__icontains=campaign)

        # "did a member ask, or a stranger" — the two are chased differently.
        who = (p.get("who") or "").strip().lower()
        if who == "guest":
            qs = qs.filter(user__isnull=True)
        elif who == "member":
            qs = qs.filter(user__isnull=False)

        date_from = (p.get("from") or "").strip()
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        date_to = (p.get("to") or "").strip()
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        q = (p.get("q") or "").strip()
        if q:
            from django.db.models import Q
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(whatsapp_number__icontains=q)
                | Q(message__icontains=q)
                | Q(button_label__icontains=q)
                | Q(user__email__icontains=q)
            )
        return qs


class AdminWhatsAppEnquiryDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/admin-panel/whatsapp-enquiries/<pk>/.

    Only `status` and `admin_note` are writable — see the admin serializer.
    What the visitor wrote is a record, not a draft.
    """

    queryset = WhatsAppEnquiry.objects.select_related("user").all()
    serializer_class = WhatsAppEnquiryAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]
