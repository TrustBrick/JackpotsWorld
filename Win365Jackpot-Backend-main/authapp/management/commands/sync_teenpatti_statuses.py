"""
Promotes Teen Patti events between published/upcoming/live/completed from the
clock, and optionally sends "starting soon" reminders. Safe to run repeatedly
— every transition is derived from the event's own dates, never from a delta.

Intended cadence (see docs/DEPLOYMENT_SCHEDULER.md): every 15 minutes for the
status pass, once daily for --remind.
"""
from django.core.management.base import BaseCommand

from authapp.services import teenpatti_service


class Command(BaseCommand):
    help = "Refreshes Teen Patti event statuses from their scheduled dates."

    def add_arguments(self, parser):
        parser.add_argument(
            "--remind", action="store_true",
            help="Also notify registrants of events starting within --within-hours.",
        )
        parser.add_argument(
            "--within-hours", type=int, default=24,
            help="Reminder window in hours (default 24). Only used with --remind.",
        )

    def handle(self, *args, **options):
        counts = teenpatti_service.refresh_event_statuses()
        self.stdout.write(self.style.SUCCESS(
            f"Teen Patti statuses: upcoming={counts['upcoming']} "
            f"live={counts['live']} completed={counts['completed']}"
        ))

        if options["remind"]:
            sent = teenpatti_service.notify_upcoming_events(within_hours=options["within_hours"])
            self.stdout.write(self.style.SUCCESS(
                f"Teen Patti reminders sent: {sent} (within {options['within_hours']}h)"
            ))
