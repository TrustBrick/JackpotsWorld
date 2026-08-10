"""Regression tests for the Live Support Chat delivery path.

These cover the specific reasons a message used to be invisible to the other
side until the page was reloaded. They exercise the REST path only, which is
deliberate: REST is the transport that must work on every deployment
(including the WSGI-only cPanel host that never serves /ws/), and the
WebSocket consumers are receive-only decorations on top of it.
"""
from itertools import count
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from authapp.models.support_ticket_models import ChatMessage, SupportTicket

User = get_user_model()


class LiveChatDeliveryTests(APITestCase):
    def setUp(self):
        # Creating a User fires a post_save signal that provisions four
        # WalletAccount rows, whose unique account numbers come from a
        # timestamp with millisecond resolution. Tests create users faster
        # than that resolution, so the generator is stubbed with a counter
        # here purely to keep these cases independent of it.
        counter = count()
        patcher = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"TEST{wtype}{next(counter):06d}",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.player = User.objects.create_user(
            email="player@example.com", password="pw-Test-1", user_uid="TESTPLR1",
        )
        self.agent = User.objects.create_user(
            email="agent@example.com", password="pw-Test-1", user_uid="TESTAGT1",
            is_staff=True, is_superuser=True,
        )

    def _as(self, user):
        self.client.force_authenticate(user=user)

    def _start_session(self):
        self._as(self.player)
        res = self.client.post("/api/live-chat/start/")
        self.assertEqual(res.status_code, 200)
        return res

    # ── The reported bug ────────────────────────────────────────────────────
    def test_admin_reply_is_visible_to_player_without_reloading_history(self):
        """Agent -> player. The player's poll must surface the reply."""
        ticket_id = self._start_session().data["session"]["id"]

        self._as(self.agent)
        sent = self.client.post(
            f"/api/admin-panel/live-chat/{ticket_id}/messages/",
            {"message": "Hello from support"}, format="json",
        )
        self.assertEqual(sent.status_code, 201)

        self._as(self.player)
        res = self.client.get(f"/api/live-chat/{ticket_id}/messages/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([m["message"] for m in res.data], ["Hello from support"])

    def test_player_message_is_visible_to_admin(self):
        """Player -> agent, the same trip in reverse."""
        ticket_id = self._start_session().data["session"]["id"]

        self._as(self.player)
        self.client.post(
            f"/api/live-chat/{ticket_id}/messages/",
            {"message": "I need help"}, format="json",
        )

        self._as(self.agent)
        res = self.client.get(f"/api/admin-panel/live-chat/{ticket_id}/messages/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([m["message"] for m in res.data], ["I need help"])

    # ── Pagination ──────────────────────────────────────────────────────────
    def test_message_list_is_a_bare_array_not_a_paginated_envelope(self):
        """The clients index the response directly; an envelope crashed the
        player's widget with `liveMessages.map is not a function`."""
        ticket_id = self._start_session().data["session"]["id"]
        res = self.client.get(f"/api/live-chat/{ticket_id}/messages/")
        self.assertIsInstance(res.data, list)
        self.assertNotIn("results", res.data if isinstance(res.data, dict) else {})

    def test_transcript_is_not_truncated_at_the_page_size(self):
        """PAGE_SIZE is 20 globally; a chat longer than that must still
        return in full, or messages 21+ can never be delivered."""
        ticket_id = self._start_session().data["session"]["id"]
        ticket = SupportTicket.objects.get(pk=ticket_id)
        for i in range(25):
            ChatMessage.objects.create(ticket=ticket, sender_type="admin", message=f"m{i}")

        self._as(self.player)
        res = self.client.get(f"/api/live-chat/{ticket_id}/messages/")
        self.assertEqual(len(res.data), 25)

        self._as(self.agent)
        res = self.client.get(f"/api/admin-panel/live-chat/{ticket_id}/messages/")
        self.assertEqual(len(res.data), 25)

    # ── Incremental polling ─────────────────────────────────────────────────
    def test_after_id_returns_only_newer_messages(self):
        ticket_id = self._start_session().data["session"]["id"]
        ticket = SupportTicket.objects.get(pk=ticket_id)
        first = ChatMessage.objects.create(ticket=ticket, sender_type="admin", message="one")
        ChatMessage.objects.create(ticket=ticket, sender_type="admin", message="two")

        self._as(self.player)
        res = self.client.get(f"/api/live-chat/{ticket_id}/messages/?after_id={first.id}")
        self.assertEqual([m["message"] for m in res.data], ["two"])

    def test_after_id_at_head_returns_empty(self):
        """The steady-state poll: nothing new, so nothing transferred."""
        ticket_id = self._start_session().data["session"]["id"]
        ticket = SupportTicket.objects.get(pk=ticket_id)
        last = ChatMessage.objects.create(ticket=ticket, sender_type="admin", message="one")

        self._as(self.player)
        res = self.client.get(f"/api/live-chat/{ticket_id}/messages/?after_id={last.id}")
        self.assertEqual(list(res.data), [])

    def test_malformed_after_id_degrades_to_full_fetch(self):
        ticket_id = self._start_session().data["session"]["id"]
        ticket = SupportTicket.objects.get(pk=ticket_id)
        ChatMessage.objects.create(ticket=ticket, sender_type="admin", message="one")

        self._as(self.player)
        res = self.client.get(f"/api/live-chat/{ticket_id}/messages/?after_id=abc")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    # ── Transport capability handshake ──────────────────────────────────────
    def test_config_endpoint_reports_transport_capability(self):
        self._as(self.player)
        res = self.client.get("/api/live-chat/config/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("realtime", res.data)
        self.assertIn("poll_interval_ms", res.data)

    def test_start_payload_carries_the_same_capability_flags(self):
        res = self._start_session()
        self.assertIn("realtime", res.data)
        self.assertIn("poll_interval_ms", res.data)

    # ── Access control still holds ──────────────────────────────────────────
    def test_player_cannot_read_another_players_session(self):
        ticket_id = self._start_session().data["session"]["id"]
        intruder = User.objects.create_user(
            email="nosy@example.com", password="pw-Test-1", user_uid="TESTNOSY",
        )

        self._as(intruder)
        res = self.client.get(f"/api/live-chat/{ticket_id}/messages/")
        self.assertEqual(res.status_code, 404)

    def test_player_cannot_use_the_admin_endpoint(self):
        ticket_id = self._start_session().data["session"]["id"]
        self._as(self.player)
        res = self.client.get(f"/api/admin-panel/live-chat/{ticket_id}/messages/")
        self.assertIn(res.status_code, (401, 403))
