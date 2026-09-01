"""VOICE-CALL: tests for in-app support calling.

Grouped by the property under test rather than by endpoint, because the risky
parts of this feature are authorization and the state machine, not the HTTP
plumbing. The WebSocket cases exercise the consumer's validation helper
directly: the relay's whole job is deciding who may send what, and that
decision is a database question, not a transport one.
"""
import os
import shutil
import tempfile
import time
from datetime import timedelta
from itertools import count
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models.affiliate_models import AffiliateProfile
from authapp.models.user_model import ActivityLog
from authapp.models.call_models import (
    PRESENCE_MAX_AGE,
    SupportAgentPresence,
    VoiceCallSettings,
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
from authapp.models.user_model import AdminProfile
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

        # An on-duty support agent. initiate_call now refuses when nobody is
        # available, so without this every existing test would fail on the new
        # guard rather than on what it is actually testing. The empty-desk path
        # gets its own tests below.
        self.duty_agent = User.objects.create_user(
            email="onduty@example.com", password="pw-Test-1", user_uid="TESTDUTY",
            is_staff=True, name="On Duty",
        )
        AdminProfile.objects.update_or_create(
            user=self.duty_agent, defaults={"role": "support", "is_active": True},
        )
        SupportAgentPresence.objects.create(
            user=self.duty_agent, channel_name="test-channel-duty",
        )

    def _go_off_duty(self):
        """Empty the support desk for a test that needs an unstaffed one."""
        SupportAgentPresence.objects.all().delete()

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
        """Name, UID and registered email — the three an agent needs to know
        which account is on the line before they speak. The email is here on
        purpose: a display name is optional on these accounts, and without it
        the card used to read "Customer" and nothing else."""
        call = self._ringing()
        payload = voice_call_service.call_payload(call)
        self.assertEqual(payload["caller_name"], "Ava Player")
        self.assertEqual(payload["caller_uid"], "TESTCAL1")
        self.assertEqual(payload["caller_email"], "caller@example.com")
        # A player is not an affiliate, so there is no AFF- reference to show.
        self.assertIsNone(payload["caller_affiliate_id"])
        # What stays off the wire: the *agent's* contact details, and anything
        # beyond identity. The caller's own email reaches only their own
        # conversation and the staff serving it.
        self.assertNotIn("receiver_email", payload)
        self.assertNotIn("agent_email", payload)
        self.assertNotIn("phone", payload)
        self.assertNotIn("balance", payload)

    def test_an_affiliate_caller_is_referenced_the_way_the_inbox_names_them(self):
        AffiliateProfile.objects.create(user=self.player, is_active=True)
        call = self._ringing(ticket=self._ticket(participant_type="affiliate"))
        payload = voice_call_service.call_payload(call)
        self.assertEqual(payload["caller_affiliate_id"], "AFF-TESTCAL1")
        self.assertEqual(payload["caller_email"], "caller@example.com")

    def test_the_rest_representation_matches_the_pushed_payload(self):
        """The card is fed by a socket push or a REST fetch depending on how
        the agent arrived, so the two must agree on identity or the same call
        renders differently in the two paths."""
        call = self._ringing()
        # Fetched as the caller: a ringing call has no receiver yet, so the
        # participant scope is the customer's own until an agent claims it.
        self._as(self.player)
        res = self.client.get(f"/api/live-chat/calls/{call.pk}/")
        payload = voice_call_service.call_payload(call)
        for field in ("caller_name", "caller_uid", "caller_email", "caller_affiliate_id"):
            self.assertEqual(res.data[field], payload[field], field)


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
        # And the response carries only what the browser needs to set a call
        # up — nothing about credentials, other users, or storage. This is an
        # allowlist on purpose: a new key here is a deliberate decision to
        # publish something, not an accident.
        self.assertEqual(
            set(res.data.keys()),
            {"available", "ice_servers", "ring_timeout_seconds", "recording_enabled"},
        )


# ── Recording ───────────────────────────────────────────────────────────────

@override_settings(
    LIVE_CHAT_REALTIME=True,
    VOICE_CALL_RECORDING_ENABLED=True,
    MEDIA_ROOT=tempfile.mkdtemp(prefix="jw-media-test-"),
    VOICE_CALL_RECORDING_ROOT=tempfile.mkdtemp(prefix="jw-call-rec-test-"),
)
class VoiceCallRecordingTests(VoiceCallTestBase):
    """The recording is audio of a customer, so these are mostly authorization
    tests. The property that matters above all: possessing a link is never the
    same as being allowed to listen."""

    def setUp(self):
        super().setUp()
        # The base class makes both of its agents superusers, which would mask
        # the "handled by someone else" rule — every check below would pass for
        # the wrong reason. This one is ordinary staff.
        self.other_agent = User.objects.create_user(
            email="agent3@example.com", password="pw-Test-1", user_uid="TESTAGT3",
            is_staff=True, name="Robin Agent",
        )
        self.addCleanup(shutil.rmtree, settings.VOICE_CALL_RECORDING_ROOT, True)
        self.addCleanup(shutil.rmtree, settings.MEDIA_ROOT, True)

    def _audio(self, size=2048, content_type="audio/webm"):
        body = b"\x1a\x45\xdf\xa3" + b"\x00" * (size - 4)
        return SimpleUploadedFile("blob", body, content_type)

    def _handled_call(self, agent=None):
        """A call that ran its course: rang, answered, connected, hung up."""
        agent = agent or self.agent
        call = self._ringing()
        call = voice_call_service.accept_call(agent, call)
        call = voice_call_service.mark_connected(agent, call)
        return voice_call_service.end_call(agent, call)

    def _upload(self, call, upload=None):
        return self.client.post(
            "/api/admin-panel/live-chat/calls/{}/recording/".format(call.pk),
            {"file": upload if upload is not None else self._audio()},
            format="multipart",
        )

    def _playback(self, call):
        return self.client.get(
            "/api/admin-panel/live-chat/calls/{}/recording/".format(call.pk),
        )

    # ── Upload ──────────────────────────────────────────────────────────────

    def test_the_agent_who_handled_the_call_can_upload_its_recording(self):
        call = self._handled_call()
        self._as(self.agent)
        self.assertEqual(self._upload(call).status_code, 201)

        call.refresh_from_db()
        self.assertTrue(call.recording)
        self.assertEqual(call.recording_bytes, 2048)
        self.assertIsNotNone(call.recording_uploaded_at)
        # Stored under the call's own id, never a client-supplied filename.
        self.assertIn("call-{}.webm".format(call.pk), call.recording.name)
        self.assertTrue(
            CallEvent.objects.filter(call=call, event="recorded").exists(),
            "the upload should leave an audit row",
        )

    def test_the_audio_never_lands_anywhere_public(self):
        """The load-bearing one.

        media_serve_views.serve_media publishes everything under MEDIA_ROOT
        with no permission check whatsoever, and a recording's filename is
        derived from a sequential call id — so a recording inside MEDIA_ROOT
        would be downloadable by anyone who can count. It has to live
        somewhere that view is not rooted at.
        """
        call = self._handled_call()
        self._as(self.agent)
        self._upload(call)
        call.refresh_from_db()

        on_disk = os.path.abspath(call.recording.path)
        media_root = os.path.abspath(settings.MEDIA_ROOT)
        self.assertFalse(
            on_disk.startswith(media_root + os.sep),
            f"recording {on_disk} is inside the publicly served MEDIA_ROOT",
        )
        self.assertTrue(os.path.exists(on_disk))

    def test_a_staff_member_who_did_not_handle_the_call_cannot_upload(self):
        call = self._handled_call()
        self._as(self.other_agent)
        self.assertEqual(self._upload(call).status_code, 403)
        call.refresh_from_db()
        self.assertFalse(call.recording)

    def test_a_second_upload_never_replaces_the_first(self):
        call = self._handled_call()
        self._as(self.agent)
        self.assertEqual(self._upload(call).status_code, 201)
        call.refresh_from_db()
        first = call.recording.name

        self.assertEqual(self._upload(call, self._audio(size=4096)).status_code, 409)
        call.refresh_from_db()
        self.assertEqual(call.recording.name, first)
        self.assertEqual(call.recording_bytes, 2048)

    def test_an_oversized_recording_is_refused(self):
        call = self._handled_call()
        self._as(self.agent)
        with override_settings(VOICE_CALL_RECORDING_MAX_BYTES=1024):
            self.assertEqual(self._upload(call, self._audio(size=4096)).status_code, 413)
        call.refresh_from_db()
        self.assertFalse(call.recording)

    def test_an_empty_recording_is_refused(self):
        call = self._handled_call()
        self._as(self.agent)
        empty = SimpleUploadedFile("blob", b"", "audio/webm")
        self.assertEqual(self._upload(call, empty).status_code, 400)

    def test_an_unsupported_container_is_refused(self):
        call = self._handled_call()
        self._as(self.agent)
        bad = self._audio(content_type="application/zip")
        self.assertEqual(self._upload(call, bad).status_code, 415)
        call.refresh_from_db()
        self.assertFalse(call.recording)

    def test_the_codec_parameter_on_the_mime_type_is_tolerated(self):
        """MediaRecorder reports "audio/webm;codecs=opus" and the browser puts
        that whole string on the multipart part."""
        call = self._handled_call()
        self._as(self.agent)
        opus = self._audio(content_type="audio/webm;codecs=opus")
        self.assertEqual(self._upload(call, opus).status_code, 201)

    def test_nothing_is_stored_while_recording_is_switched_off(self):
        call = self._handled_call()
        self._as(self.agent)
        with override_settings(VOICE_CALL_RECORDING_ENABLED=False):
            self.assertEqual(self._upload(call).status_code, 409)
        call.refresh_from_db()
        self.assertFalse(call.recording)

    # ── Playback ────────────────────────────────────────────────────────────

    def test_the_agent_who_handled_the_call_can_play_it_back(self):
        call = self._handled_call()
        self._as(self.agent)
        self._upload(call)

        res = self._playback(call)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "audio/webm")
        self.assertEqual(res["Cache-Control"], "private, no-store")
        self.assertEqual(res["X-Content-Type-Options"], "nosniff")
        self.assertEqual(len(b"".join(res.streaming_content)), 2048)

    def test_a_staff_member_who_did_not_handle_the_call_cannot_play_it_back(self):
        call = self._handled_call()
        self._as(self.agent)
        self._upload(call)

        self._as(self.other_agent)
        # 404 rather than 403 — a recording someone may not hear should not
        # confirm that it exists.
        self.assertEqual(self._playback(call).status_code, 404)

    def test_a_superuser_can_play_back_any_call(self):
        call = self._handled_call(agent=self.other_agent)
        self._as(self.other_agent)
        self._upload(call)

        self._as(self.agent2)  # superuser, handled nothing
        self.assertEqual(self._playback(call).status_code, 200)

    def test_a_customer_cannot_reach_the_recording_endpoint_at_all(self):
        call = self._handled_call()
        self._as(self.agent)
        self._upload(call)

        self._as(self.player)
        self.assertIn(self._playback(call).status_code, (401, 403, 404))

    def test_a_call_with_no_recording_is_404_not_an_empty_body(self):
        call = self._handled_call()
        self._as(self.agent)
        self.assertEqual(self._playback(call).status_code, 404)

    # ── How it surfaces ─────────────────────────────────────────────────────

    def test_history_advertises_an_authorised_path_never_a_storage_url(self):
        call = self._handled_call()
        self._as(self.agent)
        self._upload(call)

        res = self.client.get("/api/admin-panel/live-chat/calls/")
        rows = res.data if isinstance(res.data, list) else res.data["results"]
        row = next(r for r in rows if r["id"] == call.pk)
        self.assertTrue(row["has_recording"])
        self.assertEqual(row["recording_bytes"], 2048)
        self.assertEqual(
            row["recording_url"],
            "/api/admin-panel/live-chat/calls/{}/recording/".format(call.pk),
        )
        # Never the raw file location, which is public on disk and replayable
        # on S3.
        self.assertNotIn("/media/", str(row["recording_url"]))
        self.assertNotIn("call-recordings/", str(row["recording_url"]))

    def test_a_call_without_a_recording_says_so(self):
        call = self._handled_call()
        self._as(self.agent)
        res = self.client.get("/api/live-chat/calls/{}/".format(call.pk))
        self.assertFalse(res.data["has_recording"])
        self.assertIsNone(res.data["recording_url"])

    def test_config_tells_both_browsers_whether_calls_are_recorded(self):
        """One flag drives the agent's recorder and the customer's notice, so a
        recording can never be made without the notice being shown."""
        self._as(self.player)
        self.assertTrue(
            self.client.get("/api/live-chat/calls/config/").data["recording_enabled"],
        )
        with override_settings(VOICE_CALL_RECORDING_ENABLED=False):
            self.assertFalse(
                self.client.get("/api/live-chat/calls/config/").data["recording_enabled"],
            )


# ── The Back Office recording switch ────────────────────────────────────────

@override_settings(LIVE_CHAT_REALTIME=True, VOICE_CALL_RECORDING_ENABLED=True)
class VoiceCallRecordingSwitchTests(VoiceCallTestBase):
    """One switch drives the recorder and the customer's notice, so these are
    really tests that the two can never be told different things."""

    ENDPOINT = "/api/admin-panel/voice-call-settings/"

    def setUp(self):
        super().setUp()
        # Deleting history and switching recording moved from super admin to
        # Customer Support Manager, so the privileged actor in these tests is a
        # manager now. Super admins are covered by their own denial tests.
        self.manager = User.objects.create_user(
            email="mgr-S@example.com", password="pw-Test-1", user_uid="TESTMGS",
            is_staff=True, name="Mia Manager",
        )
        AdminProfile.objects.update_or_create(
            user=self.manager, defaults={"role": "support_manager", "is_active": True},
        )
        VoiceCallSettings.objects.all().delete()
        self.plain_agent = User.objects.create_user(
            email="agent4@example.com", password="pw-Test-1", user_uid="TESTAGT4",
            is_staff=True, name="Sam Agent",
        )

    def test_recording_is_on_until_someone_turns_it_off(self):
        """Adding the switch must not change how a deployment already behaves."""
        self._as(self.manager)
        res = self.client.get(self.ENDPOINT)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["recording_enabled"])
        self.assertTrue(res.data["recording_effective"])
        self.assertTrue(voice_call_service.recording_enabled())

    def test_a_support_manager_can_switch_it_off_and_back_on(self):
        self._as(self.manager)
        res = self.client.patch(self.ENDPOINT, {"recording_enabled": False}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["recording_enabled"])
        self.assertFalse(voice_call_service.recording_enabled())

        res = self.client.patch(self.ENDPOINT, {"recording_enabled": True}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(voice_call_service.recording_enabled())

    def test_the_switch_records_who_moved_it(self):
        self._as(self.manager)
        self.client.patch(self.ENDPOINT, {"recording_enabled": False}, format="json")
        row = VoiceCallSettings.load()
        self.assertEqual(row.updated_by_id, self.manager.id)

    def test_an_ordinary_agent_may_look_but_not_touch(self):
        """An agent silently switching off the recording of their own calls —
        and with it the notice the customer sees — is the hole this switch is
        supposed to be, so writes are the operator's alone."""
        self._as(self.plain_agent)
        self.assertEqual(self.client.get(self.ENDPOINT).status_code, 200)

        res = self.client.patch(self.ENDPOINT, {"recording_enabled": False}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertTrue(voice_call_service.recording_enabled())

    def test_a_customer_cannot_reach_the_switch_at_all(self):
        self._as(self.player)
        self.assertIn(self.client.get(self.ENDPOINT).status_code, (401, 403))
        self.assertIn(
            self.client.patch(self.ENDPOINT, {"recording_enabled": False}, format="json").status_code,
            (401, 403),
        )

    def test_the_config_endpoint_follows_the_switch(self):
        """What the switch changes is what both browsers are told — the agent's
        recorder and the customer's notice come from this one answer."""
        self._as(self.manager)
        self.client.patch(self.ENDPOINT, {"recording_enabled": False}, format="json")

        self._as(self.player)
        self.assertFalse(self.client.get("/api/live-chat/calls/config/").data["recording_enabled"])

        self._as(self.manager)
        self.client.patch(self.ENDPOINT, {"recording_enabled": True}, format="json")
        self._as(self.player)
        self.assertTrue(self.client.get("/api/live-chat/calls/config/").data["recording_enabled"])

    @override_settings(VOICE_CALL_RECORDING_ENABLED=False)
    def test_the_environment_flag_outranks_the_button(self):
        """A deployment that must not record at all sets the env var, and no
        Back Office click can override it."""
        VoiceCallSettings.objects.update_or_create(pk=1, defaults={"recording_enabled": True})
        self.assertFalse(voice_call_service.recording_enabled())

        self._as(self.manager)
        res = self.client.get(self.ENDPOINT)
        self.assertFalse(res.data["recording_available"])
        self.assertFalse(res.data["recording_effective"])
        # The row still says what it says; the environment simply outranks it,
        # so the panel can show "on, but blocked here" rather than lying.
        self.assertTrue(res.data["recording_enabled"])

    def test_a_patch_without_the_field_is_refused_rather_than_guessed(self):
        self._as(self.manager)
        self.assertEqual(self.client.patch(self.ENDPOINT, {}, format="json").status_code, 400)

    def test_nothing_is_stored_while_the_switch_is_off(self):
        """The end-to-end consequence: switch off, and an upload is refused."""
        self._as(self.manager)
        self.client.patch(self.ENDPOINT, {"recording_enabled": False}, format="json")

        call = self._ringing()
        call = voice_call_service.accept_call(self.agent, call)
        call = voice_call_service.mark_connected(self.agent, call)
        call = voice_call_service.end_call(self.agent, call)

        self._as(self.manager)
        res = self.client.post(
            f"/api/admin-panel/live-chat/calls/{call.pk}/recording/",
            {"file": SimpleUploadedFile("blob", bytes([0x1a, 0x45, 0xdf, 0xa3]) + bytes(2044), "audio/webm")},
            format="multipart",
        )
        self.assertEqual(res.status_code, 409)
        call.refresh_from_db()
        self.assertFalse(call.recording)


# ── Failure diagnosis ───────────────────────────────────────────────────────

class VoiceCallFailureDiagnosisTests(VoiceCallTestBase):
    """A cross-network call that fails looks identical in history to any other
    failure unless the browser says what it managed to gather. These cover the
    detail surviving to the audit row, and not being trusted on the way."""

    def _failed_call(self, detail, reason="connection_failed"):
        call = self._ringing()
        self._as(self.player)
        self.client.post(
            "/api/live-chat/calls/{}/failed/".format(call.pk),
            {"reason": reason, "detail": detail},
            format="json",
        )
        call.refresh_from_db()
        return call

    def test_the_ice_summary_lands_on_the_audit_row(self):
        call = self._failed_call("ice:l=host+srflx,r=host,turn=0")
        self.assertEqual(call.status, STATUS_FAILED)
        self.assertEqual(call.end_reason, "connection_failed")

        event = CallEvent.objects.filter(call=call, event="failed").latest("id")
        self.assertIn("ice:l=host+srflx,r=host,turn=0", event.detail)
        # The category still reads exactly as before, so anything keying on
        # end_reason is unaffected by the extra context.
        self.assertIn("connection_failed", event.detail)

    def test_a_failure_without_a_summary_still_records_normally(self):
        call = self._failed_call("")
        self.assertEqual(call.status, STATUS_FAILED)
        event = CallEvent.objects.filter(call=call, event="failed").latest("id")
        self.assertIn("connection_failed", event.detail)

    def test_the_summary_is_filtered_not_trusted(self):
        """It is a string a browser controls, landing in a row a human reads."""
        call = self._failed_call("<script>alert(1)</script> ice:l=relay")
        event = CallEvent.objects.filter(call=call, event="failed").latest("id")
        # Note the server writes its own "ringing->failed:" prefix, so assert
        # against the injected markup itself rather than bare punctuation.
        self.assertNotIn("<script", event.detail)
        self.assertNotIn("</script", event.detail)
        self.assertNotIn("alert(1)", event.detail)
        # The useful part survives the filter.
        self.assertIn("ice:l=relay", event.detail)

    def test_an_overlong_summary_cannot_fill_the_detail_column(self):
        call = self._failed_call("ice:" + ("x" * 500))
        event = CallEvent.objects.filter(call=call, event="failed").latest("id")
        self.assertLessEqual(len(event.detail), 120)

    def test_the_reason_vocabulary_is_still_closed(self):
        """detail is free-ish text; reason is not. A browser must not be able
        to invent an end_reason by routing it through the new field."""
        call = self._failed_call("ice:l=host", reason="totally_made_up")
        self.assertEqual(call.end_reason, "connection_failed")


class VoiceCallIceServerTests(VoiceCallTestBase):
    def test_several_stun_servers_are_offered_by_default(self):
        """One STUN host is a single point of failure for learning your own
        public address — and a peer with no server-reflexive candidate cannot
        reach anyone outside its own LAN."""
        self._as(self.player)
        servers = self.client.get("/api/live-chat/calls/config/").data["ice_servers"]
        stun = [u for s in servers for u in s["urls"] if str(u).startswith("stun:")]
        self.assertGreater(len(stun), 1, "expected more than one STUN server")

    @override_settings(
        WEBRTC_TURN_URLS=["turn:turn.example.com:3478"],
        WEBRTC_TURN_STATIC_AUTH_SECRET="s3cret",
        WEBRTC_TURN_CREDENTIAL_TTL=600,
    )
    def test_turn_is_offered_with_a_time_limited_credential(self):
        """The relay is what makes a call work between two networks that have
        no direct path. Credentials are minted per request and expire."""
        self._as(self.player)
        servers = self.client.get("/api/live-chat/calls/config/").data["ice_servers"]
        turn = next(
            (s for s in servers if any(str(u).startswith("turn:") for u in s["urls"])),
            None,
        )
        self.assertIsNotNone(turn, "no TURN entry was served")
        self.assertTrue(turn["username"])
        self.assertTrue(turn["credential"])
        # coturn's use-auth-secret form: "<unix-expiry>:<label>".
        expiry = int(str(turn["username"]).split(":")[0])
        self.assertGreater(expiry, int(time.time()))
        # And never the secret itself.
        self.assertNotIn("s3cret", str(servers))


# ── Deleting call history ───────────────────────────────────────────────────

@override_settings(
    LIVE_CHAT_REALTIME=True,
    VOICE_CALL_RECORDING_ENABLED=True,
    MEDIA_ROOT=tempfile.mkdtemp(prefix="jw-media-del-"),
    VOICE_CALL_RECORDING_ROOT=tempfile.mkdtemp(prefix="jw-rec-del-"),
)
class VoiceCallDeleteTests(VoiceCallTestBase):
    """Deleting a call destroys the audit trail of what happened on it, so
    these are mostly tests about who may not do it, and about what must not be
    left behind."""

    def setUp(self):
        super().setUp()
        # Deleting history and switching recording moved from super admin to
        # Customer Support Manager, so the privileged actor in these tests is a
        # manager now. Super admins are covered by their own denial tests.
        self.manager = User.objects.create_user(
            email="mgr-D@example.com", password="pw-Test-1", user_uid="TESTMGD",
            is_staff=True, name="Mia Manager",
        )
        AdminProfile.objects.update_or_create(
            user=self.manager, defaults={"role": "support_manager", "is_active": True},
        )
        self.plain_agent = User.objects.create_user(
            email="agent5@example.com", password="pw-Test-1", user_uid="TESTAGT5",
            is_staff=True, name="Dana Agent",
        )
        self.addCleanup(shutil.rmtree, settings.VOICE_CALL_RECORDING_ROOT, True)
        self.addCleanup(shutil.rmtree, settings.MEDIA_ROOT, True)

    def _url(self, call):
        return "/api/admin-panel/live-chat/calls/{}/".format(call.pk)

    def _finished_call(self, agent=None):
        agent = agent or self.agent
        call = self._ringing()
        call = voice_call_service.accept_call(agent, call)
        call = voice_call_service.mark_connected(agent, call)
        return voice_call_service.end_call(agent, call)

    def test_a_support_manager_can_erase_a_call(self):
        call = self._finished_call()
        self._as(self.manager)
        res = self.client.delete(self._url(call))
        self.assertEqual(res.status_code, 200)
        self.assertFalse(CallSession.objects.filter(pk=call.pk).exists())

    def test_the_events_go_with_it(self):
        call = self._finished_call()
        self.assertTrue(CallEvent.objects.filter(call_id=call.pk).exists())
        self._as(self.manager)
        self.client.delete(self._url(call))
        self.assertFalse(CallEvent.objects.filter(call_id=call.pk).exists())

    def test_the_audio_is_deleted_too_not_orphaned_in_storage(self):
        """The one that is easy to get wrong: Django does not delete the file
        when the row goes, which would leave the customer's recorded voice in
        storage with nothing pointing at it."""
        call = self._finished_call()
        # Uploaded by the agent who actually handled the call - attach_recording
        # only accepts audio from that call's receiver. The manager deletes it
        # below; that is the part this test is about.
        self._as(self.agent)
        self.client.post(
            "/api/admin-panel/live-chat/calls/{}/recording/".format(call.pk),
            {"file": SimpleUploadedFile("blob", bytes([0x1A, 0x45, 0xDF, 0xA3]) + bytes(2044), "audio/webm")},
            format="multipart",
        )
        call.refresh_from_db()
        path = call.recording.path
        self.assertTrue(os.path.exists(path))

        self._as(self.manager)
        res = self.client.delete(self._url(call))
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["recording_deleted"])
        self.assertFalse(os.path.exists(path), "the recording was left behind in storage")

    def test_the_deletion_outlives_the_call_in_the_account_log(self):
        """CallEvent cascades, so without this row nothing would record that
        the call ever existed or that anyone removed it."""
        call = self._finished_call()
        self._as(self.manager)
        self.client.delete(self._url(call))
        entry = ActivityLog.objects.filter(action="call_history_deleted").last()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.actor_id, self.manager.id)
        self.assertEqual(entry.target_user_id, self.player.id)
        self.assertIn("#{}".format(call.pk), entry.description)

    def test_the_agent_who_handled_the_call_cannot_erase_it(self):
        """Handled by an ordinary agent on purpose: VoiceCallTestBase makes
        self.agent a superuser, so using it here would pass for the wrong
        reason — the property under test is that handling a call gives you no
        power to erase your own record of it."""
        call = self._finished_call(agent=self.plain_agent)
        self._as(self.plain_agent)
        self.assertEqual(self.client.delete(self._url(call)).status_code, 403)
        self.assertTrue(CallSession.objects.filter(pk=call.pk).exists())

    def test_an_ordinary_staff_member_cannot_erase_it(self):
        call = self._finished_call()
        self._as(self.plain_agent)
        self.assertEqual(self.client.delete(self._url(call)).status_code, 403)
        self.assertTrue(CallSession.objects.filter(pk=call.pk).exists())

    def test_the_customer_cannot_erase_their_own_call(self):
        call = self._finished_call()
        self._as(self.player)
        self.assertIn(self.client.delete(self._url(call)).status_code, (401, 403, 404))
        self.assertTrue(CallSession.objects.filter(pk=call.pk).exists())

    def test_a_live_call_is_refused_rather_than_pulled_out_from_under_it(self):
        call = self._ringing()
        self._as(self.manager)
        res = self.client.delete(self._url(call))
        self.assertEqual(res.status_code, 409)
        self.assertTrue(CallSession.objects.filter(pk=call.pk).exists())

    def test_deleting_something_that_is_not_there_is_a_404(self):
        self._as(self.manager)
        self.assertEqual(self.client.delete("/api/admin-panel/live-chat/calls/999999/").status_code, 404)


# ── Call routing: who rings ─────────────────────────────────────────────────

class SupportCallRoutingTests(VoiceCallTestBase):
    """Ringing used to key off is_staff alone, so a player calling support also
    rang finance, KYC officers and super admins. Eligibility is now the actual
    AdminProfile role."""

    def _staff(self, uid, role, is_active=True, superuser=False):
        user = User.objects.create_user(
            email=f"{uid.lower()}@example.com", password="pw-Test-1", user_uid=uid,
            is_staff=True, is_superuser=superuser,
        )
        AdminProfile.objects.update_or_create(
            user=user, defaults={"role": role, "is_active": is_active},
        )
        return user

    def test_support_facing_roles_receive_calls(self):
        # Distinct uid per role: "support" and "support_manager" share a prefix.
        for i, role in enumerate(("admin", "support", "support_manager")):
            with self.subTest(role=role):
                user = self._staff(f"ELIGIBL{i}", role)
                self.assertTrue(voice_call_service.is_call_eligible_agent(user))

    def test_unrelated_staff_roles_do_not_receive_calls(self):
        """The whole point: a player calling support must not ring accounting."""
        for i, role in enumerate(("finance", "kyc_officer")):
            with self.subTest(role=role):
                user = self._staff(f"INELIGB{i}", role)
                self.assertFalse(voice_call_service.is_call_eligible_agent(user))

    def test_a_super_admin_never_receives_support_calls(self):
        boss = self._staff("SUPERELG", "superadmin", superuser=True)
        self.assertFalse(voice_call_service.is_call_eligible_agent(boss))

    def test_a_deactivated_profile_stops_receiving_calls(self):
        user = self._staff("DEACTIV1", "support", is_active=False)
        self.assertFalse(voice_call_service.is_call_eligible_agent(user))

    def test_staff_with_no_profile_at_all_receives_nothing(self):
        """Fail closed rather than open."""
        naked = User.objects.create_user(
            email="naked@example.com", password="pw-Test-1", user_uid="NAKED001", is_staff=True,
        )
        self.assertFalse(voice_call_service.is_call_eligible_agent(naked))

    # ── Availability ────────────────────────────────────────────────────────

    def test_an_open_panel_counts_as_available(self):
        self.assertEqual(voice_call_service.available_agent_count(), 1)

    def test_two_tabs_are_still_one_agent(self):
        SupportAgentPresence.objects.create(
            user=self.duty_agent, channel_name="test-channel-duty-2",
        )
        self.assertEqual(voice_call_service.available_agent_count(), 1)

    def test_a_demoted_agent_stops_counting_even_with_the_socket_open(self):
        """Role is re-read at query time, so a demotion takes effect without
        anyone hunting down the open session."""
        AdminProfile.objects.filter(user=self.duty_agent).update(role="finance")
        self.assertEqual(voice_call_service.available_agent_count(), 0)

    def test_a_stale_presence_row_does_not_staff_the_desk_forever(self):
        SupportAgentPresence.objects.all().update(
            connected_at=timezone.now() - (PRESENCE_MAX_AGE + timedelta(minutes=5)),
        )
        self.assertEqual(voice_call_service.available_agent_count(), 0)

    # ── Nobody on duty ──────────────────────────────────────────────────────

    def test_calling_an_unstaffed_desk_is_refused_immediately(self):
        """Not left ringing for the full timeout - the player is told."""
        self._go_off_duty()
        ticket = self._ticket()
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.data["code"], "no_agents_available")
        self.assertIn("currently unavailable", res.data["error"])

    def test_a_call_to_an_unstaffed_desk_is_still_recorded_as_missed(self):
        """A manager needs to see that someone tried to reach an empty desk."""
        self._go_off_duty()
        ticket = self._ticket()
        self._as(self.player)
        self.client.post(f"/api/live-chat/{ticket.id}/calls/")

        call = CallSession.objects.get(ticket=ticket)
        self.assertEqual(call.status, STATUS_MISSED)
        self.assertEqual(call.end_reason, "no_agents")
        self.assertEqual(call.duration_seconds, 0)
        self.assertIsNone(call.receiver_id)
        # Released the ticket's active slot, so the player can try again.
        self.assertIsNone(call.active_key)

    def test_no_agents_is_distinguishable_from_nobody_picking_up(self):
        """Two different failures that must not look the same in history."""
        self._go_off_duty()
        ticket = self._ticket()
        self._as(self.player)
        self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        unstaffed = CallSession.objects.get(ticket=ticket)
        self.assertEqual(unstaffed.end_reason, "no_agents")

    def test_a_staffed_desk_still_rings_normally(self):
        ticket = self._ticket()
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["status"], STATUS_RINGING)

    def test_the_atomic_claim_still_prevents_a_second_acceptance(self):
        """Pre-existing behaviour, re-asserted because routing changed around it."""
        call = self._ringing()
        self._as(self.agent)
        first = self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/accept/")
        self.assertEqual(first.status_code, 200)

        self._as(self.agent2)
        second = self.client.post(f"/api/admin-panel/live-chat/calls/{call.id}/accept/")
        self.assertEqual(second.status_code, 409)
        call.refresh_from_db()
        self.assertEqual(call.receiver_id, self.agent.id)


# ── Manager-only management ─────────────────────────────────────────────────

class SupportManagerPermissionTests(VoiceCallTestBase):
    def setUp(self):
        super().setUp()
        self.manager = User.objects.create_user(
            email="manager@example.com", password="pw-Test-1", user_uid="TESTMGR1",
            is_staff=True, name="Mia Manager",
        )
        AdminProfile.objects.update_or_create(
            user=self.manager, defaults={"role": "support_manager", "is_active": True},
        )
        self.support = User.objects.create_user(
            email="support@example.com", password="pw-Test-1", user_uid="TESTSUP1",
            is_staff=True, name="Sid Support",
        )
        AdminProfile.objects.update_or_create(
            user=self.support, defaults={"role": "support", "is_active": True},
        )

    def _handled_call(self, agent=None):
        agent = agent or self.support
        call = self._ringing()
        call = voice_call_service.accept_call(agent, call)
        return voice_call_service.end_call(agent, call)

    # ── Deleting call history ───────────────────────────────────────────────

    def test_a_manager_can_delete_a_call(self):
        call = self._handled_call()
        self._as(self.manager)
        res = self.client.delete(f"/api/admin-panel/live-chat/calls/{call.pk}/")
        self.assertIn(res.status_code, (200, 204))
        self.assertFalse(CallSession.objects.filter(pk=call.pk).exists())

    def test_a_support_admin_cannot_delete_their_own_call(self):
        """The exact hole this restriction exists to close."""
        call = self._handled_call()
        self._as(self.support)
        res = self.client.delete(f"/api/admin-panel/live-chat/calls/{call.pk}/")
        self.assertEqual(res.status_code, 403)
        self.assertTrue(CallSession.objects.filter(pk=call.pk).exists())

    def test_a_super_admin_cannot_delete_through_the_admin_panel(self):
        call = self._handled_call()
        self._as(self.agent)  # is_superuser=True
        res = self.client.delete(f"/api/admin-panel/live-chat/calls/{call.pk}/")
        self.assertEqual(res.status_code, 403)
        self.assertTrue(CallSession.objects.filter(pk=call.pk).exists())

    def test_a_deactivated_manager_loses_deletion(self):
        AdminProfile.objects.filter(user=self.manager).update(is_active=False)
        call = self._handled_call()
        self._as(self.manager)
        res = self.client.delete(f"/api/admin-panel/live-chat/calls/{call.pk}/")
        self.assertEqual(res.status_code, 403)

    def test_the_service_refuses_too_not_just_the_route(self):
        """Belt and suspenders: the rule holds however delete_call is reached."""
        call = self._handled_call()
        with self.assertRaises(CallError):
            voice_call_service.delete_call(self.support, call)

    # ── Recording switch ────────────────────────────────────────────────────

    def test_a_manager_can_switch_recording_off_and_on(self):
        self._as(self.manager)
        off = self.client.patch(
            "/api/admin-panel/voice-call-settings/", {"recording_enabled": False}, format="json",
        )
        self.assertEqual(off.status_code, 200)
        self.assertFalse(voice_call_service.recording_enabled())

        on = self.client.patch(
            "/api/admin-panel/voice-call-settings/", {"recording_enabled": True}, format="json",
        )
        self.assertEqual(on.status_code, 200)
        self.assertTrue(voice_call_service.recording_enabled())

    def test_a_support_admin_cannot_switch_recording(self):
        self._as(self.support)
        res = self.client.patch(
            "/api/admin-panel/voice-call-settings/", {"recording_enabled": False}, format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.assertTrue(voice_call_service.recording_enabled())

    def test_a_super_admin_cannot_switch_recording_from_the_admin_panel(self):
        self._as(self.agent)
        res = self.client.patch(
            "/api/admin-panel/voice-call-settings/", {"recording_enabled": False}, format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_any_support_staff_may_read_the_recording_state(self):
        """Agents are told on their own call surfaces anyway; hiding it would
        be theatre."""
        self._as(self.support)
        res = self.client.get("/api/admin-panel/voice-call-settings/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("recording_enabled", res.data)

    def test_disabling_recording_does_not_delete_existing_recordings(self):
        call = self._handled_call()
        CallSession.objects.filter(pk=call.pk).update(recording_bytes=2048)
        self._as(self.manager)
        self.client.patch(
            "/api/admin-panel/voice-call-settings/", {"recording_enabled": False}, format="json",
        )
        call.refresh_from_db()
        self.assertEqual(call.recording_bytes, 2048)


# ── Admin Panel / Super Admin Portal separation ─────────────────────────────

class AdminPanelRoleSeparationTests(VoiceCallTestBase):
    """A Super Admin must never hold an Admin Panel session. Enforced at the
    token source, so every /api/admin-panel/ route is closed to them by
    construction rather than by hiding buttons."""

    def setUp(self):
        super().setUp()
        self.ordinary = User.objects.create_user(
            email="ordinary@example.com", password="pw-Test-1", user_uid="TESTORD1",
            is_staff=True, name="Ora Admin",
        )
        AdminProfile.objects.update_or_create(
            user=self.ordinary, defaults={"role": "admin", "is_active": True},
        )
        self.boss = User.objects.create_user(
            email="boss@example.com", password="pw-Test-1", user_uid="TESTBOSS",
            is_staff=True, is_superuser=True, name="Bo Boss",
        )

    def test_a_super_admin_is_refused_by_the_admin_panel_login(self):
        res = self.client.post(
            "/api/auth/admin-login/",
            {"email": "boss@example.com", "password": "pw-Test-1"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("Super Admin Portal", res.data["error"])

    def test_no_admin_token_is_minted_for_a_super_admin(self):
        """The refusal must happen before tokens exist, or the separation is
        cosmetic."""
        res = self.client.post(
            "/api/auth/admin-login/",
            {"email": "boss@example.com", "password": "pw-Test-1"},
            format="json",
        )
        self.assertNotIn("tokens", res.data)

    def test_an_ordinary_admin_can_still_log_in(self):
        res = self.client.post(
            "/api/auth/admin-login/",
            {"email": "ordinary@example.com", "password": "pw-Test-1"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("tokens", res.data)
        self.assertEqual(res.data["user"]["role"], "admin")

    def test_the_login_response_carries_the_role_for_ui_gating(self):
        User.objects.filter(pk=self.ordinary.pk).update(is_staff=True)
        AdminProfile.objects.filter(user=self.ordinary).update(role="support_manager")
        res = self.client.post(
            "/api/auth/admin-login/",
            {"email": "ordinary@example.com", "password": "pw-Test-1"},
            format="json",
        )
        self.assertEqual(res.data["user"]["role"], "support_manager")

    def test_a_non_staff_user_is_still_refused(self):
        res = self.client.post(
            "/api/auth/admin-login/",
            {"email": "caller@example.com", "password": "pw-Test-1"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)


# ── Callback: support calls the player ──────────────────────────────────────

class VoiceCallCallbackTests(VoiceCallTestBase):
    """A callback reuses the whole inbound machinery - same CallSession, same
    signaling groups, same engine. These pin the two things that genuinely
    differ: who may start one, and who may answer it."""

    CALLBACK = "/api/admin-panel/live-chat/{}/callback/"

    def setUp(self):
        super().setUp()
        self.support = User.objects.create_user(
            email="cbsupport@example.com", password="pw-Test-1", user_uid="TESTCBS1",
            is_staff=True, name="Cy Support",
        )
        AdminProfile.objects.update_or_create(
            user=self.support, defaults={"role": "support", "is_active": True},
        )
        self.finance = User.objects.create_user(
            email="cbfinance@example.com", password="pw-Test-1", user_uid="TESTCBF1",
            is_staff=True, name="Fin Ance",
        )
        AdminProfile.objects.update_or_create(
            user=self.finance, defaults={"role": "finance", "is_active": True},
        )

    # ── Who may place one ───────────────────────────────────────────────────

    def test_a_support_agent_can_call_a_player_back(self):
        ticket = self._ticket()
        self._as(self.support)
        res = self.client.post(self.CALLBACK.format(ticket.id))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["direction"], "outbound")
        self.assertEqual(res.data["status"], STATUS_RINGING)
        # Initiator and answerer, not customer and agent.
        self.assertEqual(res.data["caller_id"], self.support.id)
        self.assertEqual(res.data["receiver_id"], self.player.id)

    def test_the_receiver_is_known_immediately_unlike_an_inbound_call(self):
        """No desk-wide race to resolve: a callback has one possible answerer,
        which is also what lets the agent join the signaling group at once."""
        ticket = self._ticket()
        self._as(self.support)
        self.client.post(self.CALLBACK.format(ticket.id))
        call = CallSession.objects.get(ticket=ticket)
        self.assertEqual(call.receiver_id, self.player.id)

    def test_unrelated_staff_cannot_call_a_player(self):
        ticket = self._ticket()
        self._as(self.finance)
        res = self.client.post(self.CALLBACK.format(ticket.id))
        self.assertEqual(res.status_code, 403)
        self.assertFalse(CallSession.objects.filter(ticket=ticket).exists())

    def test_a_super_admin_cannot_call_a_player(self):
        ticket = self._ticket()
        self._as(self.agent)  # is_superuser
        res = self.client.post(self.CALLBACK.format(ticket.id))
        self.assertEqual(res.status_code, 403)

    def test_a_player_cannot_place_a_callback(self):
        ticket = self._ticket()
        self._as(self.player)
        res = self.client.post(self.CALLBACK.format(ticket.id))
        self.assertIn(res.status_code, (403, 404))

    def test_a_closed_conversation_cannot_be_called_back(self):
        ticket = self._ticket(status="resolved")
        self._as(self.support)
        res = self.client.post(self.CALLBACK.format(ticket.id))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "ticket_not_callable")

    # ── Duplicate guard ─────────────────────────────────────────────────────

    def test_a_second_callback_by_the_same_agent_rejoins_rather_than_erroring(self):
        ticket = self._ticket()
        self._as(self.support)
        first = self.client.post(self.CALLBACK.format(ticket.id))
        second = self.client.post(self.CALLBACK.format(ticket.id))
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(CallSession.objects.filter(ticket=ticket).count(), 1)

    def test_a_callback_is_refused_while_the_player_is_already_on_a_call(self):
        ticket = self._ticket()
        self._ringing(ticket=ticket)          # inbound call in progress
        self._as(self.support)
        res = self.client.post(self.CALLBACK.format(ticket.id))
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "call_in_progress")

    # ── Who may answer ──────────────────────────────────────────────────────

    def _ringing_callback(self):
        ticket = self._ticket()
        self._as(self.support)
        res = self.client.post(self.CALLBACK.format(ticket.id))
        return CallSession.objects.get(pk=res.data["id"])

    def test_the_player_can_answer_their_callback(self):
        call = self._ringing_callback()
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/calls/{call.pk}/accept/")
        self.assertEqual(res.status_code, 200)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_ACCEPTED)

    def test_another_player_cannot_answer_someone_elses_callback(self):
        call = self._ringing_callback()
        self._as(self.other_player)
        res = self.client.post(f"/api/live-chat/calls/{call.pk}/accept/")
        self.assertEqual(res.status_code, 404)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_RINGING)

    def test_answering_twice_is_refused(self):
        """Two taps on the same phone are a race too."""
        call = self._ringing_callback()
        self._as(self.player)
        self.client.post(f"/api/live-chat/calls/{call.pk}/accept/")
        second = self.client.post(f"/api/live-chat/calls/{call.pk}/accept/")
        self.assertEqual(second.status_code, 409)

    def test_the_player_accept_route_refuses_an_inbound_call(self):
        """The two accept paths answer different questions and must not be
        interchangeable."""
        call = self._ringing()          # inbound
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/calls/{call.pk}/accept/")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "not_a_callback")

    def test_a_lapsed_callback_is_missed_not_answerable(self):
        call = self._ringing_callback()
        CallSession.objects.filter(pk=call.pk).update(
            ring_expires_at=timezone.now() - timedelta(seconds=1),
        )
        self._as(self.player)
        res = self.client.post(f"/api/live-chat/calls/{call.pk}/accept/")
        self.assertEqual(res.status_code, 409)
        call.refresh_from_db()
        self.assertEqual(call.status, STATUS_MISSED)

    # ── History ─────────────────────────────────────────────────────────────

    def test_an_inbound_call_is_still_recorded_as_inbound(self):
        """The new column must not change what existing calls mean."""
        call = self._ringing()
        self.assertEqual(call.direction, "inbound")

    def test_a_callback_appears_in_the_agents_history(self):
        call = self._ringing_callback()
        self._as(self.support)
        res = self.client.get("/api/admin-panel/live-chat/calls/")
        rows = res.data if isinstance(res.data, list) else res.data["results"]
        row = next(r for r in rows if r["id"] == call.pk)
        self.assertEqual(row["direction"], "outbound")

    def test_a_callback_does_not_need_an_agent_to_be_on_duty(self):
        """The unstaffed-desk guard is about inbound calls. An agent placing a
        callback is, by definition, present."""
        self._go_off_duty()
        ticket = self._ticket()
        self._as(self.support)
        res = self.client.post(self.CALLBACK.format(ticket.id))
        self.assertEqual(res.status_code, 201)


# ── Concurrent calls and the queue ──────────────────────────────────────────

class VoiceCallQueueTests(VoiceCallTestBase):
    """Several players calling at once used to mean all but the first were
    dropped: the ring is one broadcast, and every agent's browser discarded
    anything arriving while a card was already up. These pin the server half of
    the fix - who counts as free, who is ahead of whom, and re-offering."""

    def _agent(self, uid, role="support"):
        user = User.objects.create_user(
            email=f"{uid.lower()}@example.com", password="pw-Test-1", user_uid=uid,
            is_staff=True,
        )
        AdminProfile.objects.update_or_create(
            user=user, defaults={"role": role, "is_active": True},
        )
        SupportAgentPresence.objects.create(user=user, channel_name=f"chan-{uid}")
        return user

    # ── Who can actually pick up ────────────────────────────────────────────

    def test_an_idle_agent_is_free(self):
        self._go_off_duty()
        self._agent("QFREE001")
        self.assertEqual(voice_call_service.free_agent_count(), 1)

    def test_an_agent_on_a_call_is_not_free(self):
        """available_agent_count asks 'is the desk staffed'; free_agent_count
        asks 'can anyone pick up right now'. They differ exactly here."""
        self._go_off_duty()
        agent = self._agent("QBUSY001")
        call = self._ringing()
        voice_call_service.accept_call(agent, call)

        self.assertEqual(voice_call_service.available_agent_count(), 1)
        self.assertEqual(voice_call_service.free_agent_count(), 0)

    def test_finishing_a_call_makes_the_agent_free_again(self):
        self._go_off_duty()
        agent = self._agent("QFREED01")
        call = voice_call_service.accept_call(agent, self._ringing())
        self.assertEqual(voice_call_service.free_agent_count(), 0)

        voice_call_service.end_call(agent, call)
        self.assertEqual(voice_call_service.free_agent_count(), 1)

    def test_busy_is_derived_not_stored(self):
        """No second copy of the truth: an agent whose socket dies mid-call is
        still busy, and one whose call ended is free, without any cleanup."""
        self._go_off_duty()
        agent = self._agent("QDERIV01")
        voice_call_service.accept_call(agent, self._ringing())
        self.assertIn(agent.id, voice_call_service.busy_agent_ids())

    # ── Queue position ──────────────────────────────────────────────────────

    def test_the_first_caller_has_nobody_ahead(self):
        call = self._ringing()
        self.assertEqual(voice_call_service.queue_position(call), 0)

    def test_later_callers_are_behind_earlier_ones(self):
        first = self._ringing(ticket=self._ticket())
        second = self._ringing(ticket=self._ticket(user=self.other_player))
        self.assertEqual(voice_call_service.queue_position(first), 0)
        self.assertEqual(voice_call_service.queue_position(second), 1)

    def test_a_claimed_call_stops_counting_against_the_queue(self):
        first = self._ringing(ticket=self._ticket())
        second = self._ringing(ticket=self._ticket(user=self.other_player))
        voice_call_service.accept_call(self.agent, first)
        # The one ahead is answered, so the waiting caller moves up.
        self.assertEqual(voice_call_service.queue_position(second), 0)

    # ── What the caller is told ─────────────────────────────────────────────

    def test_a_caller_with_a_free_agent_is_not_told_they_are_queued(self):
        call = self._ringing()
        self.assertFalse(voice_call_service.call_payload(call)["queued"])

    def test_a_caller_with_every_agent_busy_is_told_they_are_waiting(self):
        """The case the whole queue exists for - and the one that previously
        rang out silently."""
        self._go_off_duty()
        agent = self._agent("QWAIT001")
        voice_call_service.accept_call(agent, self._ringing(ticket=self._ticket()))

        waiting = self._ringing(ticket=self._ticket(user=self.other_player))
        payload = voice_call_service.call_payload(waiting)
        self.assertTrue(payload["queued"])
        self.assertEqual(payload["status"], STATUS_RINGING)

    def test_a_queued_caller_gets_the_longer_window_not_the_ring_window(self):
        """30s is right for 'is anyone picking up' and far too short for
        'wait your turn'."""
        self._go_off_duty()
        agent = self._agent("QWINDOW1")
        voice_call_service.accept_call(agent, self._ringing(ticket=self._ticket()))

        queued = self._ringing(ticket=self._ticket(user=self.other_player))
        window = (queued.ring_expires_at - queued.started_at).total_seconds()
        self.assertGreater(window, settings.VOICE_CALL_RING_TIMEOUT_SECONDS + 5)

    # ── Re-offering ─────────────────────────────────────────────────────────

    def test_waiting_calls_are_re_offered(self):
        """The original ring is one broadcast; a browser busy at that instant
        discards it. Without a re-offer the call is never seen again."""
        first = self._ringing(ticket=self._ticket())
        second = self._ringing(ticket=self._ticket(user=self.other_player))
        offered = voice_call_service.offer_waiting_calls()
        self.assertEqual(offered, 2)
        for c in (first, second):
            c.refresh_from_db()
            self.assertEqual(c.status, STATUS_RINGING)

    def test_an_answered_call_is_not_re_offered(self):
        call = self._ringing()
        voice_call_service.accept_call(self.agent, call)
        self.assertEqual(voice_call_service.offer_waiting_calls(), 0)

    def test_ending_a_call_drains_the_queue(self):
        """An agent going free is what should pull the next caller through."""
        self._go_off_duty()
        agent = self._agent("QDRAIN01")
        held = voice_call_service.accept_call(agent, self._ringing(ticket=self._ticket()))
        waiting = self._ringing(ticket=self._ticket(user=self.other_player))

        voice_call_service.end_call(agent, held)
        waiting.refresh_from_db()
        # Still ringing and still unclaimed - now with a free agent to take it.
        self.assertEqual(waiting.status, STATUS_RINGING)
        self.assertIsNone(waiting.receiver_id)
        self.assertEqual(voice_call_service.free_agent_count(), 1)

    # ── The headline case ───────────────────────────────────────────────────

    def test_three_simultaneous_calls_reach_three_different_agents(self):
        """Player A -> admin 1, player B -> admin 2, player C -> admin 3."""
        self._go_off_duty()
        a1 = self._agent("QDIST001")
        a2 = self._agent("QDIST002")
        a3 = self._agent("QDIST003")

        players = [self.player, self.other_player,
                   User.objects.create_user(email="third@example.com",
                                            password="pw-Test-1", user_uid="QTHIRD01")]
        calls = [self._ringing(ticket=self._ticket(user=p)) for p in players]

        for agent, call in zip((a1, a2, a3), calls):
            voice_call_service.accept_call(agent, call)

        for agent, call in zip((a1, a2, a3), calls):
            call.refresh_from_db()
            self.assertEqual(call.receiver_id, agent.id)
            self.assertEqual(call.status, STATUS_ACCEPTED)
        # Everyone is now busy, so a fourth caller would be told they are
        # waiting rather than ringing into nothing.
        self.assertEqual(voice_call_service.free_agent_count(), 0)

    def test_two_agents_cannot_take_the_same_call(self):
        """The queue changes who is offered what; it must not weaken the claim."""
        self._go_off_duty()
        a1 = self._agent("QRACE001")
        a2 = self._agent("QRACE002")
        call = self._ringing()

        voice_call_service.accept_call(a1, call)
        with self.assertRaises(CallError):
            voice_call_service.accept_call(a2, call)
        call.refresh_from_db()
        self.assertEqual(call.receiver_id, a1.id)
