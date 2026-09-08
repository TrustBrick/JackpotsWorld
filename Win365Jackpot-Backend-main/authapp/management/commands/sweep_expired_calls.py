"""VOICE-CALL: mark lapsed ringing calls as missed, and end runaway holds.

Two sweeps, one command, because both exist for the same reason: a call state
nobody is left looking at.

  RINGING  — every read path already expires a call lazily (see
             voice_call_service.expire_if_due), so the sweep is only needed for
             the case nobody looks at: a customer whose browser died mid-ring,
             with no agent ever opening the panel. Without it that row would
             sit in `ringing` indefinitely, holding its ticket's single active
             call slot and blocking the next call.

  ON HOLD  — a hold has NO lazy path, and that is exactly the case that needs
             one: an agent whose tab crashed mid-hold leaves a customer
             listening to hold audio with nothing able to tell them otherwise.
             `VoiceCallSettings.max_hold_seconds` is the limit; while it is 0
             (the default) the hold sweep is a deliberate no-op.

Idempotent and safe to run concurrently with itself, and safe on every instance
of a scaled environment — each transition is a conditional UPDATE against a row
still in the state being swept, so a second runner finds nothing left to do and
neither sweep sends notifications. Suggested cadence: every minute; see
.ebextensions/02_cron.config and docs/DEPLOYMENT_SCHEDULER.md.
"""
from django.core.management.base import BaseCommand

from authapp.services import call_control_service, voice_call_service


class Command(BaseCommand):
    help = "Expire lapsed ringing calls and auto-resume calls held past the limit."

    def handle(self, *args, **options):
        swept = voice_call_service.sweep_expired_calls()
        # Deliberately after the ring sweep and in its own statement: a failure
        # in one must not silently take the other with it, and expiring a ring
        # is the more time-critical of the two (it unblocks the next call).
        resumed = call_control_service.sweep_expired_holds()
        self.stdout.write(self.style.SUCCESS(
            f"Expired {swept} ringing call(s); auto-resumed {resumed} held call(s)."
        ))
