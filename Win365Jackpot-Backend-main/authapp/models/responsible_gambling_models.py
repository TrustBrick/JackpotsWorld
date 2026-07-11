from django.db import models
from django.conf import settings


class ResponsibleGamblingSettings(models.Model):
    """
    Self-service Responsible Gambling preferences. Stored and shown back to
    the user — not wired into deposit enforcement in this pass (that would
    touch the offline-deposit wallet flow, a separate, already-stabilized
    system out of scope here).
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rg_settings",
    )
    deposit_limit_daily   = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    deposit_limit_weekly  = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    deposit_limit_monthly = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cooling_off_until     = models.DateField(null=True, blank=True)
    self_exclusion_until  = models.DateField(null=True, blank=True)
    updated_at            = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"RG settings for {self.user}"
