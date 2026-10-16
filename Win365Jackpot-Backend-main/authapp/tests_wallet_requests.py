"""
authapp/tests_wallet_requests.py
─────────────────────────────────────────────────────────────────────────────
WALLET-REQUESTS: the self-service Deposit Request / Withdrawal Request
workflow (authapp/services/wallet_request_service.py + _views.py) had no
dedicated test file. This module fills that gap and is the deposit/withdrawal
focus of the "test every sidebar" sweep: the rest of the Admin Panel sidebars
already carry their own tests_*.py, this one did not.

The money is followed at every step — a balance and a ledger that disagree is
the one outcome a wallet feature must never produce — and every test runs
against Django's throwaway test database (test_<DB_NAME>), never the live
production/dev data.

Fixtures deliberately mirror the real roles:
  • admin002@jackpotsworld.vip / Admin@123  → super admin (passes the finance
    gate via the super-admin bypass in HasFinanceAccess).
  • a Finance-role AdminProfile admin        → the non-super finance path.
  • a plain staff member without finance     → must be denied (fail-safe).
  • two players                              → request originators.
"""
from decimal import Decimal
from unittest.mock import patch

from django.db import transaction as db_transaction
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models import AdminProfile
from authapp.models.casino_models import Casino
from authapp.models.casino_wallet_models import CasinoWalletAccount
from authapp.models.user_model import User
from authapp.models.wallet_models import WalletAccount, WalletTransaction
from authapp.models.wallet_request_models import (
    DepositRequest,
    DepositRequestStatusHistory,
    WalletRequestMethodConfig,
    WithdrawalRequest,
    WithdrawalRequestStatusHistory,
)
from authapp.services import wallet_request_service as svc
from authapp.services.casino_wallet_service import credit_casino_wallet, debit_casino_wallet

# Admin-panel endpoints are mounted under /api/admin-panel/, user ones under /api/.
DEP_CREATE = "/api/wallet/deposit-requests/create/"
DEP_LIST = "/api/wallet/deposit-requests/"
WDL_CREATE = "/api/wallet/withdrawal-requests/create/"
WDL_LIST = "/api/wallet/withdrawal-requests/"
SUMMARY = "/api/wallet/requests/summary/"


class WalletRequestTestBase(APITestCase):
    ADMIN_EMAIL = "admin002@jackpotsworld.vip"
    ADMIN_PASSWORD = "Admin@123"

    def setUp(self):
        # ── The admin the task asked for: a super admin, which the finance
        #    permission lets straight through (see HasFinanceAccess). ──
        self.admin = User.objects.create_superuser(
            email=self.ADMIN_EMAIL, password=self.ADMIN_PASSWORD, name="Admin002",
        )
        # A finance-role admin that is NOT a super user — exercises the
        # AdminProfile.can_manage_finance branch rather than the super bypass.
        self.finance_admin = User.objects.create_user(
            email="finance@jackpotsworld.vip", password="pw12345!", name="Finance",
            is_staff=True,
        )
        AdminProfile.objects.create(
            user=self.finance_admin, role="finance", can_manage_finance=True, is_active=True,
        )
        # A staff member with finance explicitly OFF — must be denied.
        self.no_finance_admin = User.objects.create_user(
            email="support@jackpotsworld.vip", password="pw12345!", name="Support",
            is_staff=True,
        )
        AdminProfile.objects.create(
            user=self.no_finance_admin, role="support", can_manage_finance=False, is_active=True,
        )

        self.player = User.objects.create_user(
            email="player1@example.com", password="pw12345!", name="Player One",
        )
        self.player2 = User.objects.create_user(
            email="player2@example.com", password="pw12345!", name="Player Two",
        )

        # Migration 0037/0040 pre-seed the payment-method registry, so force a
        # known enabled + known disabled method rather than create() (which
        # would collide on the unique `code`).
        self.method, _ = WalletRequestMethodConfig.objects.update_or_create(
            code="UPI", defaults={"label": "UPI", "is_enabled": True, "order": 1},
        )
        self.disabled_method, _ = WalletRequestMethodConfig.objects.update_or_create(
            code="CRYPTO", defaults={"label": "Crypto", "is_enabled": False, "order": 2},
        )
        self.casino, _ = Casino.objects.update_or_create(
            country="India", name="Big Daddy", defaults={"is_active": True},
        )

    # ── helpers ───────────────────────────────────────────────────────────────

    def as_player(self, user=None):
        self.client.force_authenticate(user or self.player)

    def as_admin(self, user=None):
        self.client.force_authenticate(user or self.admin)

    def fund_casino_cash(self, user, amount, casino=None):
        """Put real money into the user's casino Cash wallet so withdrawals
        have something to draw against (withdrawals are drawn against the
        per-casino Cash wallet, not the main wallet)."""
        casino = casino or self.casino
        credit_casino_wallet(
            user, casino.name, "C", Decimal(str(amount)), actor=self.admin,
            txn_type="DAC", note="test funding", country=casino.country,
        )

    def main_cash(self, user):
        acct = WalletAccount.objects.filter(user=user, wallet_type="C").first()
        return acct.balance if acct else Decimal("0")

    def casino_cash(self, user, casino=None):
        casino = casino or self.casino
        acct = CasinoWalletAccount.objects.filter(
            user=user, casino_name=casino.name, wallet_type="C",
        ).first()
        return acct.balance if acct else Decimal("0")


# ════════════════════════════════════════════════════════════════════════════
# DEPOSIT REQUESTS
# ════════════════════════════════════════════════════════════════════════════

class DepositRequestCreationTests(WalletRequestTestBase):
    def test_create_deposit_request_succeeds_and_starts_pending(self):
        self.as_player()
        res = self.client.post(DEP_CREATE, {"amount": "250.00", "method_code": "upi"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        req = DepositRequest.objects.get(user=self.player)
        self.assertEqual(req.status, "pending")
        self.assertEqual(req.amount, Decimal("250.00"))
        self.assertTrue(req.request_reference.startswith("DEP-"))
        # A pending deposit credits NOTHING until an admin approves it.
        self.assertEqual(self.main_cash(self.player), Decimal("0"))
        # Status history row recorded.
        self.assertEqual(
            DepositRequestStatusHistory.objects.filter(request=req, to_status="pending").count(), 1,
        )

    def test_amount_must_be_positive(self):
        self.as_player()
        for bad in ("0", "-5", "abc"):
            res = self.client.post(DEP_CREATE, {"amount": bad, "method_code": "upi"}, format="json")
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, bad)
        self.assertFalse(DepositRequest.objects.exists())

    def test_missing_method_is_rejected(self):
        self.as_player()
        res = self.client.post(DEP_CREATE, {"amount": "100"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_disabled_method_is_rejected(self):
        self.as_player()
        res = self.client.post(DEP_CREATE, {"amount": "100", "method_code": "crypto"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(DepositRequest.objects.exists())

    def test_unauthenticated_cannot_create(self):
        res = self.client.post(DEP_CREATE, {"amount": "100", "method_code": "upi"}, format="json")
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))


class MultipleDepositsTests(WalletRequestTestBase):
    """The task explicitly asked for MULTIPLE deposits — this follows three of
    them from request to approval and proves the Cash wallet ends at the sum."""

    def test_three_deposits_approved_sum_into_cash_wallet(self):
        amounts = [Decimal("100.00"), Decimal("250.50"), Decimal("1000.00")]
        reqs = []
        self.as_player()
        for amt in amounts:
            res = self.client.post(DEP_CREATE, {"amount": str(amt), "method_code": "upi"}, format="json")
            self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
            reqs.append(DepositRequest.objects.get(request_reference=res.data["request"]["request_reference"]))

        # Admin approves each one.
        self.as_admin()
        for req in reqs:
            res = self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/approve/", {}, format="json")
            self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.assertEqual(self.main_cash(self.player), sum(amounts))
        # Each approved deposit produced exactly one DAC ledger row, linked back.
        dac = WalletTransaction.objects.filter(user=self.player, transaction_type="DAC")
        self.assertEqual(dac.count(), 3)
        for req in reqs:
            req.refresh_from_db()
            self.assertEqual(req.status, "approved")
            self.assertIsNotNone(req.wallet_transaction_id)
            self.assertEqual(req.reviewed_by_id, self.admin.id)

    def test_list_is_scoped_to_the_requesting_user(self):
        self.as_player()
        self.client.post(DEP_CREATE, {"amount": "10", "method_code": "upi"}, format="json")
        self.client.post(DEP_CREATE, {"amount": "20", "method_code": "upi"}, format="json")
        self.as_player(self.player2)
        self.client.post(DEP_CREATE, {"amount": "99", "method_code": "upi"}, format="json")

        self.as_player()
        res = self.client.get(DEP_LIST)
        self.assertEqual(res.data["count"], 2)


class DepositLifecycleTests(WalletRequestTestBase):
    def _make(self, amount="100"):
        self.as_player()
        res = self.client.post(DEP_CREATE, {"amount": amount, "method_code": "upi"}, format="json")
        return DepositRequest.objects.get(request_reference=res.data["request"]["request_reference"])

    def test_processing_then_approve_credits_once(self):
        req = self._make("300")
        self.as_admin()
        r1 = self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/processing/", {}, format="json")
        self.assertEqual(r1.status_code, status.HTTP_200_OK, r1.data)
        req.refresh_from_db(); self.assertEqual(req.status, "processing")
        r2 = self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/approve/", {}, format="json")
        self.assertEqual(r2.status_code, status.HTTP_200_OK, r2.data)
        self.assertEqual(self.main_cash(self.player), Decimal("300"))

    def test_cannot_approve_twice(self):
        req = self._make("300")
        self.as_admin()
        self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/approve/", {}, format="json")
        again = self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/approve/", {}, format="json")
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)
        # Still only one credit.
        self.assertEqual(self.main_cash(self.player), Decimal("300"))

    def test_reject_requires_a_reason_and_credits_nothing(self):
        req = self._make("300")
        self.as_admin()
        no_reason = self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/reject/", {}, format="json")
        self.assertEqual(no_reason.status_code, status.HTTP_400_BAD_REQUEST)
        ok = self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/reject/",
                              {"reason": "Payment not received"}, format="json")
        self.assertEqual(ok.status_code, status.HTTP_200_OK, ok.data)
        req.refresh_from_db()
        self.assertEqual(req.status, "rejected")
        self.assertEqual(req.rejection_reason, "Payment not received")
        self.assertEqual(self.main_cash(self.player), Decimal("0"))

    def test_user_can_cancel_only_while_pending(self):
        req = self._make("300")
        self.as_player()
        ok = self.client.post(f"/api/wallet/deposit-requests/{req.id}/cancel/", {}, format="json")
        self.assertEqual(ok.status_code, status.HTTP_200_OK, ok.data)
        req.refresh_from_db(); self.assertEqual(req.status, "cancelled")
        # Cancelling again (now cancelled) fails.
        again = self.client.post(f"/api/wallet/deposit-requests/{req.id}/cancel/", {}, format="json")
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_cannot_cancel_after_approval(self):
        req = self._make("300")
        self.as_admin()
        self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/approve/", {}, format="json")
        self.as_player()
        res = self.client.post(f"/api/wallet/deposit-requests/{req.id}/cancel/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ════════════════════════════════════════════════════════════════════════════
# WITHDRAWAL REQUESTS
# ════════════════════════════════════════════════════════════════════════════

class WithdrawalRequestCreationTests(WalletRequestTestBase):
    def test_create_requires_casino_and_within_available_balance(self):
        self.fund_casino_cash(self.player, "500")
        self.as_player()
        # Missing casino.
        r0 = self.client.post(WDL_CREATE, {"amount": "100", "method_code": "upi"}, format="json")
        self.assertEqual(r0.status_code, status.HTTP_400_BAD_REQUEST)
        # Within balance — ok.
        r1 = self.client.post(
            WDL_CREATE, {"amount": "200", "method_code": "upi", "casino_id": self.casino.id}, format="json")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED, r1.data)
        # Exceeds remaining available (500 - 200 locked = 300) — rejected.
        r2 = self.client.post(
            WDL_CREATE, {"amount": "301", "method_code": "upi", "casino_id": self.casino.id}, format="json")
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        # Real casino balance is untouched until a withdrawal is actually paid.
        self.assertEqual(self.casino_cash(self.player), Decimal("500"))

    def test_open_requests_lock_funds_against_double_spend(self):
        self.fund_casino_cash(self.player, "1000")
        self.assertEqual(svc.get_casino_available_balance(self.player, self.casino), Decimal("1000"))
        self.as_player()
        self.client.post(WDL_CREATE, {"amount": "400", "method_code": "upi", "casino_id": self.casino.id}, format="json")
        self.assertEqual(svc.get_casino_available_balance(self.player, self.casino), Decimal("600"))


class MultipleWithdrawalsTests(WalletRequestTestBase):
    """The task explicitly asked for MULTIPLE withdrawals — three of them, each
    carried through to Paid, draining the casino Cash wallet exactly."""

    def test_three_withdrawals_paid_drain_casino_wallet(self):
        self.fund_casino_cash(self.player, "1000")
        amounts = [Decimal("100.00"), Decimal("250.00"), Decimal("150.00")]
        reqs = []
        self.as_player()
        for amt in amounts:
            res = self.client.post(
                WDL_CREATE, {"amount": str(amt), "method_code": "upi", "casino_id": self.casino.id}, format="json")
            self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
            reqs.append(WithdrawalRequest.objects.get(request_reference=res.data["request"]["request_reference"]))

        self.as_admin()
        for req in reqs:
            a = self.client.post(f"/api/admin-panel/withdrawal-requests/{req.id}/approve/", {}, format="json")
            self.assertEqual(a.status_code, status.HTTP_200_OK, a.data)
            p = self.client.post(f"/api/admin-panel/withdrawal-requests/{req.id}/paid/", {}, format="json")
            self.assertEqual(p.status_code, status.HTTP_200_OK, p.data)

        # 1000 - (100 + 250 + 150) = 500 left in the casino Cash wallet.
        self.assertEqual(self.casino_cash(self.player), Decimal("500.00"))
        for req in reqs:
            req.refresh_from_db()
            self.assertEqual(req.status, "paid")
            self.assertIsNotNone(req.wallet_transaction_id)


class WithdrawalLifecycleTests(WalletRequestTestBase):
    def _make(self, amount="200"):
        self.fund_casino_cash(self.player, "1000")
        self.as_player()
        res = self.client.post(
            WDL_CREATE, {"amount": amount, "method_code": "upi", "casino_id": self.casino.id}, format="json")
        return WithdrawalRequest.objects.get(request_reference=res.data["request"]["request_reference"])

    def test_pending_then_processing_then_paid(self):
        req = self._make("200")
        self.as_admin()
        self.client.post(f"/api/admin-panel/withdrawal-requests/{req.id}/processing/", {}, format="json")
        req.refresh_from_db(); self.assertEqual(req.status, "processing")
        paid = self.client.post(f"/api/admin-panel/withdrawal-requests/{req.id}/paid/", {}, format="json")
        self.assertEqual(paid.status_code, status.HTTP_200_OK, paid.data)
        self.assertEqual(self.casino_cash(self.player), Decimal("800"))

    def test_reject_frees_the_reserved_amount(self):
        req = self._make("200")
        # While open, 200 is locked -> available 800.
        self.assertEqual(svc.get_casino_available_balance(self.player, self.casino), Decimal("800"))
        self.as_admin()
        res = self.client.post(f"/api/admin-panel/withdrawal-requests/{req.id}/reject/",
                               {"reason": "KYC incomplete"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        # Reserved amount is released; real balance never moved.
        self.assertEqual(svc.get_casino_available_balance(self.player, self.casino), Decimal("1000"))
        self.assertEqual(self.casino_cash(self.player), Decimal("1000"))

    def test_cannot_pay_from_pending(self):
        req = self._make("200")
        self.as_admin()
        res = self.client.post(f"/api/admin-panel/withdrawal-requests/{req.id}/paid/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pay_fails_if_balance_drained_after_approval(self):
        """Defense in depth: the availability check runs at request time, but
        the real balance is only touched at Paid. If the casino wallet is
        drained in between, Paid must fail cleanly, not go negative."""
        req = self._make("200")
        self.as_admin()
        self.client.post(f"/api/admin-panel/withdrawal-requests/{req.id}/approve/", {}, format="json")
        # Drain the casino wallet behind the request's back.
        debit_casino_wallet(self.player, self.casino.name, "C", Decimal("950"),
                            actor=self.admin, txn_type="WAC", note="drain", country=self.casino.country)
        res = self.client.post(f"/api/admin-panel/withdrawal-requests/{req.id}/paid/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        req.refresh_from_db()
        self.assertEqual(req.status, "approved")  # unchanged
        self.assertEqual(self.casino_cash(self.player), Decimal("50"))  # not negative

    def test_user_can_cancel_only_while_pending(self):
        req = self._make("200")
        self.as_player()
        ok = self.client.post(f"/api/wallet/withdrawal-requests/{req.id}/cancel/", {}, format="json")
        self.assertEqual(ok.status_code, status.HTTP_200_OK, ok.data)
        req.refresh_from_db(); self.assertEqual(req.status, "cancelled")
        self.assertEqual(svc.get_casino_available_balance(self.player, self.casino), Decimal("1000"))


# ════════════════════════════════════════════════════════════════════════════
# ADMIN ACCESS CONTROL  (finance capability gate on every money-moving view)
# ════════════════════════════════════════════════════════════════════════════

class AdminFinanceAccessTests(WalletRequestTestBase):
    def _a_deposit(self):
        self.as_player()
        res = self.client.post(DEP_CREATE, {"amount": "100", "method_code": "upi"}, format="json")
        return DepositRequest.objects.get(request_reference=res.data["request"]["request_reference"])

    def test_super_admin_admin002_can_approve(self):
        req = self._a_deposit()
        self.as_admin(self.admin)  # admin002@jackpotsworld.vip
        res = self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/approve/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_finance_role_admin_can_approve(self):
        req = self._a_deposit()
        self.as_admin(self.finance_admin)
        res = self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/approve/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_staff_without_finance_is_denied(self):
        req = self._a_deposit()
        self.as_admin(self.no_finance_admin)
        res = self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/approve/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        req.refresh_from_db(); self.assertEqual(req.status, "pending")

    def test_ordinary_player_cannot_reach_admin_endpoints(self):
        req = self._a_deposit()
        self.as_player()
        res = self.client.get("/api/admin-panel/deposit-requests/")
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        res2 = self.client.post(f"/api/admin-panel/deposit-requests/{req.id}/approve/", {}, format="json")
        self.assertIn(res2.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))


class AdminSummaryTests(WalletRequestTestBase):
    def test_deposit_summary_aggregates_by_status(self):
        self.as_player()
        for amt in ("100", "200", "300"):
            self.client.post(DEP_CREATE, {"amount": amt, "method_code": "upi"}, format="json")
        reqs = list(DepositRequest.objects.filter(user=self.player).order_by("amount"))
        self.as_admin()
        # Approve the 100, reject the 300, leave the 200 pending.
        self.client.post(f"/api/admin-panel/deposit-requests/{reqs[0].id}/approve/", {}, format="json")
        self.client.post(f"/api/admin-panel/deposit-requests/{reqs[2].id}/reject/",
                         {"reason": "bad"}, format="json")
        res = self.client.get("/api/admin-panel/deposit-requests/summary/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(Decimal(str(res.data["approved"]["total"])), Decimal("100"))
        self.assertEqual(res.data["pending"]["count"], 1)
        self.assertEqual(Decimal(str(res.data["total_requested"])), Decimal("600"))


# ════════════════════════════════════════════════════════════════════════════
# REGRESSION: money-safety invariants
#   • failed operations roll back (no half-credit),
#   • money cannot be credited/debited twice,
#   • the ledger balance_before/after chain stays consistent.
# ════════════════════════════════════════════════════════════════════════════

class DepositRollbackTests(TestCase):
    """A failure anywhere inside the atomic approve must leave NOTHING behind —
    no wallet credit, no ledger row, request still pending."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="rollback-admin@jackpotsworld.vip", password="pw12345!", name="A")
        self.player = User.objects.create_user(
            email="rollback-player@example.com", password="pw12345!", name="P")
        self.method, _ = WalletRequestMethodConfig.objects.update_or_create(
            code="UPI", defaults={"label": "UPI", "is_enabled": True})

    def test_approve_that_fails_after_credit_rolls_everything_back(self):
        req = svc.create_deposit_request(
            user=self.player, amount="500", method_code="UPI")
        # Make the audit-log write (which runs AFTER the wallet credit inside
        # the same atomic block) blow up, and prove the credit is undone.
        with patch.object(svc.ActivityLog, "log", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                svc.admin_approve_deposit(request_obj=req, actor=self.admin)

        # get_cash_balance returns 0 whether the wallet row was rolled back
        # entirely or left at zero — either way no money stuck.
        self.assertEqual(svc.get_cash_balance(self.player), Decimal("0"))
        self.assertFalse(
            WalletTransaction.objects.filter(user=self.player, transaction_type="DAC").exists())
        req.refresh_from_db()
        self.assertEqual(req.status, "pending")  # untouched


class WithdrawalDoubleSpendTests(TestCase):
    """A withdrawal must debit the casino wallet exactly once even if Paid is
    invoked more than once."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="ds-admin@jackpotsworld.vip", password="pw12345!", name="A")
        self.player = User.objects.create_user(
            email="ds-player@example.com", password="pw12345!", name="P")
        self.method, _ = WalletRequestMethodConfig.objects.update_or_create(
            code="UPI", defaults={"label": "UPI", "is_enabled": True})
        self.casino, _ = Casino.objects.update_or_create(
            country="India", name="Big Daddy", defaults={"is_active": True})
        credit_casino_wallet(self.player, self.casino.name, "C", Decimal("1000"),
                             actor=self.admin, txn_type="DAC", country=self.casino.country)

    def _casino_cash(self):
        acct = CasinoWalletAccount.objects.filter(
            user=self.player, casino_name=self.casino.name, wallet_type="C").first()
        return acct.balance if acct else Decimal("0")

    def test_paid_twice_debits_only_once(self):
        req = svc.create_withdrawal_request(
            user=self.player, amount="300", casino=self.casino, method_code="UPI")
        svc.admin_approve_withdrawal(request_obj=req, actor=self.admin)
        svc.admin_mark_withdrawal_paid(request_obj=req, actor=self.admin)
        self.assertEqual(self._casino_cash(), Decimal("700"))
        # Second Paid from status 'paid' is refused by the status guard.
        with self.assertRaises(svc.WalletRequestError):
            svc.admin_mark_withdrawal_paid(request_obj=req, actor=self.admin)
        self.assertEqual(self._casino_cash(), Decimal("700"))  # not 400


class LedgerConsistencyTests(TestCase):
    """Across several deposits, every WalletTransaction's before/after must
    chain, and the final balance must equal the sum of credits."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="ledger-admin@jackpotsworld.vip", password="pw12345!", name="A")
        self.player = User.objects.create_user(
            email="ledger-player@example.com", password="pw12345!", name="P")
        self.method, _ = WalletRequestMethodConfig.objects.update_or_create(
            code="UPI", defaults={"label": "UPI", "is_enabled": True})

    def test_balance_chain_is_consistent_across_many_deposits(self):
        amounts = [Decimal("10"), Decimal("20.25"), Decimal("5.75"), Decimal("1000")]
        for amt in amounts:
            req = svc.create_deposit_request(user=self.player, amount=amt, method_code="UPI")
            svc.admin_approve_deposit(request_obj=req, actor=self.admin)

        txns = list(
            WalletTransaction.objects.filter(user=self.player, transaction_type="DAC")
            .order_by("created_at", "id"))
        self.assertEqual(len(txns), len(amounts))
        running = Decimal("0")
        for txn in txns:
            self.assertEqual(txn.balance_before, running)
            running += txn.amount
            self.assertEqual(txn.balance_after, running)
        self.assertEqual(svc.get_cash_balance(self.player), sum(amounts))
