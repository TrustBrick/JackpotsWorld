from django.conf import settings
from django.db import models


class LandingSettings(models.Model):
    """Singleton (pk=1) holding the landing page's single-value text/media
    fields — Hero badge/CTA copy, background video, and shared blurbs reused
    across a couple of sections."""
    hero_badge_text         = models.CharField(max_length=200, default="Asia's #1 Offline Casinos VIP's Platform")
    hero_background_video   = models.FileField(upload_to="landing/", max_length=255, null=True, blank=True)
    hero_cta_primary_label  = models.CharField(max_length=60, default="🎰 Register — FREE")
    hero_cta_secondary_label = models.CharField(max_length=60, default="Packages ✨")
    hero_tagline             = models.CharField(max_length=100, default="www.jackpotsworld.vip")
    global_reach_tagline     = models.CharField(max_length=200, default="Experience World-Class Casino Gaming Across")
    trust_banner_heading     = models.CharField(max_length=200, default="Join 50,000+ Winning Players Across Asia")
    trust_banner_subtext     = models.TextField(blank=True, default="From first-time casino visitors to high-rollers — Jackpots World is your trusted partner for every bet.")
    whatsapp_number          = models.CharField(max_length=20, default="919573807779")
    updated_at                = models.DateTimeField(auto_now=True)

    def __str__(self):
        return "Landing Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class HeroStat(models.Model):
    label      = models.CharField(max_length=60)
    value      = models.CharField(max_length=30)
    is_active  = models.BooleanField(default=True, db_index=True)
    order      = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.label}: {self.value}"


class WhyChooseUsFeature(models.Model):
    icon_name   = models.CharField(max_length=40, default="ShieldCheck")
    color       = models.CharField(max_length=20, default="#D4AF37")
    title       = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active   = models.BooleanField(default=True, db_index=True)
    order       = models.PositiveIntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class TrustBadge(models.Model):
    icon_name  = models.CharField(max_length=40, default="CheckCircle")
    color      = models.CharField(max_length=20, default="#34d399")
    label      = models.CharField(max_length=80)
    is_active  = models.BooleanField(default=True, db_index=True)
    order      = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.label


class GiftItem(models.Model):
    tier        = models.CharField(max_length=30, default="ELITE")
    tier_color  = models.CharField(max_length=20, default="#D4AF37")
    name        = models.CharField(max_length=120)
    subtitle    = models.CharField(max_length=200, blank=True)
    logo        = models.ImageField(upload_to="landing/gifts/", max_length=255, null=True, blank=True)
    value       = models.CharField(max_length=30, blank=True)
    description = models.TextField(blank=True)
    perks       = models.JSONField(default=list, blank=True)
    accent_color = models.CharField(max_length=20, default="#D4AF37")
    featured    = models.BooleanField(default=False)
    is_active   = models.BooleanField(default=True, db_index=True)
    order       = models.PositiveIntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.name


class GiftStep(models.Model):
    icon        = models.CharField(max_length=10, default="🎰")
    label       = models.CharField(max_length=80)
    description = models.CharField(max_length=200, blank=True)
    is_active   = models.BooleanField(default=True, db_index=True)
    order       = models.PositiveIntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.label


class VipTier(models.Model):
    label        = models.CharField(max_length=60)
    accent_color = models.CharField(max_length=20, default="#1e3a8a")
    accent_bg    = models.CharField(max_length=20, default="#eff6ff")
    is_active    = models.BooleanField(default=True, db_index=True)
    order        = models.PositiveIntegerField(default=0)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.label


class VipTierBenefit(models.Model):
    tier        = models.ForeignKey(VipTier, on_delete=models.CASCADE, related_name="benefits")
    name        = models.CharField(max_length=80)
    description = models.CharField(max_length=200, blank=True)
    order       = models.PositiveIntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.tier_id} — {self.name}"


class Testimonial(models.Model):
    name         = models.CharField(max_length=100)
    city         = models.CharField(max_length=100, blank=True)
    country_code = models.CharField(max_length=8, blank=True)
    rating       = models.PositiveSmallIntegerField(default=5)
    amount_won   = models.CharField(max_length=40, blank=True)
    destination  = models.CharField(max_length=80, blank=True)
    accent_color = models.CharField(max_length=20, default="#D4AF37")
    avatar       = models.ImageField(upload_to="landing/testimonials/", max_length=255, null=True, blank=True)
    text         = models.TextField(blank=True)
    is_active    = models.BooleanField(default=True, db_index=True)
    order        = models.PositiveIntegerField(default=0)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.name


class Destination(models.Model):
    name             = models.CharField(max_length=100)
    flag_country_code = models.CharField(max_length=8, blank=True)
    tagline          = models.CharField(max_length=150, blank=True)
    accent_color     = models.CharField(max_length=20, default="#D4AF37")
    casinos_text     = models.CharField(max_length=300, blank=True)
    best_for         = models.CharField(max_length=150, blank=True)
    is_active        = models.BooleanField(default=True, db_index=True)
    order            = models.PositiveIntegerField(default=0)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.name


class DestinationMedia(models.Model):
    MEDIA_TYPE_CHOICES = [("image", "Image"), ("video", "Video")]

    destination = models.ForeignKey(Destination, on_delete=models.CASCADE, related_name="images")
    media       = models.FileField(upload_to="landing/destinations/", max_length=255)
    media_type  = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES, default="image")
    label       = models.CharField(max_length=150, blank=True)
    order       = models.PositiveIntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.destination_id} — {self.label}"


class VipServiceImage(models.Model):
    image      = models.ImageField(upload_to="landing/vip-services/", max_length=255)
    label      = models.CharField(max_length=100, blank=True)
    category   = models.CharField(max_length=60, blank=True)
    is_active  = models.BooleanField(default=True, db_index=True)
    order      = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.label or f"VIP service image #{self.pk}"


class TourPackage(models.Model):
    name              = models.CharField(max_length=60)
    price             = models.CharField(max_length=30)
    icon              = models.CharField(max_length=10, default="🎰")
    color             = models.CharField(max_length=20, default="#D4AF37")
    badge             = models.CharField(max_length=40, blank=True)
    duration          = models.CharField(max_length=40, blank=True)
    flight            = models.CharField(max_length=60, blank=True)
    hotel             = models.CharField(max_length=80, blank=True)
    food              = models.CharField(max_length=60, blank=True)
    liquor            = models.CharField(max_length=100, blank=True)
    airport_vip       = models.BooleanField(default=False)
    jackpot_rewards   = models.BooleanField(default=False)
    vip_transport     = models.BooleanField(default=False)
    vip_transport_note = models.CharField(max_length=10, blank=True)
    spa               = models.BooleanField(default=False)
    spa_note          = models.CharField(max_length=10, blank=True)
    shopping_voucher  = models.BooleanField(default=False)
    shopping_note     = models.CharField(max_length=10, blank=True)
    visa              = models.BooleanField(default=False)
    is_active         = models.BooleanField(default=True, db_index=True)
    order             = models.PositiveIntegerField(default=0)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.name


class PremiumPartner(models.Model):
    """A hand-picked partner shown in the landing hero's media band.

    Deliberately standalone: no ForeignKey to Destination and no shared
    media table. The hero showcase, the Casino Destinations section and the
    location ticker are three independent systems, so editing a destination
    can never change what the hero shows, and featuring a partner here can
    never create or alter a destination.

    Media lives on the partner itself (one image and/or one video) rather
    than in a child table — the hero shows a single frame per partner, so a
    gallery would be state the UI has no way to express.
    """

    PARTNER_TYPE_CHOICES = [
        ("top_premium", "Top Premium Partner"),
        ("premium", "Premium Partner"),
        ("standard", "Standard Partner"),
    ]

    #: Only this type is eligible for the hero (see PremiumPartnerListView).
    HERO_PARTNER_TYPE = "top_premium"

    name              = models.CharField(max_length=150)
    country           = models.CharField(max_length=100, blank=True)
    city              = models.CharField(max_length=100, blank=True)
    # ISO-2, used for the caption flag. Same convention as Destination's own
    # flag_country_code field, but stored here so the hero never has to read
    # a destination row to render itself.
    flag_country_code = models.CharField(max_length=8, blank=True)
    description       = models.CharField(max_length=300, blank=True)

    # max_length=255: Django's FileField default (100) is too short for a
    # real uploaded filename plus the upload_to prefix — confirmed live, an
    # 86-character original filename plus "landing/partners/" (18 chars)
    # already exceeds 100 on the very first upload, before any storage
    # de-duplication suffix is even added. Storage.get_available_name()
    # then raises SuspiciousFileOperation, an *unhandled* exception that
    # surfaces to the frontend as an unparseable non-JSON 400 rather than a
    # clean validation message.
    logo       = models.ImageField(upload_to="landing/partners/logos/", max_length=255, null=True, blank=True)
    hero_image = models.ImageField(upload_to="landing/partners/", max_length=255, null=True, blank=True)
    hero_video = models.FileField(upload_to="landing/partners/", max_length=255, null=True, blank=True)

    partner_type        = models.CharField(
        max_length=20, choices=PARTNER_TYPE_CHOICES, default="top_premium", db_index=True,
    )
    is_featured_in_hero = models.BooleanField(default=True, db_index=True)
    is_active           = models.BooleanField(default=True, db_index=True)
    order               = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]
        indexes = [
            models.Index(fields=["is_active", "is_featured_in_hero", "partner_type", "order"]),
        ]

    def __str__(self):
        return self.name

    @property
    def media_type(self):
        """What the hero should render for this partner. A video wins when
        both are present — the image then serves as its poster."""
        if self.hero_video:
            return "video"
        if self.hero_image:
            return "image"
        return "none"


class SectionMedia(models.Model):
    """Cinematic hero media for the Teen Patti and Poker pages — the two side
    video/image cards and the low-opacity background watermark layer.

    Same shape as PremiumPartner (Back Office managed, image+video sharing
    the same upload validators) but scoped to a fixed visual slot rather
    than being an ordered, admin-curated list: each page has exactly three
    slots to fill, not a growing collection. Kept as its own model rather
    than extending PremiumPartner — that model is a specific business
    concept (a showcased partner casino) and conflating it with decorative
    page media would blur two unrelated things.

    `section` keeps Teen Patti and Poker media hard-separated at the model
    level: the two Back Office admin views (see views/landing_views.py)
    each hardcode which section they serve and force it on every write, so
    a row can never move between sections through the API.
    """

    SECTION_CHOICES = [("teen_patti", "Teen Patti"), ("poker", "Poker")]
    SLOT_CHOICES = [
        ("side_left", "Side Card — Left"),
        ("side_right", "Side Card — Right"),
        ("background", "Background Watermark"),
    ]

    section = models.CharField(max_length=20, choices=SECTION_CHOICES, db_index=True)
    slot = models.CharField(max_length=20, choices=SLOT_CHOICES, db_index=True)
    # Small badge shown on side cards — "FEATURED", "CASINO EXPERIENCE", or
    # left blank. Deliberately never a live-viewer count or "LIVE" claim:
    # this app has no real live-viewership data source, so any such number
    # would be fabricated.
    label = models.CharField(max_length=40, blank=True)

    # max_length=255 — see PremiumPartner's identical fields above for why
    # Django's 100-char FileField default isn't enough for a real uploaded
    # filename. Confirmed live with the exact failure this was meant to fix:
    # an 86-character real filename against upload_to="landing/section_media/"
    # (22 chars) is 108, already over 100 before any dedup suffix.
    video = models.FileField(upload_to="landing/section_media/", max_length=255, null=True, blank=True)
    poster_image = models.ImageField(upload_to="landing/section_media/posters/", max_length=255, null=True, blank=True)

    is_active = models.BooleanField(default=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )

    class Meta:
        unique_together = ("section", "slot")
        ordering = ["section", "slot"]

    def __str__(self):
        return f"{self.get_section_display()} — {self.get_slot_display()}"

    @property
    def media_type(self):
        if self.video:
            return "video"
        if self.poster_image:
            return "image"
        return "none"


class FeaturedDestinationShowcase(models.Model):
    """A promotional destination block on the landing page.

    Deliberately NOT part of DestinationMedia, and not a replacement for it.
    DestinationMedia is the destination *gallery* — many small images per
    destination, shown inside the destination card. This is one large
    promotional cut (usually video) with its own headline and call to action,
    rendered as a full landing-page section. The same destination legitimately
    has both: four gallery photos in DestinationMedia and one aftermovie here.
    Merging them would force one model to carry two unrelated sets of fields
    and would make the gallery's ordering meaningless.

    The Destination FK is the existing table — this feature never introduces a
    second source of destination names.
    """

    MEDIA_TYPE_CHOICES = [("image", "Image"), ("video", "Video")]

    destination = models.ForeignKey(
        Destination, on_delete=models.CASCADE, related_name="showcases",
    )
    title       = models.CharField(max_length=150)
    description = models.CharField(max_length=300, blank=True)
    media_type  = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES, default="video")

    # upload_to stays under landing/ on purpose: the S3 bucket policy grants
    # anonymous GetObject on landing/* (plus promotions/, teenpatti/, poker/,
    # events/, spin/, wheel/, avatars/). A new top-level prefix would not be
    # covered and every file would 403 in production — see
    # docs/MEDIA_ARCHITECTURE.md §3. max_length=255 for the same reason the
    # other media fields use it: real filenames exceed Django's 100 default.
    media = models.FileField(
        upload_to="landing/showcase/", max_length=255, null=True, blank=True,
    )
    # Optional narrow-viewport cut. When empty the main media is used
    # responsively, so this is purely an optimisation for heavy videos.
    mobile_media = models.FileField(
        upload_to="landing/showcase/", max_length=255, null=True, blank=True,
    )
    # Shown before a video plays and if it fails — the section never collapses
    # to an empty frame.
    poster_image = models.ImageField(
        upload_to="landing/showcase/posters/", max_length=255, null=True, blank=True,
    )

    cta_text = models.CharField(max_length=80, blank=True)
    # No cta_url field on purpose: the CTA always targets the existing
    # destinations section of the landing page, so an admin cannot point it at
    # an arbitrary (or unsafe) URL, and there is no second destination route to
    # keep in sync.

    is_active     = models.BooleanField(default=True, db_index=True)
    display_order = models.PositiveIntegerField(default=0)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "id"]
        indexes = [
            # Backs the public list: active rows in display order.
            models.Index(fields=["is_active", "display_order"]),
        ]

    def __str__(self):
        return f"{self.destination_id} — {self.title}"
