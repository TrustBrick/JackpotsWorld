"""
authapp/tests_manual_commission.py
─────────────────────────────────────────────────────────────────────────────
Manual / Bonus commission — the fourth commission type, and the only one an
admin grants directly rather than an engine calculating.

The whole flow is exercised end to end through the real endpoints: an admin
grants a bonus, it lands in the commission ledger *and* the affiliate's
withdrawable balance in one transaction, the affiliate sees it, requests a
withdrawal against it, and an admin approves or rejects that withdrawal. The
money is followed at every step, because a balance and a ledger that disagree
is the one outcome this feature must never produce.
"""
from decimal import Decimal

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.affiliate_models import AffiliateProfile, ReferralCommission
from authapp.models.affiliate_wallet_models import (
    AffiliateWalletAccount,
    AffiliateWalletTransaction,
    AffiliateWithdrawalMethodConfig,
    AffiliateWithdrawalRequest,
    AffiliateWithdrawalSettings,
)
from authapp.models.commission_rule_models import CommissionLedgerEntry
from authapp.models.user_model import User
from authapp.services import manual_commission_service
from authapp.services.manual_commission_service import (
    ManualCommissionError, create_manual_commission,
)

MANUAL_URL = "/api/admin-panel/commissions/manual/"


class ManualCommissionBase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="mc-admin@example.com", password="pw12345!", name="Admin",
            is_staff=True, is_superuser=True,
        )
        self.affiliate = User.objects.create_user(
            email="mc-aff@example.com", password="pw12345!", name="Bonus Affiliate",
        )
        AffiliateProfile.objects.create(user=self.affiliate, is_active=True)
        self.player = User.objects.create_user(
            email="mc-player@example.com", password="pw12345!", referred_by=self.affiliate,
        )
        AffiliateWithdrawalMethodConfig.objects.get_or_create(
            code="USDT", defaults={"label": "USDT", "is_enabled": True,
                                   "field_schema": ["network", "wallet_address"]},
        )
        settings_obj = AffiliateWithdrawalSettings.load()
        settings_obj.is_withdrawal_enabled = True
        settings_obj.minimum_withdrawal_amount = Decimal("10.00")
        settings_obj.save()

    # ── helpers ─────────────────────────────────────────────────────────────

    def grant(self, **overrides):
        payload = {
            "affiliate": self.affiliate.id,
            "amount": "100.00",
            "currency": "USD",
            "commission_type": "manual",
            "reason": "Special Promotional Reward",
            "idempotency_key": overrides.pop("key", "key-default"),
        }
        payload.update(overrides)
        self.client.force_authenticate(self.admin)
        return self.client.post(MANUAL_URL, payload, format="json")

    def available(self):
        wallet = AffiliateWalletAccount.objects.filter(user=self.affiliate).first()
        return wallet.balance if wallet else Decimal("0")

    def locked(self):
        wallet = AffiliateWalletAccount.objects.filter(user=self.affiliate).first()
        return wallet.locked_for_withdrawal if wallet else Decimal("0")


class ManualCommissionCreationTests(ManualCommissionBase):

    def test_granting_a_bonus_credits_the_ledger_and_the_balance_together(self):
        response = self.grant()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["amount"], "100.00")
        self.assertEqual(response.data["currency"], "USD")
        self.assertEqual(response.data["available_commission"], "100.00")

        entry = CommissionLedgerEntry.objects.get(commission_type="manual")
        self.assertEqual(entry.affiliate, self.affiliate)
        self.assertEqual(entry.commission_amount, Decimal("100.00"))
        self.assertEqual(entry.currency, "USD")
        self.assertEqual(entry.status, "payable")
        self.assertEqual(entry.qualification_reason, "Special Promotional Reward")
        self.assertEqual(entry.reviewed_by, self.admin)
        self.assertIsNone(entry.referred_player)
        self.assertIsNone(entry.rule)
        # No calculation happened, so nothing pretends one did.
        self.assertEqual(entry.base_amount, Decimal("0.00"))
        self.assertEqual(entry.commission_rate, Decimal("0.000"))

        self.assertEqual(self.available(), Decimal("100.00"))
        credit = AffiliateWalletTransaction.objects.get(txn_type="EARNED")
        self.assertEqual(credit.amount, Decimal("100.00"))
        self.assertEqual(credit.balance_before, Decimal("0.00"))
        self.assertEqual(credit.balance_after, Decimal("100.00"))

        self.affiliate.refresh_from_db()
        self.assertEqual(self.affiliate.affiliate_profile.total_earned, Decimal("100.00"))

    def test_a_bonus_adds_to_an_existing_balance_rather_than_replacing_it(self):
        create_manual_commission(
            affiliate=self.affiliate, amount=Decimal("250"), reason="Earlier reward",
            actor=self.admin, idempotency_key="first",
        )
        self.assertEqual(self.available(), Decimal("250.00"))

        response = self.grant(key="second")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(self.available(), Decimal("350.00"))
        self.assertEqual(CommissionLedgerEntry.objects.filter(commission_type="manual").count(), 2)

    def test_a_repeated_submission_grants_the_bonus_once(self):
        """A double-clicked form sends the same key twice. The second request
        must report success -- the admin asked for one credit and got one --
        without creating a second."""
        first = self.grant(key="double-click")
        second = self.grant(key="double-click")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertTrue(first.data["created"])
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertFalse(second.data["created"])
        self.assertTrue(second.data["success"])

        self.assertEqual(CommissionLedgerEntry.objects.filter(commission_type="manual").count(), 1)
        self.assertEqual(self.available(), Decimal("100.00"))

    def test_the_database_refuses_a_duplicate_key_even_without_the_service(self):
        """The read-then-write check in the service can be raced; the unique
        constraint cannot."""
        self.grant(key="enforced")

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CommissionLedgerEntry.objects.create(
                    affiliate=self.affiliate, commission_type="manual",
                    commission_amount=Decimal("100"), idempotency_key="enforced",
                )

    def test_calculated_entries_are_unaffected_by_the_uniqueness_rule(self):
        """Every automatic row stores NULL there, and any number of NULLs may
        coexist in a unique index -- otherwise this migration would have
        broken deposit, losing and rolling outright."""
        for i in range(3):
            CommissionLedgerEntry.objects.create(
                affiliate=self.affiliate, referred_player=self.player,
                commission_type="rolling", commission_amount=Decimal("10"),
                reference_id=f"SLIP-{i}",
            )
        self.assertEqual(CommissionLedgerEntry.objects.filter(idempotency_key__isnull=True).count(), 3)


class ManualCommissionValidationTests(ManualCommissionBase):

    def test_zero_amount_is_rejected(self):
        response = self.grant(amount="0")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)
        self.assertEqual(self.available(), Decimal("0"))

    def test_negative_amount_is_rejected(self):
        response = self.grant(amount="-100")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)
        self.assertEqual(self.available(), Decimal("0"))

    def test_a_missing_reason_is_rejected(self):
        response = self.grant(reason="   ")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)

    def test_an_unknown_affiliate_id_is_rejected(self):
        response = self.grant(affiliate=999999)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not found", response.data["error"].lower())
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)

    def test_an_account_that_is_not_an_affiliate_is_rejected(self):
        response = self.grant(affiliate=self.player.id)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not an affiliate", response.data["error"].lower())
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)

    def test_an_inactive_affiliate_is_rejected(self):
        profile = self.affiliate.affiliate_profile
        profile.is_active = False
        profile.save(update_fields=["is_active"])

        response = self.grant()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("inactive", response.data["error"].lower())

    def test_an_unsupported_currency_is_rejected(self):
        response = self.grant(currency="XYZ")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)

    def test_this_endpoint_will_not_mint_a_calculated_commission_type(self):
        for bogus in ("deposit", "losing", "rolling"):
            with self.subTest(commission_type=bogus):
                response = self.grant(commission_type=bogus, key=f"k-{bogus}")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)

    def test_the_amount_is_handled_as_a_decimal_not_a_float(self):
        response = self.grant(amount="0.07")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(self.available(), Decimal("0.07"))


class ManualCommissionPermissionTests(ManualCommissionBase):
    """Only Back Office staff may grant money."""

    def _post_as(self, user):
        if user is not None:
            self.client.force_authenticate(user)
        else:
            self.client.force_authenticate(None)
        return self.client.post(MANUAL_URL, {
            "affiliate": self.affiliate.id, "amount": "100.00",
            "reason": "Trying it on", "idempotency_key": "nope",
        }, format="json")

    def test_an_affiliate_cannot_credit_themselves(self):
        response = self._post_as(self.affiliate)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.available(), Decimal("0"))

    def test_a_player_cannot_grant_a_commission(self):
        response = self._post_as(self.player)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)

    def test_an_ordinary_user_cannot_grant_a_commission(self):
        other = User.objects.create_user(email="mc-nobody@example.com", password="pw12345!")
        response = self._post_as(other)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_an_anonymous_request_is_refused(self):
        response = self._post_as(None)
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)


class ManualCommissionAtomicityTests(ManualCommissionBase):

    def test_a_failed_wallet_credit_rolls_the_ledger_entry_back(self):
        """The balance and the ledger move together or not at all. Without
        this, an admin could see 'added successfully' over a ledger row whose
        money never arrived."""
        from unittest.mock import patch

        with patch("authapp.services.affiliate_wallet_service.credit_wallet_from_commission",
                   side_effect=RuntimeError("wallet down")):
            with self.assertRaises(RuntimeError):
                create_manual_commission(
                    affiliate=self.affiliate, amount=Decimal("100"),
                    reason="Should not survive", actor=self.admin, idempotency_key="rollback",
                )

        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)
        self.assertEqual(self.available(), Decimal("0"))
        self.affiliate.refresh_from_db()
        self.assertEqual(self.affiliate.affiliate_profile.total_earned, Decimal("0"))

    def test_a_rejected_grant_leaves_no_trace_at_all(self):
        with self.assertRaises(ManualCommissionError):
            create_manual_commission(
                affiliate=self.affiliate, amount=Decimal("-5"),
                reason="Negative", actor=self.admin, idempotency_key="neg",
            )
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)
        self.assertEqual(AffiliateWalletTransaction.objects.count(), 0)


class ManualCommissionVisibilityTests(ManualCommissionBase):

    def setUp(self):
        super().setUp()
        self.grant(reason="Special Promotional Reward")

    def test_the_back_office_ledger_shows_it_with_its_reason_and_author(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get("/api/admin-panel/commissions/ledger/",
                                   {"commission_type": "manual"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["commission_type"], "manual")
        self.assertTrue(row["is_manual"])
        self.assertEqual(row["qualification_reason"], "Special Promotional Reward")
        self.assertEqual(row["reviewed_by_email"], self.admin.email)
        self.assertEqual(Decimal(row["commission_amount"]), Decimal("100.00"))

    def test_the_affiliate_sees_it_on_their_own_ledger(self):
        self.client.force_authenticate(self.affiliate)

        response = self.client.get("/api/affiliate/commissions/ledger/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["commission_type"], "manual")
        self.assertEqual(row["status"], "payable")
        self.assertEqual(row["qualification_reason"], "Special Promotional Reward")

    def test_it_counts_towards_the_affiliate_commission_summary(self):
        self.client.force_authenticate(self.affiliate)

        response = self.client.get("/api/affiliate/commissions/summary/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data["total_earned"]), Decimal("100.00"))
        self.assertEqual(response.data["statuses"]["payable"]["count"], 1)

    def test_the_affiliate_wallet_reports_it_as_available(self):
        self.client.force_authenticate(self.affiliate)

        response = self.client.get("/api/affiliate/wallet/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data["available_balance"]), Decimal("100.00"))

    def test_filtering_the_ledger_by_the_other_types_excludes_it(self):
        self.client.force_authenticate(self.admin)
        for other in ("deposit", "losing", "rolling"):
            with self.subTest(commission_type=other):
                response = self.client.get("/api/admin-panel/commissions/ledger/",
                                           {"commission_type": other})
                self.assertEqual(response.data["count"], 0)

    def test_a_manual_entry_cannot_be_pushed_through_the_approval_flow(self):
        """Its money is already in the affiliate's balance, so changing the
        paperwork would not change anything real -- and 'rejected' would
        claim money back that may already have been withdrawn."""
        self.client.force_authenticate(self.admin)
        entry = CommissionLedgerEntry.objects.get(commission_type="manual")

        response = self.client.post(
            f"/api/admin-panel/commissions/ledger/{entry.id}/transition/",
            {"status": "rejected"}, format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        entry.refresh_from_db()
        self.assertEqual(entry.status, "payable")
        self.assertEqual(self.available(), Decimal("100.00"))


class ManualCommissionWithdrawalTests(ManualCommissionBase):
    """The bonus has to behave like any other earned money once it is in the
    wallet -- withdrawable, lockable, and refundable on rejection."""

    def setUp(self):
        super().setUp()
        self.grant()

    def _request_withdrawal(self, amount):
        self.client.force_authenticate(self.affiliate)
        return self.client.post("/api/affiliate/wallet/withdrawals/create/", {
            "amount": amount, "method_code": "USDT",
            "payment_details": {"network": "TRC20", "wallet_address": "TXyz123"},
        }, format="json")

    def test_the_affiliate_can_withdraw_against_a_manual_bonus(self):
        response = self._request_withdrawal("100.00")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        req = AffiliateWithdrawalRequest.objects.get()
        self.assertEqual(req.status, "pending")
        self.assertEqual(req.amount, Decimal("100.00"))
        # Locked, not spent: available drops so the same money cannot be
        # requested twice.
        self.assertEqual(self.available(), Decimal("0.00"))
        self.assertEqual(self.locked(), Decimal("100.00"))

    def test_withdrawing_more_than_the_balance_is_refused(self):
        response = self._request_withdrawal("150.00")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exceeds", response.data["error"].lower())
        self.assertEqual(self.available(), Decimal("100.00"))
        self.assertEqual(AffiliateWithdrawalRequest.objects.count(), 0)

    def test_the_same_bonus_cannot_be_withdrawn_twice(self):
        self.assertEqual(self._request_withdrawal("100.00").status_code, status.HTTP_201_CREATED)
        second = self._request_withdrawal("100.00")

        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AffiliateWithdrawalRequest.objects.count(), 1)
        self.assertEqual(self.available(), Decimal("0.00"))

    def test_approving_and_paying_a_withdrawal_settles_the_balance(self):
        self._request_withdrawal("100.00")
        req = AffiliateWithdrawalRequest.objects.get()

        self.client.force_authenticate(self.admin)
        approve = self.client.post(f"/api/admin-panel/affiliate-withdrawals/{req.id}/approve/",
                                   {}, format="json")
        self.assertEqual(approve.status_code, status.HTTP_200_OK, approve.data)

        paid = self.client.post(f"/api/admin-panel/affiliate-withdrawals/{req.id}/mark-paid/",
                                {"txn_hash": "0xabc123"}, format="json")
        self.assertEqual(paid.status_code, status.HTTP_200_OK, paid.data)

        req.refresh_from_db()
        self.assertEqual(req.status, "paid")
        self.assertEqual(self.available(), Decimal("0.00"))
        self.assertEqual(self.locked(), Decimal("0.00"))

        debit = AffiliateWalletTransaction.objects.filter(txn_type="PAID").get()
        self.assertEqual(debit.amount, Decimal("100.00"))

    def test_rejecting_a_withdrawal_returns_the_money_and_keeps_the_history(self):
        self._request_withdrawal("100.00")
        req = AffiliateWithdrawalRequest.objects.get()

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/admin-panel/affiliate-withdrawals/{req.id}/reject/",
                                    {"reason": "Wallet address could not be verified"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        req.refresh_from_db()
        self.assertEqual(req.status, "rejected")
        self.assertEqual(req.rejection_reason, "Wallet address could not be verified")
        # Money released, not lost.
        self.assertEqual(self.available(), Decimal("100.00"))
        self.assertEqual(self.locked(), Decimal("0.00"))
        self.assertTrue(AffiliateWalletTransaction.objects.filter(txn_type="UNLOCKED").exists())
        # The request itself survives, so the affiliate can see what happened.
        self.assertEqual(AffiliateWithdrawalRequest.objects.count(), 1)
        self.assertTrue(req.status_history.filter(to_status="rejected").exists())

        # ...and the released money is withdrawable again.
        self.assertEqual(self._request_withdrawal("100.00").status_code, status.HTTP_201_CREATED)


class ManualCommissionIsolationTests(ManualCommissionBase):
    """A bonus must not disturb what the three calculated types measure."""

    def test_a_bonus_writes_no_referral_commission_row(self):
        """ReferralCommission means 'earned X from referred user Y', and
        affiliate_stats_service counts distinct referred_user values off it to
        report qualified players. A bonus has no referred user, so a row there
        would inflate that count for every affiliate who ever got one."""
        from authapp.services.affiliate_stats_service import get_qualified_user_ids

        before = len(get_qualified_user_ids(self.affiliate))
        self.grant()

        self.assertEqual(ReferralCommission.objects.count(), 0)
        self.assertEqual(len(get_qualified_user_ids(self.affiliate)), before)

    def test_the_rule_engine_still_pays_alongside_a_bonus(self):
        from authapp.models.commission_rule_models import CommissionRule
        from authapp.services import commission_engine_service

        self.grant()
        CommissionRule.objects.create(
            name="Rolling 10%", affiliate=self.affiliate, commission_type="rolling",
            rate_type="percentage", rate=Decimal("10"),
        )

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            reference_id="SLIP-ALONGSIDE",
        )

        self.assertTrue(result.applied, result.reason)
        self.assertEqual(result.entry.commission_amount, Decimal("100.00"))
        self.assertEqual(CommissionLedgerEntry.objects.count(), 2)
        self.assertEqual(
            set(CommissionLedgerEntry.objects.values_list("commission_type", flat=True)),
            {"manual", "rolling"},
        )

    def test_manual_is_not_offered_as_a_rule_type(self):
        """A rule that pays a manual bonus is a contradiction: the whole point
        of the type is that no rule produced it."""
        from authapp.models.commission_rule_models import COMMISSION_TYPES

        self.assertNotIn("manual", dict(COMMISSION_TYPES))

        self.client.force_authenticate(self.admin)
        response = self.client.post("/api/admin-panel/commissions/rules/", {
            "name": "Bogus manual rule", "commission_type": "manual",
            "rate_type": "percentage", "rate": "5.000",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_canonical_value_is_used_everywhere(self):
        self.grant()
        entry = CommissionLedgerEntry.objects.get()

        self.assertEqual(entry.commission_type, manual_commission_service.MANUAL_COMMISSION_TYPE)
        self.assertEqual(entry.commission_type, "manual")
