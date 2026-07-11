from django.db import models
from django.conf import settings


class Promotion(models.Model):
    country      = models.CharField(max_length=100, db_index=True)
    country_code = models.CharField(max_length=8, blank=True)  # ISO-3166 alpha-2, used to render the flag
    casino_name  = models.CharField(max_length=150, blank=True)
    casino_logo  = models.ImageField(upload_to="promotions/logos/", null=True, blank=True)
    image        = models.ImageField(upload_to="promotions/", null=True, blank=True)
    video        = models.FileField(upload_to="promotions/videos/", null=True, blank=True)
    title        = models.CharField(max_length=200)
    description  = models.TextField(blank=True)
    validity_text  = models.CharField(max_length=150, blank=True)
    bonus_details  = models.CharField(max_length=300, blank=True)
    benefits       = models.JSONField(default=list, blank=True)
    terms_conditions = models.TextField(blank=True)
    cta_label      = models.CharField(max_length=60, default="Claim Bonus")

    is_active  = models.BooleanField(default=True, db_index=True)
    order      = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="promotions_created",
    )

    class Meta:
        ordering = ["country", "order", "-created_at"]
        indexes = [models.Index(fields=["is_active", "country"])]

    def __str__(self):
        return f"{self.title} ({self.country})"


class PromotionGalleryImage(models.Model):
    """Extra gallery images for a promotion's details page, beyond the main
    banner (`Promotion.image`). Any number per promotion."""
    promotion  = models.ForeignKey(Promotion, on_delete=models.CASCADE, related_name="gallery")
    image      = models.ImageField(upload_to="promotions/gallery/")
    order      = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "created_at"]

    def __str__(self):
        return f"Gallery image for {self.promotion_id}"
