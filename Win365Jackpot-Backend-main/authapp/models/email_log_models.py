"""
authapp/models/email_log_models.py
─────────────────────────────────────────────────────────────────────────────
One row per outgoing email, written by the logging email backend
(authapp/email_backend.py) rather than by each caller.

WHY THE BACKEND AND NOT A HELPER
────────────────────────────────
A helper anyone can choose not to call is not a guarantee. Every email this
project sends — today's OTP and affiliate messages, and anything a future
developer writes with plain `send_mail()` — goes through Django's configured
EMAIL_BACKEND. Logging there is the only place a message cannot slip past, so
that is where the row is written. authapp/services/email_service.py adds the
type/user metadata on top; the backend logs the message either way.

WHAT IS DELIBERATELY NOT STORED
───────────────────────────────
No SMTP credentials, no API keys, no tokens, and no OTP values. The message
BODY is not stored either: an OTP email's body is the OTP, so keeping bodies
would turn this table into a store of live credentials. Subject, recipient and
outcome are what an operator needs to answer "did it go, and if not why", and
they carry no secret — the OTP subject line is "Your JackpotsWorld
Verification Code", which says nothing about the code.
"""

from django.conf import settings
from django.db import models


# ── Status lifecycle ─────────────────────────────────────────────────────────
# PENDING  row created, send not yet attempted
# SENT     the SMTP server accepted the message for delivery
# DELIVERED the PROVIDER confirmed it reached the mailbox
# FAILED   the send attempt itself failed (connection, auth, rejection)
# BOUNCED  accepted, then the provider reported it could not be delivered
#
# DELIVERED and BOUNCED can only ever be set by a provider event. The current
# provider (Gmail SMTP) emits no such events, so nothing in this codebase
# writes those two states today — they exist so that moving to a provider with
# event destinations (SES, SendGrid, Postmark) is a new writer rather than a
# schema migration. Until then SENT is the terminal success state and the Back
# Office labels it "Sent / SMTP Accepted" rather than implying delivery.
STATUS_PENDING = "pending"
STATUS_SENT = "sent"
STATUS_DELIVERED = "delivered"
STATUS_FAILED = "failed"
STATUS_BOUNCED = "bounced"

EMAIL_STATUS_CHOICES = [
    (STATUS_PENDING, "Pending"),
    (STATUS_SENT, "Sent / SMTP Accepted"),
    (STATUS_DELIVERED, "Delivered"),
    (STATUS_FAILED, "Failed"),
    (STATUS_BOUNCED, "Bounced"),
]

# Only types this application actually sends. Nothing speculative: each one
# below maps to a real call site (see EMAIL_TYPE_* use in
# authapp/services/email_service.py and its callers). OTHER is the honest
# bucket for a message that reached the backend without declaring a type,
# which is what a future `send_mail()` written in ignorance of the service
# will produce — it still gets logged, it just says so.
TYPE_OTP_VERIFICATION = "otp_verification"
TYPE_OTP_PASSWORD_RESET = "otp_password_reset"
TYPE_AFFILIATE_APPROVAL = "affiliate_approval"
TYPE_AFFILIATE_REGISTRATION_ALERT = "affiliate_registration_alert"
TYPE_OTHER = "other"

EMAIL_TYPE_CHOICES = [
    (TYPE_OTP_VERIFICATION, "Email Verification OTP"),
    (TYPE_OTP_PASSWORD_RESET, "Password Reset OTP"),
    (TYPE_AFFILIATE_APPROVAL, "Affiliate Approval"),
    (TYPE_AFFILIATE_REGISTRATION_ALERT, "Affiliate Registration Alert"),
    (TYPE_OTHER, "Other / Untyped"),
]


class EmailLog(models.Model):
    """The record of one outgoing email and what became of it."""

    # ── Who and what ─────────────────────────────────────────────────────────
    recipient_email = models.EmailField(max_length=254, db_index=True)
    # Every recipient when a message went to more than one address. The
    # indexed column above stays the first/primary one so searching by it
    # keeps using the index instead of scanning JSON.
    all_recipients = models.JSONField(default=list, blank=True)
    from_email = models.CharField(max_length=254, blank=True)
    subject = models.CharField(max_length=500, blank=True)
    email_type = models.CharField(
        max_length=40, choices=EMAIL_TYPE_CHOICES, default=TYPE_OTHER, db_index=True,
    )

    # Null for an email to someone with no account — an OTP to an address
    # mid-registration, or the support inbox. SET_NULL because the log of a
    # message that was really sent outlives the account it was sent about.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="email_logs",
    )
    # Free text naming what caused the send ("SendOTPView",
    # "AdminAffiliateApprovalView"), for answering "why did this go out".
    triggered_by = models.CharField(max_length=120, blank=True)

    # ── Outcome ──────────────────────────────────────────────────────────────
    status = models.CharField(
        max_length=12, choices=EMAIL_STATUS_CHOICES, default=STATUS_PENDING, db_index=True,
    )
    # "gmail-smtp", or whatever EMAIL_HOST resolves to. Recorded per row rather
    # than read from settings at display time, so history stays true after the
    # provider is changed.
    provider = models.CharField(max_length=60, blank=True, db_index=True)
    # The PROVIDER's own id for this message, which is what a delivery event
    # would be keyed on. Stays empty on Gmail SMTP, which returns no such id to
    # Django — see the module docstring of authapp/email_backend.py.
    provider_message_id = models.CharField(max_length=255, blank=True, db_index=True)
    # The RFC 5322 Message-ID this application generated. NOT the provider's
    # id and never displayed as one; it is how a row is matched to a message in
    # the sending account's Sent folder, which on Gmail is the only trace there
    # is.
    message_id = models.CharField(max_length=255, blank=True, db_index=True)

    # Only ever a real response read off the wire. Left empty rather than
    # filled with an invented "250 OK": smtplib does not hand Django the
    # success response, so claiming one would be fabrication.
    smtp_response = models.TextField(blank=True)
    error_message = models.TextField(blank=True)

    # ── Timeline ─────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)

    # How many times a send was attempted for this row beyond the first.
    retry_count = models.PositiveSmallIntegerField(default=0)
    # Set on the NEW row created by a retry, pointing at the failure it is
    # retrying, so the original attempt and its retries stay one story.
    retry_of = models.ForeignKey(
        "self", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="retries",
    )

    # Anything structured worth keeping that is not a column — never secrets.
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        # -id is the tie-break, not decoration: several emails can be
        # written inside one transaction and share a created_at to the
        # microsecond, and without it their order on the page is whatever
        # the database felt like — which makes "newest first" wrong at
        # exactly the moment an operator is looking at a burst.
        ordering = ["-created_at", "-id"]
        verbose_name = "Email log"
        verbose_name_plural = "Email logs"
        indexes = [
            # The Back Office list is "newest first, optionally narrowed", so
            # every filter pairs with created_at rather than standing alone.
            models.Index(fields=["-created_at"], name="emaillog_created_idx"),
            models.Index(fields=["status", "-created_at"], name="emaillog_status_created_idx"),
            models.Index(fields=["email_type", "-created_at"], name="emaillog_type_created_idx"),
            models.Index(fields=["recipient_email", "-created_at"], name="emaillog_rcpt_created_idx"),
            models.Index(fields=["provider", "-created_at"], name="emaillog_provider_created_idx"),
        ]

    def __str__(self):
        return f"{self.get_status_display()} → {self.recipient_email} ({self.subject[:40]})"

    @property
    def is_retryable(self):
        """Whether offering a Retry button for this row is honest.

        Only failures, and only ones that are not the provider telling us the
        address itself is wrong. Re-sending to a mailbox that does not exist
        just earns another rejection and, on Gmail, contributes to the sending
        reputation damage that gets an account rate-limited. The check is on
        the SMTP status class: 5xx is permanent, 4xx is transient.
        """
        if self.status != STATUS_FAILED:
            return False
        haystack = f"{self.smtp_response} {self.error_message}".lower()
        permanent_markers = (
            "550", "551", "553", "554", "5.1.1", "5.1.3", "5.7.1",
            "does not exist", "no such user", "user unknown",
            "recipient address rejected", "mailbox unavailable",
            "authentication", "username and password not accepted",
        )
        return not any(marker in haystack for marker in permanent_markers)
