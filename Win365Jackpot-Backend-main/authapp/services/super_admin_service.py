# authapp/services/super_admin_service.py
"""
All atomic operations for the SuperAdmin wallet system.

credit_admin_wallet   — SuperAdmin adds funds to AdminWallet
debit_admin_wallet    — SuperAdmin removes funds from AdminWallet
admin_transfer_to_user — Admin draws from AdminWallet, credits a User wallet
"""

import uuid
from decimal import Decimal
from django.db import transaction as db_transaction
from django.utils import timezone

from authapp.models.super_admin_models import AdminWallet, SuperAdminTransaction
from authapp.models.wallet_models import WalletAccount, WalletTransaction
from authapp.models.user_model import ActivityLog
from authapp.utils.account_number import generate_account_number

import logging
logger = logging.getLogger(__name__)


# ─── Reference generator ──────────────────────────────────────────────────────

def _gen_ref(prefix: str) -> str:
    now = timezone.now()
    return f"{prefix}-{now.strftime('%d%m%y%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"


# ─── Ensure user wallet exists ────────────────────────────────────────────────

def _get_or_create_user_wallet(user, wallet_type: str) -> WalletAccount:
    """Must be called inside a @db_transaction.atomic block (its one caller,
    admin_transfer_to_user, is). Locks the row so a concurrent operation on
    the same user's wallet can't race this read-modify-write."""
    acct, _ = WalletAccount.objects.get_or_create(
        user=user,
        wallet_type=wallet_type,
        defaults={
            "wallet_account_number": generate_account_number(wallet_type),
            "balance": Decimal("0"),
        },
    )
    return WalletAccount.objects.select_for_update().get(pk=acct.pk)


# ─── TXN type → wallet_type mapping for user wallets ─────────────────────────
# Mirrors your existing TXN_WALLET_MAP
_TXN_TO_WALLET = {"C": "C", "NC": "NC", "O": "O"}


# ═════════════════════════════════════════════════════════════════════════════
# 1.  SuperAdmin  →  AdminWallet  (credit)
# ═════════════════════════════════════════════════════════════════════════════

@db_transaction.atomic
def credit_admin_wallet(
    *,
    actor,          # request.user — must be superuser
    wallet_type: str,
    amount,
    note: str = "",
    target_admin=None,   # optional Admin this pool credit is attributed to
) -> dict:
    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValueError("Amount must be > 0")

    wallet = AdminWallet.objects.select_for_update().get(pk=1)
    before = wallet.get_balance(wallet_type)

    wallet.credit(wallet_type, amount)
    wallet.updated_by = actor
    wallet.save()

    after = wallet.get_balance(wallet_type)
    ref   = _gen_ref("SAC")

    txn = SuperAdminTransaction.objects.create(
        txn_type="SA_CREDIT",
        wallet_type=wallet_type,
        amount=amount,
        admin_wallet_before=before,
        admin_wallet_after=after,
        performed_by=actor,
        performed_by_email=actor.email,
        target_user=target_admin,
        target_user_uid=getattr(target_admin, "user_uid", ""),
        note=note,
        reference=ref,
    )

    ActivityLog.log(
        actor=actor,
        action="wallet_credit",
        wallet_type=_wallet_label(wallet_type),
        amount=amount,
        before_balance=before,
        after_balance=after,
        description=f"[SUPER ADMIN] Credited AdminWallet {wallet_type} +{amount}. Note: {note}",
        cr_dr="CR",
        reference_id=ref,
    )

    logger.info("SA credit AdminWallet %s +%s | ref=%s", wallet_type, amount, ref)

    return {
        "reference": ref,
        "wallet_type": wallet_type,
        "amount": float(amount),
        "admin_wallet_before": float(before),
        "admin_wallet_after": float(after),
    }


# ═════════════════════════════════════════════════════════════════════════════
# 2.  SuperAdmin  →  AdminWallet  (debit / correction)
# ═════════════════════════════════════════════════════════════════════════════

@db_transaction.atomic
def debit_admin_wallet(
    *,
    actor,
    wallet_type: str,
    amount,
    note: str = "",
    target_admin=None,   # optional Admin this pool debit is attributed to
) -> dict:
    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValueError("Amount must be > 0")

    wallet = AdminWallet.objects.select_for_update().get(pk=1)
    before = wallet.get_balance(wallet_type)

    wallet.debit(wallet_type, amount)   # raises ValueError if insufficient
    wallet.updated_by = actor
    wallet.save()

    after = wallet.get_balance(wallet_type)
    ref   = _gen_ref("SAD")

    SuperAdminTransaction.objects.create(
        txn_type="SA_DEBIT",
        wallet_type=wallet_type,
        amount=amount,
        admin_wallet_before=before,
        admin_wallet_after=after,
        performed_by=actor,
        performed_by_email=actor.email,
        target_user=target_admin,
        target_user_uid=getattr(target_admin, "user_uid", ""),
        note=note,
        reference=ref,
    )

    ActivityLog.log(
        actor=actor,
        action="wallet_debit",
        wallet_type=_wallet_label(wallet_type),
        amount=amount,
        before_balance=before,
        after_balance=after,
        description=f"[SUPER ADMIN] Debited AdminWallet {wallet_type} -{amount}. Note: {note}",
        cr_dr="DR",
        reference_id=ref,
    )

    return {
        "reference": ref,
        "wallet_type": wallet_type,
        "amount": float(amount),
        "admin_wallet_before": float(before),
        "admin_wallet_after": float(after),
    }


# ═════════════════════════════════════════════════════════════════════════════
# 3.  Admin  →  User  (transfer — deducts AdminWallet, credits User wallet)
# ═════════════════════════════════════════════════════════════════════════════

@db_transaction.atomic
def admin_transfer_to_user(
    *,
    actor,              # request.user — must be staff
    target_user,
    wallet_type: str,   # C / NC / O
    amount,
    txn_type: str,      # e.g. LUB, WBA, CBG — from your existing TRANSACTION_TYPES
    note: str = "",
) -> dict:
    from authapp.models.wallet_models import TXN_WALLET_MAP
    if txn_type not in TXN_WALLET_MAP:
        raise ValueError(f"Unknown txn_type: {txn_type!r}")
    if TXN_WALLET_MAP[txn_type] != wallet_type:
        raise ValueError(
            f"txn_type {txn_type!r} belongs to wallet {TXN_WALLET_MAP[txn_type]!r}, "
            f"not {wallet_type!r}"
        )

    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValueError("Amount must be > 0")

    # Lock AdminWallet and deduct
    admin_wallet = AdminWallet.objects.select_for_update().get(pk=1)
    admin_before = admin_wallet.get_balance(wallet_type)

    admin_wallet.debit(wallet_type, amount)   # raises if insufficient
    admin_wallet.updated_by = actor
    admin_wallet.save()

    admin_after = admin_wallet.get_balance(wallet_type)

    # Credit User wallet
    user_wallet = _get_or_create_user_wallet(target_user, wallet_type)
    user_before = user_wallet.balance
    user_wallet.balance += amount
    user_wallet.last_reason = txn_type
    user_wallet.updated_by = actor
    user_wallet.save(update_fields=["balance", "last_reason", "updated_by", "updated_at"])

    user_after = user_wallet.balance

    # Write to existing WalletTransaction ledger (what your admin Txns tab reads)
    ref = _gen_ref("ADT")
    WalletTransaction.objects.create(
        user=target_user,
        wallet=user_wallet,
        transaction_type=txn_type,
        amount=amount,
        balance_before=user_before,
        balance_after=user_after,
        performed_by=actor,
        note=f"[ADMIN→USER] {note}" if note else f"[ADMIN→USER] {txn_type}",
        validation_status="approved",
        transaction_reference=ref,
    )

    # Write to SuperAdminTransaction ledger
    SuperAdminTransaction.objects.create(
        txn_type="ADM_TRANSFER",
        wallet_type=wallet_type,
        amount=amount,
        admin_wallet_before=admin_before,
        admin_wallet_after=admin_after,
        performed_by=actor,
        performed_by_email=actor.email,
        target_user=target_user,
        target_user_uid=getattr(target_user, "user_uid", ""),
        user_wallet_before=user_before,
        user_wallet_after=user_after,
        note=note,
        reference=ref,
    )

    ActivityLog.log(
        actor=actor,
        target_user=target_user,
        action="wallet_credit",
        wallet_type=_wallet_label(wallet_type),
        amount=amount,
        before_balance=user_before,
        after_balance=user_after,
        description=(
            f"[ADMIN TRANSFER] {txn_type} ${amount} to {target_user.email} "
            f"({wallet_type}). AdminWallet: {admin_before}→{admin_after}."
        ),
        cr_dr="CR",
        reference_id=ref,
    )

    # Notify user
    try:
        from authapp.services.notification_service import notify_transaction
        notify_transaction(
            user=target_user,
            txn_type=txn_type,
            amount=amount,
            wallet_type=wallet_type,
            balance_after=float(user_after),
            casino_name=None,
            extra_note=note,
        )
    except Exception as exc:
        logger.warning("notify failed admin_transfer_to_user: %s", exc)

    return {
        "reference": ref,
        "txn_type": txn_type,
        "wallet_type": wallet_type,
        "amount": float(amount),
        "admin_wallet_before": float(admin_before),
        "admin_wallet_after": float(admin_after),
        "user_wallet_before": float(user_before),
        "user_wallet_after": float(user_after),
        "target_user_uid": getattr(target_user, "user_uid", ""),
    }


def _wallet_label(wt):
    return {"C": "cash", "NC": "non_cash", "O": "otp"}.get(wt, wt.lower())