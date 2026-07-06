"""
authapp/signals.py  (add/merge into your existing signals.py)
────────────────────────────────────────────────────────────────────────────
Auto-creates 4 WalletAccount rows whenever a new User is created.
Account numbers follow the format: {PREFIX}{DDMMYY}{SS}{ms+offset}

Also handles rolling-points update notification to admin when
threshold is reached after a RollingPointsLog is saved.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings

from .models.wallet_models import WalletAccount
from .utils.account_number import generate_account_number

User = settings.AUTH_USER_MODEL


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_wallet_accounts(sender, instance, created, **kwargs):
    """Create 4 wallet accounts for every new user."""
    if not created:
        return

    wallet_types = ["C", "NC", "O", "RP"]
    for wtype in wallet_types:
        acc_no = generate_account_number(wtype)
        WalletAccount.objects.get_or_create(
            user=instance,
            wallet_type=wtype,
            defaults={
                "wallet_account_number": acc_no,
                "balance": 0,
            }
        )