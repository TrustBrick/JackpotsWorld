"""
authapp/services/casino_wallet_service.py
─────────────────────────────────────────────────────────────────────────────
All casino wallet credit/debit operations.
Every operation writes to BOTH:
  1. CasinoWalletAccount  (live balance)
  2. CasinoWalletTransaction  (immutable audit log — never used for balance)
  3. WalletTransaction  (unified log — what the admin Txns tab reads)

The WalletTransaction row uses the MAIN wallet FK but records casino context
in the note field.  This lets the existing admin transaction list show every
operation without a schema change.
─────────────────────────────────────────────────────────────────────────────
"""

from decimal import Decimal
from django.utils import timezone
from django.db import transaction as db_transaction

from authapp.models.casino_wallet_models import CasinoWalletAccount, CasinoWalletTransaction
from authapp.models.wallet_models import WalletAccount, WalletTransaction
from authapp.utils.account_number import generate_account_number

import logging
logger = logging.getLogger(__name__)


# ─── Internal helpers ─────────────────────────────────────────────────────────




def _get_or_create_casino_wallet(user, casino_name: str, wallet_type: str, country: str = None) -> CasinoWalletAccount:
    """
    Must be called inside a @db_transaction.atomic block (every caller in
    this module is). Locks the row after get_or_create so concurrent
    credit/debit requests against the same casino wallet serialize instead
    of losing an update.
    """
    acct, created = CasinoWalletAccount.objects.get_or_create(
        user=user,
        casino_name=casino_name,
        wallet_type=wallet_type,
        defaults={
            "balance": Decimal("0"),
            "user_uid": user.user_uid,  # 🔥 REQUIRED
            "country": country or "",
        }
    )
    acct = CasinoWalletAccount.objects.select_for_update().get(pk=acct.pk)
    # Backfill country on legacy rows that predate this field, or self-heal
    # a blank one, whenever a country is actually supplied by the caller.
    if country and not acct.country:
        acct.country = country
        acct.save(update_fields=["country"])
    return acct


def _get_or_create_main_wallet(user, wallet_type: str) -> WalletAccount:
    """
    Get the user's main (JackpotsWorld) wallet account for unified txn logging.
    This is the FK that WalletTransaction.wallet points to.
    """
    acct, _ = WalletAccount.objects.get_or_create(
        user=user,
        wallet_type=wallet_type,
        defaults={
            "wallet_account_number": generate_account_number(wallet_type),
            "balance": Decimal("0"),
        },
    )
    return acct


def _write_casino_txn(
    *,
    user,
    casino_wallet,
    txn_type,
    amount,
    balance_before,
    balance_after,
    note,
    actor,
    unified_ref="",   # ← add this
):
    return CasinoWalletTransaction.objects.create(
        user=user,
        user_uid=user.user_uid,
        casino_name=casino_wallet.casino_name,
        wallet_type=casino_wallet.wallet_type,
        transaction_type=txn_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        note=note,
        performed_by=actor,
        unified_ref=unified_ref,   # ← add this
    )


def _write_unified_txn(
    *,
    user,
    wallet_type: str,
    txn_type: str,
    amount: Decimal,
    note: str,
    actor,
) -> WalletTransaction:
    """
    Write one row to WalletTransaction so the admin Txns tab shows every
    casino operation in the unified ledger.

    balance_before / balance_after here reflect the MAIN wallet at the time
    of the call — they are informational only for casino-side operations.
    The main wallet balance itself is only mutated by the cash-view code
    (for WIN/LAC/etc. that explicitly credit/debit main).
    """
    main_wallet = _get_or_create_main_wallet(user, wallet_type)
    current_bal = main_wallet.balance  # snapshot — not modified here

    return WalletTransaction.objects.create(
        user=user,
        wallet=main_wallet,
        transaction_type=txn_type,
        amount=amount,
        balance_before=current_bal,
        balance_after=current_bal,   # unchanged by casino-only ops
        performed_by=actor,
        note=note,
        validation_status="approved",
    )


# ─── Public API ───────────────────────────────────────────────────────────────

@db_transaction.atomic
def credit_casino_wallet(
    user,
    casino_name: str,
    wallet_type: str,
    amount,
    actor,
    txn_type: str,
    note: str = "",
    country: str = None,
) -> dict:
    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValueError("Credit amount must be > 0")

    acct = _get_or_create_casino_wallet(user, casino_name, wallet_type, country=country)
    before = acct.balance
    acct.balance += amount
    acct.last_transaction_type = txn_type
    acct.updated_by_email = actor.email if actor else None
    acct.save(update_fields=["balance", "last_transaction_type", "updated_by_email", "updated_at"])

    full_note = note or f"{txn_type} at {casino_name}"

    unified_note = f"[CASINO:{casino_name}] [{wallet_type}] {txn_type} ${amount} | {full_note}"
    unified_txn = None

    if txn_type != "DAC":   # 🔥 ADD THIS
        unified_txn = _write_unified_txn(
            user=user,
            wallet_type=wallet_type,
            txn_type=txn_type,
            amount=amount,
            note=unified_note,
            actor=actor,
        )

    casino_txn = _write_casino_txn(
        user=user,
        casino_wallet=acct,
        txn_type=txn_type,
        amount=amount,
        balance_before=before,
        balance_after=acct.balance,
        note=full_note,
        actor=actor,
        unified_ref = unified_txn.transaction_reference if unified_txn else "",
        
    )

    # ── Notify user ──────────────────────────────────────────────────────────
    try:
        from authapp.services.notification_service import notify_transaction
        notify_transaction(
            user=user,
            txn_type=txn_type,
            amount=amount,
            wallet_type=wallet_type,
            balance_after=float(acct.balance),
            casino_name=casino_name,
            extra_note=full_note,
            actor=actor,
        )
    except Exception as exc:
        logger.warning("notify failed credit_casino_wallet: %s", exc)

    # ── Referral commission (flat % of a referred user's cash deposits) ────
    if txn_type == "DAC":
        try:
            from authapp.services.affiliate_service import record_referral_commission
            record_referral_commission(user, amount, source_ref=str(casino_txn.id))
        except Exception as exc:
            logger.warning("referral commission failed credit_casino_wallet: %s", exc)

    return {
        "casino_balance": float(acct.balance),
        "casino_txn_id":  str(casino_txn.id),
        "unified_ref": unified_txn.transaction_reference if unified_txn else "",
    }


@db_transaction.atomic
def debit_casino_wallet(
    user,
    casino_name: str,
    wallet_type: str,
    amount,
    actor,
    txn_type: str,
    note: str = "",
    country: str = None,
) -> dict:
    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValueError("Debit amount must be > 0")

    acct = _get_or_create_casino_wallet(user, casino_name, wallet_type, country=country)
    if acct.balance < amount:
        raise ValueError(
            f"Insufficient {casino_name}/{wallet_type} balance "
            f"(have ${acct.balance}, need ${amount})"
        )

    before = acct.balance
    acct.balance -= amount
    acct.last_transaction_type = txn_type
    acct.updated_by_email = actor.email if actor else None
    acct.save(update_fields=["balance", "last_transaction_type", "updated_by_email", "updated_at"])

    full_note = note or f"{txn_type} at {casino_name}"

    unified_note = f"[CASINO:{casino_name}] [{wallet_type}] {txn_type} ${amount} | {full_note}"
    unified_txn = _write_unified_txn(
        user=user,
        wallet_type=wallet_type,
        txn_type=txn_type,
        amount=amount,
        note=unified_note,
        actor=actor,
    )

    casino_txn = _write_casino_txn(
        user=user,
        casino_wallet=acct,
        txn_type=txn_type,
        amount=amount,
        balance_before=before,
        balance_after=acct.balance,
        note=full_note,
        actor=actor,
        unified_ref=unified_txn.transaction_reference if unified_txn else "",    )

    # ── Notify user ──────────────────────────────────────────────────────────
    try:
        from authapp.services.notification_service import notify_transaction
        notify_transaction(
            user=user,
            txn_type=txn_type,
            amount=amount,
            wallet_type=wallet_type,
            balance_after=float(acct.balance),
            casino_name=casino_name,
            extra_note=full_note,
            actor=actor,
           
        )
    except Exception as exc:
        logger.warning("notify failed debit_casino_wallet: %s", exc)

    return {
        "casino_balance": float(acct.balance),
        "casino_txn_id":  str(casino_txn.id),
        "unified_ref":    unified_txn.transaction_reference,
    }

    