"""
authapp/services/affiliate_stats_service.py
─────────────────────────────────────────────────────────────────────────────
Shared funnel math for the affiliate dashboard and campaign analytics, so
both compute "deposited" / "qualified" the exact same way.

Funnel (per referred user, relative to one affiliate):
  Deposit Player   — has >=1 successful deposit, hasn't placed a bet yet
  Qualified Player — has placed >=1 bet (a ReferralCommission row exists)
A user "graduates" from Deposit Player to Qualified Player the moment they
place their first bet, so the two buckets are mutually exclusive and
Total Deposits = deposit-player deposits + qualified-player deposits is
just "deposits from every referred user who ever deposited" — no double
counting.

"Successful deposit" = either flow that actually moves new money in:
  • DepositRequest(status="approved")               — self-service online deposits
  • CasinoWalletTransaction(transaction_type="DAC")  — admin-recorded offline
    "Deposit at Casino" entries (see authapp/views/admin_offline_deposit_views.py)
"""
from collections import defaultdict
from decimal import Decimal

from django.db.models import Sum

from authapp.models.affiliate_models import ReferralCommission
from authapp.models.casino_wallet_models import CasinoWalletTransaction
from authapp.models.wallet_request_models import DepositRequest


def get_deposit_totals(user_ids) -> dict:
    """{user_id: Decimal total successfully deposited} — only users with a
    positive total appear as keys. Merges both deposit paths per user
    (they're written to different tables, so summing both never double-counts)."""
    user_ids = list(user_ids)
    totals = defaultdict(lambda: Decimal("0"))
    if not user_ids:
        return dict(totals)

    for row in (
        DepositRequest.objects.filter(user_id__in=user_ids, status="approved")
        .values("user_id").annotate(total=Sum("amount"))
    ):
        totals[row["user_id"]] += row["total"] or Decimal("0")

    for row in (
        CasinoWalletTransaction.objects.filter(user_id__in=user_ids, transaction_type="DAC")
        .values("user_id").annotate(total=Sum("amount"))
    ):
        totals[row["user_id"]] += row["total"] or Decimal("0")

    return dict(totals)


def get_loss_totals(user_ids) -> dict:
    """{user_id: Decimal total lost at casino} — only users with a positive
    total appear as keys. Single-source (unlike get_deposit_totals): the
    only loss ledger anywhere in the codebase is
    CasinoWalletTransaction(transaction_type="LAC"), written by
    debit_casino_wallet() from the Cash Wallet tab's "Lost at Casino" action
    (see authapp/services/casino_wallet_service.py)."""
    user_ids = list(user_ids)
    totals = defaultdict(lambda: Decimal("0"))
    if not user_ids:
        return dict(totals)

    for row in (
        CasinoWalletTransaction.objects.filter(user_id__in=user_ids, transaction_type="LAC")
        .values("user_id").annotate(total=Sum("amount"))
    ):
        totals[row["user_id"]] += row["total"] or Decimal("0")

    return dict(totals)


def get_qualified_user_ids(affiliate, user_ids=None) -> set:
    """Referred users (of this affiliate) who've placed at least one bet —
    signaled by having a ReferralCommission row, which is only ever created
    once a verified bet slip is recorded (see
    authapp/services/affiliate_service.py record_referral_commission)."""
    qs = ReferralCommission.objects.filter(affiliate=affiliate)
    if user_ids is not None:
        qs = qs.filter(referred_user_id__in=list(user_ids))
    return set(qs.values_list("referred_user_id", flat=True).distinct())


def split_deposit_and_qualified(affiliate, referred_user_ids) -> dict:
    """Core funnel computation shared by the dashboard and campaign
    analytics endpoints. Returns a dict with:
      deposit_totals          {user_id: Decimal} for every referred user
                               with >=1 successful deposit (both cohorts)
      qualified_ids           set of referred user ids who've placed a bet
      deposit_player_ids      set of referred user ids who deposited but
                               haven't bet yet ("Deposit Players" cohort)
      deposit_players_count   len(deposit_player_ids)
      qualified_players_count len(qualified_ids)
      deposit_players_total   Decimal — deposits from deposit_player_ids
      qualified_players_total Decimal — deposits from qualified_ids
      total_deposits          Decimal — deposits from every referred user
                               (== deposit_players_total + qualified_players_total)
    """
    referred_user_ids = list(referred_user_ids)
    deposit_totals = get_deposit_totals(referred_user_ids)
    qualified_ids = get_qualified_user_ids(affiliate, referred_user_ids)
    deposit_player_ids = set(deposit_totals.keys()) - qualified_ids

    deposit_players_total = sum((deposit_totals[u] for u in deposit_player_ids), Decimal("0"))
    qualified_players_total = sum(
        (deposit_totals[u] for u in qualified_ids if u in deposit_totals), Decimal("0"),
    )
    total_deposits = sum(deposit_totals.values(), Decimal("0"))

    return {
        "deposit_totals": deposit_totals,
        "qualified_ids": qualified_ids,
        "deposit_player_ids": deposit_player_ids,
        "deposit_players_count": len(deposit_player_ids),
        "qualified_players_count": len(qualified_ids),
        "deposit_players_total": deposit_players_total,
        "qualified_players_total": qualified_players_total,
        "total_deposits": total_deposits,
    }
