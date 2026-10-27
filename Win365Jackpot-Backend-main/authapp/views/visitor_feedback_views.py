"""
VISITOR-FEEDBACK views.

POST /api/feedback/ is the public side: the "Feedback" side tab and the footer
link on every public page post here. Anonymous, throttled, and guarded by a
honeypot field that real visitors never see.

The Back Office reads and works the same rows through the admin endpoints
below, and can copy a row into the Testimonials list — the only way feedback
ever appears on the site.
"""

import logging

from django.db import transaction
from django.db.models import Avg, Count, Max, Q
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from authapp.models.landing_models import Testimonial
from authapp.models.visitor_feedback_models import (
    LOW_RATING_ALERT_AT,
    PROMPT_EVENT_CHOICES,
    PROMPT_EVENT_DISMISSED,
    PROMPT_EVENT_SHOWN,
    STATUS_NEW,
    STATUS_REVIEWED,
    TRIGGER_CHOICES,
    TRIGGER_PAGE_HELPFUL,
    FeedbackPromptEvent,
    VisitorFeedback,
)
from authapp.permissions.super_admin_permissions import IsAdminOrSuperAdmin
from authapp.serializers.visitor_feedback_serializers import (
    PublishTestimonialSerializer,
    VisitorFeedbackAdminSerializer,
    VisitorFeedbackCreateSerializer,
)
from authapp.throttles import FeedbackPromptEventThrottle, VisitorFeedbackThrottle
from authapp.utils.client_ip import get_client_ip

logger = logging.getLogger(__name__)

# A field the form hides from people. Bots that fill every input fill this
# one too; such a submission is answered as if it worked and then dropped.
HONEYPOT_FIELD = "website"

THANK_YOU = "Thank you for your feedback!"


class VisitorFeedbackCreateView(generics.CreateAPIView):
    """POST /api/feedback/ — a visitor leaving feedback."""

    permission_classes = [AllowAny]
    throttle_classes = [VisitorFeedbackThrottle]
    serializer_class = VisitorFeedbackCreateSerializer

    def create(self, request, *args, **kwargs):
        if (request.data.get(HONEYPOT_FIELD) or "").strip():
            return Response({"message": THANK_YOU}, status=status.HTTP_201_CREATED)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user if request.user and request.user.is_authenticated else None
        extra = {}
        if user is not None:
            # Fill blanks from the account; anything the visitor typed wins.
            if not serializer.validated_data.get("name"):
                extra["name"] = (getattr(user, "name", "") or "")[:120]
            if not serializer.validated_data.get("email"):
                extra["email"] = user.email or ""

        feedback = serializer.save(
            user=user,
            status=STATUS_NEW,
            submitted_ip=get_client_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:1000],
            **extra,
        )
        _alert_support_if_low(feedback)
        return Response({"message": THANK_YOU}, status=status.HTTP_201_CREATED)


def _alert_support_if_low(feedback):
    """Email the support inbox about a 1-2 star rating, so a complaint does not
    wait for someone to open the Back Office tab.

    Best-effort, like the affiliate registration alert: an SMTP failure is
    logged and never turns the visitor's thank-you into an error. A page-helpful
    thumb-down is stored as 1 but is not a complaint, so it is skipped.
    """
    if feedback.rating > LOW_RATING_ALERT_AT or feedback.trigger == TRIGGER_PAGE_HELPFUL:
        return
    try:
        from authapp.services.email_service import build_message
        from authapp.utils.email_utils import SUPPORT_EMAIL

        who = feedback.name or (feedback.user.email if feedback.user_id else "") or "anonymous visitor"
        lines = [
            f"A visitor gave {feedback.rating} star(s) at: {feedback.get_trigger_display()}.",
            "",
            f"From: {who}",
            f"Email: {feedback.email or '-'}",
            f"Page: {feedback.page_path or '-'}",
            f"Country: {feedback.country_code or '-'}   Language: {feedback.language or '-'}",
            "",
            "Comment:",
            feedback.message or "(no comment)",
            "",
            "Open Back Office > Visitor Feedback to review it.",
        ]
        build_message(
            subject=f"Low feedback rating ({feedback.rating}/5): {feedback.get_trigger_display()}",
            body="\n".join(lines),
            to=[SUPPORT_EMAIL],
            user=feedback.user,
            triggered_by="visitor_feedback_low_rating",
            metadata={"feedback_id": feedback.id},
        ).send(fail_silently=False)
    except Exception:
        logger.exception("Low-rating feedback alert failed for feedback %s", feedback.pk)


class FeedbackPromptEventView(APIView):
    """POST /api/feedback/prompt-event/ — the popup was shown, or closed with
    no answer. Answers themselves are VisitorFeedback rows; together they give
    a response rate per moment. Anonymous and stores nothing but the moment."""

    permission_classes = [AllowAny]
    throttle_classes = [FeedbackPromptEventThrottle]

    def post(self, request):
        trigger = request.data.get("trigger")
        event = request.data.get("event")
        if trigger not in dict(TRIGGER_CHOICES) or event not in dict(PROMPT_EVENT_CHOICES):
            return Response({"error": "Unknown trigger or event."}, status=status.HTTP_400_BAD_REQUEST)
        FeedbackPromptEvent.objects.create(trigger=trigger, event=event)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Back Office ──────────────────────────────────────────────────────────────

def _filtered(params):
    qs = VisitorFeedback.objects.select_related("user").all()

    for field in ("status", "category", "trigger"):
        value = (params.get(field) or "").strip()
        if value:
            qs = qs.filter(**{field: value})

    rating = (params.get("rating") or "").strip()
    if rating.isdigit():
        qs = qs.filter(rating=int(rating))

    date_from = (params.get("from") or "").strip()
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    date_to = (params.get("to") or "").strip()
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)

    q = (params.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(message__icontains=q) | Q(name__icontains=q)
            | Q(email__icontains=q) | Q(page_path__icontains=q)
            | Q(user__email__icontains=q)
        )
    return qs


class AdminVisitorFeedbackListView(generics.ListAPIView):
    """GET /api/admin-panel/visitor-feedback/ — filter by status, category,
    trigger, rating, from/to date, and search `q` across message, name, email, page."""

    serializer_class = VisitorFeedbackAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]

    def get_queryset(self):
        return _filtered(self.request.query_params)


class AdminVisitorFeedbackSummaryView(APIView):
    """GET /api/admin-panel/visitor-feedback/summary/ — headline numbers for
    the whole list: total, average rating, unread count, rating spread."""

    permission_classes = [IsAdminOrSuperAdmin]

    def get(self, request):
        qs = VisitorFeedback.objects.all()
        # "Was this page helpful?" answers are a thumb, stored as 5 (yes) or
        # 1 (no). They get their own figure rather than dragging the star
        # average around.
        stars = qs.exclude(trigger=TRIGGER_PAGE_HELPFUL)
        helpful = qs.filter(trigger=TRIGGER_PAGE_HELPFUL)
        average = stars.aggregate(a=Avg("rating"))["a"]
        spread = {str(n): 0 for n in range(1, 6)}
        for row in stars.values("rating").annotate(n=Count("id")):
            spread[str(row["rating"])] = row["n"]
        by_trigger = {
            row["trigger"]: {"count": row["n"], "average": round(row["a"], 2)}
            for row in stars.values("trigger").annotate(n=Count("id"), a=Avg("rating"))
        }
        # Response rate per moment: popups shown against answers received. The
        # popup is the only way in now, so every non-manual row is an answer to
        # one; "manual" rows are older feedback from the removed button.
        events = {}
        for row in FeedbackPromptEvent.objects.values("trigger", "event").annotate(n=Count("id")):
            events.setdefault(row["trigger"], {})[row["event"]] = row["n"]
        answered = {r["trigger"]: r["n"] for r in qs.values("trigger").annotate(n=Count("id"))}
        prompts = {}
        for trigger_key, counts in events.items():
            shown = counts.get(PROMPT_EVENT_SHOWN, 0)
            got = answered.get(trigger_key, 0)
            prompts[trigger_key] = {
                "shown": shown,
                "dismissed": counts.get(PROMPT_EVENT_DISMISSED, 0),
                "answered": got,
                "response_rate": round(min(got / shown, 1.0) * 100) if shown else None,
            }
        return Response({
            "prompts": prompts,
            "total": qs.count(),
            "average_rating": round(average, 2) if average is not None else None,
            "new": qs.filter(status=STATUS_NEW).count(),
            "by_rating": spread,
            "by_trigger": by_trigger,
            "page_helpful": {
                "yes": helpful.filter(rating__gte=4).count(),
                "no": helpful.filter(rating__lte=2).count(),
            },
        })


class AdminVisitorFeedbackDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/admin-panel/visitor-feedback/<pk>/ — status and note only."""

    queryset = VisitorFeedback.objects.select_related("user").all()
    serializer_class = VisitorFeedbackAdminSerializer
    permission_classes = [IsAdminOrSuperAdmin]


class AdminPublishFeedbackView(APIView):
    """POST /api/admin-panel/visitor-feedback/<pk>/publish/ — copy feedback
    into the Testimonials list, shown on the site straight away.

    The admin may adjust the name, city and wording on the way (a visitor's
    typo or a surname they would rather not show). Publishing twice is refused,
    so one piece of feedback can never appear as two testimonials.
    """

    permission_classes = [IsAdminOrSuperAdmin]

    def post(self, request, pk):
        edits = PublishTestimonialSerializer(data=request.data)
        edits.is_valid(raise_exception=True)
        data = edits.validated_data

        with transaction.atomic():
            feedback = VisitorFeedback.objects.select_for_update().filter(pk=pk).first()
            if feedback is None:
                return Response({"error": "Feedback not found."}, status=status.HTTP_404_NOT_FOUND)
            if feedback.testimonial_id:
                return Response(
                    {"error": "This feedback is already published as a testimonial.",
                     "testimonial": feedback.testimonial_id},
                    status=status.HTTP_409_CONFLICT,
                )

            text = (data.get("text") or "").strip() or feedback.message
            if not text:
                return Response({"error": "A testimonial needs some text."},
                                status=status.HTTP_400_BAD_REQUEST)
            name = (data.get("name") or "").strip() or feedback.name.strip() or "JackpotsWorld Guest"
            next_order = (Testimonial.objects.aggregate(m=Max("order"))["m"] or 0) + 1
            testimonial = Testimonial.objects.create(
                name=name[:100],
                city=(data.get("city") or "").strip()[:100],
                country_code=(feedback.country_code or "")[:8],
                rating=feedback.rating,
                text=text,
                is_active=True,
                order=next_order,
            )
            feedback.testimonial = testimonial
            if feedback.status == STATUS_NEW:
                feedback.status = STATUS_REVIEWED
            feedback.save(update_fields=["testimonial", "status", "updated_at"])

        return Response(
            {"testimonial": testimonial.id,
             "feedback": VisitorFeedbackAdminSerializer(feedback).data},
            status=status.HTTP_201_CREATED,
        )
