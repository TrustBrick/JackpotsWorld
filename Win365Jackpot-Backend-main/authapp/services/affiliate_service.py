"""
Flat-percentage referral commission engine.

Called from casino_wallet_service.credit_casino_wallet() whenever a user
completes a real cash deposit (txn_type="DAC"). Non-fatal — any error here
must never block the deposit itself, so callers wrap this in a try/except.
"""
import logging
from decimal import Decimal

from authapp.models.affiliate_models import AffiliateProfile, ReferralCommission

logger = logging.getLogger(__name__)


def record_referral_commission(referred_user, deposit_amount, source_ref=""):
    """Creates a pending ReferralCommission for referred_user's referrer, if
    that referrer is an active affiliate. Returns the commission row, or
    None if no commission applies (no referrer / not an affiliate / inactive)."""
    referrer = referred_user.referred_by
    if not referrer:
        return None

    try:
        profile = referrer.affiliate_profile
    except AffiliateProfile.DoesNotExist:
        return None

    if not profile.is_active:
        return None

    deposit_amount = Decimal(str(deposit_amount))
    commission_amount = (deposit_amount * profile.commission_rate / Decimal("100")).quantize(Decimal("0.01"))
    if commission_amount <= 0:
        return None

    commission = ReferralCommission.objects.create(
        affiliate=referrer,
        referred_user=referred_user,
        source_transaction_ref=source_ref,
        deposit_amount=deposit_amount,
        commission_rate=profile.commission_rate,
        amount=commission_amount,
    )

    profile.total_earned += commission_amount
    profile.save(update_fields=["total_earned"])

    referrer.referral_earnings += commission_amount
    referrer.save(update_fields=["referral_earnings"])

    # AFFILIATE-WITHDRAWALS: also credit the withdrawable wallet balance.
    # Kept behind its own try/except (same non-fatal contract as the rest
    # of this function relative to the deposit it's called from) so a
    # problem in the new wallet module can never break commission
    # recording itself — safe to delete this block to remove the feature.
    try:
        from authapp.services.affiliate_wallet_service import credit_wallet_from_commission
        credit_wallet_from_commission(
            referrer, commission_amount,
            note=f"Commission from referred user #{referred_user.id} (ref {source_ref})".strip(),
        )
    except Exception:
        logger.exception("Failed to credit affiliate wallet for commission id=%s", commission.id)

    return commission
