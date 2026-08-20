"""VOICE-CALL: concurrency tests for the one-active-call-per-conversation rule.

TransactionTestCase, not TestCase: the point of these is that several real
database connections race each other, and TestCase's per-test transaction
would hide every row from every other thread.

What is actually being proven here is that the guarantee comes from the
database, not from the service's check. `initiate_call` does read the current
active call before inserting, but two requests can both pass that read — the
unique constraint on CallSession.active_key is what makes exactly one of them
win. Frontend guards and the service pre-check are conveniences on top.
"""
import threading
from itertools import count
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase, override_settings

from authapp.models.call_models import ACTIVE_STATUSES, CallSession
from authapp.models.support_ticket_models import SupportTicket
from authapp.services import voice_call_service
from authapp.services.voice_call_service import CallError

User = get_user_model()


@override_settings(LIVE_CHAT_REALTIME=True)
class VoiceCallConcurrencyTests(TransactionTestCase):
    def setUp(self):
        counter = count()
        patcher = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"CC{wtype}{next(counter):06d}",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.player = User.objects.create_user(
            email="cc-caller@example.com", password="pw-Test-1", user_uid="CCCALL01",
        )
        self.agents = [
            User.objects.create_user(
                email=f"cc-agent{i}@example.com", password="pw-Test-1",
                user_uid=f"CCAGNT{i}0", is_staff=True, is_superuser=True,
            )
            for i in range(4)
        ]
        self.ticket = SupportTicket.objects.create(
            user=self.player, subject="Live Chat Session",
            message="(live chat session)", is_live_chat=True, status="open",
        )

    def _run_in_parallel(self, fn, n):
        """Runs fn() on n threads released together, and collects per-thread
        (result, exception). Each thread closes its own connection — Django
        opens one per thread and would otherwise leak them into the suite."""
        barrier = threading.Barrier(n)
        results = []
        lock = threading.Lock()

        def worker(index):
            try:
                barrier.wait(timeout=10)
                outcome = ("ok", fn(index))
            except Exception as exc:  # noqa: BLE001 - recorded, asserted on below
                outcome = ("error", exc)
            finally:
                connection.close()
            with lock:
                results.append(outcome)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        return results

    def test_concurrent_initiates_create_exactly_one_active_call(self):
        def initiate(_index):
            call, created = voice_call_service.initiate_call(self.player, self.ticket)
            return call.pk, created

        results = self._run_in_parallel(initiate, 8)

        # Nothing may crash: a losing race returns the winner's call, it does
        # not surface as a 500 to the customer.
        errors = [r for kind, r in results if kind == "error"]
        self.assertEqual(errors, [], f"unexpected exceptions: {errors}")

        active = CallSession.objects.filter(ticket=self.ticket, status__in=ACTIVE_STATUSES)
        self.assertEqual(active.count(), 1)
        self.assertEqual(CallSession.objects.filter(ticket=self.ticket).count(), 1)

        # Every thread ended up pointing at the same call, and exactly one of
        # them was the creator.
        call_ids = {r[0] for kind, r in results if kind == "ok"}
        self.assertEqual(len(call_ids), 1)
        created_flags = [r[1] for kind, r in results if kind == "ok"]
        self.assertEqual(created_flags.count(True), 1)

    def test_concurrent_accepts_produce_exactly_one_receiver(self):
        call, _ = voice_call_service.initiate_call(self.player, self.ticket)

        def accept(index):
            fresh = CallSession.objects.get(pk=call.pk)
            return voice_call_service.accept_call(self.agents[index], fresh).receiver_id

        results = self._run_in_parallel(accept, len(self.agents))

        winners = [r for kind, r in results if kind == "ok"]
        losers = [r for kind, r in results if kind == "error"]
        self.assertEqual(len(winners), 1, f"expected one winner, got {winners}")
        self.assertEqual(len(losers), len(self.agents) - 1)
        for exc in losers:
            self.assertIsInstance(exc, CallError)
            self.assertEqual(exc.status, 409)

        call.refresh_from_db()
        self.assertEqual(call.receiver_id, winners[0])

    def test_concurrent_hangups_produce_one_terminal_transition(self):
        """Both parties hitting End at the same instant must not double-count
        duration or write two terminal transitions."""
        call, _ = voice_call_service.initiate_call(self.player, self.ticket)
        voice_call_service.accept_call(self.agents[0], call)
        call.refresh_from_db()
        voice_call_service.mark_connected(self.agents[0], call)

        participants = [self.player, self.agents[0]]

        def hangup(index):
            fresh = CallSession.objects.get(pk=call.pk)
            return voice_call_service.end_call(participants[index], fresh).status

        results = self._run_in_parallel(hangup, 2)
        errors = [r for kind, r in results if kind == "error"]
        self.assertEqual(errors, [], f"end must never raise: {errors}")

        call.refresh_from_db()
        self.assertEqual(call.status, "ended")
        self.assertIsNone(call.active_key)

        # Exactly one "ended" audit row, not one per caller.
        self.assertEqual(call.events.filter(event="ended").count(), 1)

    def test_a_freed_slot_can_be_reused_concurrently_without_duplicating(self):
        first, _ = voice_call_service.initiate_call(self.player, self.ticket)
        voice_call_service.end_call(self.player, first)

        def initiate(_index):
            call, _created = voice_call_service.initiate_call(self.player, self.ticket)
            return call.pk

        results = self._run_in_parallel(initiate, 6)
        errors = [r for kind, r in results if kind == "error"]
        self.assertEqual(errors, [], f"unexpected exceptions: {errors}")

        active = CallSession.objects.filter(ticket=self.ticket, status__in=ACTIVE_STATUSES)
        self.assertEqual(active.count(), 1)
        self.assertNotEqual(active.first().pk, first.pk)
