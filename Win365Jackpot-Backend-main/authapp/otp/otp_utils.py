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

logger = logging.getLogger(__name__)


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
    subject    = "Your WIN365 OTP Code"
    message    = (
        f"Your one-time password (OTP) for WIN365 is:\n\n"
        f"  {otp}\n\n"
        f"This code expires in 10 minutes. Do not share it with anyone.\n\n"
        f"— WIN365 Team"
    )
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@win365.com")
    try:
        send_mail(subject, message, from_email, [email], fail_silently=False)
        logger.info(f"✅ OTP email sent to {email}")
    except Exception as exc:
        _log_send_failure(email, exc)
        raise


def send_otp_email_html(email: str, otp: str) -> None:
    """
    Send a styled HTML OTP email.
    """
    digits = "".join(
        f'<span style="display:inline-block;width:44px;height:52px;line-height:52px;'
        f'text-align:center;font-size:24px;font-weight:900;font-family:monospace;'
        f'background:#1a000d;border:1.5px solid rgba(212,175,55,0.5);border-radius:10px;'
        f'color:#D4AF37;margin:0 3px;">{d}</span>'
        for d in otp
    )
    html_message = f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#06000F;font-family:'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="420" cellpadding="0" cellspacing="0"
        style="background:linear-gradient(160deg,#120008,#0a0005);
               border:1px solid rgba(212,175,55,0.2);border-radius:20px;overflow:hidden;">
        <tr>
          <td style="height:3px;background:linear-gradient(90deg,transparent,#D4AF37,transparent);"></td>
        </tr>
        <tr><td style="padding:36px 36px 0;">
          <div style="font-size:26px;font-weight:900;color:#D4AF37;letter-spacing:3px;margin-bottom:4px;">WIN365</div>
          <div style="font-size:11px;color:rgba(212,175,55,0.45);letter-spacing:6px;text-transform:uppercase;">Jackpot</div>
        </td></tr>
        <tr><td style="padding:28px 36px 10px;">
          <div style="font-size:15px;color:rgba(255,255,255,0.55);margin-bottom:6px;">Your verification code</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.3);margin-bottom:24px;">
            Expires in <strong style="color:rgba(212,175,55,0.7);">10 minutes</strong>.
          </div>
          <div style="text-align:center;margin-bottom:24px;">{digits}</div>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);
                      border-radius:10px;padding:12px 16px;font-size:12px;color:rgba(255,255,255,0.3);">
            🔒 Never share this code. WIN365 staff will never ask for your OTP.
          </div>
        </td></tr>
        <tr><td style="padding:20px 36px 32px;">
          <div style="font-size:11px;color:rgba(255,255,255,0.18);text-align:center;">
            If you didn't request this, you can safely ignore this email.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    from_email = settings.EMAIL_HOST_USER
    try:
        send_mail(
            subject="Your WIN365 Verification Code",
            message=f"Your WIN365 OTP is: {otp}\n\nExpires in 10 minutes.",
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