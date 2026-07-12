"""
authapp/utils/two_factor.py
─────────────────────────────────────────────────────────────────────────────
TOTP helpers shared between the Super Admin login flow (auth_views.py) and
the 2FA management endpoints (two_factor_views.py).
"""
import pyotp

from django.core import signing

from authapp.models.two_factor_models import TwoFactorBackupCode

PENDING_TOKEN_SALT = "super-admin-2fa-pending"
PENDING_TOKEN_MAX_AGE = 5 * 60  # 5 minutes to enter the code after password check


def make_2fa_pending_token(user):
    """Stateless — no DB/cache row needed. Signed + timestamped, so it can't
    be forged or replayed past PENDING_TOKEN_MAX_AGE."""
    return signing.TimestampSigner(salt=PENDING_TOKEN_SALT).sign(str(user.pk))


def verify_2fa_pending_token(token):
    """Returns the user id, or None if the token is missing/invalid/expired."""
    if not token:
        return None
    signer = signing.TimestampSigner(salt=PENDING_TOKEN_SALT)
    try:
        return int(signer.unsign(token, max_age=PENDING_TOKEN_MAX_AGE))
    except (signing.BadSignature, ValueError):
        return None


def verify_totp_or_backup_code(two_factor, code):
    """Tries the live TOTP code first (allowing ±1 time-step for clock
    drift), then falls back to one-time backup codes. Returns True/False."""
    code = (code or "").strip()
    if not code:
        return False
    totp = pyotp.TOTP(two_factor.secret)
    if totp.verify(code, valid_window=1):
        return True
    return TwoFactorBackupCode.try_consume(two_factor, code)
