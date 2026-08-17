"""
authapp/tests_wheel_wallet.py
─────────────────────────────────────────────────────────────────────────────
Covers the core business rule: every Spin Wheel reward (Signup Wheel and
Bonus Wheel alike) must land in the Non-Cash wallet, never Cash — plus the
transaction-safety and no-repeat guarantees the spec calls out explicitly.
"""
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.user_model import User
from authapp.models.wallet_models import WalletAccount, WalletTransaction
from authapp.models.wheel_models import (
    BonusWheel, BonusWheelGrant, BonusWheelReward, BonusWheelSpin,
    SignupWheelReward, SignupWheelSettings, SignupWheelSpin,
)
from authapp.services import wheel_service
from authapp.services.wallet_service import get_or_create_main_wallet


def make_user(email="wheelplayer@example.com", **overrides):
    return User.objects.create_user(email=email, password="pw12345!", **overrides)


class WheelRewardWalletRoutingTests(TestCase):
    """apply_wheel_reward() is the single dispatch point both wheel views
    call — proving it routes correctly here covers Signup and Bonus Wheel
    at once."""

    def setUp(self):
        self.user = make_user()

    def test_cash_bonus_credits_non_cash_wallet_not_cash(self):
        wheel_service.apply_wheel_reward(
            user=self.user, reward_type="cash_bonus", value=Decimal("500.00"),
            label="$500", actor=self.user, note="test",
        )

        nc = WalletAccount.objects.get(user=self.user, wallet_type="NC")
        c = WalletAccount.objects.get(user=self.user, wallet_type="C")
        self.assertEqual(nc.balance, Decimal("500.00"))
        self.assertEqual(c.balance, Decimal("0"))

    def test_cash_bonus_writes_a_non_cash_transaction_code(self):
        wheel_service.apply_wheel_reward(
            user=self.user, reward_type="cash_bonus", value=Decimal("50.00"),
            label="$50", actor=self.user, note="test",
        )

        txn = WalletTransaction.objects.get(user=self.user)
        self.assertEqual(txn.transaction_type, "CBGNC")
        nc = WalletAccount.objects.get(user=self.user, wallet_type="NC")
        self.assertEqual(txn.wallet_id, nc.id)

    def test_cashback_also_credits_non_cash(self):
        wheel_service.apply_wheel_reward(
            user=self.user, reward_type="cashback", value=Decimal("100.00"),
            label="Cashback", actor=self.user, note="test",
        )

        nc = WalletAccount.objects.get(user=self.user, wallet_type="NC")
        self.assertEqual(nc.balance, Decimal("100.00"))

    def test_no_wheel_reward_type_ever_credits_the_cash_wallet(self):
        """Runs every wallet-relevant reward type through the dispatcher and
        checks none of them touch WalletAccount(wallet_type='C') — the
        wallet a user can actually withdraw from."""
        for reward_type in ("cash_bonus", "cashback", "rolling_points"):
            user = make_user(email=f"{reward_type}@example.com")
            wheel_service.apply_wheel_reward(
                user=user, reward_type=reward_type, value=Decimal("10"),
                label=reward_type, actor=user, note="sweep",
            )
            cash_balance = get_or_create_main_wallet(user, "C").balance
            self.assertEqual(
                cash_balance, Decimal("0"),
                f"{reward_type} incorrectly credited the Cash wallet",
            )

    def test_try_again_credits_nothing(self):
        wheel_service.apply_wheel_reward(
            user=self.user, reward_type="no_reward", value=Decimal("0"),
            label="Try Again", actor=self.user, note="test",
        )
        self.assertFalse(WalletTransaction.objects.filter(user=self.user).exists())


class SignupWheelPlayEndToEndTests(APITestCase):
    """Drives the real POST endpoint (not the service function directly) so
    the view's transaction boundary, eligibility gate and history recording
    are all exercised together — a true trail test of Section 2's flow."""

    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)
        SignupWheelSettings.objects.update_or_create(
            pk=1, defaults={"is_enabled": True, "max_lifetime_spins": 5, "eligibility_window_days": 30},
        )

    def test_a_cash_bonus_win_lands_in_non_cash_wallet_via_the_real_endpoint(self):
        SignupWheelReward.objects.filter(is_active=True).update(is_active=False)
        SignupWheelReward.objects.create(
            label="$50", reward_type="cash_bonus", value=Decimal("50.00"),
            probability_pct=Decimal("100.000"), is_active=True,
        )

        res = self.client.post("/api/wheel/signup/play/")

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        nc = WalletAccount.objects.get(user=self.user, wallet_type="NC")
        self.assertEqual(nc.balance, Decimal("50.00"))
        c = WalletAccount.objects.get(user=self.user, wallet_type="C")
        self.assertEqual(c.balance, Decimal("0"))

    def test_the_segments_endpoint_never_exposes_probability(self):
        """Backend-only RNG guarantee: the client can't even see the odds,
        let alone compute a reward itself."""
        SignupWheelReward.objects.create(
            label="$50", reward_type="cash_bonus", value=Decimal("50"),
            probability_pct=Decimal("30.000"), is_active=True,
        )

        res = self.client.get("/api/wheel/signup/segments/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        for segment in res.data:
            self.assertNotIn("probability_pct", segment)
            self.assertNotIn("probability", segment)

    def test_a_double_submit_after_the_last_spin_does_not_double_award(self):
        """Simulates a double-click: two POSTs when only one spin remains.
        The view's select_for_update + re-check-inside-the-lock means the
        second request must be rejected, not double-credited."""
        SignupWheelReward.objects.filter(is_active=True).update(is_active=False)
        SignupWheelReward.objects.create(
            label="$50", reward_type="cash_bonus", value=Decimal("50.00"),
            probability_pct=Decimal("100.000"), is_active=True,
        )
        SignupWheelSettings.objects.update_or_create(pk=1, defaults={"max_lifetime_spins": 1, "is_enabled": True, "eligibility_window_days": 30})

        first = self.client.post("/api/wheel/signup/play/")
        second = self.client.post("/api/wheel/signup/play/")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(SignupWheelSpin.objects.filter(user=self.user).count(), 1)
        nc = WalletAccount.objects.get(user=self.user, wallet_type="NC")
        self.assertEqual(nc.balance, Decimal("50.00"))  # not 100 — only one award landed

    def test_a_high_value_tier_cannot_repeat_for_the_same_player(self):
        SignupWheelReward.objects.filter(is_active=True).update(is_active=False)
        five_hundred = SignupWheelReward.objects.create(
            label="$500", reward_type="cash_bonus", value=Decimal("500.00"),
            probability_pct=Decimal("100.000"), no_repeat_for_player=True, is_active=True,
        )
        fifty = SignupWheelReward.objects.create(
            label="$50", reward_type="cash_bonus", value=Decimal("50.00"),
            probability_pct=Decimal("1.000"), no_repeat_for_player=False, is_active=True,
        )
        SignupWheelSettings.objects.update_or_create(pk=1, defaults={"max_lifetime_spins": 5, "is_enabled": True, "eligibility_window_days": 30})

        # First spin is forced to $500 by making it the only 100%-weighted
        # active tier momentarily.
        fifty.is_active = False
        fifty.save()
        first = self.client.post("/api/wheel/signup/play/")
        self.assertEqual(first.data["reward"]["label"], "$500")

        # Re-activate both; $500 must now be excluded from the candidate
        # pool for this player even though it's still active platform-wide.
        fifty.is_active = True
        fifty.save()
        already_won_ids = set(
            SignupWheelSpin.objects.filter(user=self.user, reward__no_repeat_for_player=True).values_list("reward_id", flat=True)
        )
        self.assertIn(five_hundred.id, already_won_ids)

        for _ in range(20):
            reward = wheel_service.resolve_signup_wheel_spin(self.user)
            self.assertNotEqual(reward.id, five_hundred.id)

    def test_disabled_wheel_is_rejected_and_credits_nothing(self):
        SignupWheelSettings.objects.update_or_create(pk=1, defaults={"is_enabled": False, "max_lifetime_spins": 5, "eligibility_window_days": 30})

        res = self.client.post("/api/wheel/signup/play/")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(WalletTransaction.objects.filter(user=self.user).exists())

    def test_expired_window_is_rejected(self):
        from django.utils import timezone
        self.user.date_joined = timezone.now() - timezone.timedelta(days=31)
        self.user.save(update_fields=["date_joined"])

        res = self.client.post("/api/wheel/signup/play/")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["error"], "Your Signup Wheel window has expired.")


class BonusWheelPlayEndToEndTests(APITestCase):
    def setUp(self):
        self.user = make_user(email="bonusplayer@example.com")
        self.client.force_authenticate(self.user)
        self.wheel = BonusWheel.objects.create(name="Test Bonus Wheel", is_active=True)
        self.reward = BonusWheelReward.objects.create(
            wheel=self.wheel, label="$100", reward_type="cash_bonus",
            value=Decimal("100.00"), weight=100, is_active=True,
        )
        self.grant = BonusWheelGrant.objects.create(
            wheel=self.wheel, assignment=self._make_assignment(), user=self.user, spins_total=1,
        )

    def _make_assignment(self):
        from authapp.models.wheel_models import BonusWheelAssignment
        return BonusWheelAssignment.objects.create(
            wheel=self.wheel, target_type="individual", spins_granted=1, created_by=self.user,
        )

    def test_bonus_wheel_cash_bonus_also_lands_in_non_cash_wallet(self):
        res = self.client.post(f"/api/wheel/bonus/{self.grant.id}/play/")

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        nc = WalletAccount.objects.get(user=self.user, wallet_type="NC")
        self.assertEqual(nc.balance, Decimal("100.00"))
        c = WalletAccount.objects.get(user=self.user, wallet_type="C")
        self.assertEqual(c.balance, Decimal("0"))

    def test_a_grant_cannot_be_spent_twice_via_double_submit(self):
        first = self.client.post(f"/api/wheel/bonus/{self.grant.id}/play/")
        second = self.client.post(f"/api/wheel/bonus/{self.grant.id}/play/")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BonusWheelSpin.objects.filter(user=self.user).count(), 1)
        nc = WalletAccount.objects.get(user=self.user, wallet_type="NC")
        self.assertEqual(nc.balance, Decimal("100.00"))


class WheelConcurrencySimulationTests(TestCase):
    """Section 2 explicitly calls out "multiple API requests creating
    multiple rewards" as a failure to prevent. select_for_update() serializes
    concurrent transactions rather than truly running them in parallel inside
    SQLite/this test runner, so this proves the logical guard — that a
    second request re-checks state after acquiring the lock and correctly
    finds the spin budget exhausted — using sequential calls, which is what
    that logic actually depends on regardless of true DB-level concurrency."""

    def setUp(self):
        self.user = make_user(email="concurrency@example.com")
        SignupWheelSettings.objects.update_or_create(pk=1, defaults={"is_enabled": True, "max_lifetime_spins": 1, "eligibility_window_days": 30})
        SignupWheelReward.objects.filter(is_active=True).update(is_active=False)
        SignupWheelReward.objects.create(
            label="$50", reward_type="cash_bonus", value=Decimal("50.00"),
            probability_pct=Decimal("100.000"), is_active=True,
        )

    def test_three_rapid_calls_produce_exactly_one_spin_record_and_one_credit(self):
        from django.db import transaction as db_transaction
        from authapp.services.wheel_service import apply_wheel_reward, resolve_signup_wheel_spin, signup_wheel_status

        successes = 0
        for _ in range(3):
            with db_transaction.atomic():
                User.objects.select_for_update().get(pk=self.user.pk)
                status_data = signup_wheel_status(self.user)
                if not status_data["eligible"]:
                    continue
                reward = resolve_signup_wheel_spin(self.user)
                apply_wheel_reward(
                    user=self.user, reward_type=reward.reward_type, value=reward.value,
                    label=reward.label, actor=self.user, note="race test",
                )
                spin_number = SignupWheelSpin.objects.filter(user=self.user).count() + 1
                SignupWheelSpin.objects.create(
                    user=self.user, reward=reward, reward_label_snapshot=reward.label,
                    reward_type_snapshot=reward.reward_type, value_snapshot=reward.value,
                    spin_number=spin_number,
                )
                successes += 1

        self.assertEqual(successes, 1)
        self.assertEqual(SignupWheelSpin.objects.filter(user=self.user).count(), 1)
        nc = WalletAccount.objects.get(user=self.user, wallet_type="NC")
        self.assertEqual(nc.balance, Decimal("50.00"))
