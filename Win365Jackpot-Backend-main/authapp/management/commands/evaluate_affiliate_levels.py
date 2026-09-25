"""
python manage.py evaluate_affiliate_levels

AFFILIATE-LEVELS: re-check every unlocked affiliate against the Back Office
level conditions and move up anyone who has earned it. Levels are normally
checked the moment a deposit, commission or referral sign-up is saved, and
again whenever an admin saves the conditions; this is the manual catch-all
(for example after importing historical data). Up only, like every check.
"""

from django.core.management.base import BaseCommand

from authapp.services import affiliate_level_service


class Command(BaseCommand):
    help = "Move affiliates up to the highest level whose conditions they meet."

    def handle(self, *args, **options):
        moved = affiliate_level_service.evaluate_all(source="management_command")
        self.stdout.write(self.style.SUCCESS(f"{len(moved)} affiliate(s) moved up."))
        for user_id, level in sorted(moved.items()):
            self.stdout.write(f"  user {user_id} -> {level}")
