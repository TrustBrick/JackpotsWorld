"""
authapp/models/faq_models.py
─────────────────────────────────────────────────────────────────────────────
Back-Office-managed FAQ entries, for the landing page and the Affiliates page.

ONE model, `category` scoped, rather than a LandingFaq and an AffiliateFaq:
the two are the same thing (question, answer, order, on/off) shown in two
places, and splitting them would mean two admin tabs, two endpoints and two
components to keep in step for no gain.

WHY THIS EXISTS AT ALL — READ BEFORE CHANGING THE LANDING CATEGORY
──────────────────────────────────────────────────────────────────
The landing page's four questions were previously hardcoded in
components/BusinessModelFAQ.jsx, and the comment there gave the reason: they
are the compliance-critical statement of what this business is *not* ("Is
JackpotsWorld an online casino? No."), and they must not vanish because an API
call failed.

Making them editable does not weaken that, because two things preserve it:

  1. Migration 0085 seeds the exact four originals, so the page ships saying
     what it has always said and an admin has to deliberately change it.
  2. The frontend keeps those four as a LOCAL FALLBACK, rendered when the API
     returns nothing — an outage, a 500, an empty table. So the compliance
     wording survives the failure mode the original comment was guarding
     against, which a plain "fetch and render" would not.

What an admin *can* now do is edit or retire them. That is the requested
capability and it is a deliberate business decision, not an accident: the
audit trail is `updated_by` + `updated_at` below.
"""
from django.conf import settings
from django.db import models

# Where an FAQ renders. Adding a surface here is additive — an unknown
# category simply has no page reading it yet.
CATEGORY_LANDING = "landing"
CATEGORY_AFFILIATE = "affiliate"
CATEGORY_ANDHAR_BAHAR = "andhar_bahar"

FAQ_CATEGORY_CHOICES = [
    (CATEGORY_LANDING, "Landing Page"),
    (CATEGORY_AFFILIATE, "Affiliates Page"),
    (CATEGORY_ANDHAR_BAHAR, "Andhar Bahar"),
]

PUBLIC_FAQ_CATEGORIES = tuple(slug for slug, _ in FAQ_CATEGORY_CHOICES)


class FAQ(models.Model):
    category = models.CharField(
        max_length=20, choices=FAQ_CATEGORY_CHOICES, default=CATEGORY_LANDING, db_index=True,
    )
    question = models.CharField(max_length=300)
    answer = models.TextField()

    # Same three control columns every other Back-Office-managed content model
    # in this app uses (HeroStat, WhyChooseUsFeature, TrustBadge …), so the
    # admin table behaves identically and the reorder control is the same one.
    is_active = models.BooleanField(default=True, db_index=True)
    order = models.PositiveIntegerField(default=0)
    is_featured = models.BooleanField(default=False, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )

    class Meta:
        ordering = ["category", "order", "id"]
        indexes = [
            models.Index(fields=["category", "is_active", "order"]),
        ]
        verbose_name = "FAQ"
        verbose_name_plural = "FAQs"

    def __str__(self):
        return f"[{self.get_category_display()}] {self.question[:60]}"
