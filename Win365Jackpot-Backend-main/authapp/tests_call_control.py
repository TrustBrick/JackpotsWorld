"""
Hold / resume, call forwarding, and per-player communication restrictions.

These are the tests that make the difference between a real feature and a
decorative button. Each one asserts a SERVER-SIDE consequence — a column
changed, a row written, a request refused — not that a UI rendered.

The channel layer is not exercised here (voice_call_service._broadcast is
best-effort by design and swallows a missing layer); what is asserted is the
persistent state every push is derived from, which is what survives a dropped
socket.
"""
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from authapp.models.call_models import (
    DIRECTION_OUTBOUND,
    STATUS_CONNECTED,
    STATUS_ENDED,
    CallEvent,
    CallSession,
    SupportAgentPresence,
    VoiceCallSettings,
)
from authapp.models.support_communication_models import (
    CHANNEL_CALL,
    CHANNEL_CHAT,
    TRANSFER_ACCEPTED,
    TRANSFER_CANCELLED,
    TRANSFER_DECLINED,
    TRANSFER_TIMEOUT,
    CallHoldEvent,
    CallTransfer,
    PlayerCommunicationRestriction,
    SupportDepartment,
)
from authapp.models.support_ticket_models import SupportTicket
from authapp.models.user_model import AdminProfile
from authapp.services import (
    call_control_service,
    communication_restriction_service,
    live_chat_service,
    voice_call_service,
)
from authapp.services.voice_call_service import CallError

User = get_user_model()


def make_agent(email, role="support"):
    user = User.objects.create_user(email=email, password="pw12345!", name=email.split("@")[0])
    user.is_staff = True
    user.save()
    AdminProfile.objects.create(user=user, role=role, is_active=True)
    return user


class CallControlTestBase(TestCase):
    def setUp(self):
        VoiceCallSettings.objects.all().delete()
        self.settings_row = VoiceCallSettings.load()

        self.player = User.objects.create_user(
            email="cc-player@example.com", password="pw12345!", name="Player",
        )
        self.agent_a = make_agent("cc-agent-a@example.com")
        self.agent_b = make_agent("cc-agent-b@example.com")
        self.agent_c = make_agent("cc-agent-c@example.com")

        self.ticket = SupportTicket.objects.create(
            user=self.player, subject="Live Chat Session", message="(live chat session)",
            is_live_chat=True, status="open",
        )

    def make_connected_call(self, receiver=None):
        """A call already up and answered — the state hold and transfer act on.

        Built directly rather than driven through initiate/accept, because
        those paths need agent presence rows and a channel layer, and neither
        is what these tests are about.
        """
        call = CallSession.objects.create(
            ticket=self.ticket,
            caller=self.player,
            receiver=receiver or self.agent_a,
            status=STATUS_CONNECTED,
            ring_expires_at=timezone.now() + timedelta(seconds=30),
            connected_at=timezone.now(),
            active_key=self.ticket.pk,
        )
        return call

    def make_connected_callback(self, agent=None):
        """The MIRROR of the above: a call the agent placed to the customer.

        `caller=agent, receiver=player` — the opposite column order, which is
        the whole point. Every control action has to work the same on this row
        as on an inbound one, and for a long time none of them did.
        """
        return CallSession.objects.create(
            ticket=self.ticket,
            caller=agent or self.agent_a,
            receiver=self.player,
            direction=DIRECTION_OUTBOUND,
            status=STATUS_CONNECTED,
            ring_expires_at=timezone.now() + timedelta(seconds=30),
            connected_at=timezone.now(),
            active_key=self.ticket.pk,
        )


# ── HOLD ────────────────────────────────────────────────────────────────────
class HoldTests(CallControlTestBase):
    def test_hold_sets_server_state_and_records_the_period(self):
        call = self.make_connected_call()
        call_control_service.hold_call(self.agent_a, call)

        call.refresh_from_db()
        self.assertTrue(call.is_on_hold)
        self.assertIsNotNone(call.hold_started_at)
        # THE CALL IS STILL CONNECTED. Hold is not a status — modelling it as
        # one would break every `status == "connected"` check in the stack and
        # tear the recorder down mid-call.
        self.assertEqual(call.status, STATUS_CONNECTED)
        # …but the single word an operator reads says "on hold".
        self.assertEqual(call.display_status, "on_hold")

        event = CallHoldEvent.objects.get(call=call)
        self.assertEqual(event.held_by, self.agent_a)
        self.assertIsNone(event.resumed_at)
        self.assertEqual(event.reason, CallHoldEvent.REASON_MANUAL)
        self.assertTrue(CallEvent.objects.filter(call=call, event="hold").exists())

    def test_resume_closes_the_period_and_accumulates_duration(self):
        call = self.make_connected_call()
        call_control_service.hold_call(self.agent_a, call)

        # Backdate the hold so a real duration is measurable without sleeping.
        CallHoldEvent.objects.filter(call=call).update(
            held_at=timezone.now() - timedelta(seconds=42),
        )
        call.refresh_from_db()
        CallSession.objects.filter(pk=call.pk).update(
            hold_started_at=timezone.now() - timedelta(seconds=42),
        )
        call.refresh_from_db()

        call_control_service.resume_call(self.agent_a, call)
        call.refresh_from_db()

        self.assertFalse(call.is_on_hold)
        self.assertIsNone(call.hold_started_at)
        self.assertGreaterEqual(call.total_hold_seconds, 40)
        self.assertEqual(call.display_status, STATUS_CONNECTED)

        event = CallHoldEvent.objects.get(call=call)
        self.assertIsNotNone(event.resumed_at)
        self.assertEqual(event.resumed_by, self.agent_a)
        self.assertGreaterEqual(event.duration_seconds, 40)
        self.assertFalse(event.auto_resumed)
        self.assertTrue(CallEvent.objects.filter(call=call, event="resume").exists())

    def test_display_status_covers_the_operator_vocabulary(self):
        """The words the brief asks an operator to be able to read:
        Ringing / Connected / On Hold / Forwarding / Forwarded / Ended /
        Missed / Failed.

        ("Calling" is the caller-side reading of `ringing` and is rendered by
        the customer widget from its own phase — one row cannot be two words
        at once. See the note in display_status.)
        """
        call = self.make_connected_call()
        self.assertEqual(call.display_status, STATUS_CONNECTED)

        call_control_service.hold_call(self.agent_a, call)
        call.refresh_from_db()
        self.assertEqual(call.display_status, "on_hold")

        call_control_service.resume_call(self.agent_a, call)
        call.refresh_from_db()
        call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_b)
        call.refresh_from_db()
        self.assertEqual(call.display_status, "forwarding")

    def test_a_call_that_was_forwarded_reads_forwarded_once_it_ends(self):
        """"Forwarded" is an OUTCOME, not a live state — it is what a manager
        reviewing the day needs to see without opening the transfer list on
        every row. While the call is live it is simply connected, because that
        is what it is to the agent now on it."""
        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(
            self.agent_a, call, to_agent=self.agent_b,
        )
        call_control_service.accept_transfer(self.agent_b, transfer)
        call.refresh_from_db()
        # Live and handed over: still just "connected".
        self.assertEqual(call.transfer_count, 1)
        self.assertEqual(call.display_status, STATUS_CONNECTED)

        CallSession.objects.filter(pk=call.pk).update(
            status=STATUS_ENDED, ended_at=timezone.now(), active_key=None,
        )
        call.refresh_from_db()
        self.assertEqual(call.display_status, "forwarded")

    def test_a_call_that_was_never_forwarded_ends_as_ended(self):
        call = self.make_connected_call()
        CallSession.objects.filter(pk=call.pk).update(
            status=STATUS_ENDED, ended_at=timezone.now(), active_key=None,
        )
        call.refresh_from_db()
        self.assertEqual(call.transfer_count, 0)
        self.assertEqual(call.display_status, STATUS_ENDED)

    def test_holding_twice_opens_one_period_not_two(self):
        call = self.make_connected_call()
        call_control_service.hold_call(self.agent_a, call)
        call.refresh_from_db()
        call_control_service.hold_call(self.agent_a, call)

        self.assertEqual(CallHoldEvent.objects.filter(call=call).count(), 1)

    def test_multiple_hold_periods_accumulate(self):
        call = self.make_connected_call()
        for _ in range(3):
            call_control_service.hold_call(self.agent_a, call)
            call.refresh_from_db()
            CallSession.objects.filter(pk=call.pk).update(
                hold_started_at=timezone.now() - timedelta(seconds=10),
            )
            CallHoldEvent.objects.filter(call=call, resumed_at__isnull=True).update(
                held_at=timezone.now() - timedelta(seconds=10),
            )
            call.refresh_from_db()
            call_control_service.resume_call(self.agent_a, call)
            call.refresh_from_db()

        self.assertEqual(CallHoldEvent.objects.filter(call=call).count(), 3)
        self.assertGreaterEqual(call.total_hold_seconds, 29)

    def test_only_the_agent_on_the_call_can_hold_it(self):
        call = self.make_connected_call(receiver=self.agent_a)
        with self.assertRaises(CallError) as ctx:
            call_control_service.hold_call(self.agent_b, call)
        self.assertEqual(ctx.exception.code, "not_call_owner")
        call.refresh_from_db()
        self.assertFalse(call.is_on_hold)

    def test_a_player_can_never_hold_a_call(self):
        call = self.make_connected_call()
        with self.assertRaises(CallError) as ctx:
            call_control_service.hold_call(self.player, call)
        self.assertEqual(ctx.exception.code, "not_authorized")

    def test_hold_is_refused_when_disabled_in_settings(self):
        self.settings_row.hold_enabled = False
        self.settings_row.save()
        call = self.make_connected_call()
        with self.assertRaises(CallError) as ctx:
            call_control_service.hold_call(self.agent_a, call)
        self.assertEqual(ctx.exception.code, "hold_disabled")

    def test_an_ended_call_cannot_be_held(self):
        call = self.make_connected_call()
        CallSession.objects.filter(pk=call.pk).update(status=STATUS_ENDED, active_key=None)
        call.refresh_from_db()
        with self.assertRaises(CallError) as ctx:
            call_control_service.hold_call(self.agent_a, call)
        self.assertEqual(ctx.exception.code, "call_not_active")

    def test_max_hold_seconds_auto_resumes(self):
        self.settings_row.max_hold_seconds = 60
        self.settings_row.save()

        call = self.make_connected_call()
        call_control_service.hold_call(self.agent_a, call)
        # Push the hold past the limit.
        stale = timezone.now() - timedelta(seconds=120)
        CallSession.objects.filter(pk=call.pk).update(hold_started_at=stale)
        CallHoldEvent.objects.filter(call=call).update(held_at=stale)

        resumed = call_control_service.sweep_expired_holds()
        self.assertEqual(resumed, 1)

        call.refresh_from_db()
        self.assertFalse(call.is_on_hold)
        event = CallHoldEvent.objects.get(call=call)
        self.assertTrue(event.auto_resumed)
        # Nobody resumed it; the server did. Recording that distinction is why
        # the column exists.
        self.assertIsNone(event.resumed_by)

    def test_sweep_does_nothing_when_no_limit_is_configured(self):
        # 0 has to be set explicitly now: the shipped default is 120 seconds,
        # so "no limit" is a choice an admin makes rather than the state a
        # fresh install happens to be in.
        self.settings_row.max_hold_seconds = 0
        self.settings_row.save()

        call = self.make_connected_call()
        call_control_service.hold_call(self.agent_a, call)
        CallSession.objects.filter(pk=call.pk).update(
            hold_started_at=timezone.now() - timedelta(hours=3),
        )
        self.assertEqual(call_control_service.sweep_expired_holds(), 0)
        call.refresh_from_db()
        self.assertTrue(call.is_on_hold)

    def test_the_sweep_command_is_what_actually_ends_a_runaway_hold(self):
        """The scheduled job, not just the function underneath it.

        A hold has no lazy read path — nothing expires it on the way past, the
        way a lapsed ring or a stale transfer is expired. `sweep_expired_holds`
        existed for months with no caller anywhere but this test file, which
        made the "an agent whose tab crashed cannot strand a customer"
        guarantee true only in principle. This asserts the wiring: the command
        cron runs must drive the hold sweep, not only the ring sweep.
        """
        self.settings_row.max_hold_seconds = 60
        self.settings_row.save()

        call = self.make_connected_call()
        call_control_service.hold_call(self.agent_a, call)
        stale = timezone.now() - timedelta(seconds=120)
        CallSession.objects.filter(pk=call.pk).update(hold_started_at=stale)
        CallHoldEvent.objects.filter(call=call).update(held_at=stale)

        out = StringIO()
        call_command("sweep_expired_calls", stdout=out)

        call.refresh_from_db()
        self.assertFalse(call.is_on_hold, "the command must resume an overdue hold")
        self.assertTrue(CallHoldEvent.objects.get(call=call).auto_resumed)
        self.assertIn("auto-resumed 1 held call(s)", out.getvalue())

    def test_ending_a_held_call_closes_the_hold_instead_of_leaving_it_open(self):
        """`is_on_hold` had no path that cleared it when the call ended.

        The flag stayed set on the terminal row, and `live_hold_seconds` adds
        "now minus hold_started_at" whenever it is set — so an ended call
        reported a hold time that grew forever, and every hold figure over call
        history was wrong for calls that ended while held.
        """
        call = self.make_connected_call()
        held_at = timezone.now() - timedelta(seconds=30)
        call_control_service.hold_call(self.agent_a, call)
        CallSession.objects.filter(pk=call.pk).update(hold_started_at=held_at)
        CallHoldEvent.objects.filter(call=call).update(held_at=held_at)
        call.refresh_from_db()

        voice_call_service.end_call(self.agent_a, call)
        call.refresh_from_db()

        self.assertFalse(call.is_on_hold)
        self.assertIsNone(call.hold_started_at)
        # The customer really did wait ~30s; the total keeps it.
        self.assertGreaterEqual(call.total_hold_seconds, 30)
        # And it stops there rather than tracking the clock.
        self.assertEqual(call.live_hold_seconds, call.total_hold_seconds)

        event = CallHoldEvent.objects.get(call=call)
        self.assertIsNotNone(event.resumed_at)
        self.assertGreaterEqual(event.duration_seconds, 30)
        # Nobody resumed it and no timeout fired — the hold ran until the call
        # did, and history should not claim otherwise.
        self.assertIsNone(event.resumed_by)
        self.assertFalse(event.auto_resumed)

    def test_ending_a_call_that_was_never_held_touches_no_hold_state(self):
        call = self.make_connected_call()
        voice_call_service.end_call(self.agent_a, call)
        call.refresh_from_db()
        self.assertFalse(call.is_on_hold)
        self.assertEqual(call.total_hold_seconds, 0)
        self.assertFalse(CallHoldEvent.objects.filter(call=call).exists())

    def test_the_sweep_command_leaves_a_hold_inside_the_limit_alone(self):
        # The counterpart to the above: a job that runs every minute must not
        # cut short a hold an agent is legitimately still in.
        self.settings_row.max_hold_seconds = 600
        self.settings_row.save()

        call = self.make_connected_call()
        call_control_service.hold_call(self.agent_a, call)

        call_command("sweep_expired_calls", stdout=StringIO())

        call.refresh_from_db()
        self.assertTrue(call.is_on_hold)


# ── TRANSFER ────────────────────────────────────────────────────────────────
class TransferTests(CallControlTestBase):
    def test_a_callback_can_be_held_and_forwarded_by_the_agent_who_placed_it(self):
        """Control actions on a call the AGENT placed.

        `_require_controlling_agent` compared the caller's id to `receiver_id`,
        which on a callback is the CUSTOMER — so hold, resume and forward all
        answered 403 "Only the agent currently on this call can control it" to
        the one agent who was actually on it. Every support callback was
        therefore uncontrollable, while inbound calls worked, which is why it
        went unnoticed.
        """
        call = self.make_connected_callback(agent=self.agent_a)
        self.assertEqual(call.caller_id, self.agent_a.id)
        self.assertEqual(call.receiver_id, self.player.id)

        call_control_service.hold_call(self.agent_a, call)
        call.refresh_from_db()
        self.assertTrue(call.is_on_hold)

        call_control_service.resume_call(self.agent_a, call)
        call.refresh_from_db()
        self.assertFalse(call.is_on_hold)

        transfer = call_control_service.request_transfer(
            self.agent_a, call, to_agent=self.agent_b,
        )
        call.refresh_from_db()
        self.assertTrue(call.is_transferring)
        self.assertEqual(transfer.from_agent_id, self.agent_a.id)

    def test_accepting_a_transfer_on_a_callback_replaces_the_agent_not_the_customer(self):
        """The reassignment writes the AGENT's column, whichever one it is.

        `update(receiver=agent)` is correct for an inbound call and catastrophic
        for a callback: `receiver` there is the customer, so accepting would
        have removed the person the call is for and left the row with two
        agents on it and nobody to talk to.
        """
        call = self.make_connected_callback(agent=self.agent_a)
        transfer = call_control_service.request_transfer(
            self.agent_a, call, to_agent=self.agent_b,
        )

        call_control_service.accept_transfer(self.agent_b, transfer)

        call.refresh_from_db()
        # The agent's side moved...
        self.assertEqual(call.caller_id, self.agent_b.id)
        # ...and the customer is still on their own call.
        self.assertEqual(call.receiver_id, self.player.id)
        self.assertEqual(call.transfer_count, 1)
        self.assertFalse(call.is_transferring)
        self.assertFalse(call.is_on_hold)
        self.assertEqual(CallSession.objects.filter(ticket=self.ticket).count(), 1)

    def test_a_second_agent_still_cannot_control_a_callback(self):
        # The fix widens *which column* identifies the agent, not who may act.
        call = self.make_connected_callback(agent=self.agent_a)
        with self.assertRaises(CallError) as ctx:
            call_control_service.hold_call(self.agent_b, call)
        self.assertEqual(ctx.exception.code, "not_call_owner")

    def test_the_customer_cannot_control_the_callback_they_are_on(self):
        # The customer is `receiver` here — the very column the old check
        # trusted — so this is the case that check would have got backwards.
        call = self.make_connected_callback(agent=self.agent_a)
        with self.assertRaises(CallError) as ctx:
            call_control_service.hold_call(self.player, call)
        self.assertEqual(ctx.exception.code, "not_authorized")

    def test_transfer_to_a_named_agent_moves_the_call(self):
        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(
            self.agent_a, call, to_agent=self.agent_b, reason="Needs payments",
        )
        call.refresh_from_db()
        self.assertTrue(call.is_transferring)
        # The customer is held for the duration of the ring rather than left
        # listening to silence.
        self.assertTrue(call.is_on_hold)
        self.assertEqual(
            CallHoldEvent.objects.get(call=call, resumed_at__isnull=True).reason,
            CallHoldEvent.REASON_TRANSFER,
        )

        call_control_service.accept_transfer(self.agent_b, transfer)

        call.refresh_from_db()
        transfer.refresh_from_db()
        # THE LINE THAT MATTERS: the same call now belongs to agent B.
        self.assertEqual(call.receiver_id, self.agent_b.id)
        self.assertEqual(transfer.status, TRANSFER_ACCEPTED)
        self.assertEqual(transfer.accepted_by_id, self.agent_b.id)
        self.assertEqual(call.transfer_count, 1)
        self.assertFalse(call.is_transferring)
        # And the customer is off hold and talking to B.
        self.assertFalse(call.is_on_hold)
        # One call, not two — the ticket, the history and the duration all
        # continue on the same row.
        self.assertEqual(CallSession.objects.filter(ticket=self.ticket).count(), 1)
        self.assertEqual(call.status, STATUS_CONNECTED)
        self.assertTrue(CallEvent.objects.filter(call=call, event="transferred").exists())

    def test_department_transfer_can_be_claimed_by_any_member(self):
        dept = SupportDepartment.objects.create(name="Payments", slug="payments")
        dept.agents.add(self.agent_b, self.agent_c)

        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(
            self.agent_a, call, to_department=dept,
        )
        call_control_service.accept_transfer(self.agent_c, transfer)

        call.refresh_from_db()
        transfer.refresh_from_db()
        self.assertEqual(call.receiver_id, self.agent_c.id)
        # `to_agent` is null for a department transfer, so accepted_by is the
        # only place the answer to "who took it" exists.
        self.assertIsNone(transfer.to_agent_id)
        self.assertEqual(transfer.accepted_by_id, self.agent_c.id)

    def test_a_second_agent_loses_the_race_rather_than_joining(self):
        dept = SupportDepartment.objects.create(name="Payments", slug="payments")
        dept.agents.add(self.agent_b, self.agent_c)
        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(self.agent_a, call, to_department=dept)

        call_control_service.accept_transfer(self.agent_b, transfer)
        with self.assertRaises(CallError) as ctx:
            call_control_service.accept_transfer(self.agent_c, transfer)
        self.assertIn(ctx.exception.code, ("transfer_not_pending", "transfer_already_taken"))

        call.refresh_from_db()
        self.assertEqual(call.receiver_id, self.agent_b.id)

    def test_only_one_pending_transfer_per_call(self):
        call = self.make_connected_call(receiver=self.agent_a)
        call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_b)
        call.refresh_from_db()
        with self.assertRaises(CallError) as ctx:
            call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_c)
        self.assertEqual(ctx.exception.code, "transfer_in_progress")
        self.assertEqual(CallTransfer.objects.filter(call=call).count(), 1)

    def test_declined_transfer_returns_the_call_and_stays_as_a_row(self):
        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_b)
        call_control_service.decline_transfer(self.agent_b, transfer)

        call.refresh_from_db()
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, TRANSFER_DECLINED)
        # The call is still agent A's, and the customer is off the transfer hold.
        self.assertEqual(call.receiver_id, self.agent_a.id)
        self.assertFalse(call.is_transferring)
        self.assertFalse(call.is_on_hold)
        # The failed attempt is history, not a deleted row — "we tried to
        # escalate and nobody picked up" is what a manager needs to see.
        self.assertEqual(CallTransfer.objects.filter(call=call).count(), 1)

    def test_a_transfer_can_be_cancelled_by_the_forwarding_agent_only(self):
        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_b)

        with self.assertRaises(CallError) as ctx:
            call_control_service.cancel_transfer(self.agent_c, transfer)
        self.assertEqual(ctx.exception.code, "not_authorized")

        call_control_service.cancel_transfer(self.agent_a, transfer)
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, TRANSFER_CANCELLED)

    def test_a_lapsed_transfer_times_out_on_read(self):
        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_b)
        CallTransfer.objects.filter(pk=transfer.pk).update(
            ring_expires_at=timezone.now() - timedelta(seconds=1),
        )
        transfer.refresh_from_db()

        call_control_service.expire_transfer_if_due(transfer)
        transfer.refresh_from_db()
        call.refresh_from_db()

        self.assertEqual(transfer.status, TRANSFER_TIMEOUT)
        self.assertEqual(call.receiver_id, self.agent_a.id)
        self.assertFalse(call.is_transferring)
        # Accepting after the window has closed must fail.
        with self.assertRaises(CallError):
            call_control_service.accept_transfer(self.agent_b, transfer)

    def test_a_transfer_cannot_be_accepted_by_someone_it_was_not_offered_to(self):
        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_b)
        with self.assertRaises(CallError) as ctx:
            call_control_service.accept_transfer(self.agent_c, transfer)
        self.assertEqual(ctx.exception.code, "not_transfer_target")

    def test_a_player_cannot_request_or_accept_a_transfer(self):
        call = self.make_connected_call(receiver=self.agent_a)
        with self.assertRaises(CallError):
            call_control_service.request_transfer(self.player, call, to_agent=self.agent_b)
        transfer = call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_b)
        with self.assertRaises(CallError) as ctx:
            call_control_service.accept_transfer(self.player, transfer)
        self.assertEqual(ctx.exception.code, "not_authorized")

    def test_transfer_to_an_empty_department_is_refused(self):
        dept = SupportDepartment.objects.create(name="Empty", slug="empty")
        call = self.make_connected_call(receiver=self.agent_a)
        with self.assertRaises(CallError) as ctx:
            call_control_service.request_transfer(self.agent_a, call, to_department=dept)
        self.assertEqual(ctx.exception.code, "department_empty")

    def test_a_department_member_who_cannot_take_calls_is_not_a_target(self):
        """Adding a finance user to a department must not make them
        answerable for calls — department membership is intersected with call
        eligibility rather than trusted on its own."""
        finance = User.objects.create_user(
            email="cc-finance@example.com", password="pw12345!", name="Finance",
        )
        finance.is_staff = True
        finance.save()
        AdminProfile.objects.create(user=finance, role="finance", is_active=True)

        dept = SupportDepartment.objects.create(name="Finance", slug="finance")
        dept.agents.add(finance)

        call = self.make_connected_call(receiver=self.agent_a)
        with self.assertRaises(CallError) as ctx:
            call_control_service.request_transfer(self.agent_a, call, to_department=dept)
        self.assertEqual(ctx.exception.code, "department_empty")

    def test_forwarding_can_be_switched_off(self):
        self.settings_row.forwarding_enabled = False
        self.settings_row.save()
        call = self.make_connected_call(receiver=self.agent_a)
        with self.assertRaises(CallError) as ctx:
            call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_b)
        self.assertEqual(ctx.exception.code, "forwarding_disabled")

    def test_transfer_needs_a_target(self):
        call = self.make_connected_call(receiver=self.agent_a)
        with self.assertRaises(CallError) as ctx:
            call_control_service.request_transfer(self.agent_a, call)
        self.assertEqual(ctx.exception.code, "no_target")

    def test_a_manual_hold_survives_a_failed_transfer(self):
        """An agent who deliberately put the customer on hold BEFORE
        forwarding should still have them on hold when the transfer fails —
        a failed escalation is not a decision to resume the conversation."""
        call = self.make_connected_call(receiver=self.agent_a)
        call_control_service.hold_call(self.agent_a, call)
        call.refresh_from_db()
        transfer = call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_b)
        call_control_service.decline_transfer(self.agent_b, transfer)

        call.refresh_from_db()
        self.assertTrue(call.is_on_hold)


# ── WHO CAN BE FORWARDED TO ─────────────────────────────────────────────────
class TransferAvailabilityTests(CallControlTestBase):
    """An agent already on a call with a player must not be offered as a
    forward target, and must be refused if one is attempted anyway.

    Forwarding to a busy agent rings nobody: the card goes to their socket,
    they are mid-call and cannot act on it, and the customer sits on hold until
    the ring window lapses and the call bounces back to where it started.
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        # Everyone online. Presence is what "has the Back Office open" means,
        # and the transfer picker reads it the same way inbound ringing does.
        for i, a in enumerate((self.agent_a, self.agent_b, self.agent_c)):
            SupportAgentPresence.objects.create(user=a, channel_name=f"ch-{i}")

    def busy(self, agent):
        """Put `agent` on a live call with a second player."""
        player = User.objects.create_user(
            email=f"busy-{agent.pk}@example.com", password="pw12345!", name="Other",
        )
        ticket = SupportTicket.objects.create(
            user=player, subject="Live Chat Session", message="x",
            is_live_chat=True, status="open",
        )
        return CallSession.objects.create(
            ticket=ticket, caller=player, receiver=agent, status=STATUS_CONNECTED,
            ring_expires_at=timezone.now() + timedelta(seconds=30),
            connected_at=timezone.now(), active_key=ticket.pk,
        )

    def targets(self, as_agent):
        self.client.force_authenticate(as_agent)
        res = self.client.get("/api/admin-panel/live-chat/transfer-targets/")
        self.assertEqual(res.status_code, 200, res.content[:300])
        return res.data

    # ── The picker ──────────────────────────────────────────────────────────
    def test_a_free_colleague_is_offered(self):
        data = self.targets(self.agent_a)
        self.assertIn(self.agent_b.id, [a["id"] for a in data["agents"]])

    def test_an_agent_on_a_call_is_not_offered(self):
        self.busy(self.agent_b)
        data = self.targets(self.agent_a)
        ids = [a["id"] for a in data["agents"]]
        self.assertNotIn(self.agent_b.id, ids, "an agent mid-call was offered as a target")
        # Agent C is free and still there — the filter narrowed, it did not empty.
        self.assertIn(self.agent_c.id, ids)
        self.assertEqual(data["on_call_count"], 1)
        self.assertEqual(data["unavailable_count"], 1)

    def test_an_offline_agent_is_not_offered(self):
        SupportAgentPresence.objects.filter(user=self.agent_b).delete()
        data = self.targets(self.agent_a)
        self.assertNotIn(self.agent_b.id, [a["id"] for a in data["agents"]])
        # Offline is not "on a call" — the two counts stay distinguishable.
        self.assertEqual(data["on_call_count"], 0)
        self.assertEqual(data["unavailable_count"], 1)

    def test_the_forwarding_agent_never_offers_themselves(self):
        self.make_connected_call(receiver=self.agent_a)
        self.assertNotIn(
            self.agent_a.id, [a["id"] for a in self.targets(self.agent_a)["agents"]],
        )

    def test_an_agent_who_finishes_a_call_becomes_offerable_again(self):
        """Busy is derived from live CallSession rows, so it clears itself the
        moment the call ends — there is no flag to reset and nothing to sweep."""
        call = self.busy(self.agent_b)
        self.assertNotIn(self.agent_b.id, [a["id"] for a in self.targets(self.agent_a)["agents"]])

        CallSession.objects.filter(pk=call.pk).update(
            status=STATUS_ENDED, ended_at=timezone.now(), active_key=None,
        )
        self.assertIn(self.agent_b.id, [a["id"] for a in self.targets(self.agent_a)["agents"]])

    # ── The server-side gate ────────────────────────────────────────────────
    def test_forwarding_to_a_busy_agent_is_refused(self):
        """The picker hiding them is presentation. This is the gate — a stale
        card or a direct POST must not park a customer on hold waiting for
        somebody who cannot answer."""
        self.busy(self.agent_b)
        call = self.make_connected_call(receiver=self.agent_a)
        with self.assertRaises(CallError) as ctx:
            call_control_service.request_transfer(self.agent_a, call, to_agent=self.agent_b)
        self.assertEqual(ctx.exception.code, "target_on_a_call")
        # Nothing was created and the customer was not put on hold for it.
        self.assertEqual(CallTransfer.objects.filter(call=call).count(), 0)
        call.refresh_from_db()
        self.assertFalse(call.is_transferring)
        self.assertFalse(call.is_on_hold)

    def test_forwarding_to_an_offline_agent_is_hidden_but_NOT_refused(self):
        """The two signals carry different weight, deliberately.

        Busy comes from live CallSession rows and is always right. Offline
        comes from a WebSocket presence row, where a dropped socket reads
        exactly like an empty chair — so it hides the agent from the picker but
        does not block a transfer that may well succeed. An absent agent
        already degrades gracefully: the ring lapses and the call comes back.
        """
        SupportAgentPresence.objects.filter(user=self.agent_b).delete()
        # Hidden from the picker...
        self.assertNotIn(self.agent_b.id, [a["id"] for a in self.targets(self.agent_a)["agents"]])

        # ...but a deliberate forward to them still goes through.
        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(
            self.agent_a, call, to_agent=self.agent_b,
        )
        self.assertEqual(transfer.to_agent_id, self.agent_b.id)

    def test_with_no_presence_data_at_all_the_picker_does_not_empty_itself(self):
        """"No presence rows" means presence is not being tracked — realtime
        switched off, or the channel layer unavailable — not that the entire
        desk went home. Filtering on it there would make forwarding impossible
        for everyone, which is far worse than the problem it solves, so the
        presence filter stands down.

        Busy filtering is unaffected, because it never depended on presence.
        """
        SupportAgentPresence.objects.all().delete()
        self.busy(self.agent_b)

        offered = [a["id"] for a in self.targets(self.agent_a)["agents"]]
        # Agent C is still offerable despite having no presence row...
        self.assertIn(self.agent_c.id, offered)
        # ...and agent B is still correctly withheld for being on a call.
        self.assertNotIn(self.agent_b.id, offered)

    def test_a_department_is_not_emptied_by_missing_presence(self):
        """Department routing uses the busy signal only, so a blinking socket
        cannot make a staffed department refuse a forward outright."""
        SupportAgentPresence.objects.all().delete()
        dept = SupportDepartment.objects.create(name="Payments", slug="payments")
        dept.agents.add(self.agent_b)

        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(
            self.agent_a, call, to_department=dept,
        )
        self.assertEqual(transfer.to_department_id, dept.id)

    def test_the_refusal_surfaces_over_http(self):
        self.busy(self.agent_b)
        call = self.make_connected_call(receiver=self.agent_a)
        self.client.force_authenticate(self.agent_a)
        res = self.client.post(
            f"/api/admin-panel/live-chat/calls/{call.pk}/transfer/",
            {"to_agent_id": self.agent_b.id}, format="json",
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "target_on_a_call")

    # ── Departments ─────────────────────────────────────────────────────────
    def test_a_department_whose_whole_team_is_on_calls_cannot_be_forwarded_to(self):
        dept = SupportDepartment.objects.create(name="Payments", slug="payments")
        dept.agents.add(self.agent_b)
        self.busy(self.agent_b)

        call = self.make_connected_call(receiver=self.agent_a)
        with self.assertRaises(CallError) as ctx:
            call_control_service.request_transfer(self.agent_a, call, to_department=dept)
        self.assertEqual(ctx.exception.code, "department_empty")

    def test_a_department_with_one_free_member_still_works(self):
        dept = SupportDepartment.objects.create(name="Payments", slug="payments")
        dept.agents.add(self.agent_b, self.agent_c)
        self.busy(self.agent_b)

        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(
            self.agent_a, call, to_department=dept,
        )
        # The free member takes it.
        call_control_service.accept_transfer(self.agent_c, transfer)
        call.refresh_from_db()
        self.assertEqual(call.receiver_id, self.agent_c.id)

    def test_the_picker_reports_a_departments_free_headcount(self):
        dept = SupportDepartment.objects.create(name="Payments", slug="payments")
        dept.agents.add(self.agent_b, self.agent_c)
        self.busy(self.agent_b)

        row = next(
            d for d in self.targets(self.agent_a)["departments"] if d["id"] == dept.id
        )
        # Total membership is unchanged; only the free count moves.
        self.assertEqual(row["agent_count"], 2)
        self.assertEqual(row["available_agent_count"], 1)

    # ── Eligibility is still the accept-time question ───────────────────────
    def test_an_agent_who_came_free_can_still_accept_a_pending_transfer(self):
        """Availability decides who is OFFERED; eligibility decides who is
        ALLOWED. An agent who was busy when the card was drawn and free by the
        time they clicked must not be refused — otherwise a transfer offered to
        a department could become unacceptable by everyone."""
        dept = SupportDepartment.objects.create(name="Payments", slug="payments")
        dept.agents.add(self.agent_b, self.agent_c)

        call = self.make_connected_call(receiver=self.agent_a)
        transfer = call_control_service.request_transfer(
            self.agent_a, call, to_department=dept,
        )
        # B picks up another call after the transfer was offered, then drops it
        # and accepts this one.
        other = self.busy(self.agent_b)
        CallSession.objects.filter(pk=other.pk).update(
            status=STATUS_ENDED, ended_at=timezone.now(), active_key=None,
        )
        call_control_service.accept_transfer(self.agent_b, transfer)
        call.refresh_from_db()
        self.assertEqual(call.receiver_id, self.agent_b.id)


# ── ENDPOINTS ───────────────────────────────────────────────────────────────
class CallControlEndpointTests(CallControlTestBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()

    def test_endpoints_are_agent_only(self):
        call = self.make_connected_call()
        self.client.force_authenticate(self.player)
        for path in (
            f"/api/admin-panel/live-chat/calls/{call.pk}/hold/",
            f"/api/admin-panel/live-chat/calls/{call.pk}/resume/",
            f"/api/admin-panel/live-chat/calls/{call.pk}/transfer/",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.post(path, {}).status_code, 403, path)

    def test_hold_and_resume_over_http(self):
        call = self.make_connected_call(receiver=self.agent_a)
        self.client.force_authenticate(self.agent_a)

        res = self.client.post(f"/api/admin-panel/live-chat/calls/{call.pk}/hold/", {})
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertTrue(res.data["is_on_hold"])
        self.assertEqual(res.data["display_status"], "on_hold")

        res = self.client.post(f"/api/admin-panel/live-chat/calls/{call.pk}/resume/", {})
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["is_on_hold"])

    def test_transfer_over_http_and_its_history(self):
        call = self.make_connected_call(receiver=self.agent_a)
        self.client.force_authenticate(self.agent_a)
        res = self.client.post(
            f"/api/admin-panel/live-chat/calls/{call.pk}/transfer/",
            {"to_agent_id": self.agent_b.id, "reason": "Needs KYC"},
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        transfer_id = res.data["id"]

        self.client.force_authenticate(self.agent_b)
        res = self.client.post(f"/api/admin-panel/live-chat/transfers/{transfer_id}/accept/", {})
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertEqual(res.data["status"], TRANSFER_ACCEPTED)

        res = self.client.get(f"/api/admin-panel/live-chat/calls/{call.pk}/transfers/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["transfers"]), 1)
        self.assertEqual(res.data["call"]["transfer_count"], 1)

    def test_transfer_targets_excludes_the_requesting_agent(self):
        self.client.force_authenticate(self.agent_a)
        res = self.client.get("/api/admin-panel/live-chat/transfer-targets/")
        self.assertEqual(res.status_code, 200)
        ids = {a["id"] for a in res.data["agents"]}
        self.assertNotIn(self.agent_a.id, ids)
        self.assertIn(self.agent_b.id, ids)

    def test_settings_round_trip(self):
        self.client.force_authenticate(self.agent_a)
        res = self.client.get("/api/admin-panel/live-support-settings/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("hold_message", res.data)

        res = self.client.patch(
            "/api/admin-panel/live-support-settings/",
            {"hold_message": "One moment please.", "max_hold_seconds": 300},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertEqual(VoiceCallSettings.load().hold_message, "One moment please.")

    def test_settings_reject_a_half_configured_working_window(self):
        self.client.force_authenticate(self.agent_a)
        res = self.client.patch(
            "/api/admin-panel/live-support-settings/",
            {"working_hours_start": "09:00"}, format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_settings_are_admin_only(self):
        self.client.force_authenticate(self.player)
        self.assertEqual(
            self.client.get("/api/admin-panel/live-support-settings/").status_code, 403,
        )


# ── PLAYER COMMUNICATION RESTRICTIONS ───────────────────────────────────────
class CommunicationRestrictionTests(CallControlTestBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()

    def test_chat_is_open_by_default(self):
        self.assertTrue(communication_restriction_service.chat_allowed(self.player).allowed)
        self.assertTrue(communication_restriction_service.calls_allowed(self.player).allowed)

    def test_disabling_chat_blocks_the_session_endpoint(self):
        communication_restriction_service.set_restriction(
            self.agent_a, self.player, CHANNEL_CHAT,
            is_enabled=False, reason="Repeated contact while under review",
            admin_note="INTERNAL: suspected bonus abuse",
        )

        result = communication_restriction_service.chat_allowed(self.player)
        self.assertFalse(result.allowed)
        self.assertEqual(result.scope, "player")

        # The gate is in the service, so it holds however the endpoint is
        # called.
        with self.assertRaises(live_chat_service.ChatRestricted):
            live_chat_service.get_or_create_active_session(self.player)

        self.client.force_authenticate(self.player)
        res = self.client.post("/api/live-chat/start/", {})
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["code"], "chat_restricted")

    def test_the_internal_reason_is_never_shown_to_the_player(self):
        secret = "INTERNAL: suspected bonus abuse, do not disclose"
        communication_restriction_service.set_restriction(
            self.agent_a, self.player, CHANNEL_CHAT,
            is_enabled=False, reason="Under review", admin_note=secret,
        )
        self.client.force_authenticate(self.player)

        res = self.client.get("/api/live-chat/communication-status/")
        self.assertEqual(res.status_code, 200)
        body = str(res.data)
        self.assertNotIn(secret, body)
        self.assertNotIn("Under review", body)
        # But they ARE told the channel is closed.
        self.assertFalse(res.data["chat"]["allowed"])
        self.assertTrue(res.data["chat"]["message"])

        res = self.client.post("/api/live-chat/start/", {})
        self.assertNotIn(secret, str(res.data))

    def test_disabling_calls_blocks_initiate(self):
        communication_restriction_service.set_restriction(
            self.agent_a, self.player, CHANNEL_CALL, is_enabled=False,
        )
        with self.assertRaises(CallError) as ctx:
            voice_call_service.initiate_call(self.player, self.ticket)
        self.assertEqual(ctx.exception.code, "calls_restricted")
        # And no call row was created.
        self.assertEqual(CallSession.objects.filter(ticket=self.ticket).count(), 0)

    def test_an_expired_restriction_lifts_itself_with_no_scheduler(self):
        communication_restriction_service.set_restriction(
            self.agent_a, self.player, CHANNEL_CHAT,
            is_enabled=False, disabled_until=timezone.now() + timedelta(hours=24),
        )
        self.assertFalse(communication_restriction_service.chat_allowed(self.player).allowed)

        # Move the expiry into the past. NOTHING else runs.
        PlayerCommunicationRestriction.objects.filter(
            user=self.player, channel=CHANNEL_CHAT,
        ).update(disabled_until=timezone.now() - timedelta(seconds=1))

        self.assertTrue(communication_restriction_service.chat_allowed(self.player).allowed)

    def test_a_player_cannot_lift_their_own_restriction(self):
        communication_restriction_service.set_restriction(
            self.agent_a, self.player, CHANNEL_CHAT, is_enabled=False,
        )
        self.client.force_authenticate(self.player)
        res = self.client.post(
            f"/api/admin-panel/players/{self.player.id}/communication/",
            {"channel": "chat", "is_enabled": True}, format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.assertFalse(communication_restriction_service.chat_allowed(self.player).allowed)

    def test_admin_can_disable_and_re_enable_and_history_records_both(self):
        self.client.force_authenticate(self.agent_a)
        base = f"/api/admin-panel/players/{self.player.id}/communication/"

        res = self.client.post(
            base,
            {"channel": "call", "is_enabled": False, "reason": "24h review",
             "admin_note": "internal", "player_message": "We will call you back."},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertFalse(res.data["channels"]["call"]["is_enabled"])

        res = self.client.post(base, {"channel": "call", "is_enabled": True}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["channels"]["call"]["is_enabled"])

        res = self.client.get(f"{base}history/")
        self.assertEqual(res.status_code, 200)
        # Both the disable and the re-enable: who lifted it is as much a part
        # of the history as who imposed it.
        self.assertEqual(len(res.data["history"]), 2)

    def test_platform_switch_closes_the_channel_for_everyone(self):
        self.settings_row.calls_enabled = False
        self.settings_row.save()
        result = communication_restriction_service.calls_allowed(self.player)
        self.assertFalse(result.allowed)
        self.assertEqual(result.scope, "platform")

    def test_holiday_mode_closes_calls_but_the_scope_says_why(self):
        self.settings_row.holiday_mode = True
        self.settings_row.save()
        result = communication_restriction_service.calls_allowed(self.player)
        self.assertFalse(result.allowed)
        self.assertEqual(result.scope, "hours")

    def test_re_enabling_clears_the_expiry(self):
        communication_restriction_service.set_restriction(
            self.agent_a, self.player, CHANNEL_CHAT,
            is_enabled=False, disabled_until=timezone.now() + timedelta(days=2),
        )
        communication_restriction_service.set_restriction(
            self.agent_a, self.player, CHANNEL_CHAT, is_enabled=True,
        )
        row = PlayerCommunicationRestriction.objects.get(user=self.player, channel=CHANNEL_CHAT)
        self.assertTrue(row.is_enabled)
        self.assertIsNone(row.disabled_until)

    def test_one_row_per_user_and_channel(self):
        for _ in range(3):
            communication_restriction_service.set_restriction(
                self.agent_a, self.player, CHANNEL_CHAT, is_enabled=False,
            )
        self.assertEqual(
            PlayerCommunicationRestriction.objects.filter(
                user=self.player, channel=CHANNEL_CHAT,
            ).count(),
            1,
        )
