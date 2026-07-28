"""
authapp/utils/email_utils.py
─────────────────────────────────────────────────────────────────────────────
General transactional-email helpers (non-OTP). Reuses the same Django email
backend/settings as authapp/otp/otp_utils.py.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def send_affiliate_approval_email(user) -> None:
    """
    Notify an affiliate that their account has been approved and is now
    active. Best-effort: failures are logged, not raised, so an SMTP hiccup
    never blocks the admin approval action itself.
    """
    subject = "Affiliate Onboarding Completed Successfully"
    message = (
        f"Dear {user.name or user.email},\n\n"
        f"Congratulations! Your affiliate account has been successfully onboarded and is now active.\n\n"
        f"You can log in to the affiliate portal using your registered credentials and start using our services.\n\n"
        f"Affiliate ID: {user.user_uid}\n"
        f"Portal: https://jackpotsworld.vip/affiliates\n\n"
        f"If you need any assistance, please reach out to us at support@jackpotsworld.vip.\n\n"
        f"Thank you for partnering with JackpotsWorld.\n\n"
        f"Best regards,\n"
        f"JackpotsWorld Support Team"
    )
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@jackpotsworld.vip")
    try:
        send_mail(subject, message, from_email, [user.email], fail_silently=False)
        logger.info(f"Affiliate onboarding email sent to {user.email}")
    except Exception as exc:
        logger.error(f"Affiliate onboarding email to {user.email} failed: {exc}")
