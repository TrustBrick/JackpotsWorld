"""
authapp/services/affiliate_wallet_service.py
─────────────────────────────────────────────────────────────────────────────
AFFILIATE-WITHDRAWALS: new module — safe to delete entirely to remove the
feature (paired with affiliate_wallet_models.py / _views.py / _urls.py /
_serializers.py and the small hooks in affiliate_service.py).

All balance mutations follow the same pattern as casino_wallet_service.py:
  • @db_transaction.atomic
  • select_for_update() the wallet row before mutating it, so concurrent
    requests against the same affiliate's balance serialize instead of
    losing an update (prevents double-spending / race conditions)
  • before/after balance snapshot written to AffiliateWalletTransaction
  • ActivityLog.log(...) for the audit trail (who/what/when/IP)
  • AffiliateWithdrawalStatusHistory row for every status transition
  • notify_generic(...) wrapped in try/except so a notification failure
    never rolls back or blocks the financial operation
"""
import logging
from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone

from authapp.models import ActivityLog
from authapp.models.affiliate_wallet_models import (
    AffiliateWalletAccount,
    AffiliateWalletTransaction,
    AffiliateWithdrawalMethodConfig,
    AffiliateWithdrawalPaymentDetail,
    AffiliateWithdrawalRequest,
    AffiliateWithdrawalSettings,
    AffiliateWithdrawalStatusHistory,
)

logger = logging.getLogger(__name__)


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _get_or_create_wallet(user) -> AffiliateWalletAccount:
    """Must be called inside a @db_transaction.atomic block. Locks the row
    after get_or_create so concurrent credit/lock/release calls against the
    same affiliate's wallet serialize instead of losing an update."""
    acct, _ = AffiliateWalletAccount.objects.get_or_create(user=user)
    return AffiliateWalletAccount.objects.select_for_update().get(pk=acct.pk)


def _write_ledger(*, wallet, txn_type, amount, before, after, withdrawal_request=None, note=""):
    return AffiliateWalletTransaction.objects.create(
        wallet=wallet, withdrawal_request=withdrawal_request, txn_type=txn_type,
        amount=amount, balance_before=before, balance_after=after, note=note,
    )


def _write_status_history(*, request, from_status, to_status, changed_by, note="", ip_address=None):
    return AffiliateWithdrawalStatusHistory.objects.create(
        request=request, from_status=from_status, to_status=to_status,
        changed_by=changed_by, note=note, ip_address=ip_address,
    )


def _notify(user, title, message):
    try:
        from authapp.services.notification_service import notify_generic
        notify_generic(user=user, title=title, message=message, icon="withdrawal")
    except Exception as exc:
        logger.warning("affiliate withdrawal notify failed for user=%s: %s", user, exc)


# ─── Public API — wallet balance ─────────────────────────────────────────────

def get_wallet_summary(user) -> dict:
    """Read-only summary for the affiliate's Wallet tab. Never mutates
    anything — safe to call outside a transaction."""
    wallet, _ = AffiliateWalletAccount.objects.get_or_create(user=user)
    settings_obj = AffiliateWithdrawalSettings.load()

    qs = AffiliateWithdrawalRequest.objects.filter(affiliate=user)
    last_paid = qs.filter(status="paid").order_by("-payment_date", "-updated_at").first()

    def _sum(status):
        return qs.filter(status=status).aggregate(total=Sum("amount"))["total"] or Decimal("0")

    return {
        "available_balance": wallet.balance,
        "locked_for_withdrawal": wallet.locked_for_withdrawal,
        "pending_withdrawals": _sum("pending"),
        "processing_withdrawals": _sum("processing"),
        "approved_withdrawals": _sum("approved"),
        "paid_withdrawals": _sum("paid"),
        "rejected_withdrawals": _sum("rejected"),
        "cancelled_withdrawals": _sum("cancelled"),
        # Computed from this module's own ledger rather than
        # AffiliateProfile.total_earned/total_paid — those counters belong
        # to the pre-existing per-commission payout flow (AdminMarkCommissionPaidView,
        # which pays into the internal casino wallet) and must stay
        # exclusively tied to it. Reusing them here would conflate two
        # independent payout channels on one shared counter: an admin could
        # mark a commission "paid" via the old flow *and* the affiliate
        # could separately withdraw the same money via this wallet, and the
        # combined counter would both double-count and (as observed while
        # testing) go negative on the Overview tab.
        "lifetime_earned": wallet.transactions.filter(txn_type="EARNED").aggregate(t=Sum("amount"))["t"] or Decimal("0"),
        "lifetime_paid": wallet.transactions.filter(txn_type="PAID").aggregate(t=Sum("amount"))["t"] or Decimal("0"),
        "last_withdrawal": last_paid,
        "minimum_withdrawal_amount": settings_obj.minimum_withdrawal_amount,
        "is_withdrawal_enabled": settings_obj.is_withdrawal_enabled,
        "estimated_processing_time_text": settings_obj.estimated_processing_time_text,
        "processing_notes": settings_obj.processing_notes,
        "enabled_methods": list(AffiliateWithdrawalMethodConfig.objects.filter(is_enabled=True)),
    }


@db_transaction.atomic
def credit_wallet_from_commission(user, amount, note=""):
    """Called from affiliate_service.record_referral_commission() at the
    moment a commission is earned, so it's immediately available to
    withdraw. Non-fatal to the caller by design — wrapped there in the same
    try/except that already guards the whole commission-creation call."""
    amount = Decimal(str(amount))
    if amount <= 0:
        return None

    wallet = _get_or_create_wallet(user)
    before = wallet.balance
    wallet.balance += amount
    wallet.save(update_fields=["balance", "updated_at"])

    return _write_ledger(wallet=wallet, txn_type="EARNED", amount=amount, before=before, after=wallet.balance, note=note)


# ─── Public API — withdrawal requests (affiliate-initiated) ─────────────────

class WithdrawalError(ValueError):
    """Raised for any validation failure — views catch this and return 400."""


@db_transaction.atomic
def create_withdrawal_request(*, affiliate, amount, method_code, payment_details, ip_address=None, user_agent=""):
    settings_obj = AffiliateWithdrawalSettings.load()
    if not settings_obj.is_withdrawal_enabled:
        raise WithdrawalError("Withdrawals are temporarily disabled. Please try again later.")

    try:
        amount = Decimal(str(amount))
    except Exception:
        raise WithdrawalError("Invalid withdrawal amount.")
    if amount <= 0:
        raise WithdrawalError("Withdrawal amount must be greater than zero.")
    if amount < settings_obj.minimum_withdrawal_amount:
        raise WithdrawalError(f"Minimum withdrawal amount is {settings_obj.minimum_withdrawal_amount}.")

    method = AffiliateWithdrawalMethodConfig.objects.filter(code=method_code, is_enabled=True).first()
    if not method:
        raise WithdrawalError("This withdrawal method is not currently available.")

    if method.code == "USDT":
        network = (payment_details or {}).get("network", "").strip()
        wallet_address = (payment_details or {}).get("wallet_address", "").strip()
        if not network:
            raise WithdrawalError("Network is required.")
        if not wallet_address:
            raise WithdrawalError("Wallet address is required.")
        payment_details = {"network": network, "wallet_address": wallet_address}

    wallet = _get_or_create_wallet(affiliate)
    if wallet.balance < amount:
        raise WithdrawalError("Withdrawal amount exceeds your available balance.")

    before = wallet.balance
    wallet.balance -= amount
    wallet.locked_for_withdrawal += amount
    wallet.save(update_fields=["balance", "locked_for_withdrawal", "updated_at"])

    request_obj = AffiliateWithdrawalRequest.objects.create(
        affiliate=affiliate, method=method, amount=amount, status="pending",
    )
    AffiliateWithdrawalPaymentDetail.objects.create(
        request=request_obj, method=method, details=payment_details or {},
    )
    _write_ledger(
        wallet=wallet, txn_type="LOCKED", amount=amount, before=before, after=wallet.balance,
        withdrawal_request=request_obj, note=f"Locked for withdrawal request {request_obj.request_reference}",
    )
    _write_status_history(
        request=request_obj, from_status="", to_status="pending",
        changed_by=affiliate, note="Request created by affiliate.", ip_address=ip_address,
    )
    ActivityLog.log(
        actor=affiliate, target_user=affiliate, action="affiliate_withdrawal_requested",
        amount=amount, before_balance=before, after_balance=wallet.balance,
        description=f"Withdrawal request {request_obj.request_reference} for {amount} via {method.code}",
        reference_id=request_obj.request_reference, ip_address=ip_address, user_agent=user_agent,
    )
    _notify(
        affiliate, "Withdrawal request submitted",
        f"Your withdrawal request {request_obj.request_reference} for {amount} via {method.label} "
        f"has been submitted and is now pending review.",
    )
    return request_obj


@db_transaction.atomic
def cancel_withdrawal_request(*, request_obj, actor, ip_address=None, note=""):
    """Affiliate-initiated cancel — only while status == 'pending' (once
    processing starts, cancellation is disabled per spec). Admin override
    cancel (any open status) is a separate function below."""
    request_obj = AffiliateWithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    if request_obj.status != "pending":
        raise WithdrawalError("Only pending requests can be cancelled.")

    wallet = _get_or_create_wallet(request_obj.affiliate)
    before = wallet.balance
    wallet.balance += request_obj.amount
    wallet.locked_for_withdrawal -= request_obj.amount
    wallet.save(update_fields=["balance", "locked_for_withdrawal", "updated_at"])

    _write_ledger(
        wallet=wallet, txn_type="UNLOCKED", amount=request_obj.amount, before=before, after=wallet.balance,
        withdrawal_request=request_obj, note="Cancelled by affiliate.",
    )
    request_obj.status = "cancelled"
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    request_obj.save(update_fields=["status", "processed_at", "updated_at"])

    _write_status_history(
        request=request_obj, from_status="pending", to_status="cancelled",
        changed_by=actor, note=note or "Cancelled by affiliate.", ip_address=ip_address,
    )
    ActivityLog.log(
        actor=actor, target_user=request_obj.affiliate, action="affiliate_withdrawal_cancelled",
        amount=request_obj.amount, before_balance=before, after_balance=wallet.balance,
        description=f"Withdrawal request {request_obj.request_reference} cancelled by affiliate",
        reference_id=request_obj.request_reference, ip_address=ip_address,
    )
    _notify(
        request_obj.affiliate, "Withdrawal request cancelled",
        f"Your withdrawal request {request_obj.request_reference} has been cancelled and the amount "
        f"({request_obj.amount}) has been returned to your available balance.",
    )
    return request_obj


# ─── Public API — admin actions ──────────────────────────────────────────────

def _require_open(request_obj, *valid_from):
    if request_obj.status not in valid_from:
        raise WithdrawalError(
            f"Cannot perform this action from status '{request_obj.status}'. "
            f"Expected one of: {', '.join(valid_from)}."
        )


@db_transaction.atomic
def admin_approve(*, request_obj, actor, note="", ip_address=None):
    request_obj = AffiliateWithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_open(request_obj, "pending")

    from_status = request_obj.status
    request_obj.status = "approved"
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=["status", "reviewed_by", "processed_at", "admin_notes", "updated_at"])

    _write_status_history(request=request_obj, from_status=from_status, to_status="approved",
                           changed_by=actor, note=note, ip_address=ip_address)
    ActivityLog.log(actor=actor, target_user=request_obj.affiliate, action="affiliate_withdrawal_approved",
                     amount=request_obj.amount, description=f"Withdrawal {request_obj.request_reference} approved",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.affiliate, "Withdrawal request approved",
            f"Your withdrawal request {request_obj.request_reference} has been approved and will be processed shortly.")
    return request_obj


@db_transaction.atomic
def admin_move_to_processing(*, request_obj, actor, note="", ip_address=None):
    request_obj = AffiliateWithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_open(request_obj, "pending", "approved")

    from_status = request_obj.status
    request_obj.status = "processing"
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=["status", "reviewed_by", "processed_at", "admin_notes", "updated_at"])

    _write_status_history(request=request_obj, from_status=from_status, to_status="processing",
                           changed_by=actor, note=note, ip_address=ip_address)
    ActivityLog.log(actor=actor, target_user=request_obj.affiliate, action="affiliate_withdrawal_processing",
                     amount=request_obj.amount, description=f"Withdrawal {request_obj.request_reference} moved to processing",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.affiliate, "Withdrawal request processing",
            f"Your withdrawal request {request_obj.request_reference} is now being processed.")
    return request_obj


@db_transaction.atomic
def admin_reject(*, request_obj, actor, reason, ip_address=None):
    if not reason or not reason.strip():
        raise WithdrawalError("A rejection reason is required.")

    request_obj = AffiliateWithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_open(request_obj, "pending", "processing", "approved")
    from_status = request_obj.status

    wallet = _get_or_create_wallet(request_obj.affiliate)
    before = wallet.balance
    wallet.balance += request_obj.amount
    wallet.locked_for_withdrawal -= request_obj.amount
    wallet.save(update_fields=["balance", "locked_for_withdrawal", "updated_at"])

    _write_ledger(wallet=wallet, txn_type="UNLOCKED", amount=request_obj.amount, before=before, after=wallet.balance,
                  withdrawal_request=request_obj, note=f"Rejected: {reason}")

    request_obj.status = "rejected"
    request_obj.rejection_reason = reason
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    request_obj.save(update_fields=["status", "rejection_reason", "reviewed_by", "processed_at", "updated_at"])

    _write_status_history(request=request_obj, from_status=from_status, to_status="rejected",
                           changed_by=actor, note=reason, ip_address=ip_address)
    ActivityLog.log(actor=actor, target_user=request_obj.affiliate, action="affiliate_withdrawal_rejected",
                     amount=request_obj.amount, before_balance=before, after_balance=wallet.balance,
                     description=f"Withdrawal {request_obj.request_reference} rejected: {reason}",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.affiliate, "Withdrawal request rejected",
            f"Your withdrawal request {request_obj.request_reference} was rejected: {reason}\n"
            f"The amount ({request_obj.amount}) has been returned to your available balance.")
    return request_obj


@db_transaction.atomic
def admin_mark_paid(*, request_obj, actor, txn_hash, payment_date=None, note="", ip_address=None):
    if not txn_hash or not txn_hash.strip():
        raise WithdrawalError("A blockchain transaction hash is required.")

    request_obj = AffiliateWithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_open(request_obj, "processing", "approved")
    from_status = request_obj.status

    wallet = _get_or_create_wallet(request_obj.affiliate)
    before = wallet.balance
    # Funds have left the platform via an external USDT transfer — the
    # locked amount is released permanently, NOT credited back to the
    # available balance (unlike reject/cancel).
    wallet.locked_for_withdrawal -= request_obj.amount
    wallet.save(update_fields=["locked_for_withdrawal", "updated_at"])

    _write_ledger(wallet=wallet, txn_type="PAID", amount=request_obj.amount, before=before, after=wallet.balance,
                  withdrawal_request=request_obj, note=f"Paid — tx {txn_hash}")

    request_obj.status = "paid"
    request_obj.txn_hash = txn_hash.strip()
    request_obj.payment_date = payment_date or timezone.now()
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=[
        "status", "txn_hash", "payment_date", "reviewed_by", "processed_at", "admin_notes", "updated_at",
    ])

    # Deliberately does NOT touch AffiliateProfile.total_paid — that counter
    # belongs exclusively to the pre-existing per-commission payout flow
    # (AdminMarkCommissionPaidView, which pays into the internal casino
    # wallet). This wallet module keeps its own complete ledger
    # (AffiliateWalletTransaction) instead, so the two payout channels never
    # conflate into one shared counter — see get_wallet_summary's
    # lifetime_earned/lifetime_paid for why that matters.

    _write_status_history(request=request_obj, from_status=from_status, to_status="paid",
                           changed_by=actor, note=note or f"Paid — tx {txn_hash}", ip_address=ip_address)
    ActivityLog.log(actor=actor, target_user=request_obj.affiliate, action="affiliate_withdrawal_paid",
                     amount=request_obj.amount, before_balance=before, after_balance=wallet.balance,
                     description=f"Withdrawal {request_obj.request_reference} paid — tx {txn_hash}",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.affiliate, "Withdrawal paid",
            f"Your withdrawal request {request_obj.request_reference} for {request_obj.amount} has been paid. "
            f"Transaction: {txn_hash}")
    return request_obj


@db_transaction.atomic
def admin_cancel(*, request_obj, actor, note="", ip_address=None):
    """Admin override cancel — any still-open status, unlike the
    affiliate's own cancel which only works while pending."""
    request_obj = AffiliateWithdrawalRequest.objects.select_for_update().get(pk=request_obj.pk)
    _require_open(request_obj, *AffiliateWithdrawalRequest.OPEN_STATUSES)
    from_status = request_obj.status

    wallet = _get_or_create_wallet(request_obj.affiliate)
    before = wallet.balance
    wallet.balance += request_obj.amount
    wallet.locked_for_withdrawal -= request_obj.amount
    wallet.save(update_fields=["balance", "locked_for_withdrawal", "updated_at"])

    _write_ledger(wallet=wallet, txn_type="UNLOCKED", amount=request_obj.amount, before=before, after=wallet.balance,
                  withdrawal_request=request_obj, note=note or "Cancelled by admin.")

    request_obj.status = "cancelled"
    request_obj.reviewed_by = actor
    request_obj.processed_at = request_obj.processed_at or timezone.now()
    if note:
        request_obj.admin_notes = note
    request_obj.save(update_fields=["status", "reviewed_by", "processed_at", "admin_notes", "updated_at"])

    _write_status_history(request=request_obj, from_status=from_status, to_status="cancelled",
                           changed_by=actor, note=note or "Cancelled by admin.", ip_address=ip_address)
    ActivityLog.log(actor=actor, target_user=request_obj.affiliate, action="affiliate_withdrawal_cancelled",
                     amount=request_obj.amount, before_balance=before, after_balance=wallet.balance,
                     description=f"Withdrawal {request_obj.request_reference} cancelled by admin",
                     reference_id=request_obj.request_reference, ip_address=ip_address)
    _notify(request_obj.affiliate, "Withdrawal request cancelled",
            f"Your withdrawal request {request_obj.request_reference} was cancelled by our team. "
            f"The amount ({request_obj.amount}) has been returned to your available balance.")
    return request_obj
