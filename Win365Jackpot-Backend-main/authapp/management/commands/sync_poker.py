"""
Runs the poker source synchronisation (Part 10). Safe to run repeatedly — a
re-run updates known events rather than duplicating them.

One source failing never stops the others; failures are recorded on the
source and in PokerSyncLog, then the run continues.

Intended cadence (see docs/DEPLOYMENT_SCHEDULER.md): hourly for --sync,
every 15 minutes for --statuses-only.
"""
from django.core.management.base import BaseCommand

from authapp.services import poker_ingest_service, poker_sync_service


class Command(BaseCommand):
    help = "Syncs poker events from every enabled PokerSource and refreshes event statuses."

    def add_arguments(self, parser):
        parser.add_argument(
            "--source", type=int, action="append", dest="source_ids",
            help="Sync only this PokerSource id. Repeatable.",
        )
        parser.add_argument(
            "--statuses-only", action="store_true",
            help="Skip fetching; only refresh upcoming/live/completed from event dates.",
        )
        parser.add_argument(
            "--no-notify", action="store_true",
            help="Don't send the Back Office notification for this run.",
        )

    def handle(self, *args, **options):
        if not options["statuses_only"]:
            totals = poker_sync_service.sync_poker_from_sources(
                source_ids=options.get("source_ids"),
                notify=not options["no_notify"],
            )
            self.stdout.write(self.style.SUCCESS(
                f"Poker sync: sources={totals['sources']} fetched={totals['fetched']} "
                f"created={totals['created']} updated={totals['updated']} "
                f"duplicates={totals['duplicate']} skipped={totals['skipped']}"
            ))
            for failure in totals["failures"]:
                self.stdout.write(self.style.WARNING(f"  source failed — {failure}"))

        counts = poker_ingest_service.refresh_statuses()
        self.stdout.write(self.style.SUCCESS(
            f"Poker statuses: upcoming={counts['upcoming']} live={counts['live']} "
            f"completed={counts['completed']}"
        ))
