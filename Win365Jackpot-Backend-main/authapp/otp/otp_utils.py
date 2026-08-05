"""
authapp/otp/otp_utils.py
─────────────────────────────────────────────────────────────────────────────
OTP generation and delivery helpers.
"""

import random
import logging
import smtplib
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)

# How long a freshly issued OTP stays valid. Single source of truth: otp_views
# stamps OTPRecord.expires_at from this, and both the plain-text and HTML
# emails quote it, so the expiry a user is told can never drift from the
# expiry actually enforced.
OTP_TTL_MINUTES = 10

OTP_EMAIL_TEMPLATE = "emails/otp_verification.html"


def _log_send_failure(email: str, exc: Exception) -> None:
    """Log OTP email failures with enough detail to actually diagnose them,
    without ever including the OTP itself. SMTPAuthenticationError specifically
    means the SMTP provider rejected EMAIL_HOST_USER/EMAIL_HOST_PASSWORD —
    for Gmail this almost always means EMAIL_HOST_PASSWORD isn't a valid
    16-character App Password (regular account passwords are always rejected),
    or 2-Step Verification isn't enabled on that Google Account."""
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        logger.error(
            "OTP email to %s failed: SMTP authentication rejected by %s:%s "
            "for user %s — generate a fresh Gmail App Password at "
            "https://myaccount.google.com/apppasswords (requires 2-Step "
            "Verification) and update EMAIL_HOST_PASSWORD. Raw error: %s",
            email, settings.EMAIL_HOST, settings.EMAIL_PORT, settings.EMAIL_HOST_USER, exc,
        )
    elif isinstance(exc, (smtplib.SMTPException, OSError)):
        logger.error(
            "OTP email to %s failed: could not reach/complete handshake with %s:%s — %s",
            email, settings.EMAIL_HOST, settings.EMAIL_PORT, exc,
        )
    else:
        logger.error("OTP email to %s failed: %s", email, exc)


def generate_otp() -> str:
    """Return a 6-digit OTP string."""
    return str(random.randint(100_000, 999_999))


def send_otp_email(email: str, otp: str) -> None:
    """
    Send a plain-text OTP email.
    Configure EMAIL_* in settings.py (or use SendGrid / Mailgun).
    """
    subject    = "Your JackpotsWorld OTP Code"
    message    = (
        f"Your one-time password (OTP) for JackpotsWorld is:\n\n"
        f"  {otp}\n\n"
        f"This code expires in {OTP_TTL_MINUTES} minutes. Do not share it with anyone.\n\n"
        f"— JackpotsWorld Team"
    )
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@jackpotsworld.vip")
    try:
        send_mail(subject, message, from_email, [email], fail_silently=False)
        logger.info(f"OTP email sent to {email}")
    except Exception as exc:
        _log_send_failure(email, exc)
        raise


def send_otp_email_html(email: str, otp: str) -> None:
    """
    Send the styled HTML OTP email, rendered from
    authapp/templates/emails/otp_verification.html.

    The plain-text `message` below is not decoration — it's the alternative
    part every multipart email carries, and it's what plain-text-only clients
    and most spam filters actually read, so its wording tracks the template's.
    """
    text_message = (
        f"Here is your verification code:\n\n"
        f"  {otp}\n\n"
        f"Please make sure you never share this code with anyone.\n"
        f"Note: The code will expire in {OTP_TTL_MINUTES} minutes.\n\n"
        f"If you didn't request this code, you can safely ignore this email.\n\n"
        f"— JackpotsWorld"
    )
    # DEFAULT_FROM_EMAIL falls back to EMAIL_HOST_USER in settings, so this is
    # the same address as before unless it's overridden in the environment.
    # Gmail rewrites a From that isn't the authenticated account anyway.
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None) or settings.EMAIL_HOST_USER
    try:
        html_message = render_to_string(
            OTP_EMAIL_TEMPLATE,
            {"OTP_CODE": otp, "EXPIRY_MINUTES": OTP_TTL_MINUTES},
        )
        send_mail(
            subject="Your JackpotsWorld Verification Code",
            message=text_message,
            from_email=from_email,
            recipient_list=[email],
            html_message=html_message,
            fail_silently=False,
        )
    except Exception as exc:
        _log_send_failure(email, exc)
        raise


def send_otp_whatsapp(phone: str, otp: str) -> None:
    """Placeholder — integrate with WhatsApp Business API in production."""
    logger.info(f"[DEV] WhatsApp OTP to {phone}: {otp}")
    print(f"[DEV] WhatsApp OTP to {phone}: {otp}")