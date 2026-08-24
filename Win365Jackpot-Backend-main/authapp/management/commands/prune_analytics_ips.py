"""
authapp/management/commands/prune_analytics_ips.py
─────────────────────────────────────────────────────────────────────────────
VISITOR-ANALYTICS: enforce the IP retention window.

Blanks Visitor.ip_address / VisitorSession.ip_address for rows older than
ANALYTICS_IP_RETENTION_DAYS. The derived country / region / city / timezone
are deliberately left ALONE — the point is to stop holding the identifier
while keeping the aggregate analytics that were legitimately derived from it,
so pruning never rewrites a historical report.

Nothing is deleted. Visitors, sessions and events all survive; only the
address field is cleared. That keeps every count stable across a prune, which
is what makes this safe to run unattended.

Idempotent — a second run finds nothing left to do. Intended for cron/systemd
timer, e.g. daily:

    python manage.py prune_analytics_ips

    --days N   override the configured retention window for this run
    --dry-run  report what would be cleared, change nothing
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from authapp.models.analytics_models import Visitor, VisitorSession


class Command(BaseCommand):
    help = "Clear stored visitor IP addresses older than the retention window."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days", type=int, default=None,
            help="Retention window in days (defaults to ANALYTICS_IP_RETENTION_DAYS).",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be cleared without changing anything.",
        )

    def handle(self, *args, **options):
        days = options["days"]
        if days is None:
            days = getattr(settings, "ANALYTICS_IP_RETENTION_DAYS", 90)
        dry_run = options["dry_run"]

        cutoff = timezone.now() - timedelta(days=days)

        # Age is measured on last activity, not creation: a visitor still
        # active last week has not aged out just because they first arrived a
        # year ago.
        visitors = Visitor.objects.filter(
            last_seen__lt=cutoff, ip_address__isnull=False,
        )
        sessions = VisitorSession.objects.filter(
            last_activity_at__lt=cutoff, ip_address__isnull=False,
        )

        v_count = visitors.count()
        s_count = sessions.count()

        if dry_run:
            self.stdout.write(
                f"[dry-run] would clear {v_count} visitor and {s_count} session "
                f"IP address(es) last active before {cutoff:%Y-%m-%d %H:%M}"
            )
            return

        visitors.update(ip_address=None)
        sessions.update(ip_address=None)

        self.stdout.write(self.style.SUCCESS(
            f"Cleared {v_count} visitor and {s_count} session IP address(es) "
            f"last active before {cutoff:%Y-%m-%d %H:%M} "
            f"(retention: {days} days). Location data left intact."
        ))
