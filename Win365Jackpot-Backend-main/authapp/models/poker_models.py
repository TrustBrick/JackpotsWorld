from django.db import models
from django.conf import settings

STATUS_CHOICES = [
    ("upcoming",  "Upcoming"),
    ("live",      "Live"),
    ("completed", "Completed"),
]


class PokerTournament(models.Model):
    image       = models.ImageField(upload_to="poker/", null=True, blank=True)
    name        = models.CharField(max_length=200)
    casino_name = models.CharField(max_length=150, blank=True)
    location    = models.CharField(max_length=150, blank=True)
    event_date  = models.DateField(db_index=True)
    event_time  = models.TimeField(null=True, blank=True)
    prize_pool  = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    buy_in      = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default="upcoming", db_index=True)
    description = models.TextField(blank=True)
    seats_available = models.PositiveIntegerField(null=True, blank=True)

    is_active  = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="poker_tournaments_created",
    )

    class Meta:
        ordering = ["-event_date", "-event_time"]
        indexes = [models.Index(fields=["is_active", "event_date"])]

    def __str__(self):
        return f"{self.name} ({self.casino_name})"


class PokerRegistration(models.Model):
    tournament = models.ForeignKey(PokerTournament, on_delete=models.CASCADE, related_name="registrations")
    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="poker_registrations")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("tournament", "user")

    def __str__(self):
        return f"{self.user} -> {self.tournament}"
