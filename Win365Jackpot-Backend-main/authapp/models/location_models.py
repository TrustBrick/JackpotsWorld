from django.db import models


class SupportedLocation(models.Model):
    """Casino destination shown in the homepage scrolling locations ribbon."""
    name         = models.CharField(max_length=100)
    country_code = models.CharField(max_length=8, blank=True)  # ISO-3166 alpha-2, used to render the flag
    is_active    = models.BooleanField(default=True, db_index=True)
    order        = models.PositiveIntegerField(default=0)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return self.name
