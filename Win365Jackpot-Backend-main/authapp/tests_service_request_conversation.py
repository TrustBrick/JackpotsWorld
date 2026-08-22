"""Opening a Service Request as a live conversation.

The customer's "My Service Requests" are ordinary ticket-form SupportTickets
(is_live_chat=False, one admin_reply). Clicking "Chat now" on one must open
THAT request — its exact id — as a real-time Chat + Voice conversation, reusing
the existing live-chat thread, WebSocket and voice-call systems, never a
generic thread and never a second ticket.

POST /api/support/tickets/<id>/open-conversation/ is the one new endpoint that
makes this possible: it promotes an active form ticket to a live thread in
place (seeding its original message + any reply already given) and returns the
transcript. These tests pin down that promotion, its idempotency, its
owner-scoping, and that a promoted request then behaves exactly like any other
live session — chattable, callable, and still only ever resolved by the
explicit agent action (the broader "message/call never resolves" contract lives
in tests_service_request_lifecycle.py).
"""
from itertools import count
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from authapp.models.call_models import CallSession
from authapp.models.support_ticket_models import SupportTicket
from authapp.throttles import VoiceCallStartRateThrottle
# Opening a live session posts the scripted greeting as an admin message.
# These tests count the messages the participants exchanged, so the system
# one is switched off here. Defined and explained once in tests_live_chat;
# the greeting itself is covered by OpeningGreetingTests there.
from authapp.tests_live_chat import silence_opening_greeting

User = get_user_model()

ACTIVE_STATUSES = ("open", "in_progress")


@override_settings(LIVE_CHAT_REALTIME=True)
class OpenConversationTests(APITestCase):
    def setUp(self):
        silence_opening_greeting()
        # Same signal stub the other support tests use: the User post_save
        # signal provisions wallet rows numbered from a millisecond timestamp,
        # and tests create users faster than that resolves.
        counter = count()
        patcher = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"TEST{wtype}{next(counter):06d}",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        throttle_patcher = patch.object(
            VoiceCallStartRateThrottle, "allow_request", return_value=True,
        )
        throttle_patcher.start()
        self.addCleanup(throttle_patcher.stop)

        self.customer = User.objects.create_user(
            email="customer@example.com", password="pw-Test-1", user_uid="TESTCUS1",
        )
        self.other_customer = User.objects.create_user(
            email="other@example.com", password="pw-Test-1", user_uid="TESTOTH1",
        )
        self.agent = User.objects.create_user(
            email="agent@example.com", password="pw-Test-1", user_uid="TESTAGT1",
            is_staff=True, is_superuser=True,
        )

    # ── helpers ────────────────────────────────────────────────────────────
    def _as(self, user):
        self.client.force_authenticate(user=user)

    def _form_ticket(self, subject="Account Issue", message="I can't log in.", user=None):
        """A request as the ticket form creates it: is_live_chat=False."""
        return SupportTicket.objects.create(
            user=user or self.customer, subject=subject, message=message,
        )

    def _open(self, ticket, user=None):
        self._as(user or self.customer)
        return self.client.post(f"/api/support/tickets/{ticket.id}/open-conversation/")

    def _reply(self, ticket, text="Hi, how can I help?"):
        self._as(self.agent)
        return self.client.patch(
            f"/api/admin-panel/support/tickets/{ticket.id}/",
            {"admin_reply": text}, format="json",
        )

    def _resolve(self, ticket):
        self._as(self.agent)
        return self.client.patch(
            f"/api/admin-panel/support/tickets/{ticket.id}/",
            {"status": "resolved"}, format="json",
        )

    # ── promotion + seeding ────────────────────────────────────────────────
    def test_open_promotes_active_form_ticket_and_seeds_original_message(self):
        ticket = self._form_ticket(message="I can't log in.")
        self.assertFalse(ticket.is_live_chat)

        res = self._open(ticket)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["ticket"]["is_live_chat"])

        ticket.refresh_from_db()
        self.assertTrue(ticket.is_live_chat, "an active request must be promoted in place")

        msgs = res.data["messages"]
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0]["sender_type"], "user")
        self.assertEqual(msgs[0]["message"], "I can't log in.")

    def test_open_seeds_existing_admin_reply_into_the_thread(self):
        ticket = self._form_ticket(message="Need help")
        self.assertEqual(self._reply(ticket, "We're on it.").status_code, 200)

        res = self._open(ticket)
        self.assertEqual(res.status_code, 200)
        msgs = res.data["messages"]
        # Original submission first, then the agent's reply, in order.
        self.assertEqual([m["sender_type"] for m in msgs], ["user", "admin"])
        self.assertEqual(msgs[0]["message"], "Need help")
        self.assertEqual(msgs[1]["message"], "We're on it.")

    def test_open_is_idempotent_and_never_duplicates_the_seed(self):
        ticket = self._form_ticket(message="Need help")
        self._reply(ticket, "We're on it.")

        first = self._open(ticket)
        self.assertEqual(len(first.data["messages"]), 2)
        second = self._open(ticket)
        self.assertEqual(len(second.data["messages"]), 2, "re-opening must not re-seed")
        self.assertEqual(ticket.chat_messages.count(), 2)

    # ── routing: the exact ticket, never another ───────────────────────────
    def test_open_returns_the_clicked_request_not_another(self):
        a = self._form_ticket(subject="Deposit Problem", message="AAA")
        b = self._form_ticket(subject="Account Issue", message="BBB")

        res = self._open(b)
        self.assertEqual(res.data["ticket"]["id"], b.id)
        self.assertEqual(res.data["ticket"]["subject"], "Account Issue")
        texts = [m["message"] for m in res.data["messages"]]
        self.assertIn("BBB", texts)
        self.assertNotIn("AAA", texts)

    def test_customer_cannot_open_another_customers_request(self):
        theirs = self._form_ticket(user=self.other_customer, message="secret")
        res = self._open(theirs, user=self.customer)
        self.assertEqual(res.status_code, 404)
        theirs.refresh_from_db()
        self.assertFalse(theirs.is_live_chat, "a refused open must not promote the row")

    # ── a promoted request behaves like any live session ───────────────────
    def test_promoted_request_accepts_messages_and_stays_active(self):
        ticket = self._form_ticket()
        self.assertEqual(self._open(ticket).status_code, 200)

        self._as(self.customer)
        sent = self.client.post(
            f"/api/live-chat/{ticket.id}/messages/", {"message": "any update?"}, format="json",
        )
        self.assertEqual(sent.status_code, 201)
        ticket.refresh_from_db()
        self.assertIn(ticket.status, ACTIVE_STATUSES)

    def test_promoted_request_supports_a_call_bound_to_that_ticket(self):
        ticket = self._form_ticket()
        self.assertEqual(self._open(ticket).status_code, 200)

        self._as(self.customer)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(res.status_code, 201)
        call = CallSession.objects.get(pk=res.data["id"])
        self.assertEqual(call.ticket_id, ticket.id, "the call must belong to this request")
        ticket.refresh_from_db()
        self.assertIn(ticket.status, ACTIVE_STATUSES)

    # ── an already-live session is returned untouched ──────────────────────
    def test_open_on_an_existing_live_session_returns_its_thread(self):
        self._as(self.customer)
        start = self.client.post("/api/live-chat/start/")
        ticket = SupportTicket.objects.get(pk=start.data["session"]["id"])
        self.client.post(f"/api/live-chat/{ticket.id}/messages/", {"message": "hi"}, format="json")
        self._as(self.agent)
        self.client.post(
            f"/api/admin-panel/live-chat/{ticket.id}/messages/", {"message": "hello"}, format="json",
        )

        res = self._open(ticket)
        self.assertEqual(res.status_code, 200)
        # The two real messages, and no seeded "(live chat session)" placeholder.
        self.assertEqual(len(res.data["messages"]), 2)
        self.assertNotIn("(live chat session)", [m["message"] for m in res.data["messages"]])

    # ── resolved requests: read-only, never revived by opening ─────────────
    def test_open_does_not_promote_or_revive_a_resolved_request(self):
        ticket = self._form_ticket(message="old issue")
        self._reply(ticket, "Sorted for you.")
        self.assertEqual(self._resolve(ticket).status_code, 200)

        res = self._open(ticket)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["ticket"]["status"], "resolved")
        # Left as a form ticket, so opening it can never reactivate it.
        self.assertFalse(res.data["ticket"]["is_live_chat"])
        ticket.refresh_from_db()
        self.assertFalse(ticket.is_live_chat)
        # The client still has the history to render read-only.
        self.assertEqual(res.data["ticket"]["message"], "old issue")
        self.assertEqual(res.data["ticket"]["admin_reply"], "Sorted for you.")

    def test_resolving_after_promotion_locks_messages_and_calls(self):
        ticket = self._form_ticket()
        self.assertEqual(self._open(ticket).status_code, 200)  # promote
        self.assertEqual(self._resolve(ticket).status_code, 200)

        self._as(self.customer)
        late = self.client.post(
            f"/api/live-chat/{ticket.id}/messages/", {"message": "still there?"}, format="json",
        )
        self.assertEqual(late.status_code, 409)
        call = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertGreaterEqual(call.status_code, 400)
        self.assertFalse(CallSession.objects.filter(ticket=ticket).exists())
