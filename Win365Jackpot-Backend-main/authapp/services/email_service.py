"""
authapp/services/email_service.py
─────────────────────────────────────────────────────────────────────────────
The one place this project builds an outgoing email.

DIVISION OF LABOUR WITH THE BACKEND
───────────────────────────────────
authapp/email_backend.py guarantees that every message is logged, because it
sits on the path Django forces all mail through. What it cannot know is what
the message IS: the transport sees a subject and a recipient, not "this is a
password-reset OTP for user 41, sent by ForgotPasswordRequestView".

This service supplies exactly that, by tagging the message object before
handing it to Django. Sending through here produces a typed, attributed log
row; sending around it still produces a row, typed "other". Neither can
produce no row at all.

WHAT CALLERS KEEP CONTROL OF
────────────────────────────
`fail_silently` is passed through rather than decided here, because the two
existing families of sender deliberately differ and both are right: an OTP
send raises so the view can tell the user their code is not coming, while the
affiliate emails swallow so an SMTP hiccup cannot fail an approval that has
already happened in the database. This service preserves each caller's
choice instead of imposing one.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from authapp.email_backend import META_ATTR
from authapp.models.email_log_models import (  # noqa: F401 — re-exported for callers
    TYPE_AFFILIATE_APPROVAL,
    TYPE_AFFILIATE_REGISTRATION_ALERT,
    TYPE_OTHER,
    TYPE_OTP_PASSWORD_RESET,
    TYPE_OTP_VERIFICATION,
)

logger = logging.getLogger(__name__)


def build_message(
    *,
    subject,
    body,
    to,
    email_type=TYPE_OTHER,
    html_body=None,
    from_email=None,
    user=None,
    triggered_by="",
    metadata=None,
    retry_of_id=None,
    retry_count=0,
):
    """An EmailMultiAlternatives carrying the metadata the backend logs.

    Returned rather than sent so a caller that needs to do more to the message
    — attach an inline logo, promote the container to multipart/related — can
    do that and then call `.send()` itself. The metadata rides on the object,
    so it survives whatever the caller does next.
    """
    recipients = [to] if isinstance(to, str) else list(to)
    sender = from_email or getattr(settings, "DEFAULT_FROM_EMAIL", None) or settings.EMAIL_HOST_USER

    message = EmailMultiAlternatives(subject, body, sender, recipients)
    if html_body:
        message.attach_alternative(html_body, "text/html")

    # Never the body, never a code — see the EmailLog docstring.
    setattr(message, META_ATTR, {
        "email_type": email_type,
        "user_id": getattr(user, "id", None),
        "triggered_by": triggered_by,
        "metadata": metadata or {},
        "retry_of_id": retry_of_id,
        "retry_count": retry_count,
    })
    return message


def send_email(
    *,
    subject,
    body,
    to,
    email_type=TYPE_OTHER,
    html_body=None,
    from_email=None,
    user=None,
    triggered_by="",
    metadata=None,
    fail_silently=False,
):
    """Build and send in one call, for the common case with no attachments.

    Returns the number of messages sent (0 or 1), matching Django's own
    `send()`. Raises whatever the backend raises unless fail_silently.
    """
    message = build_message(
        subject=subject, body=body, to=to, email_type=email_type,
        html_body=html_body, from_email=from_email, user=user,
        triggered_by=triggered_by, metadata=metadata,
    )
    return message.send(fail_silently=fail_silently)
