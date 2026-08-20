"""
authapp/services/manual_commission_service.py
─────────────────────────────────────────────────────────────────────────────
Manual / Bonus Commission — the fourth commission type, and the only one no
engine produces.

Deposit, Losing and Rolling are all *calculated*: a rule matches, a base
amount is measured off a ledger, and an amount falls out (see
commission_engine_service.py). A manual commission is *granted* — an admin
decides an affiliate should receive an amount, for a stated reason, with no
player, deposit, loss or bet slip behind it. Nothing in this module touches
rule resolution, condition evaluation or any of the three automatic branches;
it writes one ledger row and credits one wallet.

Where the money lands, and why
──────────────────────────────
The platform has two payout channels, and this one deliberately uses the
withdrawable channel:

  • AffiliateWalletAccount.balance — what an affiliate can actually request a
    withdrawal against (affiliate_wallet_service.py). The legacy flat-rate
    flow credits it the moment a commission is earned.
  • ReferralCommission (status="pending") → the older per-commission
    "mark paid" screen, which pays into an internal casino wallet.

The spec for manual commission is that the amount is available immediately,
so it is credited to the first via the existing
affiliate_wallet_service.credit_wallet_from_commission() — the same function,
the same AffiliateWalletTransaction ledger, the same before/after snapshots.
No second wallet, no second withdrawal system.

No ReferralCommission row is written. That table means "this affiliate earned
X from referred user Y": its referred_user is a non-nullable FK, and
affiliate_stats_service.get_qualified_user_ids() counts distinct values of it
to decide how many players an affiliate has qualified. A manual bonus has no
referred user, so a row there would either need that column made nullable or
would silently inflate every affiliate's qualified-player count. The
CommissionLedgerEntry *is* the auditable record, which is what the ledger is
for.

Idempotency
───────────
A double-clicked form must not grant the bonus twice. The caller supplies an
`idempotency_key` (the Back Office generates one per opened form), stored on
CommissionLedgerEntry.idempotency_key, which is unique. The second request
loses the race in the database rather than in application code, and is
reported back as the *same* successful grant rather than as an error — the
admin's intent was one credit, and one credit is what happened.
"""
import logging
import uuid
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction as db_transaction
from django.utils import timezone

from authapp.models import ActivityLog
from authapp.models.affiliate_models import AffiliateProfile
from authapp.models.commission_rule_models import (
    MANUAL_COMMISSION_TYPE,
    CommissionLedgerEntry,
)

logger = logging.getLogger(__name__)

CENTS = Decimal("0.01")

# Matches CommissionRule.currency's own width (max_length=8). Kept as an
# explicit allow-list rather than free text so a typo cannot create a
# commission denominated in a currency nothing else in the system knows.
SUPPORTED_CURRENCIES = ("USD",)

# "payable" is the existing vocabulary for money that is earned and waiting to
# be taken out (LEDGER_STATUSES in commission_rule_models). It is what the
# affiliate Commission Slip already renders as "Payable", and what
# AffiliateCommissionSummaryView already counts towards total_earned — so a
# manual bonus lands in the affiliate's totals with no special-casing
# anywhere. A new "available" status would have been a parallel vocabulary
# for a state the project already names.
MANUAL_LEDGER_STATUS = "payable"


class ManualCommissionError(ValueError):
    """Raised for any validation failure. Views translate it to a 400."""


def _clean_amount(raw):
    try:
        amount = Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError):
        raise ManualCommissionError("Amount must be a valid decimal number.")
    if not amount.is_finite():
        raise ManualCommissionError("Amount must be a valid decimal number.")
    if amount <= 0:
        raise ManualCommissionError("Amount must be greater than zero.")
    amount = amount.quantize(CENTS)
    if amount <= 0:
        raise ManualCommissionError("Amount must be greater than zero.")
    if amount >= Decimal("1000000000000"):
        raise ManualCommissionError("Amount is too large.")
    return amount


def _require_affiliate(affiliate):
    """An account only counts as an affiliate if it has an active
    AffiliateProfile — the same test IsAffiliate applies to the affiliate
    portal, so a manual commission can never be granted to an account that
    could not log in to see it."""
    if affiliate is None:
        raise ManualCommissionError("Affiliate not found.")
    profile = AffiliateProfile.objects.filter(user=affiliate).first()
    if profile is None:
        raise ManualCommissionError("That account is not an affiliate.")
    if not profile.is_active:
        raise ManualCommissionError("That affiliate account is inactive.")
    return profile


@db_transaction.atomic
def create_manual_commission(*, affiliate, amount, reason, actor, currency="USD",
                             note="", idempotency_key=None, ip_address=None):
    """Grant a manual/bonus commission. Returns (entry, created).

    `created` is False when an identical submission already landed — the
    caller reports success either way, because the outcome the admin asked
    for is in place; it just was not this request that put it there.

    Everything below happens in one transaction: the ledger row, the wallet
    credit, its own wallet-ledger row and the lifetime counter. A failure
    anywhere rolls back all of it, so the balance and the ledger can never
    disagree.
    """
    profile = _require_affiliate(affiliate)
    amount = _clean_amount(amount)

    reason = (reason or "").strip()
    if not reason:
        raise ManualCommissionError("A reason is required for every manual commission.")
    if len(reason) > 255:
        raise ManualCommissionError("Reason must be 255 characters or fewer.")

    currency = (currency or "USD").strip().upper()
    if currency not in SUPPORTED_CURRENCIES:
        raise ManualCommissionError(
            f"Unsupported currency '{currency}'. Supported: {', '.join(SUPPORTED_CURRENCIES)}."
        )

    # Absent a caller-supplied key every request is distinct by definition, so
    # generating one here keeps the column populated without pretending to
    # de-duplicate something we were never given a way to recognise. The Back
    # Office always sends one.
    idempotency_key = (idempotency_key or "").strip() or f"auto:{uuid.uuid4()}"
    if len(idempotency_key) > 64:
        raise ManualCommissionError("Idempotency key must be 64 characters or fewer.")

    existing = CommissionLedgerEntry.objects.filter(idempotency_key=idempotency_key).first()
    if existing is not None:
        return existing, False

    trace = (
        f"Manual / Bonus commission granted by {getattr(actor, 'email', 'system')}.\n"
        f"Amount: {amount} {currency}\n"
        f"Reason: {reason}"
    )
    if note:
        trace += f"\nReference / note: {note}"

    try:
        with db_transaction.atomic():
            entry = CommissionLedgerEntry.objects.create(
                affiliate=affiliate,
                referred_player=None,
                rule=None,
                rule_name="Manual / Bonus",
                commission_type=MANUAL_COMMISSION_TYPE,
                # No calculation happened: there is no base to take a
                # percentage of, and no rate that was applied.
                base_amount=Decimal("0"),
                commission_rate=Decimal("0"),
                commission_amount=amount,
                currency=currency,
                status=MANUAL_LEDGER_STATUS,
                qualification_reason=reason,
                admin_notes=note,
                calculation_trace=trace,
                reviewed_by=actor,
                qualified_at=timezone.now(),
                idempotency_key=idempotency_key,
            )
    except IntegrityError:
        # Lost the race on idempotency_key — the other request granted it.
        logger.info(
            "Manual commission already recorded for key %s (affiliate %s) — returning existing.",
            idempotency_key, getattr(affiliate, "id", None),
        )
        existing = CommissionLedgerEntry.objects.filter(idempotency_key=idempotency_key).first()
        if existing is None:
            raise
        return existing, False

    # Withdrawable balance, through the existing wallet service so this
    # credit gets the same row lock, the same before/after snapshot and the
    # same AffiliateWalletTransaction ledger row as every other credit.
    #
    # Deliberately NOT wrapped in try/except: the legacy flow swallows wallet
    # errors because its commission must survive a wallet problem, but here
    # the credit *is* the point. If it fails, the ledger row must go with it.
    from authapp.services.affiliate_wallet_service import credit_wallet_from_commission
    credit_wallet_from_commission(
        affiliate, amount,
        note=f"Manual / Bonus commission — {reason}",
    )

    # Lifetime counter, same bookkeeping the other three types perform.
    profile = AffiliateProfile.objects.select_for_update().get(pk=profile.pk)
    profile.total_earned += amount
    profile.save(update_fields=["total_earned"])
    affiliate.referral_earnings = (affiliate.referral_earnings or Decimal("0")) + amount
    affiliate.save(update_fields=["referral_earnings"])

    ActivityLog.log(
        actor=actor, target_user=affiliate, action="affiliate_manual_commission",
        amount=amount,
        description=f"Manual / Bonus commission {amount} {currency} — {reason}",
        reference_id=entry.idempotency_key, ip_address=ip_address,
    )

    try:
        from authapp.services.notification_service import notify_generic
        notify_generic(
            affiliate, "Bonus commission added",
            f"🎁 A bonus commission of {currency} {amount:,.2f} has been added to your account.\n📝 {reason}",
            icon="commission",
        )
    except Exception as exc:
        logger.warning("manual commission notification failed for %s: %s", affiliate, exc)

    return entry, True
