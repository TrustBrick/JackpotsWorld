"""
authapp/services/wallet_request_service.py
─────────────────────────────────────────────────────────────────────────────
WALLET-REQUESTS: new module — safe to delete entirely to remove the feature.

Self-service Deposit Request / Withdrawal Request workflow on the main Cash
wallet only. Every balance mutation goes through
authapp.services.wallet_service.credit_main_wallet/debit_main_wallet — the
exact same functions the existing admin Offline Transactions tool already
uses — so this module never touches wallet math directly. The resulting
WalletTransaction row IS the transaction log (linked back via a nullable
FK); ActivityLog IS the audit log. No parallel ledger/audit tables.

Withdrawal "locking": rather than adding a locked_for_withdrawal field to
the live WalletAccount table (which the instructions say not to touch), the
amount available for a NEW withdrawal request is computed on the fly as
    cash_balance - SUM(amount of this user's still-open WithdrawalRequests)
"Open" = pending/processing/approved. This reserves the money against
double-spending without duplicating or altering the existing balance
calculation — the real WalletAccount.balance is only ever touched at the
moment a withdrawal is actually marked Paid (debit_main_wallet), exactly
like every other wallet-mutating flow in this codebase.
"""
import logging
from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone

from authapp.models import ActivityLog
from authapp.models.wallet_models import WalletAccount, WalletTransaction
from authapp.models.wallet_request_models import (
    DepositRequest,
    DepositRequestStatusHistory,
    WalletRequestMethodConfig,
    WithdrawalRequest,
    WithdrawalRequestStatusHistory,
)
from authapp.services.wallet_service import credit_main_wallet, debit_main_wallet

logger = logging.getLogger(__name__)

CASH = "C"


class WalletRequestError(ValueError):
    """Raised for any validation failure — views catch this and return 400."""


def _notify(user, title, message):
    try:
        from authapp.services.notification_service import notify_generic
        notify_generic(user=user, title=title, message=message, icon="wallet")
    except Exception as exc:
        logger.warning("wallet request notify failed for user=%s: %s", user, exc)


def _latest_wallet_txn(user, txn_type):
    """See module docstring — safe within the same atomic/select_for_update
    block that just wrote it via credit_main_wallet/debit_main_wallet."""
    return (
        WalletTransaction.objects
        .filter(user=user, wallet__wallet_type=CASH, transaction_type=txn_type)
        .order_by("-created_at")
        .first()
    )


# ─── Read-only summary ────────────────────────────────────────────────────────

def get_cash_balance(user) -> Decimal:
    acct = WalletAccount.objects.filter(user=user, wallet_type=CASH).first()
    return acct.balance if acct else Decimal("0")


def get_locked_withdrawal_amount(user) -> Decimal:
    total = WithdrawalRequest.objects.filter(
        user=user, status__in=WithdrawalRequest.OPEN_STATUSES,
    ).aggregate(t=Sum("amount"))["t"]
    return total or Decimal("0")


def get_available_balance(user) -> Decimal:
    return get_cash_balance(user) - get_locked_withdrawal_amount(user)


def get_wallet_request_summary(user) -> dict:
    cash_balance = get_cash_balance(user)
    locked = get_locked_withdrawal_amount(user)
    return {
        "cash_balance": cash_balance,
        "locked_for_withdrawal": locked,
        "available_for_withdrawal": cash_balance - locked,
        "enabled_deposit_methods": list(WalletRequestMethodConfig.objects.filter(is_enabled=True)),
    }


# ─── Deposit requests (affiliate-style naming avoided — this is the MAIN wallet) ──

@db_transaction.atomic
def create_deposit_request(*, user, amount, casino=None, method_code, payment_reference="", notes="", ip_address=None):
    try:
        amount = Decimal(str(amount))
    except Exception:
        raise WalletRequestError("Invalid deposit amount.")
    if amount <= 0:
        raise WalletRequestError("Deposit amount must be greater than zero.")

    method = WalletRequestMethodConfig.objects.filter(code=method_code, is_enabled=True).first()
    if not method:
        raise WalletRequestError("This payment method is not currently available.")

    req = DepositRequest.objects.create(
        user=user, amount=amount, casino=casino, method=method,
        payment_reference=(payment_reference or "").strip(),
        notes=(notes or "").strip(),
        status="pending",
    )
    DepositRequestStatusHistory.objects.create(
        request=req, from_status="", to_status="pending",
        changed_by=user, note="Request created by user.", ip_address=ip_address,
    )
    ActivityLog.log(
        actor=user, target_user=user, action="main_deposit_requested",
        amount=amount, description=f"Deposit request {req.request_reference} for {amount} via {method.code}",
        reference_id=req.request_reference, ip_address=ip_address,
    )
    _notify(user, "Deposit request submitted",
            f"Your deposit request {req.request_reference} for ${amount:,.2f} has been submitted and is now pending review.")
    return req


@db_transaction.atomic
def cancel_deposit_request(*, request_obj, actor, ip_address=None):
    request_obj = DepositRequest.objects.select_for_update().get(pk=request_obj.pk)
    if request_obj.status != "pending":
        raise WalletRequestError("Only pending deposit requests can be cancelled.")

    request_obj.status = "cancelled"
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    request_obj.save(update_fields=["status", "processed_at", "updated_at"])

    DepositRequestStatusHistory.objects.create(
        request=request_obj, from_status="pending", to_status="cancelled",
        changed_by=actor, note="Cancelled by user.", ip_address=ip_address,
    )
    ActivityLog.log(
        actor=actor, target_user=request_obj.user, action="main_deposit_cancelled",
        amount=request_obj.amount, description=f"Deposit request {request_obj.request_reference} cancelled",
        reference_id=request_obj.request_reference, ip_address=ip_address,
    )
    _notify(request_obj.user, "Deposit request cancelled",
            f"Your deposit request {request_obj.request_reference} has been cancelled.")
    return request_obj


def _evaluate_deposit_commission(user):
    """Re-evaluate this player's Deposit Commission under the rule engine.

    Best-effort and non-fatal, the same shape the admin offline-deposit view
    uses: a commission problem must never roll back an approved deposit. With
    no matching deposit rule this is a no-op, so nothing changes for any
    affiliate who has not been given one.
    """
    try:
        from authapp.services import commission_engine_service
        commission_engine_service.evaluate(user, commission_type="deposit")
    except Exception as e:
        logger.warning("deposit commission evaluation failed for user %s: %s", user.id, e)


def _require_deposit_status(request_obj, *valid_from):
    if request_obj.status not in valid_from:
        raise WalletRequestError(
            f"Cannot perform this action from status '{request_obj.status}'. Expected one of: {', '.join(valid_from)}."
        )


@db_transaction.atomic
def admin_approve_deposit(*, request_obj, actor, note="", ip_address=None):
    request_obj = DepositRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_deposit_status(request_obj, "pending", "processing")

    credit_main_wallet(
        request_obj.user, CASH, request_obj.amount, txn_type="DAC",
        note=f"Deposit request {request_obj.request_reference} approved" + (f" — {note}" if note else ""),
        actor=actor,
    )
    txn = _latest_wallet_txn(request_obj.user, "DAC")

    from_status = request_obj.status
    request_obj.status = "approved"
    request_obj.reviewed_by = actor
    request_obj.wallet_transaction = txn
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=["status", "reviewed_by", "wallet_transaction", "processed_at", "admin_notes", "updated_at"])

    DepositRequestStatusHistory.objects.create(
        request=request_obj, from_status=from_status, to_status="approved",
        changed_by=actor, note=note, ip_address=ip_address,
    )
    ActivityLog.log(
        actor=actor, target_user=request_obj.user, action="main_deposit_approved",
        amount=request_obj.amount, description=f"Deposit request {request_obj.request_reference} approved",
        reference_id=request_obj.request_reference, ip_address=ip_address,
    )
    _notify(request_obj.user, "Deposit approved",
            f"Your deposit request {request_obj.request_reference} for ${request_obj.amount:,.2f} has been approved and credited to your Cash Wallet.")

    # Deposit Commission — an approved DepositRequest is one of the two
    # deposits affiliate_stats_service.get_deposit_totals() counts (the other
    # being an offline DAC entry), so the referrer's deposit commission has to
    # be re-evaluated here too or it would only ever see half the money.
    # There is no casino in this flow, so only rules that do not pin one can
    # match — which is the correct outcome, not a miss.
    _evaluate_deposit_commission(request_obj.user)

    return request_obj


@db_transaction.atomic
def admin_move_deposit_processing(*, request_obj, actor, note="", ip_address=None):
    request_obj = DepositRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_deposit_status(request_obj, "pending")

    request_obj.status = "processing"
    request_obj.reviewed_by = actor
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=["status", "reviewed_by", "admin_notes", "updated_at"])

    DepositRequestStatusHistory.objects.create(
        request=request_obj, from_status="pending", to_status="processing",
        changed_by=actor, note=note, ip_address=ip_address,
    )
    ActivityLog.log(actor=actor, target_user=request_obj.user, action="main_deposit_processing",
                     amount=request_obj.amount, description=f"Deposit request {request_obj.request_reference} moved to processing",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.user, "Deposit request processing",
            f"Your deposit request {request_obj.request_reference} is now being processed.")
    return request_obj


@db_transaction.atomic
def admin_reject_deposit(*, request_obj, actor, reason, ip_address=None):
    if not reason or not reason.strip():
        raise WalletRequestError("A rejection reason is required.")
    request_obj = DepositRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_deposit_status(request_obj, "pending", "processing")
    from_status = request_obj.status

    request_obj.status = "rejected"
    request_obj.rejection_reason = reason
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    request_obj.save(update_fields=["status", "rejection_reason", "reviewed_by", "processed_at", "updated_at"])

    DepositRequestStatusHistory.objects.create(
        request=request_obj, from_status=from_status, to_status="rejected",
        changed_by=actor, note=reason, ip_address=ip_address,
    )
    ActivityLog.log(actor=actor, target_user=request_obj.user, action="main_deposit_rejected",
                     amount=request_obj.amount, description=f"Deposit request {request_obj.request_reference} rejected: {reason}",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.user, "Deposit request rejected",
            f"Your deposit request {request_obj.request_reference} was rejected: {reason}")
    return request_obj


@db_transaction.atomic
def admin_cancel_deposit(*, request_obj, actor, note="", ip_address=None):
    request_obj = DepositRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_deposit_status(request_obj, *DepositRequest.OPEN_STATUSES)
    from_status = request_obj.status

    request_obj.status = "cancelled"
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=["status", "reviewed_by", "processed_at", "admin_notes", "updated_at"])

    DepositRequestStatusHistory.objects.create(
        request=request_obj, from_status=from_status, to_status="cancelled",
        changed_by=actor, note=note or "Cancelled by admin.", ip_address=ip_address,
    )
    ActivityLog.log(actor=actor, target_user=request_obj.user, action="main_deposit_cancelled",
                     amount=request_obj.amount, description=f"Deposit request {request_obj.request_reference} cancelled by admin",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.user, "Deposit request cancelled",
            f"Your deposit request {request_obj.request_reference} was cancelled by our team.")
    return request_obj


# ─── Withdrawal requests ──────────────────────────────────────────────────────

def get_casino_cash_balance(user, casino) -> Decimal:
    from authapp.models.casino_wallet_models import CasinoWalletAccount
    acct = CasinoWalletAccount.objects.filter(user=user, casino_name=casino.name, wallet_type=CASH).first()
    return acct.balance if acct else Decimal("0")


def get_casino_locked_withdrawal_amount(user, casino) -> Decimal:
    total = WithdrawalRequest.objects.filter(
        user=user, casino=casino, status__in=WithdrawalRequest.OPEN_STATUSES,
    ).aggregate(t=Sum("amount"))["t"]
    return total or Decimal("0")


def get_casino_available_balance(user, casino) -> Decimal:
    return get_casino_cash_balance(user, casino) - get_casino_locked_withdrawal_amount(user, casino)


@db_transaction.atomic
def create_withdrawal_request(*, user, amount, casino, method_code, notes="", ip_address=None):
    try:
        amount = Decimal(str(amount))
    except Exception:
        raise WalletRequestError("Invalid withdrawal amount.")
    if amount <= 0:
        raise WalletRequestError("Withdrawal amount must be greater than zero.")
    if not casino:
        raise WalletRequestError("Please select a casino.")

    method = WalletRequestMethodConfig.objects.filter(code=method_code, is_enabled=True).first()
    if not method:
        raise WalletRequestError("This payment method is not currently available.")

    available = get_casino_available_balance(user, casino)
    if amount > available:
        raise WalletRequestError(f"Withdrawal amount exceeds your available casino wallet balance (${available:,.2f}).")

    req = WithdrawalRequest.objects.create(
        user=user, wallet_type=CASH, amount=amount, casino=casino, method=method,
        notes=(notes or "").strip(), status="pending",
    )
    WithdrawalRequestStatusHistory.objects.create(
        request=req, from_status="", to_status="pending",
        changed_by=user, note="Request created by user.", ip_address=ip_address,
    )
    ActivityLog.log(
        actor=user, target_user=user, action="main_withdrawal_requested",
        amount=amount, description=f"Withdrawal request {req.request_reference} for {amount} at {casino.name} via {method.code}",
        reference_id=req.request_reference, ip_address=ip_address,
    )
    _notify(user, "Withdrawal request submitted",
            f"Your withdrawal request {req.request_reference} for ${amount:,.2f} has been submitted and is now pending review.")
    return req


@db_transaction.atomic
def cancel_withdrawal_request(*, request_obj, actor, ip_address=None):
    request_obj = WithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    if request_obj.status != "pending":
        raise WalletRequestError("Only pending withdrawal requests can be cancelled.")

    request_obj.status = "cancelled"
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    request_obj.save(update_fields=["status", "processed_at", "updated_at"])

    WithdrawalRequestStatusHistory.objects.create(
        request=request_obj, from_status="pending", to_status="cancelled",
        changed_by=actor, note="Cancelled by user.", ip_address=ip_address,
    )
    ActivityLog.log(
        actor=actor, target_user=request_obj.user, action="main_withdrawal_cancelled",
        amount=request_obj.amount, description=f"Withdrawal request {request_obj.request_reference} cancelled",
        reference_id=request_obj.request_reference, ip_address=ip_address,
    )
    _notify(request_obj.user, "Withdrawal request cancelled",
            f"Your withdrawal request {request_obj.request_reference} has been cancelled. The reserved amount is available again.")
    return request_obj


def _require_withdrawal_status(request_obj, *valid_from):
    if request_obj.status not in valid_from:
        raise WalletRequestError(
            f"Cannot perform this action from status '{request_obj.status}'. Expected one of: {', '.join(valid_from)}."
        )


@db_transaction.atomic
def admin_approve_withdrawal(*, request_obj, actor, note="", ip_address=None):
    request_obj = WithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_withdrawal_status(request_obj, "pending")

    from_status = request_obj.status
    request_obj.status = "approved"
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=["status", "reviewed_by", "processed_at", "admin_notes", "updated_at"])

    WithdrawalRequestStatusHistory.objects.create(request=request_obj, from_status=from_status, to_status="approved",
                                                    changed_by=actor, note=note, ip_address=ip_address)
    ActivityLog.log(actor=actor, target_user=request_obj.user, action="main_withdrawal_approved",
                     amount=request_obj.amount, description=f"Withdrawal request {request_obj.request_reference} approved",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.user, "Withdrawal request approved",
            f"Your withdrawal request {request_obj.request_reference} has been approved and will be paid shortly.")
    return request_obj


@db_transaction.atomic
def admin_move_withdrawal_processing(*, request_obj, actor, note="", ip_address=None):
    request_obj = WithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_withdrawal_status(request_obj, "pending", "approved")

    from_status = request_obj.status
    request_obj.status = "processing"
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=["status", "reviewed_by", "processed_at", "admin_notes", "updated_at"])

    WithdrawalRequestStatusHistory.objects.create(request=request_obj, from_status=from_status, to_status="processing",
                                                    changed_by=actor, note=note, ip_address=ip_address)
    ActivityLog.log(actor=actor, target_user=request_obj.user, action="main_withdrawal_processing",
                     amount=request_obj.amount, description=f"Withdrawal request {request_obj.request_reference} moved to processing",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.user, "Withdrawal request processing",
            f"Your withdrawal request {request_obj.request_reference} is now being processed.")
    return request_obj


@db_transaction.atomic
def admin_reject_withdrawal(*, request_obj, actor, reason, ip_address=None):
    if not reason or not reason.strip():
        raise WalletRequestError("A rejection reason is required.")
    request_obj = WithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_withdrawal_status(request_obj, "pending", "processing", "approved")
    from_status = request_obj.status

    request_obj.status = "rejected"
    request_obj.rejection_reason = reason
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    request_obj.save(update_fields=["status", "rejection_reason", "reviewed_by", "processed_at", "updated_at"])

    WithdrawalRequestStatusHistory.objects.create(request=request_obj, from_status=from_status, to_status="rejected",
                                                    changed_by=actor, note=reason, ip_address=ip_address)
    ActivityLog.log(actor=actor, target_user=request_obj.user, action="main_withdrawal_rejected",
                     amount=request_obj.amount, description=f"Withdrawal request {request_obj.request_reference} rejected: {reason}",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.user, "Withdrawal request rejected",
            f"Your withdrawal request {request_obj.request_reference} was rejected: {reason}. The reserved amount is available again.")
    return request_obj


@db_transaction.atomic
def admin_mark_withdrawal_paid(*, request_obj, actor, note="", ip_address=None):
    request_obj = WithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_withdrawal_status(request_obj, "processing", "approved")
    from_status = request_obj.status

    pay_note = f"Withdrawal request {request_obj.request_reference} paid" + (f" — {note}" if note else "")
    try:
        if request_obj.casino:
            # Post-casino-wallet withdrawals: paid out from the specific
            # casino wallet the user requested against (see
            # get_casino_available_balance), not the main Cash wallet.
            from authapp.services.casino_wallet_service import debit_casino_wallet
            debit_casino_wallet(
                request_obj.user, request_obj.casino.name, CASH, request_obj.amount,
                actor=actor, txn_type="WAC", note=pay_note, country=request_obj.casino.country,
            )
        else:
            # Legacy rows created before the casino field existed still draw
            # against the main Cash wallet.
            debit_main_wallet(
                request_obj.user, CASH, request_obj.amount, txn_type="WAC",
                note=pay_note, actor=actor,
            )
    except ValueError as exc:
        # Defense in depth: the availability check already ran at request
        # creation, but the real balance is only ever touched here — if
        # something changed in between (e.g. other debits), surface it.
        raise WalletRequestError(str(exc))

    txn = _latest_wallet_txn(request_obj.user, "WAC")

    request_obj.status = "paid"
    request_obj.wallet_transaction = txn
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=["status", "wallet_transaction", "reviewed_by", "processed_at", "admin_notes", "updated_at"])

    WithdrawalRequestStatusHistory.objects.create(request=request_obj, from_status=from_status, to_status="paid",
                                                    changed_by=actor, note=note, ip_address=ip_address)
    ActivityLog.log(actor=actor, target_user=request_obj.user, action="main_withdrawal_paid",
                     amount=request_obj.amount, description=f"Withdrawal request {request_obj.request_reference} paid",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.user, "Withdrawal paid",
            f"Your withdrawal request {request_obj.request_reference} for ${request_obj.amount:,.2f} has been paid.")
    return request_obj


@db_transaction.atomic
def admin_cancel_withdrawal(*, request_obj, actor, note="", ip_address=None):
    request_obj = WithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_withdrawal_status(request_obj, *WithdrawalRequest.OPEN_STATUSES)
    from_status = request_obj.status

    request_obj.status = "cancelled"
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=["status", "reviewed_by", "processed_at", "admin_notes", "updated_at"])

    WithdrawalRequestStatusHistory.objects.create(request=request_obj, from_status=from_status, to_status="cancelled",
                                                    changed_by=actor, note=note or "Cancelled by admin.", ip_address=ip_address)
    ActivityLog.log(actor=actor, target_user=request_obj.user, action="main_withdrawal_cancelled",
                     amount=request_obj.amount, description=f"Withdrawal request {request_obj.request_reference} cancelled by admin",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.user, "Withdrawal request cancelled",
            f"Your withdrawal request {request_obj.request_reference} was cancelled by our team. The reserved amount is available again.")
    return request_obj
