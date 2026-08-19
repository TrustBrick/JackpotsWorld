"""VOICE-CALL: mark lapsed ringing calls as missed.

Every read path already expires a call lazily (see
voice_call_service.expire_if_due), so this is only needed for the case nobody
looks at: a customer whose browser died mid-ring, with no agent ever opening
the panel. Without it that row would sit in `ringing` indefinitely, holding
its ticket's single active-call slot and blocking the next call.

Idempotent and safe to run concurrently with itself — each transition is a
conditional UPDATE against the still-ringing row, so a second runner finds
nothing left to do. Suggested cadence: every minute. See
docs/DEPLOYMENT_SCHEDULER.md for why this repo ships no cron config of its own.
"""
from django.core.management.base import BaseCommand

from authapp.services import voice_call_service


class Command(BaseCommand):
    help = "Mark voice calls whose ring window has lapsed as missed."

    def handle(self, *args, **options):
        swept = voice_call_service.sweep_expired_calls()
        self.stdout.write(self.style.SUCCESS(f"Expired {swept} ringing call(s)."))
