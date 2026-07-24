"""
authapp/models/two_factor_models.py
─────────────────────────────────────────────────────────────────────────────
TOTP-based Two-Factor Authentication, currently offered to Super Admin
accounts only (see authapp/views/two_factor_views.py). The TOTP secret and
backup-code hashes are the credential here, same trust boundary as any other
secret in this database — no extra field-level encryption beyond what MySQL
access control already provides.
"""
import secrets

from django.db import models
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password


class TwoFactorAuth(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="two_factor",
    )
    # Base32 TOTP secret (pyotp.random_base32()). Written on setup, only
    # takes effect once confirmed via /2fa/confirm/.
    secret = models.CharField(max_length=64)
    is_enabled = models.BooleanField(default=False, db_index=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"2FA for {self.user} ({'enabled' if self.is_enabled else 'pending'})"


def _generate_backup_code():
    # e.g. "K3F7-9QXP" — short enough to type, long enough to not be
    # brute-forceable within the login-throttle window.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
    half = lambda: "".join(secrets.choice(alphabet) for _ in range(4))
    return f"{half()}-{half()}"


class TwoFactorBackupCode(models.Model):
    two_factor = models.ForeignKey(
        TwoFactorAuth, on_delete=models.CASCADE, related_name="backup_codes",
    )
    code_hash = models.CharField(max_length=128)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["two_factor", "used_at"])]

    @classmethod
    def generate_set(cls, two_factor, count=8):
        """Replaces any existing backup codes with a fresh set. Returns the
        plaintext codes — the only time they're ever available in plaintext,
        show them to the user once and never again."""
        two_factor.backup_codes.all().delete()
        plaintext_codes = [_generate_backup_code() for _ in range(count)]
        cls.objects.bulk_create([
            cls(two_factor=two_factor, code_hash=make_password(code))
            for code in plaintext_codes
        ])
        return plaintext_codes

    @classmethod
    def try_consume(cls, two_factor, code):
        """Checks `code` against every unused backup code for this account;
        marks the first match used (one-time use) and returns True. Doesn't
        short-circuit on format — a small, fixed-size scan either way."""
        from django.utils import timezone
        for backup in two_factor.backup_codes.filter(used_at__isnull=True):
            if check_password(code, backup.code_hash):
                backup.used_at = timezone.now()
                backup.save(update_fields=["used_at"])
                return True
        return False
