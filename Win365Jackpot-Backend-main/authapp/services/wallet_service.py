"""
authapp/services/wallet_service.py
─────────────────────────────────────────────────────────────────────────────
WALLET-REQUESTS: extracted from authapp/views/admin_offline_deposit_views.py
(where these were private, view-local helpers named _get_or_create_wallet /
_credit_main / _debit_main) so the new user-initiated Deposit/Withdrawal
Request system can call the exact same main-wallet credit/debit logic
without duplicating it. Behavior is byte-for-byte unchanged — this is a
relocation, not a rewrite. admin_offline_deposit_views.py now imports these
same functions instead of defining its own copies.

Safe to delete only if BOTH admin_offline_deposit_views.py and the new
wallet_request_service.py are reverted to not depend on it — see the
WALLET-REQUESTS rollback notes.
"""
from decimal import Decimal

from authapp.models.wallet_models import WalletAccount, WalletTransaction
from authapp.utils.account_number import generate_account_number

import logging
logger = logging.getLogger(__name__)


def get_or_create_main_wallet(user, wallet_type: str) -> WalletAccount:
    """
    Must be called inside a @transaction.atomic block. Locks the row after
    get_or_create so concurrent credit/debit requests against the same
    user's wallet serialize instead of losing an update.
    """
    acct, _ = WalletAccount.objects.get_or_create(
        user=user,
        wallet_type=wallet_type,
        defaults={
            "wallet_account_number": generate_account_number(wallet_type),
            "balance": Decimal("0"),
        },
    )
    return WalletAccount.objects.select_for_update().get(pk=acct.pk)


def credit_main_wallet(user, wallet_type, amount, txn_type, note, actor) -> float:
    """Credit user's main wallet. Returns new balance."""
    acct   = get_or_create_main_wallet(user, wallet_type)
    amount = Decimal(str(amount))
    before = acct.balance
    acct.balance += amount
    acct.last_reason = txn_type
    acct.updated_by  = actor
    acct.save(update_fields=["balance", "last_reason", "updated_by", "updated_at"])
    WalletTransaction.objects.create(
        user=user, wallet=acct, transaction_type=txn_type,
        amount=amount, balance_before=before, balance_after=acct.balance,
        performed_by=actor, note=note, validation_status="approved",
    )
    try:
        from authapp.services.notification_service import notify_transaction
        notify_transaction(
            user=user, txn_type=txn_type, amount=amount,
            wallet_type=wallet_type, balance_after=acct.balance,
            casino_name=None, extra_note=note,
        )
    except Exception as e:
        logger.warning("notify_transaction failed: %s", e)
    return float(acct.balance)


def debit_main_wallet(user, wallet_type, amount, txn_type, note, actor) -> float:
    """Debit user's main wallet. Raises ValueError if insufficient."""
    acct   = get_or_create_main_wallet(user, wallet_type)
    amount = Decimal(str(amount))
    if acct.balance < amount:
        raise ValueError(
            f"Insufficient main {wallet_type} balance "
            f"(available: ${acct.balance:,.2f}, required: ${amount:,.2f})"
        )
    before = acct.balance
    acct.balance -= amount
    acct.last_reason = txn_type
    acct.updated_by  = actor
    acct.save(update_fields=["balance", "last_reason", "updated_by", "updated_at"])
    WalletTransaction.objects.create(
        user=user, wallet=acct, transaction_type=txn_type,
        amount=amount, balance_before=before, balance_after=acct.balance,
        performed_by=actor, note=note, validation_status="approved",
    )
    try:
        from authapp.services.notification_service import notify_transaction
        if txn_type != "DAC":   # prevent duplicate notification for deposit
            notify_transaction(
                user=user, txn_type=txn_type, amount=amount,
                wallet_type=wallet_type, balance_after=acct.balance,
                casino_name=None, extra_note=note,
            )
    except Exception as e:
        logger.warning("notify_transaction failed: %s", e)
    return float(acct.balance)
