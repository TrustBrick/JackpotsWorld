from django.core.management.base import BaseCommand

from authapp.services.poker_sync_service import sync_poker_from_sources


class Command(BaseCommand):
    help = "Pulls configured POKER_RSS_FEEDS and creates new PokerTournament rows. Safe to run repeatedly."

    def handle(self, *args, **options):
        result = sync_poker_from_sources()
        self.stdout.write(self.style.SUCCESS(
            f"Poker sync: fetched={result['fetched']} created={result['created']} "
            f"skipped_feeds={result['skipped_feeds']}"
        ))
