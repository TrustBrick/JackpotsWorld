"""VOICE-CALL: WebSocket signaling tests.

These drive the real consumers through Channels' WebsocketCommunicator, which
is the only way to prove the parts the REST tests cannot reach: that a browser
can actually get a frame *into* a consumer, that the consumer relays it to the
other endpoint and nobody else, and that chat traffic on the same socket is
unaffected by any of it.

TransactionTestCase rather than TestCase because the consumers reach the
database from a worker thread (database_sync_to_async), which cannot see rows
created inside another thread's uncommitted atomic block.

The channel layer is forced to InMemory here. That is correct for a test —
everything runs in one process, so the layer really is shared — and is exactly
the configuration settings.py refuses to allow in production, where gunicorn
and daphne are separate processes. The cross-process requirement is covered by
LIVE_CHAT_REALTIME, tested in tests_voice_call.py.
"""
from itertools import count
from unittest.mock import patch

from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from rest_framework_simplejwt.tokens import AccessToken

from authapp.models.support_ticket_models import SupportTicket
from authapp.models.call_models import SupportAgentPresence
from authapp.models.user_model import AdminProfile
from authapp.routing import websocket_urlpatterns
from authapp.services import voice_call_service

from channels.routing import URLRouter

User = get_user_model()

APPLICATION = URLRouter(websocket_urlpatterns)

IN_MEMORY_LAYER = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


@override_settings(CHANNEL_LAYERS=IN_MEMORY_LAYER, LIVE_CHAT_REALTIME=True)
class VoiceCallWebSocketTests(TransactionTestCase):
    # The suite creates users directly; keep the wallet-account generator
    # deterministic for the same reason the other suites do.
    def setUp(self):
        counter = count()
        patcher = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"WS{wtype}{next(counter):06d}",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.player = User.objects.create_user(
            email="ws-caller@example.com", password="pw-Test-1", user_uid="WSCALL01", name="Ada",
        )
        self.other = User.objects.create_user(
            email="ws-other@example.com", password="pw-Test-1", user_uid="WSOTHR01",
        )
        # An ordinary support agent, not a super admin. Ringing is now routed
        # by AdminProfile role: super admins are deliberately excluded (they
        # hold no Admin Panel session at all), so a superuser here would no
        # longer join the ring group and these tests would be asserting against
        # a user the feature is designed to skip.
        self.agent = User.objects.create_user(
            email="ws-agent@example.com", password="pw-Test-1", user_uid="WSAGNT01",
            is_staff=True, name="Sam",
        )
        AdminProfile.objects.update_or_create(
            user=self.agent, defaults={"role": "support", "is_active": True},
        )
        # On duty. initiate_call now refuses an unstaffed desk, and most tests
        # here start a call without opening an inbox socket first - the ones
        # that do open one get a second row from the consumer itself, which is
        # the real code path and exactly what should happen.
        SupportAgentPresence.objects.create(
            user=self.agent, channel_name="ws-test-presence",
        )
        self.ticket = SupportTicket.objects.create(
            user=self.player, subject="Live Chat Session", message="(live chat session)",
            is_live_chat=True, status="open",
        )

    def _token(self, user):
        return str(AccessToken.for_user(user))

    async def _connect(self, path, user):
        comm = WebsocketCommunicator(APPLICATION, f"{path}?token={self._token(user)}")
        connected, _ = await comm.connect()
        return comm, connected

    async def _session_socket(self, user, ticket_id=None):
        return await self._connect(f"/ws/live-chat/{ticket_id or self.ticket.id}/", user)

    async def _inbox_socket(self, user):
        return await self._connect("/ws/live-chat/admin/inbox/", user)

    # ── Connection ──────────────────────────────────────────────────────────

    async def test_session_socket_rejects_a_missing_token(self):
        comm = WebsocketCommunicator(APPLICATION, f"/ws/live-chat/{self.ticket.id}/")
        connected, code = await comm.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4001)
        await comm.disconnect()

    async def test_inbox_socket_rejects_a_non_staff_user(self):
        comm, connected = await self._inbox_socket(self.player)
        self.assertFalse(connected)
        await comm.disconnect()

    # ── Ringing ─────────────────────────────────────────────────────────────

    async def test_agent_inbox_receives_the_incoming_call(self):
        agent_comm, connected = await self._inbox_socket(self.agent)
        self.assertTrue(connected)

        call = await self._initiate()

        event = await agent_comm.receive_json_from(timeout=3)
        self.assertEqual(event["event"], "call_incoming")
        self.assertEqual(event["data"]["call"]["id"], call.id)
        self.assertEqual(event["data"]["call"]["caller_uid"], "WSCALL01")
        self.assertEqual(event["data"]["call"]["ticket_id"], self.ticket.id)
        # The ring notification is metadata only — no SDP, no ICE.
        self.assertNotIn("sdp", str(event))
        await agent_comm.disconnect()

    async def test_customer_session_socket_receives_call_state(self):
        cust_comm, connected = await self._session_socket(self.player)
        self.assertTrue(connected)
        call = await self._initiate()
        event = await cust_comm.receive_json_from(timeout=3)
        self.assertEqual(event["event"], "call_state")
        self.assertEqual(event["data"]["call"]["id"], call.id)
        await cust_comm.disconnect()

    # ── Signaling relay ─────────────────────────────────────────────────────

    async def test_offer_reaches_the_other_endpoint_and_not_the_sender(self):
        call = await self._initiate()
        await self._accept(call)

        cust_comm, _ = await self._session_socket(self.player)
        agent_comm, _ = await self._inbox_socket(self.agent)

        await cust_comm.send_json_to({"action": "call.subscribe", "call_id": call.id})
        self.assertEqual((await cust_comm.receive_json_from(timeout=3))["event"], "call_subscribed")
        await agent_comm.send_json_to({"action": "call.subscribe", "call_id": call.id})
        self.assertEqual((await agent_comm.receive_json_from(timeout=3))["event"], "call_subscribed")

        await cust_comm.send_json_to({
            "action": "call.offer", "call_id": call.id,
            "data": {"type": "offer", "sdp": "v=0 fake"},
        })

        received = await agent_comm.receive_json_from(timeout=3)
        self.assertEqual(received["event"], "call_signal")
        self.assertEqual(received["data"]["signal"], "offer")
        self.assertEqual(received["data"]["data"]["sdp"], "v=0 fake")
        self.assertEqual(received["data"]["from_user_id"], self.player.id)

        # The sender must not receive its own offer back.
        self.assertTrue(await cust_comm.receive_nothing(timeout=0.6))

        await cust_comm.disconnect()
        await agent_comm.disconnect()

    async def test_a_third_party_cannot_subscribe_to_someone_elses_call(self):
        call = await self._initiate()
        await self._accept(call)

        # The unrelated customer connects to their *own* session socket, then
        # names someone else's call id. The server refuses on identity, not on
        # which socket the frame arrived over.
        other_ticket = await self._make_other_ticket()
        comm, connected = await self._session_socket(self.other, other_ticket.id)
        self.assertTrue(connected)

        await comm.send_json_to({"action": "call.subscribe", "call_id": call.id})
        denied = await comm.receive_json_from(timeout=3)
        self.assertEqual(denied["event"], "call_subscribe_denied")
        await comm.disconnect()

    async def test_a_third_party_offer_is_dropped_not_relayed(self):
        call = await self._initiate()
        await self._accept(call)

        agent_comm, _ = await self._inbox_socket(self.agent)
        await agent_comm.send_json_to({"action": "call.subscribe", "call_id": call.id})
        await agent_comm.receive_json_from(timeout=3)  # call_subscribed

        other_ticket = await self._make_other_ticket()
        intruder, _ = await self._session_socket(self.other, other_ticket.id)
        await intruder.send_json_to({
            "action": "call.offer", "call_id": call.id,
            "data": {"type": "offer", "sdp": "malicious"},
        })

        # Nothing reaches the legitimate participant.
        self.assertTrue(await agent_comm.receive_nothing(timeout=0.8))
        await intruder.disconnect()
        await agent_comm.disconnect()

    async def test_signaling_after_hangup_is_dropped(self):
        """Replay guard, end to end."""
        call = await self._initiate()
        await self._accept(call)

        cust_comm, _ = await self._session_socket(self.player)
        agent_comm, _ = await self._inbox_socket(self.agent)
        await cust_comm.send_json_to({"action": "call.subscribe", "call_id": call.id})
        await cust_comm.receive_json_from(timeout=3)
        await agent_comm.send_json_to({"action": "call.subscribe", "call_id": call.id})
        await agent_comm.receive_json_from(timeout=3)

        await self._end(call)
        # Drain the resulting call_state pushes.
        while not await agent_comm.receive_nothing(timeout=0.5):
            await agent_comm.receive_json_from(timeout=1)

        await cust_comm.send_json_to({
            "action": "call.offer", "call_id": call.id,
            "data": {"type": "offer", "sdp": "late"},
        })
        self.assertTrue(await agent_comm.receive_nothing(timeout=0.8))

        await cust_comm.disconnect()
        await agent_comm.disconnect()

    async def test_malformed_frames_do_not_close_the_socket(self):
        """Chat must survive whatever a client puts on this socket."""
        comm, _ = await self._session_socket(self.player)
        for frame in (
            {"action": "call.subscribe"},                     # no call_id
            {"action": "call.subscribe", "call_id": "abc"},    # non-numeric
            {"action": "call.offer", "call_id": None},
            {"action": "totally.unknown"},
            {"no_action": True},
        ):
            await comm.send_json_to(frame)

        # Still alive: a real call still rings through on this same socket.
        call = await self._initiate()
        event = await comm.receive_json_from(timeout=3)
        self.assertEqual(event["event"], "call_state")
        self.assertEqual(event["data"]["call"]["id"], call.id)
        await comm.disconnect()

    async def test_chat_push_still_works_on_a_socket_used_for_signaling(self):
        """The regression that matters most: adding signaling must not break
        message delivery on the same connection."""
        from authapp.services import live_chat_service

        call = await self._initiate()
        comm, _ = await self._session_socket(self.player)
        await comm.send_json_to({"action": "call.subscribe", "call_id": call.id})
        await comm.receive_json_from(timeout=3)  # call_subscribed

        await self._post_admin_message("hello from the agent")

        # Walk past any call frames to find the chat message.
        seen = []
        for _ in range(5):
            evt = await comm.receive_json_from(timeout=3)
            seen.append(evt["event"])
            if evt["event"] == "new_message":
                self.assertEqual(evt["data"]["message"], "hello from the agent")
                break
        else:
            self.fail(f"chat message never arrived; saw {seen}")
        await comm.disconnect()

    # ── DB helpers (sync work, off the event loop) ───────────────────────────

    async def _initiate(self):
        from channels.db import database_sync_to_async

        @database_sync_to_async
        def go():
            call, _ = voice_call_service.initiate_call(self.player, self.ticket)
            return call
        return await go()

    async def _accept(self, call):
        from channels.db import database_sync_to_async

        @database_sync_to_async
        def go():
            call.refresh_from_db()
            return voice_call_service.accept_call(self.agent, call)
        return await go()

    async def _end(self, call):
        from channels.db import database_sync_to_async

        @database_sync_to_async
        def go():
            call.refresh_from_db()
            return voice_call_service.end_call(self.player, call)
        return await go()

    async def _make_other_ticket(self):
        from channels.db import database_sync_to_async

        @database_sync_to_async
        def go():
            return SupportTicket.objects.create(
                user=self.other, subject="Live Chat Session",
                message="(live chat session)", is_live_chat=True, status="open",
            )
        return await go()

    async def _post_admin_message(self, text):
        from channels.db import database_sync_to_async
        from authapp.services import live_chat_service

        @database_sync_to_async
        def go():
            return live_chat_service.post_message(self.ticket, "admin", self.agent, text)
        return await go()

    # ── Regression: the contract the multi-agent UI depends on ──────────────

    async def test_other_agents_are_told_when_a_call_is_claimed(self):
        """A call rings to every on-duty agent via `livechat_admins`, so the
        accept must be broadcast to that same group — that push is the only
        thing that tells the agents who did *not* answer to take their
        incoming-call card down.

        Without it their card stays up with the ringtone looping for the whole
        call, and pressing Accept just returns 409. That was a real bug in the
        agent UI; this pins the server side of the fix.
        """
        agent_b, _ = await self._inbox_socket(self.agent)
        call = await self._initiate()

        ring = await agent_b.receive_json_from(timeout=3)
        self.assertEqual(ring["event"], "call_incoming")

        await self._accept(call)

        claimed = await agent_b.receive_json_from(timeout=3)
        self.assertEqual(claimed["event"], "call_state")
        self.assertEqual(claimed["data"]["call"]["id"], call.id)
        # Not "ringing" any more — that is precisely what the other agents'
        # clients key off to dismiss.
        self.assertNotEqual(claimed["data"]["call"]["status"], "ringing")
        self.assertEqual(claimed["data"]["call"]["receiver_id"], self.agent.id)
        await agent_b.disconnect()

    async def test_unclaimed_agent_cannot_subscribe_over_the_admin_socket(self):
        """Same rule as the service-level check, exercised over the real
        agent transport: seeing a ringing call does not grant signaling."""
        call = await self._initiate()
        comm, connected = await self._inbox_socket(self.agent)
        self.assertTrue(connected)

        # Ringing, not yet accepted by this agent.
        await comm.send_json_to({"action": "call.subscribe", "call_id": call.id})

        # The ring notification may arrive first; the denial is what matters.
        events = []
        for _ in range(3):
            if await comm.receive_nothing(timeout=0.6):
                break
            events.append((await comm.receive_json_from(timeout=1))["event"])
        self.assertIn("call_subscribe_denied", events)
        await comm.disconnect()

    async def test_subscribe_to_a_nonexistent_call_is_denied(self):
        comm, _ = await self._inbox_socket(self.agent)
        await comm.send_json_to({"action": "call.subscribe", "call_id": 987654})
        denied = await comm.receive_json_from(timeout=3)
        self.assertEqual(denied["event"], "call_subscribe_denied")
        await comm.disconnect()
