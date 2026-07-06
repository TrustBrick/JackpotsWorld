from django.db import models


class Registration(models.Model):
    # Core fields
    full_name = models.CharField(max_length=200)
    country = models.CharField(max_length=100)
    whatsapp_number = models.CharField(max_length=20)
    destination = models.CharField(max_length=200)
    package = models.CharField(max_length=200)

    # Notification preferences (what we can contact them about)
    interested_in_vip_deals = models.BooleanField(default=False)
    interested_in_pro_tips = models.BooleanField(default=False)

    # Automatic tracking fields
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")

    # Geo-location (resolved from IP)
    geo_country = models.CharField(max_length=100, blank=True, default="")
    geo_city = models.CharField(max_length=100, blank=True, default="")
    geo_region = models.CharField(max_length=100, blank=True, default="")
    geo_latitude = models.FloatField(null=True, blank=True)
    geo_longitude = models.FloatField(null=True, blank=True)
    geo_isp = models.CharField(max_length=200, blank=True, default="")
    geo_timezone = models.CharField(max_length=100, blank=True, default="")

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Registration"
        verbose_name_plural = "Registrations"
        indexes = [
            models.Index(fields=["country"]),
            models.Index(fields=["destination"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["interested_in_vip_deals"]),
            models.Index(fields=["interested_in_pro_tips"]),
        ]

    def __str__(self):
        return f"{self.full_name} — {self.destination} ({self.created_at.date()})"

    @property
    def contact_interests(self):
        """Returns a list of topics the user opted into."""
        interests = []
        if self.interested_in_vip_deals:
            interests.append("VIP Deals")
        if self.interested_in_pro_tips:
            interests.append("Pro Tips & Strategies")
        return interests