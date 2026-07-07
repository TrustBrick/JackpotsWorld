from django.db import models


class Casino(models.Model):
    country = models.CharField(max_length=100, db_index=True)
    location = models.CharField(max_length=100, blank=True)
    name = models.CharField(max_length=150)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["country", "name"]
        unique_together = ("country", "name")

    def __str__(self):
        return f"{self.country} - {self.name}"