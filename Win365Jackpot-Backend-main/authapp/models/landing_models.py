from django.db import models


class LandingSettings(models.Model):
    """Singleton (pk=1) holding the landing page's single-value text/media
    fields — Hero badge/CTA copy, background video, and shared blurbs reused
    across a couple of sections."""
    hero_badge_text         = models.CharField(max_length=200, default="Asia's #1 Offline Casinos VIP's Platform")
    hero_background_video   = models.FileField(upload_to="landing/", null=True, blank=True)
    hero_cta_primary_label  = models.CharField(max_length=60, default="🎰 Register — FREE")
    hero_cta_secondary_label = models.CharField(max_length=60, default="Packages ✨")
    hero_tagline             = models.CharField(max_length=100, default="www.jackpotsworld.casino")
    global_reach_tagline     = models.CharField(max_length=200, default="Experience World-Class Casino Gaming Across")
    trust_banner_heading     = models.CharField(max_length=200, default="Join 50,000+ Winning Players Across Asia")
    trust_banner_subtext     = models.TextField(blank=True, default="From first-time casino visitors to high-rollers — Jackpots World is your trusted partner for every bet.")
    whatsapp_number          = models.CharField(max_length=20, default="917795281999")
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
    logo        = models.ImageField(upload_to="landing/gifts/", null=True, blank=True)
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
    avatar       = models.ImageField(upload_to="landing/testimonials/", null=True, blank=True)
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
    media       = models.FileField(upload_to="landing/destinations/")
    media_type  = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES, default="image")
    label       = models.CharField(max_length=150, blank=True)
    order       = models.PositiveIntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.destination_id} — {self.label}"


class VipServiceImage(models.Model):
    image      = models.ImageField(upload_to="landing/vip-services/")
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
