from decouple import config

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from authapp.models import User, AdminProfile


def _seed_account(stdout, style, *, email, password, name, role, is_superuser):
    if not email:
        stdout.write(style.WARNING(
            f"Skipping {role}: {role.upper()}_EMAIL is not set."
        ))
        return

    email = email.strip().lower()

    if User.objects.filter(email__iexact=email).exists():
        stdout.write(style.NOTICE(
            f"{role} account already exists ({email}) — leaving it untouched."
        ))
        return

    if not password:
        raise CommandError(
            f"{role.upper()}_EMAIL is set but {role.upper()}_PASSWORD is missing."
        )
    try:
        validate_password(password)
    except DjangoValidationError as exc:
        raise CommandError(
            f"{role.upper()}_PASSWORD is too weak: {'; '.join(exc.messages)}"
        )

    # User.objects.create_user hashes the password via set_password() —
    # never stored or logged in plaintext.
    user = User.objects.create_user(
        email=email,
        password=password,
        name=name,
        is_staff=True,
        is_superuser=is_superuser,
    )
    AdminProfile.objects.get_or_create(user=user, defaults={"role": role})
    stdout.write(style.SUCCESS(f"Created {role} account: {email}"))


class Command(BaseCommand):
    help = (
        "Seeds a default Super Admin (is_staff+is_superuser) and Admin "
        "(is_staff) account from environment variables. Idempotent and "
        "safe to run on every deploy — an account is only ever created if "
        "no user with that email already exists; existing accounts "
        "(including their passwords) are never modified. Leave an "
        "*_EMAIL var blank to skip seeding that account."
    )

    def handle(self, *args, **options):
        _seed_account(
            self.stdout, self.style,
            email=config("SUPERADMIN_EMAIL", default=""),
            password=config("SUPERADMIN_PASSWORD", default=""),
            name=config("SUPERADMIN_NAME", default="Super Admin"),
            role="superadmin",
            is_superuser=True,
        )
        _seed_account(
            self.stdout, self.style,
            email=config("ADMIN_EMAIL", default=""),
            password=config("ADMIN_PASSWORD", default=""),
            name=config("ADMIN_NAME", default="Admin"),
            role="admin",
            is_superuser=False,
        )
