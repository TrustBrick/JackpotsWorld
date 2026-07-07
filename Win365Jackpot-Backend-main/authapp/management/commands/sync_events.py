from django.core.management.base import BaseCommand

from authapp.services.event_sync_service import sync_events_from_sources


class Command(BaseCommand):
    help = "Pulls configured EVENT_RSS_FEEDS and creates new CasinoEvent rows. Safe to run repeatedly."

    def handle(self, *args, **options):
        result = sync_events_from_sources()
        self.stdout.write(self.style.SUCCESS(
            f"Events sync: fetched={result['fetched']} created={result['created']} "
            f"skipped_feeds={result['skipped_feeds']}"
        ))
