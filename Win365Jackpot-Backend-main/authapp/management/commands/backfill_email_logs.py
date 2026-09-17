"""
authapp/management/commands/backfill_email_logs.py
─────────────────────────────────────────────────────────────────────────────
Import historical sends into authapp_emaillog from the ONE place they still
exist: the sending Gmail account's Sent folder.

WHY THIS IS THE ONLY SOURCE
───────────────────────────
Before the logging backend existed, a sent email left no trace in this system.
Each candidate was checked and ruled out:

  * Application logs — send_otp_email_html, which is the sender that actually
    runs, had no success log line at all. Only failures were ever logged, and
    OTP is the overwhelming majority of this platform's email.
  * ActivityLog "otp_sent" — the action exists in ACTION_CHOICES but is never
    written anywhere; it appears only in a filter list in admin_views.
  * OTPRecord — not a history. SendOTPView deletes every prior record for the
    same (email, mode) before creating a new one, and deletes the record again
    if the send raises. At most one row survives per address per mode, and a
    failed send leaves none.
  * CloudWatch — the app log group has 7-day retention.
  * The rotating django.log — instance-local, and EB replaces instances on
    every deploy.

Gmail's Sent folder is the real record: one message per email that genuinely
left this system, carrying its date, recipient, subject and Message-ID.

WHAT AN IMPORTED ROW CAN AND CANNOT CLAIM
─────────────────────────────────────────
A message in Sent means Gmail accepted and transmitted it. That is exactly the
SENT / "SMTP accepted" state and nothing more. It is NOT proof of delivery, and
this command never writes DELIVERED — the same rule the live path follows.
Bounces are not visible here either; they arrive later as separate messages in
the INBOX and are not part of this import.

Every imported row is marked in `metadata` so a backfilled record can always be
told apart from one this application observed itself.

CREDENTIALS
───────────
Read from settings (EMAIL_HOST_USER / EMAIL_HOST_PASSWORD), the same Gmail app
password the SMTP sender already uses. Nothing is printed, logged or stored —
the password never leaves this process, and no part of it reaches the database.
Gmail requires IMAP to be enabled on the account for this to connect.
"""

import email as email_lib
import imaplib
from datetime import datetime, timezone as dt_timezone
from email.header import decode_header, make_header
from email.utils import getaddresses, parsedate_to_datetime

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from authapp.models.email_log_models import (
    EmailLog,
    STATUS_SENT,
    TYPE_AFFILIATE_APPROVAL,
    TYPE_AFFILIATE_REGISTRATION_ALERT,
    TYPE_OTHER,
    TYPE_OTP_VERIFICATION,
)

DEFAULT_FOLDER = "[Gmail]/Sent Mail"
DEFAULT_IMAP_HOST = "imap.gmail.com"


def classify_subject(subject):
    """Map a historical subject line to an email type.

    The subjects this application sends are fixed strings, so this is a lookup
    rather than a guess — with one honest limitation. send_otp_email_html uses
    the SAME subject for the signup code and the password-reset code, so a
    historical OTP cannot be attributed to one flow or the other. It is typed
    by what the message itself was — a verification code — and the ambiguity is
    recorded in metadata rather than being resolved by picking a side.
    """
    s = (subject or "").strip().lower()
    if "verification code" in s or "otp code" in s:
        return TYPE_OTP_VERIFICATION, True
    if "affiliate onboarding completed" in s:
        return TYPE_AFFILIATE_APPROVAL, False
    if "new affiliate registration" in s:
        return TYPE_AFFILIATE_REGISTRATION_ALERT, False
    return TYPE_OTHER, False


def decode_subject(raw):
    if not raw:
        return ""
    try:
        return str(make_header(decode_header(raw)))
    except Exception:
        return str(raw)


def parse_message(raw_bytes):
    """One Sent message -> the fields an EmailLog needs, or None if it carries
    no recipient (a draft artefact rather than a real send)."""
    msg = email_lib.message_from_bytes(raw_bytes)

    recipients = [addr for _name, addr in getaddresses(msg.get_all("To", []) or []) if addr]
    if not recipients:
        return None

    sent_at = None
    if msg.get("Date"):
        try:
            sent_at = parsedate_to_datetime(msg["Date"])
        except Exception:
            sent_at = None
    # A Date header without an offset parses to a naive datetime, and USE_TZ is
    # on, so it has to be made aware or the ORM rejects it. dt_timezone.utc,
    # not django.utils.timezone.utc — the latter was removed in Django 5.0 and
    # this project runs 5.2, so referencing it would raise AttributeError and
    # abort the whole import on the first such message.
    if sent_at is not None and timezone.is_naive(sent_at):
        sent_at = sent_at.replace(tzinfo=dt_timezone.utc)

    subject = decode_subject(msg.get("Subject"))
    email_type, ambiguous = classify_subject(subject)
    from_addrs = [addr for _n, addr in getaddresses(msg.get_all("From", []) or []) if addr]

    return {
        "message_id": (msg.get("Message-ID") or "").strip()[:255],
        "recipient_email": recipients[0][:254],
        "all_recipients": recipients,
        "from_email": (from_addrs[0] if from_addrs else "")[:254],
        "subject": subject[:500],
        "email_type": email_type,
        "sent_at": sent_at,
        "ambiguous_type": ambiguous,
    }


class Command(BaseCommand):
    help = (
        "Import historical sends into the Email Logs from the sending Gmail "
        "account's Sent folder. Imported rows are SENT (accepted by the "
        "provider) and never DELIVERED."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--since", default=None,
            help="Only import messages sent on or after this date (YYYY-MM-DD). "
                 "Applied by the mail server, so it also keeps the download small.",
        )
        parser.add_argument(
            "--limit", type=int, default=0,
            help="Stop after this many messages. 0 means no limit.",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be imported and write nothing.",
        )
        parser.add_argument("--folder", default=DEFAULT_FOLDER)
        parser.add_argument("--imap-host", default=DEFAULT_IMAP_HOST)

    def handle(self, *args, **opts):
        user = getattr(settings, "EMAIL_HOST_USER", "")
        password = getattr(settings, "EMAIL_HOST_PASSWORD", "")
        if not user or not password:
            raise CommandError(
                "EMAIL_HOST_USER / EMAIL_HOST_PASSWORD are not configured, so there "
                "is no mailbox to read. Run this where the app's email settings are."
            )

        since = opts["since"]
        if since:
            try:
                since_dt = datetime.strptime(since, "%Y-%m-%d")
            except ValueError:
                raise CommandError("--since must be YYYY-MM-DD.")
            # IMAP wants 01-Jan-2026.
            criteria = ["SINCE", since_dt.strftime("%d-%b-%Y")]
        else:
            criteria = ["ALL"]

        dry_run = opts["dry_run"]
        limit = opts["limit"]

        self.stdout.write(f"Connecting to {opts['imap_host']} as {user} …")
        try:
            conn = imaplib.IMAP4_SSL(opts["imap_host"])
            conn.login(user, password)
        except imaplib.IMAP4.error as exc:
            # Deliberately does not echo the exception verbatim: Gmail's auth
            # failures can quote the credential back.
            raise CommandError(
                "IMAP login failed. Check that IMAP is enabled on the Google "
                "Account and that EMAIL_HOST_PASSWORD is a current app password. "
                f"({type(exc).__name__})"
            )

        imported = skipped = malformed = 0
        # Dry-run reporting: the operator needs to know what period the
        # mailbox actually covers and what kinds of mail are in it before
        # deciding to write any of it.
        oldest = newest = None
        by_type = {}
        undated = 0
        try:
            status_, _ = conn.select(f'"{opts["folder"]}"', readonly=True)
            if status_ != "OK":
                raise CommandError(
                    f"Could not open folder {opts['folder']!r}. On Gmail the Sent "
                    'folder is "[Gmail]/Sent Mail"; localised accounts differ.'
                )

            status_, data = conn.search(None, *criteria)
            if status_ != "OK":
                raise CommandError("IMAP search failed.")

            ids = data[0].split()
            if limit:
                ids = ids[-limit:]  # newest first is more useful than oldest
            self.stdout.write(f"{len(ids)} message(s) to examine.")

            for num in ids:
                status_, payload = conn.fetch(num, "(RFC822)")
                if status_ != "OK" or not payload or not payload[0]:
                    malformed += 1
                    continue

                parsed = parse_message(payload[0][1])
                if parsed is None:
                    malformed += 1
                    continue

                # Idempotent on Message-ID, so re-running never duplicates and a
                # partial run can simply be repeated.
                # Span and mix are gathered across everything examined, before
                # the already-present check, so the reported range describes the
                # mailbox rather than only the part still missing.
                sent_at = parsed["sent_at"]
                if sent_at is None:
                    undated += 1
                else:
                    oldest = sent_at if oldest is None or sent_at < oldest else oldest
                    newest = sent_at if newest is None or sent_at > newest else newest

                if parsed["message_id"] and EmailLog.objects.filter(
                    message_id=parsed["message_id"]
                ).exists():
                    skipped += 1
                    continue

                by_type[parsed["email_type"]] = by_type.get(parsed["email_type"], 0) + 1

                if dry_run:
                    imported += 1
                    continue

                metadata = {
                    "backfilled": True,
                    "backfill_source": "gmail-sent-folder",
                    "backfill_note": (
                        "Imported from the sending account's Sent folder. Presence "
                        "there means the provider accepted and transmitted the "
                        "message; it is not confirmation of delivery."
                    ),
                }
                if parsed["ambiguous_type"]:
                    metadata["type_caveat"] = (
                        "Signup and password-reset codes shared one subject line, "
                        "so which flow triggered this cannot be recovered."
                    )

                log = EmailLog.objects.create(
                    recipient_email=parsed["recipient_email"],
                    all_recipients=parsed["all_recipients"],
                    from_email=parsed["from_email"],
                    subject=parsed["subject"],
                    email_type=parsed["email_type"],
                    status=STATUS_SENT,
                    provider="gmail-smtp",
                    message_id=parsed["message_id"],
                    sent_at=parsed["sent_at"],
                    triggered_by="backfill_email_logs",
                    metadata=metadata,
                )
                # created_at is auto_now_add, so it lands as "now" and has to be
                # corrected to the real send time — otherwise every historical
                # row sorts to the top and the date filter is meaningless.
                if parsed["sent_at"]:
                    EmailLog.objects.filter(pk=log.pk).update(created_at=parsed["sent_at"])
                imported += 1
        finally:
            try:
                conn.close()
            except Exception:
                pass
            conn.logout()

        verb = "would import" if dry_run else "imported"
        self.stdout.write("")
        self.stdout.write(f"Messages examined : {imported + skipped + malformed}")
        self.stdout.write(f"  {verb:<16}: {imported}")
        self.stdout.write(f"  already present : {skipped}")
        self.stdout.write(f"  unreadable      : {malformed}")
        if oldest and newest:
            self.stdout.write(
                f"Date range        : {oldest:%Y-%m-%d %H:%M %Z} -> {newest:%Y-%m-%d %H:%M %Z}"
            )
        else:
            self.stdout.write("Date range        : (no dated messages found)")
        if undated:
            self.stdout.write(f"  undated         : {undated}")
        if by_type:
            self.stdout.write("Breakdown by type :")
            for key, count in sorted(by_type.items(), key=lambda kv: -kv[1]):
                self.stdout.write(f"  {key:<32} {count}")
        self.stdout.write(self.style.SUCCESS(
            f"Done: {verb} {imported}, skipped {skipped} already present, "
            f"{malformed} unreadable."
        ))
        if not dry_run and imported:
            self.stdout.write(
                "Imported rows are marked SENT (provider accepted). None are marked "
                "DELIVERED — the provider reports no delivery events."
            )
