"""VOICE-CALL: tests for in-app support calling.

Grouped by the property under test rather than by endpoint, because the risky
parts of this feature are authorization and the state machine, not the HTTP
plumbing. The WebSocket cases exercise the consumer's validation helper
directly: the relay's whole job is deciding who may send what, and that
decision is a database question, not a transport one.
"""
from datetime import timedelta
from itertools import count
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models.affiliate_models import AffiliateProfile
from authapp.models.call_models import (
    CallEvent,
    CallSession,
    STATUS_ACCEPTED,
    STATUS_CANCELLED,
    STATUS_CONNECTED,
    STATUS_ENDED,
    STATUS_FAILED,
    STATUS_MISSED,
    STATUS_REJECTED,
    STATUS_RINGING,
)
from authapp.models.support_ticket_models import SupportTicket
from authapp.services import voice_call_service
from authapp.services.voice_call_service import CallError
from authapp.throttles import VoiceCallStartRateThrottle

User = get_user_model()


@override_settings(LIVE_CHAT_REALTIME=True)
class VoiceCallTestBase(APITestCase):
    def setUp(self):
        # Same stub as tests_live_chat: the User post_save signal provisions
        # four WalletAccount rows whose numbers come from a millisecond
        # timestamp, and tests create users faster than that resolves.
        counter = count()
        patcher = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"TEST{wtype}{next(counter):06d}",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        # Call initiation is rate limited to 6/min per account in production.
        # These tests deliberately start more calls than that, so the throttle
        # is disabled here and covered by its own test below instead.
        throttle_patcher = patch.object(
            VoiceCallStartRateThrottle, "allow_request", return_value=True,
        )
        throttle_patcher.start()
        self.addCleanup(throttle_patcher.stop)

        self.player = User.objects.create_user(
            email="caller@example.com", password="pw-Test-1", user_uid="TESTCAL1", name="Ava Player",
        )
        self.other_player = User.objects.create_user(
            email="other@example.com", password="pw-Test-1", user_uid="TESTOTH1",
        )
        self.agent = User.objects.create_user(
            email="agent@example.com", password="pw-Test-1", user_uid="TESTAGT1",
            is_staff=True, is_superuser=True, name="Sam Agent",
        )
        self.agent2 = User.objects.create_user(
            email="agent2@example.com", password="pw-Test-1", user_uid="TESTAGT2",
            is_staff=True, is_superuser=True,
        )

    def _as(self, user):
        self.client.force_authenticate(user=user)

    def _ticket(self, user=None, participant_type="player", status="open"):
        return SupportTicket.objects.create(
            user=user or self.player,
            subject="Live Chat Session",
            message="(live chat session)",
            is_live_chat=True,
            participant_type=participant_type,
            status=status,
        )

    def _ringing(self, ticket=None, caller=None):
        ticket = ticket or self._ticket()
        call, _ = voice_call_service.initiate_call(caller or ticket.user, ticket)
        return call


# ── Authorization ───────────────────────────────────────────────────────────

class VoiceCallAuthorizationTests(VoiceCallTestBase):
    def test_customer_can_start_call_on_own_live_chat_ticket(self):
        ticket = self._ticket()
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["status"], STATUS_RINGING)
        self.assertEqual(res.data["ticket_id"], ticket.id)
        self.assertEqual(res.data["caller_id"], self.player.id)
        self.assertIsNone(res.data["receiver_id"])

    def test_customer_cannot_start_call_on_another_customers_ticket(self):
        ticket = self._ticket(user=self.other_player)
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(res.status_code, 404)
        self.assertFalse(CallSession.objects.exists())

    def test_unrelated_customer_cannot_read_someone_elses_call(self):
        call = self._ringing()
        self._as(self.other_player)
        res = self.client.get(f"/api/live-chat/calls/{call.id}/")
        # 404, not 403 — whether a call id exists is itself information.
        self.assertEqual(res.status_code, 404)

    def test_unrelated_customer_cannot_end_someone_elses_call(self):
        call = self._ringing()
        self._as(self.other_player)
        res = self.client.post(f"/api/live-chat/calls/{call.id}/end/")
        self.assertEqual(res.status_code, 404)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_RINGING)

    def test_non_staff_cannot_accept_a_call(self):
        call = self._ringing()
        self._as(self.other_player)
        res = self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/accept/")
        self.assertIn(res.status_code, (403, 404))
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_RINGING)
        self.assertIsNone(call.receiver_id)

    def test_agent_can_accept_and_becomes_the_receiver(self):
        call = self._ringing()
        self._as(self.agent)
        res = self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/accept/")
        self.assertEqual(res.status_code, 200)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_ACCEPTED)
        self.assertEqual(call.receiver_id, self.agent.id)

    def test_call_cannot_be_started_on_a_resolved_conversation(self):
        ticket = self._ticket(status="resolved")
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "ticket_not_callable")

    def test_customer_call_history_is_scoped_to_their_own_calls(self):
        mine = self._ringing()
        theirs = self._ringing(ticket=self._ticket(user=self.other_player))
        self._as(self.player)
        res = self.client.get("/api/live-chat/calls/")
        ids = [row["id"] for row in res.data["results"]] if isinstance(res.data, dict) else [r["id"] for r in res.data]
        self.assertIn(mine.id, ids)
        self.assertNotIn(theirs.id, ids)


# ── State transitions ───────────────────────────────────────────────────────

class VoiceCallStateMachineTests(VoiceCallTestBase):
    def test_full_happy_path_records_duration(self):
        call = self._ringing()

        self._as(self.agent)
        self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/accept/")
        self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/connected/")

        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_CONNECTED)
        self.assertIsNotNone(call.connected_at)

        # Rewind the connect stamp so a measurable duration is recorded
        # without the test having to actually sleep.
        CallSession.objects.filter(pk=call.pk).update(
            connected_at=timezone.now() - timedelta(seconds=42),
        )

        self._as(self.player)
        res = self.client.post(f"/api/live-chat/calls/{call.id}/end/")
        self.assertEqual(res.status_code, 200)

        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_ENDED)
        self.assertEqual(call.end_reason, "caller_ended")
        self.assertGreaterEqual(call.duration_seconds, 41)
        self.assertIsNone(call.active_key)

    def test_ringing_to_rejected(self):
        call = self._ringing()
        self._as(self.agent)
        res = self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/reject/")
        self.assertEqual(res.status_code, 200)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_REJECTED)
        self.assertEqual(call.end_reason, "rejected")
        self.assertEqual(call.duration_seconds, 0)
        self.assertIsNone(call.active_key)

    def test_caller_hanging_up_while_ringing_is_cancelled_not_ended(self):
        call = self._ringing()
        self._as(self.player)
        self.client.post(f"/api/live-chat/calls/{call.id}/end/")
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_CANCELLED)
        self.assertEqual(call.duration_seconds, 0)

    def test_agent_hanging_up_while_ringing_is_missed(self):
        call = self._ringing()
        self._as(self.agent)
        self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/end/")
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_MISSED)

    def test_connecting_to_failed_records_the_category(self):
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        self._as(self.player)
        res = self.client.post(
            f"/api/live-chat/calls/{call.id}/failed/",
            {"reason": "network_failure"}, format="json",
        )
        self.assertEqual(res.status_code, 200)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_FAILED)
        self.assertEqual(call.end_reason, "network_failure")

    def test_client_supplied_failure_reason_is_not_trusted_verbatim(self):
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        self._as(self.player)
        self.client.post(
            f"/api/live-chat/calls/{call.id}/failed/",
            {"reason": "'; DROP TABLE --"}, format="json",
        )
        call.refresh_from_db()
        self.assertEqual(call.end_reason, "connection_failed")

    def test_cannot_mark_connected_before_acceptance(self):
        call = self._ringing()
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/calls/{call.id}/connected/")
        self.assertEqual(res.status_code, 409)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_RINGING)

    def test_ending_an_already_ended_call_is_a_no_op_not_an_error(self):
        """Both sides hanging up simultaneously is the normal case, and a
        replayed `end` must not re-stamp or resurrect anything."""
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        voice_call_service.mark_connected(self.agent, call)
        call.refresh_from_db()

        self._as(self.player)
        first = self.client.post(f"/api/live-chat/calls/{call.id}/end/")
        self.assertEqual(first.status_code, 200)
        call.refresh_from_db()
        ended_at, reason = call.ended_at, call.end_reason

        second = self.client.post(f"/api/live-chat/calls/{call.id}/end/")
        self.assertEqual(second.status_code, 200)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_ENDED)
        self.assertEqual(call.ended_at, ended_at)
        self.assertEqual(call.end_reason, reason)

    def test_lifecycle_events_are_recorded(self):
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        voice_call_service.mark_connected(self.agent, call)
        call.refresh_from_db()
        voice_call_service.end_call(self.player, call)

        events = list(CallEvent.objects.filter(call=call).values_list("event", flat=True))
        self.assertEqual(events, ["initiated", "accepted", "connected", "ended"])


# ── Duplicate prevention ────────────────────────────────────────────────────

class VoiceCallDuplicateTests(VoiceCallTestBase):
    def test_second_initiate_by_same_caller_returns_the_existing_call(self):
        ticket = self._ticket()
        self._as(self.player)
        first = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        second = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(CallSession.objects.filter(ticket=ticket).count(), 1)

    def test_database_rejects_two_live_calls_on_one_ticket(self):
        """The unique constraint is the real guard — not the service's check,
        which two concurrent requests could both pass."""
        ticket = self._ticket()
        self._ringing(ticket=ticket)
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CallSession.objects.create(
                    ticket=ticket, caller=self.player, status=STATUS_RINGING,
                    ring_expires_at=timezone.now() + timedelta(seconds=30),
                    active_key=ticket.pk,
                )

    def test_a_new_call_is_allowed_once_the_previous_one_ended(self):
        ticket = self._ticket()
        first = self._ringing(ticket=ticket)
        voice_call_service.end_call(self.player, first)

        self._as(self.player)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(res.status_code, 201)
        self.assertNotEqual(res.data["id"], first.id)
        self.assertEqual(CallSession.objects.filter(ticket=ticket).count(), 2)

    def test_second_agent_loses_the_race_to_accept(self):
        call = self._ringing()
        self._as(self.agent)
        first = self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/accept/")
        self.assertEqual(first.status_code, 200)

        self._as(self.agent2)
        second = self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/accept/")
        self.assertEqual(second.status_code, 409)

        call.refresh_from_db()
        self.assertEqual(call.receiver_id, self.agent.id)


# ── Timeout ─────────────────────────────────────────────────────────────────

class VoiceCallTimeoutTests(VoiceCallTestBase):
    def _lapse(self, call):
        CallSession.objects.filter(pk=call.pk).update(
            ring_expires_at=timezone.now() - timedelta(seconds=1),
        )
        call.refresh_from_db()
        return call

    def test_lapsed_ring_is_marked_missed_on_read(self):
        call = self._lapse(self._ringing())
        self._as(self.player)
        res = self.client.get(f"/api/live-chat/calls/{call.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], STATUS_MISSED)
        self.assertEqual(res.data["end_reason"], "timeout")

    def test_lapsed_call_cannot_still_be_accepted(self):
        call = self._lapse(self._ringing())
        self._as(self.agent)
        res = self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/accept/")
        self.assertEqual(res.status_code, 409)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_MISSED)

    def test_expiry_does_not_depend_on_a_browser_timer(self):
        """Nothing client-side runs here — the backend decides from the row."""
        call = self._lapse(self._ringing())
        voice_call_service.expire_if_due(call)
        self.assertEqual(call.status, STATUS_MISSED)
        self.assertIsNone(call.active_key)

    def test_sweep_command_expires_abandoned_rings(self):
        call = self._lapse(self._ringing())
        call_command("sweep_expired_calls")
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_MISSED)

    def test_a_missed_call_frees_the_ticket_for_a_new_one(self):
        ticket = self._ticket()
        self._lapse(self._ringing(ticket=ticket))
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(res.status_code, 201)


# ── WebSocket signaling authorization ───────────────────────────────────────

class VoiceCallSignalingAuthorizationTests(VoiceCallTestBase):
    """The relay's only job is deciding who may send into a call's group, so
    these test that decision directly rather than through a socket."""

    def _load(self, user, call_id):
        # The consumer's helper is a one-line database_sync_to_async adapter
        # over exactly this call; testing the rule itself keeps these cases
        # free of an event loop and a threaded DB connection.
        return voice_call_service.load_call_for_endpoint(user, call_id)

    def test_caller_may_signal_on_their_own_call(self):
        call = self._ringing()
        self.assertIsNotNone(self._load(self.player, call.id))

    def test_accepted_agent_may_signal(self):
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        self.assertIsNotNone(self._load(self.agent, call.id))

    def test_staff_who_have_not_accepted_may_not_inject_signaling(self):
        """An agent can *see* a ringing call in order to answer it, but must
        not be able to push SDP into someone else's negotiation."""
        call = self._ringing()
        self.assertIsNone(self._load(self.agent, call.id))

    def test_a_different_agent_cannot_signal_on_a_claimed_call(self):
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        self.assertIsNone(self._load(self.agent2, call.id))

    def test_unrelated_customer_cannot_signal(self):
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        self.assertIsNone(self._load(self.other_player, call.id))

    def test_customer_b_cannot_reach_customer_a_call_group(self):
        call_a = self._ringing()
        ticket_b = self._ticket(user=self.other_player)
        call_b = self._ringing(ticket=ticket_b, caller=self.other_player)
        self.assertIsNone(self._load(self.other_player, call_a.id))
        self.assertIsNone(self._load(self.player, call_b.id))

    def test_signaling_is_refused_once_the_call_is_terminal(self):
        """Replay guard: a stale offer/ICE frame cannot revive an ended call."""
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        call.refresh_from_db()
        voice_call_service.end_call(self.player, call)
        self.assertIsNone(self._load(self.player, call.id))
        self.assertIsNone(self._load(self.agent, call.id))

    def test_unknown_call_id_is_refused(self):
        self.assertIsNone(self._load(self.player, 999999))

    def test_group_name_is_derived_server_side_from_the_primary_key(self):
        call = self._ringing()
        self.assertEqual(voice_call_service.call_group(call.pk), f"voicecall_{call.pk}")


# ── Participant routing (player vs affiliate) ───────────────────────────────

class VoiceCallParticipantRoutingTests(VoiceCallTestBase):
    def test_affiliate_session_call_carries_the_affiliate_participant_type(self):
        AffiliateProfile.objects.create(user=self.player, is_active=True)
        ticket = self._ticket(participant_type="affiliate")
        call = self._ringing(ticket=ticket)
        payload = voice_call_service.call_payload(call)
        self.assertEqual(payload["participant_type"], "affiliate")

    def test_player_and_affiliate_conversations_hold_independent_calls(self):
        """The one-active-call guard is per ticket, and the two portals are
        separate tickets — so the same person's two conversations do not
        block each other, exactly as their chat threads do not."""
        AffiliateProfile.objects.create(user=self.player, is_active=True)
        player_ticket = self._ticket(participant_type="player")
        affiliate_ticket = self._ticket(participant_type="affiliate")

        self._ringing(ticket=player_ticket)
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/{affiliate_ticket.id}/calls/")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(CallSession.objects.filter(status=STATUS_RINGING).count(), 2)

    def test_payload_carries_caller_identity_for_the_agent_card(self):
        call = self._ringing()
        payload = voice_call_service.call_payload(call)
        self.assertEqual(payload["caller_name"], "Ava Player")
        self.assertEqual(payload["caller_uid"], "TESTCAL1")
        self.assertNotIn("email", payload)
        self.assertNotIn("phone", payload)


# ── Config / ICE ────────────────────────────────────────────────────────────

class VoiceCallConfigTests(VoiceCallTestBase):
    @override_settings(WEBRTC_STUN_URLS=["stun:example:3478"], WEBRTC_TURN_URLS=[])
    def test_stun_only_when_no_turn_configured(self):
        servers = voice_call_service.ice_servers()
        self.assertEqual(servers, [{"urls": ["stun:example:3478"]}])

    @override_settings(
        WEBRTC_STUN_URLS=["stun:example:3478"],
        WEBRTC_TURN_URLS=["turn:example:3478"],
        WEBRTC_TURN_USERNAME="u", WEBRTC_TURN_CREDENTIAL="p",
        WEBRTC_TURN_STATIC_AUTH_SECRET="",
    )
    def test_static_turn_credentials_are_served(self):
        servers = voice_call_service.ice_servers()
        turn = [s for s in servers if "turn:example:3478" in s["urls"]][0]
        self.assertEqual(turn["username"], "u")
        self.assertEqual(turn["credential"], "p")

    @override_settings(
        WEBRTC_STUN_URLS=[],
        WEBRTC_TURN_URLS=["turn:example:3478"],
        WEBRTC_TURN_STATIC_AUTH_SECRET="s3cret",
        WEBRTC_TURN_CREDENTIAL_TTL=600,
    )
    def test_time_limited_turn_credentials_expire_and_hide_the_secret(self):
        servers = voice_call_service.ice_servers()
        turn = servers[0]
        expiry, _, label = turn["username"].partition(":")
        self.assertEqual(label, "jackpotsworld")
        self.assertGreater(int(expiry), int(timezone.now().timestamp()))
        self.assertNotIn("s3cret", turn["credential"])
        self.assertNotIn("s3cret", str(servers))

    def test_config_endpoint_never_leaks_the_turn_secret(self):
        with override_settings(
            WEBRTC_TURN_URLS=["turn:example:3478"],
            WEBRTC_TURN_STATIC_AUTH_SECRET="do-not-leak",
        ):
            self._as(self.player)
            res = self.client.get("/api/live-chat/calls/config/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["available"])
        self.assertNotIn("do-not-leak", str(res.data))

    def test_config_requires_authentication(self):
        self.client.force_authenticate(user=None)
        res = self.client.get("/api/live-chat/calls/config/")
        self.assertEqual(res.status_code, 401)

    @override_settings(LIVE_CHAT_REALTIME=False)
    def test_calling_is_unavailable_without_cross_process_push(self):
        """On a WSGI-only host the signaling push cannot cross processes, so
        the feature reports itself unavailable instead of ringing forever."""
        self.assertFalse(voice_call_service.calling_available())
        ticket = self._ticket()
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.data["code"], "calling_unavailable")


# ── Rate limiting ───────────────────────────────────────────────────────────

class VoiceCallThrottleTests(VoiceCallTestBase):
    def test_call_initiation_is_rate_limited(self):
        """Runs with the real throttle, unlike the rest of the suite."""
        from django.core.cache import cache

        cache.clear()
        self.addCleanup(cache.clear)
        patch.stopall()  # restore the real allow_request for this case

        # Re-apply the account-number stub that stopall() just removed.
        counter = count(9000)
        p = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"THR{wtype}{next(counter):06d}",
        )
        p.start()
        self.addCleanup(p.stop)

        self._as(self.player)
        statuses = []
        for _ in range(9):
            ticket = self._ticket()
            statuses.append(self.client.post(f"/api/live-chat/{ticket.id}/calls/").status_code)
        self.assertIn(429, statuses)


# ── Illegal transitions ─────────────────────────────────────────────────────

class VoiceCallIllegalTransitionTests(VoiceCallTestBase):
    """An ended call is final. These pin that nothing can walk it backwards."""

    def _ended_call(self):
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        voice_call_service.mark_connected(self.agent, call)
        call.refresh_from_db()
        voice_call_service.end_call(self.player, call)
        call.refresh_from_db()
        return call

    def test_ended_call_cannot_go_back_to_accepted(self):
        call = self._ended_call()
        with self.assertRaises(CallError) as ctx:
            voice_call_service.accept_call(self.agent, call)
        self.assertEqual(ctx.exception.status, 409)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_ENDED)

    def test_ended_call_cannot_go_back_to_connected(self):
        call = self._ended_call()
        with self.assertRaises(CallError) as ctx:
            voice_call_service.mark_connected(self.player, call)
        self.assertEqual(ctx.exception.status, 409)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_ENDED)

    def test_ended_call_cannot_be_rejected(self):
        call = self._ended_call()
        with self.assertRaises(CallError):
            voice_call_service.reject_call(self.agent, call)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_ENDED)

    def test_ended_call_cannot_be_re_failed(self):
        """fail_call on a terminal call is a silent no-op, so a late failure
        report from a dying browser cannot rewrite a clean hangup as a fault."""
        call = self._ended_call()
        ended_at, reason = call.ended_at, call.end_reason
        voice_call_service.fail_call(self.player, call, "network_failure")
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_ENDED)
        self.assertEqual(call.end_reason, reason)
        self.assertEqual(call.ended_at, ended_at)

    def test_rejected_call_cannot_then_be_accepted(self):
        call = self._ringing()
        voice_call_service.reject_call(self.agent, call)
        call.refresh_from_db()
        with self.assertRaises(CallError):
            voice_call_service.accept_call(self.agent2, call)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_REJECTED)

    def test_missed_call_cannot_then_be_accepted(self):
        call = self._ringing()
        CallSession.objects.filter(pk=call.pk).update(
            ring_expires_at=timezone.now() - timedelta(seconds=1),
        )
        call.refresh_from_db()
        with self.assertRaises(CallError):
            voice_call_service.accept_call(self.agent, call)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_MISSED)

    def test_connected_call_can_still_fail(self):
        """connected → failed is legal: the media path can die mid-call."""
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        voice_call_service.mark_connected(self.agent, call)
        call.refresh_from_db()
        voice_call_service.fail_call(self.player, call, "network_failure")
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_FAILED)
        self.assertEqual(call.end_reason, "network_failure")

    def test_terminal_call_releases_its_ticket_slot_exactly_once(self):
        call = self._ended_call()
        self.assertIsNone(call.active_key)
        voice_call_service.end_call(self.agent, call)
        call.refresh_from_db()
        self.assertIsNone(call.active_key)
        self.assertEqual(call.status, STATUS_ENDED)


# ── TURN credential handling ────────────────────────────────────────────────

class VoiceCallTurnCredentialTests(VoiceCallTestBase):
    @override_settings(
        WEBRTC_STUN_URLS=[],
        WEBRTC_TURN_URLS=["turn:example:3478"],
        WEBRTC_TURN_STATIC_AUTH_SECRET="super-secret",
        WEBRTC_TURN_CREDENTIAL_TTL=120,
    )
    def test_time_limited_credential_encodes_the_configured_ttl(self):
        before = int(timezone.now().timestamp())
        turn = voice_call_service.ice_servers()[0]
        expiry = int(turn["username"].split(":")[0])
        # Expiry is now+TTL, so it must sit inside a small window around it.
        self.assertGreaterEqual(expiry, before + 120)
        self.assertLessEqual(expiry, before + 125)

    @override_settings(
        WEBRTC_STUN_URLS=[],
        WEBRTC_TURN_URLS=["turn:example:3478"],
        WEBRTC_TURN_STATIC_AUTH_SECRET="super-secret",
        WEBRTC_TURN_CREDENTIAL_TTL=120,
    )
    def test_each_request_mints_a_fresh_credential(self):
        """A credential scraped from one browser must not be the same one
        every other client is using."""
        import time as _time
        first = voice_call_service.ice_servers()[0]
        _time.sleep(1.1)
        second = voice_call_service.ice_servers()[0]
        self.assertNotEqual(first["username"], second["username"])
        self.assertNotEqual(first["credential"], second["credential"])

    @override_settings(
        WEBRTC_STUN_URLS=[],
        WEBRTC_TURN_URLS=["turn:example:3478"],
        WEBRTC_TURN_USERNAME="", WEBRTC_TURN_CREDENTIAL="",
        WEBRTC_TURN_STATIC_AUTH_SECRET="",
    )
    def test_turn_without_credentials_is_omitted_rather_than_served_broken(self):
        """Misconfiguration degrades to STUN-only instead of handing the
        browser a TURN entry that can only fail authentication."""
        servers = voice_call_service.ice_servers()
        self.assertEqual(servers, [])

    @override_settings(
        WEBRTC_TURN_URLS=["turn:example:3478"],
        WEBRTC_TURN_STATIC_AUTH_SECRET="never-leaves-the-server",
    )
    def test_the_shared_secret_is_never_in_the_response_body(self):
        self._as(self.player)
        res = self.client.get("/api/live-chat/calls/config/")
        body = str(res.data)
        self.assertNotIn("never-leaves-the-server", body)
        self.assertNotIn("STATIC_AUTH_SECRET", body)
        # And the response carries only what RTCPeerConnection needs.
        self.assertEqual(
            set(res.data.keys()), {"available", "ice_servers", "ring_timeout_seconds"},
        )
