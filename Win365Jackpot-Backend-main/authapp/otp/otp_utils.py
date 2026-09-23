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
from django.conf import settings
from django.template.loader import render_to_string

from authapp.models.email_log_models import TYPE_OTP_VERIFICATION
from authapp.services.email_service import build_message

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
# Under assets/ since the 2026-08-18 /assets/ media migration. The old images/
# path silently stopped existing then, so every OTP went out on the linked
# fallback -- which Cloudflare answers with a 403 at the old URL.
LOGO_PATH = os.path.join(
    settings.BASE_DIR, "jackpotsworld_frontend_dist", "assets", "images", "jackpotsworld-logo-256.png"
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


def send_otp_email(email: str, otp: str, *, email_type: str = TYPE_OTP_VERIFICATION) -> None:
    """
    Send a plain-text OTP email.

    Routed through the email service so the send is typed and attributed in
    authapp_emaillog. Only the subject and recipient reach the log -- this
    body IS the code, and bodies are never stored.
    """
    subject    = "Your JackpotsWorld OTP Code"
    message    = (
        f"Your one-time password (OTP) for JackpotsWorld is:\n\n"
        f"  {otp}\n\n"
        f"This code expires in {OTP_TTL_MINUTES} minutes. Do not share it with anyone.\n\n"
        f"— JackpotsWorld Team"
    )
    try:
        build_message(
            subject=subject, body=message, to=[email],
            email_type=email_type, triggered_by="send_otp_email",
        ).send(fail_silently=False)
        logger.info(f"OTP email sent to {email}")
    except Exception as exc:
        _log_send_failure(email, exc)
        raise


def send_otp_email_html(email: str, otp: str, *, email_type: str = TYPE_OTP_VERIFICATION) -> None:
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
    # from_email is resolved inside the email service, to the same
    # DEFAULT_FROM_EMAIL-or-EMAIL_HOST_USER value this used to compute here.
    # Gmail rewrites a From that isn't the authenticated account anyway.
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
        # build_message returns the same EmailMultiAlternatives this used to
        # construct by hand, with the log metadata attached -- so the inline
        # logo assembly below is unchanged.
        message = build_message(
            subject="Your JackpotsWorld Verification Code",
            body=text_message,
            html_body=html_message,
            to=[email],
            email_type=email_type,
            triggered_by="send_otp_email_html",
        )
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