"""
authapp/models/visitor_feedback_models.py
─────────────────────────────────────────────────────────────────────────────
VISITOR-FEEDBACK: what a visitor thinks of the site, left through the
"Feedback" side tab or the footer link on any public page.

Anonymous on purpose — name and email are optional, so somebody can say what
is wrong without signing up. That is why the public endpoint is throttled and
carries a honeypot, and why nothing stored here is ever shown on the site by
itself: the only way a row reaches visitors is an admin pressing "Publish as
testimonial", which copies it into the existing Testimonial list.
"""

from django.conf import settings
from django.db import models

CATEGORY_SUGGESTION = "suggestion"
CATEGORY_PROBLEM = "problem"
CATEGORY_COMPLIMENT = "compliment"
CATEGORY_OTHER = "other"

CATEGORY_CHOICES = [
    (CATEGORY_SUGGESTION, "Suggestion"),
    (CATEGORY_PROBLEM, "Problem or bug"),
    (CATEGORY_COMPLIMENT, "Compliment"),
    (CATEGORY_OTHER, "Other"),
]

STATUS_NEW = "new"
STATUS_REVIEWED = "reviewed"
STATUS_RESOLVED = "resolved"

STATUS_CHOICES = [
    (STATUS_NEW, "New"),
    (STATUS_REVIEWED, "Reviewed"),
    (STATUS_RESOLVED, "Resolved"),
]

MESSAGE_MAX = 2000

# What prompted the feedback. "manual" is the visitor opening the form
# themselves; the rest are the moments the site asks on its own, right after
# the visitor finishes something. Lets Back Office compare, say, the rating
# after registration with the rating after an enquiry.
TRIGGER_MANUAL = "manual"
# A thumb rather than stars: stored as rating 5 (helpful) or 1 (not helpful).
TRIGGER_PAGE_HELPFUL = "page_helpful"
TRIGGER_CHOICES = [
    (TRIGGER_MANUAL, "Opened by visitor"),
    ("experience_enquiry", "After an experience enquiry"),
    ("whatsapp_enquiry", "After the WhatsApp form"),
    ("registration", "After a game or event registration"),
    ("signup", "After signing up"),
    (TRIGGER_PAGE_HELPFUL, "Was this page helpful?"),
]


class VisitorFeedback(models.Model):
    """One piece of feedback from a site visitor."""

    rating = models.PositiveSmallIntegerField()  # 1–5, enforced by the serializer
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default=CATEGORY_OTHER)
    trigger = models.CharField(max_length=30, choices=TRIGGER_CHOICES, default=TRIGGER_MANUAL, db_index=True)
    message = models.TextField(blank=True)  # optional: a prompted rating may be a star alone

    # Optional — feedback is anonymous unless the visitor chooses otherwise.
    name = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)

    # Where it came from. Recorded by the frontend, never trusted for display
    # without escaping.
    page_path = models.CharField(max_length=300, blank=True)
    language = models.CharField(max_length=12, blank=True)
    country_code = models.CharField(max_length=8, blank=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="visitor_feedback",
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_NEW, db_index=True)
    admin_note = models.TextField(blank=True)

    # Set once an admin publishes this feedback as a testimonial. Kept so the
    # same feedback cannot be published twice.
    testimonial = models.ForeignKey(
        "authapp.Testimonial", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="source_feedback",
    )

    submitted_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.rating}★ {self.get_category_display()} — {self.name or 'anonymous'}"
