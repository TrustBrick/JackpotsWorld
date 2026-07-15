from decouple import config

from django.core.management.base import BaseCommand, CommandError

from authapp.models import User


def _reset(stdout, style, *, email, password, role):
    if not email or not password:
        stdout.write(style.WARNING(f"Skipping {role}: email/password not set."))
        return

    email = email.strip().lower()
    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        raise CommandError(f"{role} account {email} does not exist.")

    user.set_password(password)
    user.save(update_fields=["password"])
    stdout.write(style.SUCCESS(f"Password reset for {role} account: {email}"))


class Command(BaseCommand):
    help = (
        "One-off: force-resets the password of the existing SUPERADMIN_EMAIL "
        "and ADMIN_EMAIL accounts from env vars, even if the account already "
        "existed. Temporary — remove after use."
    )

    def handle(self, *args, **options):
        _reset(
            self.stdout, self.style,
            email=config("SUPERADMIN_EMAIL", default=""),
            password=config("SUPERADMIN_PASSWORD", default=""),
            role="superadmin",
        )
        _reset(
            self.stdout, self.style,
            email=config("ADMIN_EMAIL", default=""),
            password=config("ADMIN_PASSWORD", default=""),
            role="admin",
        )
