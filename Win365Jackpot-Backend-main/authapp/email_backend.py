"""
authapp/email_backend.py
─────────────────────────────────────────────────────────────────────────────
The configured EMAIL_BACKEND: Django's own SMTP backend, plus a row in
authapp_emaillog for every message that passes through it.

WHY HERE
────────
"Every email must be logged" cannot be enforced by a helper, because a helper
can simply not be called. It can be enforced here: `send_mail()`,
`EmailMessage.send()`, `EmailMultiAlternatives.send()` and
`send_mass_mail()` all end up in a backend's `send_messages()`, so a future
developer who knows nothing about this system still gets a log row. Sending an
unlogged email would take deliberately constructing a different backend.

WHAT THIS BACKEND CAN AND CANNOT KNOW
─────────────────────────────────────
It sees the message and the outcome of the SMTP conversation. That is enough
for PENDING → SENT/FAILED, and it is ALL that Gmail SMTP offers:

  * No provider message id. smtplib's sendmail() returns only the dict of
    refused recipients; the queue id Gmail puts in its 250 response is never
    handed to Django. provider_message_id is therefore left empty rather than
    filled with something that is not one.
  * No success response text, for the same reason — so smtp_response stays
    empty on success instead of carrying an invented "250 OK".
  * No delivery or bounce events. Gmail returns bounces as human-readable
    email to the From address hours later, not as a machine-readable callback.
    Nothing here can honestly write DELIVERED or BOUNCED, so nothing here
    does.

Failure is the case where the wire actually tells us something, and all of it
is kept: SMTPResponseException carries the numeric code and the server's own
text, and SMTPRecipientsRefused carries a per-recipient reason.

FAILING TO LOG MUST NEVER FAIL AN EMAIL
───────────────────────────────────────
Every database call below is wrapped. A logging problem degrades this table,
and the alternative — an OTP that never arrives because its log row could not
be written — is strictly worse. Logging failures go to the application log.
"""

import logging

from django.core.mail.backends.smtp import EmailBackend as SMTPEmailBackend
from django.utils import timezone

logger = logging.getLogger(__name__)

# Set by authapp/services/email_service.py on the message object. Read here so
# a typed send records its type, user and trigger, while an untyped one still
# records everything the message itself reveals.
META_ATTR = "_jw_email_meta"
# The log row this backend attached to the message, so _send() can find it
# again without re-matching on recipient.
LOG_ATTR = "_jw_email_log"


def _provider_name():
    """A stable label for whatever is actually configured, recorded per row so
    history stays readable after the provider changes."""
    from django.conf import settings

    host = (getattr(settings, "EMAIL_HOST", "") or "").strip().lower()
    if not host:
        return "django-console" if "console" in getattr(settings, "EMAIL_BACKEND", "") else "unknown"
    if "gmail" in host:
        return "gmail-smtp"
    if "amazonaws" in host:
        return "aws-ses-smtp"
    if "sendgrid" in host:
        return "sendgrid-smtp"
    return host


def _describe_smtp_exception(exc):
    """(smtp_response, error_message) — the server's own words where it gave
    any, never our paraphrase of them."""
    import smtplib

    smtp_response = ""
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        # {recipient: (code, b"reason")} — one line per address.
        parts = []
        for addr, (code, msg) in (exc.recipients or {}).items():
            text = msg.decode("utf-8", "replace") if isinstance(msg, bytes) else str(msg)
            parts.append(f"{addr}: {code} {text}")
        smtp_response = "\n".join(parts)
    elif isinstance(exc, smtplib.SMTPResponseException):
        text = exc.smtp_error
        if isinstance(text, bytes):
            text = text.decode("utf-8", "replace")
        smtp_response = f"{exc.smtp_code} {text}"

    return smtp_response, f"{type(exc).__name__}: {exc}"


class LoggingEmailBackend(SMTPEmailBackend):
    """Django's SMTP backend with an audit row per message."""

    # ── Row lifecycle helpers. Each one swallows its own failures. ───────────

    def _create_log(self, message):
        from authapp.models.email_log_models import EmailLog, STATUS_PENDING, TYPE_OTHER

        try:
            meta = getattr(message, META_ATTR, None) or {}
            recipients = list(message.to or [])
            # Django sets Message-ID when the message is rendered; force that
            # now so the header we store is the one that goes on the wire.
            try:
                message_id = message.message().get("Message-ID", "") or ""
            except Exception:
                message_id = ""

            return EmailLog.objects.create(
                recipient_email=(recipients[0] if recipients else "")[:254],
                all_recipients=recipients,
                from_email=(message.from_email or "")[:254],
                subject=(message.subject or "")[:500],
                email_type=meta.get("email_type") or TYPE_OTHER,
                user_id=meta.get("user_id"),
                triggered_by=(meta.get("triggered_by") or "")[:120],
                status=STATUS_PENDING,
                provider=_provider_name(),
                message_id=message_id[:255],
                metadata=meta.get("metadata") or {},
                retry_of_id=meta.get("retry_of_id"),
                retry_count=meta.get("retry_count") or 0,
            )
        except Exception:
            # Never let the audit trail take an email down with it.
            logger.exception("EmailLog row could not be created; sending anyway")
            return None

    def _mark_sent(self, message):
        from authapp.models.email_log_models import EmailLog, STATUS_SENT, STATUS_PENDING

        log = getattr(message, LOG_ATTR, None)
        if log is None:
            return
        try:
            EmailLog.objects.filter(pk=log.pk, status=STATUS_PENDING).update(
                status=STATUS_SENT, sent_at=timezone.now(), updated_at=timezone.now(),
            )
        except Exception:
            logger.exception("EmailLog %s could not be marked sent", log.pk)

    def _mark_failed(self, message, exc=None, reason=""):
        from authapp.models.email_log_models import EmailLog, STATUS_FAILED, STATUS_PENDING

        log = getattr(message, LOG_ATTR, None)
        if log is None:
            return
        smtp_response, error_message = ("", reason)
        if exc is not None:
            smtp_response, error_message = _describe_smtp_exception(exc)
        try:
            EmailLog.objects.filter(pk=log.pk, status=STATUS_PENDING).update(
                status=STATUS_FAILED,
                failed_at=timezone.now(),
                updated_at=timezone.now(),
                smtp_response=smtp_response[:4000],
                error_message=error_message[:4000],
            )
        except Exception:
            logger.exception("EmailLog %s could not be marked failed", log.pk)

    # ── Django's hooks ───────────────────────────────────────────────────────

    def send_messages(self, email_messages):
        """Rows are created before the connection is opened, so a failure in
        open() — a wrong password, an unreachable host — is still recorded
        against each message it stopped, rather than vanishing because _send()
        was never reached."""
        if not email_messages:
            return 0

        for message in email_messages:
            setattr(message, LOG_ATTR, self._create_log(message))

        try:
            return super().send_messages(email_messages)
        except Exception as exc:
            # Anything still PENDING never made it to _send(). The filtered
            # UPDATE inside _mark_failed means messages already resolved by
            # _send() are left exactly as they are.
            for message in email_messages:
                self._mark_failed(message, exc=exc)
            raise

    def _send(self, email_message):
        """One message, one outcome. This is the only place that knows whether
        a particular message was accepted."""
        try:
            sent = super()._send(email_message)
        except Exception as exc:
            self._mark_failed(email_message, exc=exc)
            raise

        if sent:
            self._mark_sent(email_message)
        else:
            # The parent returns False for a message with no recipients, and
            # when fail_silently swallowed an SMTPException.
            self._mark_failed(
                email_message,
                reason="The email backend declined the message without raising "
                       "(no recipients, or an SMTP error suppressed by fail_silently).",
            )
        return sent
