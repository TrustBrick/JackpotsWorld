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

from authapp.models.affiliate_models import AffiliateProfile
from authapp.models.support_ticket_models import ChatMessage, SupportTicket
from authapp.models.support_script_models import SupportScript

User = get_user_model()


def silence_opening_greeting():
    """Stop the scripted greeting posting into these tests' threads.

    Opening a live-chat session posts the Section 5 greeting as the first admin
    message (see live_chat_service._post_opening_greeting). That is intended
    behaviour and has its own test below, but it is a *system* message, and
    every test in this module asserts on the exact messages the participants
    exchanged -- transcripts, counts, idempotency of a retried send. Leaving it
    in would mean rewriting each of those assertions to say "and also the
    greeting", which tests the greeting nine times over and obscures what each
    case is actually about.

    Clearing the flag rather than deleting the row keeps the fixture honest:
    the script still exists, it is simply not auto-sent, which is exactly the
    supported Back Office configuration.

    Same shape as tests_teenpatti._clear_seeded_events -- seeded data that
    breaks count assertions is neutralised in setUp, not asserted around.
    """
    SupportScript.objects.filter(key="greeting").update(is_auto_send=False)


class LiveChatDeliveryTests(APITestCase):
    def setUp(self):
        silence_opening_greeting()
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


class AffiliateChatRoutingTests(APITestCase):
    """Affiliate -> Admin -> Affiliate, and its separation from player chat.

    The bug these cover: an affiliate is the *same* User row as a player
    (AffiliateProfile is a OneToOne on top of it), so nothing in the session
    lookup distinguished "this person opened the chat from the affiliate
    portal" from "...from the player dashboard" — both collapsed onto one
    thread. On the client side the widget only ever read the player token
    namespace, so an affiliate without a player session couldn't open a chat
    at all, and one with a stale player session opened it as that player.
    """

    def setUp(self):
        silence_opening_greeting()
        counter = count()
        patcher = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"TEST{wtype}{next(counter):06d}",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.affiliate = User.objects.create_user(
            email="aff@example.com", password="pw-Test-1", user_uid="TESTAFF1",
        )
        AffiliateProfile.objects.create(user=self.affiliate, is_active=True)

        self.player = User.objects.create_user(
            email="plr@example.com", password="pw-Test-1", user_uid="TESTPLR2",
        )
        self.agent = User.objects.create_user(
            email="agent2@example.com", password="pw-Test-1", user_uid="TESTAGT2",
            is_staff=True, is_superuser=True,
        )

    def _as(self, user):
        self.client.force_authenticate(user=user)

    def _start(self, user, portal):
        self._as(user)
        res = self.client.post("/api/live-chat/start/", {"portal": portal}, format="json")
        self.assertEqual(res.status_code, 200)
        return res.data["session"]

    def _rows(self, response):
        data = response.data
        return data if isinstance(data, list) else data["results"]

    # -- Affiliate -> Admin --------------------------------------------------
    def test_affiliate_message_reaches_the_admin_inbox(self):
        session = self._start(self.affiliate, "affiliate")
        self.assertEqual(session["participant_type"], "affiliate")

        self._as(self.affiliate)
        sent = self.client.post(
            f"/api/live-chat/{session['id']}/messages/",
            {"message": "Hello, I need help with my account."}, format="json",
        )
        self.assertEqual(sent.status_code, 201)

        self._as(self.agent)
        rows = self._rows(
            self.client.get("/api/admin-panel/live-chat/list/?participant_type=affiliate")
        )
        self.assertEqual([r["id"] for r in rows], [session["id"]])
        self.assertEqual(rows[0]["affiliate_id"], "AFF-TESTAFF1")
        self.assertEqual(rows[0]["unread_count"], 1)
        self.assertEqual(rows[0]["last_message"]["message"], "Hello, I need help with my account.")

        thread = self.client.get(f"/api/admin-panel/live-chat/{session['id']}/messages/")
        self.assertEqual(
            [m["message"] for m in thread.data], ["Hello, I need help with my account."],
        )

    # -- Admin -> Affiliate --------------------------------------------------
    def test_admin_reply_reaches_the_affiliate(self):
        session = self._start(self.affiliate, "affiliate")

        self._as(self.agent)
        replied = self.client.post(
            f"/api/admin-panel/live-chat/{session['id']}/messages/",
            {"message": "Sure, I will check that."}, format="json",
        )
        self.assertEqual(replied.status_code, 201)

        self._as(self.affiliate)
        res = self.client.get(f"/api/live-chat/{session['id']}/messages/")
        self.assertEqual([m["message"] for m in res.data], ["Sure, I will check that."])

    # -- No cross-routing ----------------------------------------------------
    def test_player_and_affiliate_chats_are_separate_threads(self):
        aff = self._start(self.affiliate, "affiliate")
        plr = self._start(self.player, "player")
        self.assertNotEqual(aff["id"], plr["id"])
        self.assertEqual(plr["participant_type"], "player")

        self._as(self.affiliate)
        self.client.post(f"/api/live-chat/{aff['id']}/messages/", {"message": "aff-side"}, format="json")
        self._as(self.player)
        self.client.post(f"/api/live-chat/{plr['id']}/messages/", {"message": "plr-side"}, format="json")

        self._as(self.agent)
        aff_thread = self.client.get(f"/api/admin-panel/live-chat/{aff['id']}/messages/")
        plr_thread = self.client.get(f"/api/admin-panel/live-chat/{plr['id']}/messages/")
        self.assertEqual([m["message"] for m in aff_thread.data], ["aff-side"])
        self.assertEqual([m["message"] for m in plr_thread.data], ["plr-side"])

    def test_same_person_gets_one_thread_per_portal(self):
        """An affiliate who also plays has two conversations, not one."""
        as_affiliate = self._start(self.affiliate, "affiliate")
        as_player = self._start(self.affiliate, "player")
        self.assertNotEqual(as_affiliate["id"], as_player["id"])
        self.assertEqual(as_player["participant_type"], "player")

    def test_reopening_reuses_the_same_session(self):
        first = self._start(self.affiliate, "affiliate")
        second = self._start(self.affiliate, "affiliate")
        self.assertEqual(first["id"], second["id"])

    # -- The portal claim is verified, never trusted -------------------------
    def test_non_affiliate_claiming_the_affiliate_portal_is_downgraded(self):
        session = self._start(self.player, "affiliate")
        self.assertEqual(session["participant_type"], "player")
        self.assertIsNone(session["affiliate_id"])

    def test_deactivated_affiliate_is_downgraded(self):
        AffiliateProfile.objects.filter(user=self.affiliate).update(is_active=False)
        session = self._start(self.affiliate, "affiliate")
        self.assertEqual(session["participant_type"], "player")

    def test_missing_portal_defaults_to_player(self):
        """The pre-existing clients send no portal at all."""
        self._as(self.affiliate)
        res = self.client.post("/api/live-chat/start/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["session"]["participant_type"], "player")

    # -- Admin segmentation --------------------------------------------------
    def test_admin_list_filters_by_participant_type(self):
        aff = self._start(self.affiliate, "affiliate")
        plr = self._start(self.player, "player")

        self._as(self.agent)
        for wanted, expected in (("affiliate", {aff["id"]}), ("player", {plr["id"]})):
            rows = self._rows(
                self.client.get(f"/api/admin-panel/live-chat/list/?participant_type={wanted}")
            )
            self.assertEqual({r["id"] for r in rows}, expected)

        rows = self._rows(self.client.get("/api/admin-panel/live-chat/list/"))
        self.assertEqual({r["id"] for r in rows}, {aff["id"], plr["id"]})

    def test_unknown_participant_type_filter_is_ignored(self):
        self._start(self.affiliate, "affiliate")
        self._as(self.agent)
        rows = self._rows(
            self.client.get("/api/admin-panel/live-chat/list/?participant_type=bogus")
        )
        self.assertEqual(len(rows), 1)

    # -- Ownership still holds across portals --------------------------------
    def test_player_cannot_read_an_affiliate_session(self):
        aff = self._start(self.affiliate, "affiliate")
        self._as(self.player)
        res = self.client.get(f"/api/live-chat/{aff['id']}/messages/")
        self.assertEqual(res.status_code, 404)

    # -- Duplicate prevention ------------------------------------------------
    def test_retrying_a_send_does_not_duplicate_the_message(self):
        session = self._start(self.affiliate, "affiliate")
        self._as(self.affiliate)
        body = {"message": "only once", "client_message_id": "fixed-key-1"}

        first = self.client.post(f"/api/live-chat/{session['id']}/messages/", body, format="json")
        second = self.client.post(f"/api/live-chat/{session['id']}/messages/", body, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(ChatMessage.objects.filter(ticket_id=session["id"]).count(), 1)

    def test_sends_without_a_client_id_are_still_independent(self):
        """Two genuinely separate messages with identical text must both land."""
        session = self._start(self.affiliate, "affiliate")
        self._as(self.affiliate)
        for _ in range(2):
            self.client.post(
                f"/api/live-chat/{session['id']}/messages/", {"message": "same text"}, format="json",
            )
        self.assertEqual(ChatMessage.objects.filter(ticket_id=session["id"]).count(), 2)

    # -- Offline admin -------------------------------------------------------
    def test_message_persists_when_no_admin_is_connected(self):
        """WebSockets are a latency optimisation; the row is the source of truth."""
        session = self._start(self.affiliate, "affiliate")
        self._as(self.affiliate)
        self.client.post(
            f"/api/live-chat/{session['id']}/messages/", {"message": "anyone there?"}, format="json",
        )

        # The agent only "comes online" now.
        self._as(self.agent)
        rows = self._rows(
            self.client.get("/api/admin-panel/live-chat/list/?participant_type=affiliate")
        )
        self.assertEqual(rows[0]["unread_count"], 1)
        self.assertEqual(rows[0]["last_message"]["message"], "anyone there?")


class OpeningGreetingTests(APITestCase):
    """The one message the system sends on its own.

    Deliberately not silenced here: this is the case that proves the greeting
    is delivered, so the other classes are free to switch it off and assert on
    participant messages alone.
    """

    def setUp(self):
        self.player = User.objects.create(email="greet-player@example.com", user_uid="GRTP01")

    def test_opening_a_session_posts_the_scripted_greeting(self):
        from authapp.services import live_chat_service

        script = SupportScript.objects.get(key="greeting")
        session, created = live_chat_service.get_or_create_active_session(self.player)

        self.assertTrue(created)
        messages = list(session.chat_messages.all())
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0].sender_type, "admin")
        self.assertEqual(messages[0].message, script.body)
        # No agent wrote it, so it is attributed to none of them.
        self.assertIsNone(messages[0].sender_id)

    def test_reopening_does_not_post_it_twice(self):
        from authapp.services import live_chat_service

        session, _ = live_chat_service.get_or_create_active_session(self.player)
        again, created = live_chat_service.get_or_create_active_session(self.player)

        self.assertFalse(created)
        self.assertEqual(again.pk, session.pk)
        self.assertEqual(again.chat_messages.count(), 1)

    def test_turning_the_flag_off_stops_it(self):
        from authapp.services import live_chat_service

        SupportScript.objects.filter(key="greeting").update(is_auto_send=False)
        session, created = live_chat_service.get_or_create_active_session(self.player)

        self.assertTrue(created)
        self.assertEqual(session.chat_messages.count(), 0)
