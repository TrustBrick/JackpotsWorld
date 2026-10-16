"""
authapp/tests_wallet_idempotency.py
─────────────────────────────────────────────────────────────────────────────
FIN-01 regression suite: idempotency on deposit/withdrawal request creation.

Covers: same-key retry returns one request; concurrent same-key creates exactly
one; different keys create separate requests; conflicting payload under one key
→ 409; cross-user isolation; deposit/withdrawal keyspaces never cross-return;
unrelated IntegrityErrors are NOT swallowed as a retry; and legacy keyless
requests remain un-deduplicated (documented compatibility).

All against the isolated test DB. No production, no real money.
"""
import threading
from decimal import Decimal
from unittest.mock import patch

from django.db import IntegrityError, OperationalError, connection
from django.test import TransactionTestCase
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.casino_models import Casino
from authapp.models.user_model import User
from authapp.models.wallet_request_models import DepositRequest, WalletRequestMethodConfig, WithdrawalRequest
from authapp.services import wallet_request_service as svc
from authapp.services.casino_wallet_service import credit_casino_wallet

DEP_CREATE = "/api/wallet/deposit-requests/create/"
WDL_CREATE = "/api/wallet/withdrawal-requests/create/"


class _Base(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="idem-u1@example.com", password="pw12345!", name="U1")
        self.user2 = User.objects.create_user(email="idem-u2@example.com", password="pw12345!", name="U2")
        self.method, _ = WalletRequestMethodConfig.objects.update_or_create(
            code="UPI", defaults={"label": "UPI", "is_enabled": True})
        self.casino, _ = Casino.objects.update_or_create(
            country="India", name="Big Daddy", defaults={"is_active": True})


class DepositIdempotencyApiTests(_Base):
    def test_same_key_same_payload_returns_one_request(self):
        self.client.force_authenticate(self.user)
        body = {"amount": "100.00", "method_code": "upi", "idempotency_key": "k-dep-1"}
        r1 = self.client.post(DEP_CREATE, body, format="json")
        r2 = self.client.post(DEP_CREATE, body, format="json")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED, r1.data)
        self.assertEqual(r2.status_code, status.HTTP_200_OK, r2.data)   # replay
        self.assertTrue(r2.data["idempotent_replay"])
        self.assertEqual(r1.data["request"]["request_reference"],
                         r2.data["request"]["request_reference"])
        self.assertEqual(DepositRequest.objects.filter(user=self.user).count(), 1)

    def test_same_key_conflicting_payload_returns_409(self):
        self.client.force_authenticate(self.user)
        self.client.post(DEP_CREATE, {"amount": "100", "method_code": "upi", "idempotency_key": "k-dep-2"}, format="json")
        conflict = self.client.post(DEP_CREATE, {"amount": "250", "method_code": "upi", "idempotency_key": "k-dep-2"}, format="json")
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT, conflict.data)
        self.assertEqual(DepositRequest.objects.filter(user=self.user).count(), 1)

    def test_different_keys_same_payload_create_separate_requests(self):
        self.client.force_authenticate(self.user)
        base = {"amount": "100", "method_code": "upi"}
        self.client.post(DEP_CREATE, {**base, "idempotency_key": "k-a"}, format="json")
        self.client.post(DEP_CREATE, {**base, "idempotency_key": "k-b"}, format="json")
        self.assertEqual(DepositRequest.objects.filter(user=self.user).count(), 2)

    def test_missing_key_legacy_allows_duplicates(self):
        self.client.force_authenticate(self.user)
        base = {"amount": "100", "method_code": "upi"}  # no idempotency_key
        r1 = self.client.post(DEP_CREATE, base, format="json")
        r2 = self.client.post(DEP_CREATE, base, format="json")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED)  # not deduped
        self.assertEqual(DepositRequest.objects.filter(user=self.user).count(), 2)


class CrossUserIsolationTests(_Base):
    def test_same_key_two_users_do_not_cross_return(self):
        self.client.force_authenticate(self.user)
        r1 = self.client.post(DEP_CREATE, {"amount": "100", "method_code": "upi", "idempotency_key": "shared"}, format="json")
        self.client.force_authenticate(self.user2)
        r2 = self.client.post(DEP_CREATE, {"amount": "100", "method_code": "upi", "idempotency_key": "shared"}, format="json")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED)  # user2 gets its OWN row
        self.assertNotEqual(r1.data["request"]["request_reference"],
                            r2.data["request"]["request_reference"])
        self.assertEqual(DepositRequest.objects.filter(user=self.user, idempotency_key="shared").count(), 1)
        self.assertEqual(DepositRequest.objects.filter(user=self.user2, idempotency_key="shared").count(), 1)


class KeyspaceSeparationTests(_Base):
    def test_deposit_and_withdrawal_keys_do_not_cross_return(self):
        credit_casino_wallet(self.user, self.casino.name, "C", Decimal("1000"),
                             actor=self.user, txn_type="DAC", country=self.casino.country)
        dep = svc.create_deposit_request(user=self.user, amount="100", method_code="UPI", idempotency_key="same")
        wdl = svc.create_withdrawal_request(user=self.user, amount="100", casino=self.casino,
                                            method_code="UPI", idempotency_key="same")
        self.assertTrue(dep.request_reference.startswith("DEP-"))
        self.assertTrue(wdl.request_reference.startswith("WDL-"))
        # A deposit retry returns the DEPOSIT, a withdrawal retry the WITHDRAWAL.
        dep2 = svc.create_deposit_request(user=self.user, amount="100", method_code="UPI", idempotency_key="same")
        self.assertEqual(dep2.pk, dep.pk)
        self.assertTrue(getattr(dep2, "idempotent_replay", False))


class WithdrawalIdempotencyTests(_Base):
    def setUp(self):
        super().setUp()
        credit_casino_wallet(self.user, self.casino.name, "C", Decimal("1000"),
                             actor=self.user, txn_type="DAC", country=self.casino.country)
        self.client.force_authenticate(self.user)

    def test_same_key_same_payload_returns_one(self):
        body = {"amount": "200", "casino_id": self.casino.id, "method_code": "upi", "idempotency_key": "wk-1"}
        r1 = self.client.post(WDL_CREATE, body, format="json")
        r2 = self.client.post(WDL_CREATE, body, format="json")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED, r1.data)
        self.assertEqual(r2.status_code, status.HTTP_200_OK, r2.data)
        self.assertEqual(WithdrawalRequest.objects.filter(user=self.user).count(), 1)

    def test_same_key_conflicting_payload_409(self):
        self.client.post(WDL_CREATE, {"amount": "200", "casino_id": self.casino.id, "method_code": "upi", "idempotency_key": "wk-2"}, format="json")
        c = self.client.post(WDL_CREATE, {"amount": "300", "casino_id": self.casino.id, "method_code": "upi", "idempotency_key": "wk-2"}, format="json")
        self.assertEqual(c.status_code, status.HTTP_409_CONFLICT, c.data)
        self.assertEqual(WithdrawalRequest.objects.filter(user=self.user).count(), 1)


class UnrelatedIntegrityErrorTests(_Base):
    def test_non_idempotency_integrity_error_is_not_swallowed(self):
        # Force a DIFFERENT IntegrityError during insert, with a key for which no
        # row exists → the service must re-raise, not report a false "retry".
        with patch.object(svc.DepositRequest.objects, "create",
                          side_effect=IntegrityError("unrelated constraint")):
            with self.assertRaises(IntegrityError):
                svc.create_deposit_request(user=self.user, amount="100",
                                           method_code="UPI", idempotency_key="k-unrelated")
        self.assertEqual(DepositRequest.objects.filter(user=self.user).count(), 0)


class DeadlockAndRaceTests(_Base):
    """Deterministic (no-threads) coverage of the transient-error paths, so the
    transaction-handling approach can be judged without relying on real timing."""

    def test_transient_deadlock_is_retried_then_succeeds(self):
        # First INSERT simulates a deadlock (1213); a safe retry must recover and
        # complete. If no retry exists, the OperationalError propagates (fails).
        real_create = DepositRequest.objects.create
        calls = {"n": 0}

        def flaky(*a, **k):
            calls["n"] += 1
            if calls["n"] == 1:
                raise OperationalError(1213, "Deadlock found when trying to get lock; try restarting transaction")
            return real_create(*a, **k)

        with patch.object(DepositRequest.objects, "create", side_effect=flaky):
            req = svc.create_deposit_request(
                user=self.user, amount="100", method_code="UPI", idempotency_key="dl-1")

        self.assertEqual(calls["n"], 2)  # retried exactly once
        self.assertEqual(DepositRequest.objects.filter(user=self.user, idempotency_key="dl-1").count(), 1)
        self.assertFalse(getattr(req, "idempotent_replay", True))  # created on the retry

    def test_integrity_race_refetches_and_replays(self):
        # A committed winner exists; our insert loses the unique race
        # (IntegrityError); the except re-fetch must return the winner (replay).
        # The winner is hidden from the fast-path lookup only, to force the
        # except path deterministically.
        winner = DepositRequest.objects.create(
            user=self.user, amount=Decimal("100"), method=self.method,
            status="pending", idempotency_key="race-x")
        fcalls = {"n": 0}
        real_filter = DepositRequest.objects.filter

        def filter_side(*a, **k):
            fcalls["n"] += 1
            qs = real_filter(*a, **k)
            if fcalls["n"] == 1 and k.get("idempotency_key") == "race-x":
                return qs.none()  # hide winner from the fast-path check
            return qs

        def create_side(*a, **k):
            raise IntegrityError("(1062, \"Duplicate entry for key 'uniq_deposit_user_idem'\")")

        with patch.object(DepositRequest.objects, "filter", side_effect=filter_side), \
             patch.object(DepositRequest.objects, "create", side_effect=create_side):
            req = svc.create_deposit_request(
                user=self.user, amount="100", method_code="UPI", idempotency_key="race-x")

        self.assertEqual(req.pk, winner.pk)
        self.assertTrue(getattr(req, "idempotent_replay", False))
        self.assertEqual(DepositRequest.objects.filter(user=self.user, idempotency_key="race-x").count(), 1)

    def test_unrelated_operational_error_is_not_retried_or_swallowed(self):
        # A non-lock OperationalError (e.g. 1146) must propagate — never retried,
        # never misreported as success.
        def boom(*a, **k):
            raise OperationalError(1146, "Table 'x' doesn't exist")

        with patch.object(DepositRequest.objects, "create", side_effect=boom):
            with self.assertRaises(OperationalError):
                svc.create_deposit_request(
                    user=self.user, amount="100", method_code="UPI", idempotency_key="oe-1")
        self.assertEqual(DepositRequest.objects.filter(user=self.user, idempotency_key="oe-1").count(), 0)


class ConcurrentSameKeyTests(TransactionTestCase):
    """Real threads + real connections: the (user, idempotency_key) unique
    constraint is the final guard — N racing same-key creates yield one row."""

    def setUp(self):
        self.user = User.objects.create_user(email="idem-conc@example.com", password="pw12345!", name="C")
        self.method, _ = WalletRequestMethodConfig.objects.update_or_create(
            code="UPI", defaults={"label": "UPI", "is_enabled": True})

    def test_concurrent_same_key_creates_exactly_one(self):
        # SAFETY GUARANTEE (the requirement): the (user, idempotency_key) unique
        # constraint means at most ONE request row can ever exist for a key, no
        # matter how many submissions race. Colliding losers are returned the
        # winner's request where possible; under *truly simultaneous* InnoDB
        # contention a loser may instead get a transient DB error (duplicate /
        # deadlock / aborted-txn) — the client reuses the key and retries, and the
        # retry's fast path returns the committed winner. A SECOND ROW must never
        # exist; that invariant is what this test proves.
        n = 8
        barrier = threading.Barrier(n)
        results, lock = [], threading.Lock()

        def worker(_i):
            try:
                barrier.wait(timeout=10)
                req = svc.create_deposit_request(
                    user=self.user, amount="100", method_code="UPI", idempotency_key="race")
                outcome = ("ok", req.pk, getattr(req, "idempotent_replay", False))
            except Exception as exc:  # noqa: BLE001
                outcome = ("error", type(exc).__name__, None)
            finally:
                connection.close()
            with lock:
                results.append(outcome)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        # 1) The guarantee: exactly one row for the key — never a duplicate.
        self.assertEqual(
            DepositRequest.objects.filter(user=self.user, idempotency_key="race").count(), 1)
        # 2) At least one thread resolved it, and every success points at that one row.
        oks = [r for r in results if r[0] == "ok"]
        self.assertGreaterEqual(len(oks), 1)
        self.assertEqual(len({r[1] for r in oks}), 1)
        self.assertEqual(sum(1 for r in oks if r[2] is False), 1)  # exactly one real creator
        # 3) Any non-success is a TRANSIENT DB-contention error (client retries),
        #    never a logic error — and never a second row (asserted in #1).
        TRANSIENT = {"IntegrityError", "OperationalError", "TransactionManagementError"}
        unexpected = [r[1] for r in results if r[0] == "error" and r[1] not in TRANSIENT]
        self.assertEqual(unexpected, [], f"unexpected non-transient errors: {unexpected}")
