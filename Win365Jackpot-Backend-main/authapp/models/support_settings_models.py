# MULTILINGUAL-CHAT: new file — local preview feature, safe to delete entirely.
#
# Admin-configurable settings for the multilingual support ticket feature.
# Singleton (pk=1), same pattern as LandingSettings. `enabled` is the
# day-to-day on/off switch controlled from the Admin Panel; the hard master
# switch is settings.ENABLE_MULTILINGUAL_CHAT (env var) — when that's False,
# this row is never even consulted (see services/translation_service.py).
from django.db import models

TRANSLATION_PROVIDER_CHOICES = [
    ("mock", "Mock (offline, no external calls)"),
    ("openai", "OpenAI"),
    ("aws_translate", "AWS Translate"),
    ("google_translate", "Google Cloud Translate"),
]


class SupportSettings(models.Model):
    enabled = models.BooleanField(default=False)
    default_language = models.CharField(max_length=8, default="en")
    translation_provider = models.CharField(
        max_length=20, choices=TRANSLATION_PROVIDER_CHOICES, default="mock",
    )
    fallback_language = models.CharField(max_length=8, default="en")
    auto_detect_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return "Support Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
