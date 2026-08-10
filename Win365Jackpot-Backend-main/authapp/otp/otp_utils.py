"""
authapp/otp/otp_utils.py
─────────────────────────────────────────────────────────────────────────────
OTP generation and delivery helpers.
"""

import os
import random
import logging
import smtplib
from email.mime.image import MIMEImage
from django.core.mail import send_mail, EmailMultiAlternatives
from django.conf import settings
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)

# How long a freshly issued OTP stays valid. Single source of truth: otp_views
# stamps OTPRecord.expires_at from this, and both the plain-text and HTML
# emails quote it, so the expiry a user is told can never drift from the
# expiry actually enforced.
OTP_TTL_MINUTES = 10

# The black-and-gold casino template. The light-theme original it replaced is
# still on disk at emails/otp_verification.html and still renders — point this
# constant back at it to revert, no other change needed. Both templates read
# EXPIRY_MINUTES, and the context below carries the OTP under both key names
# they use, so a revert stays a one-line edit.
OTP_EMAIL_TEMPLATE = "emails/otp_verification_gold.html"

# The brand mark is embedded in the message as an inline part rather than
# linked to https://jackpotsworld.vip/images/..., because a linked logo is only
# as reliable as the recipient's client is welcome at our own origin. Cloudflare
# sits in front of jackpotsworld.vip and its bot rules answer by user agent:
# Gmail's proxy, Apple Mail and Outlook get a 200, but Yahoo Mail's proxy and
# any client sending an empty user agent get a 403 — and a 403 renders as the
# alt text inside an empty ring where the logo should be. Embedding removes the
# network from the path entirely: no fetch, no proxy, no bot rule, and it still
# works offline and in clients with remote images switched off.
#
# The cost is that every OTP email carries the image. That is affordable only
# because the PNG is the palette-optimised 32 KB cut (~44 KB base64), not the
# 152 KB original it replaced.
LOGO_CID = "jwlogo"
LOGO_PATH = os.path.join(
    settings.BASE_DIR, "jackpotsworld_frontend_dist", "images", "jackpotsworld-logo-256.png"
)


def _build_logo_part():
    """Return the inline logo MIME part, or None if the file is missing.

    Returning None rather than raising is deliberate: a missing asset must
    never be the reason a verification code fails to arrive. The template
    falls back to the https URL when LOGO_SRC is absent, so the email still
    renders — just over the network, with the reliability caveat above.
    """
    try:
        with open(LOGO_PATH, "rb") as fh:
            part = MIMEImage(fh.read(), "png")
    except OSError as exc:
        logger.warning(
            "Inline OTP logo unavailable at %s (%s) — falling back to the "
            "linked logo, which some clients will not load.", LOGO_PATH, exc,
        )
        return None
    # The angle brackets belong in the header but not in the template's
    # src="cid:jwlogo"; mismatching the two is the usual reason an embedded
    # image renders as a broken-image icon.
    part.add_header("Content-ID", "<%s>" % LOGO_CID)
    part.add_header("Content-Disposition", "inline", filename="jackpotsworld-logo.png")
    return part


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
    Send the styled HTML OTP email, rendered from the template named by
    OTP_EMAIL_TEMPLATE under authapp/templates/.

    The plain-text `message` below is not decoration — it's the alternative
    part every multipart email carries, and it's what plain-text-only clients
    and most spam filters actually read, so its wording tracks the template's.
    """
    text_message = (
        f"Here is your verification code:\n\n"
        f"  {otp}\n\n"
        f"Use this code to verify your email address.\n"
        f"Please make sure you never share this code with anyone.\n\n"
        f"Note: The code will expire in {OTP_TTL_MINUTES} minutes.\n\n"
        f"Jackpots World — PLAY. WIN. REPEAT.\n"
        f"jackpotsworld.vip"
    )
    # DEFAULT_FROM_EMAIL falls back to EMAIL_HOST_USER in settings, so this is
    # the same address as before unless it's overridden in the environment.
    # Gmail rewrites a From that isn't the authenticated account anyway.
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None) or settings.EMAIL_HOST_USER
    try:
        logo_part = _build_logo_part()
        html_message = render_to_string(
            OTP_EMAIL_TEMPLATE,
            # "otp" is the key the gold template documents; "OTP_CODE" is what
            # the light template reads. Both are supplied so either renders.
            # EXPIRY_MINUTES stays OTP_TTL_MINUTES, never a literal — the
            # expiry the email quotes has to be the expiry otp_views enforces.
            # LOGO_SRC points the template's <img> at the part attached below;
            # omitting it when the file is missing lets the template fall back
            # to its linked-logo default.
            {
                "otp": otp,
                "OTP_CODE": otp,
                "EXPIRY_MINUTES": OTP_TTL_MINUTES,
                **({"LOGO_SRC": "cid:%s" % LOGO_CID} if logo_part else {}),
            },
        )
        # Built by hand rather than with send_mail, which has no way to attach
        # an inline part. The structure a cid: reference needs is
        #   multipart/related
        #     multipart/alternative -> text/plain + text/html
        #     image/png             -> Content-ID: <jwlogo>
        # EmailMultiAlternatives already nests the alternative part; setting
        # mixed_subtype promotes the outer container from mixed to related,
        # which is what tells a client the image belongs to the HTML rather
        # than being a file the user attached.
        message = EmailMultiAlternatives(
            subject="Your JackpotsWorld Verification Code",
            body=text_message,
            from_email=from_email,
            to=[email],
        )
        message.attach_alternative(html_message, "text/html")
        if logo_part:
            message.mixed_subtype = "related"
            message.attach(logo_part)
        message.send(fail_silently=False)
    except Exception as exc:
        _log_send_failure(email, exc)
        raise


def send_otp_whatsapp(phone: str, otp: str) -> None:
    """Placeholder — integrate with WhatsApp Business API in production."""
    logger.info(f"[DEV] WhatsApp OTP to {phone}: {otp}")
    print(f"[DEV] WhatsApp OTP to {phone}: {otp}")