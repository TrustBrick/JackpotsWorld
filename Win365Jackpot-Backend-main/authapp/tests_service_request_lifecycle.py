"""A support request must only be resolved by an explicit resolve action.

The reported production bug: an agent answering a customer's "Hi" with "Hi"
closed the request on the spot. The cause was entirely in the Back Office --
SupportTicketsTab.jsx sent {admin_reply, status: "resolved"} in a single
PATCH, so replying and resolving were one operation. The customer saw their
request marked resolved while the conversation had barely started.

Nothing in the backend ever resolved a ticket on its own, and these tests
pin that down from the API side so it stays true: replying, chatting and
calling all leave the status alone, and only a deliberate status change ends
the request. They also cover the other half of the contract -- once a request
IS resolved it stops accepting messages and calls, enforced on the server
rather than by hiding a button.
"""
from itertools import count
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from authapp.models.call_models import CallSession
from authapp.models.support_ticket_models import SupportTicket
from authapp.services import voice_call_service
from authapp.throttles import VoiceCallStartRateThrottle

User = get_user_model()

ACTIVE_STATUSES = ("open", "in_progress")


@override_settings(LIVE_CHAT_REALTIME=True)
class ServiceRequestLifecycleTests(APITestCase):
    def setUp(self):
        # Same stub as tests_live_chat/tests_voice_call: the User post_save
        # signal provisions wallet rows whose numbers come from a millisecond
        # timestamp, and tests create users faster than that resolves.
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

    def _as(self, user):
        self.client.force_authenticate(user=user)

    def _start_request(self):
        """A live-chat service request, as the widget creates it."""
        self._as(self.customer)
        res = self.client.post("/api/live-chat/start/")
        self.assertEqual(res.status_code, 200)
        return SupportTicket.objects.get(pk=res.data["session"]["id"])

    def _status(self, ticket):
        ticket.refresh_from_db()
        return ticket.status

    def _customer_says(self, ticket, text):
        self._as(self.customer)
        return self.client.post(
            f"/api/live-chat/{ticket.id}/messages/", {"message": text}, format="json",
        )

    def _agent_says(self, ticket, text):
        self._as(self.agent)
        return self.client.post(
            f"/api/admin-panel/live-chat/{ticket.id}/messages/", {"message": text}, format="json",
        )

    def _resolve(self, ticket, as_user=None):
        self._as(as_user or self.agent)
        return self.client.patch(
            f"/api/admin-panel/support/tickets/{ticket.id}/",
            {"status": "resolved"}, format="json",
        )

    # -- 1. A new request is active -----------------------------------------
    def test_new_request_starts_active(self):
        self.assertIn(self._status(self._start_request()), ACTIVE_STATUSES)

    # -- 2-4. Chatting never resolves ---------------------------------------
    def test_customer_message_keeps_request_active(self):
        ticket = self._start_request()
        self.assertEqual(self._customer_says(ticket, "Hi").status_code, 201)
        self.assertIn(self._status(ticket), ACTIVE_STATUSES)

    def test_admin_message_keeps_request_active(self):
        """The exact reported sequence: customer says Hi, admin says Hi."""
        ticket = self._start_request()
        self._customer_says(ticket, "Hi")
        self.assertEqual(self._agent_says(ticket, "Hi").status_code, 201)
        self.assertIn(
            self._status(ticket), ACTIVE_STATUSES,
            "an agent replying must never resolve the request",
        )

    def test_many_messages_keep_request_active(self):
        ticket = self._start_request()
        for i in range(3):
            self.assertEqual(self._customer_says(ticket, f"c{i}").status_code, 201)
            self.assertEqual(self._agent_says(ticket, f"a{i}").status_code, 201)
            self.assertIn(self._status(ticket), ACTIVE_STATUSES)

    # -- The Back Office reply path (where the bug actually was) -------------
    def test_admin_reply_patch_alone_does_not_resolve(self):
        """PATCHing only admin_reply must leave the status untouched. The Back
        Office used to bundle status resolved into this same request."""
        ticket = SupportTicket.objects.create(
            user=self.customer, subject="Booking problem", message="Need help",
        )
        self._as(self.agent)
        res = self.client.patch(
            f"/api/admin-panel/support/tickets/{ticket.id}/",
            {"admin_reply": "Hi, how can I help?"}, format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn(self._status(ticket), ACTIVE_STATUSES)
        ticket.refresh_from_db()
        self.assertEqual(ticket.admin_reply, "Hi, how can I help?")

    # -- 5-6. Calls never resolve -------------------------------------------
    def test_starting_a_call_keeps_request_active(self):
        ticket = self._start_request()
        self._as(self.customer)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertEqual(res.status_code, 201)
        self.assertIn(self._status(ticket), ACTIVE_STATUSES)

    def test_ending_a_call_keeps_request_active(self):
        ticket = self._start_request()
        call, _ = voice_call_service.initiate_call(self.customer, ticket)
        self._as(self.customer)
        res = self.client.post(f"/api/live-chat/calls/{call.id}/end/")
        self.assertEqual(res.status_code, 200)
        self.assertIn(
            self._status(ticket), ACTIVE_STATUSES,
            "hanging up must not end the request itself",
        )

    # -- 7. Only the explicit action resolves -------------------------------
    def test_explicit_resolve_marks_request_resolved(self):
        ticket = self._start_request()
        self._customer_says(ticket, "Hi")
        self._agent_says(ticket, "Hi")
        self.assertEqual(self._resolve(ticket).status_code, 200)
        self.assertEqual(self._status(ticket), "resolved")

    # -- 8-9. A resolved request is closed for business ---------------------
    def test_resolved_request_rejects_new_messages(self):
        ticket = self._start_request()
        self._resolve(ticket)
        self.assertEqual(self._customer_says(ticket, "still there?").status_code, 409)
        self.assertEqual(self._agent_says(ticket, "hello again").status_code, 409)

    def test_resolved_request_rejects_new_calls(self):
        ticket = self._start_request()
        self._resolve(ticket)
        self._as(self.customer)
        res = self.client.post(f"/api/live-chat/{ticket.id}/calls/")
        self.assertGreaterEqual(res.status_code, 400)
        self.assertFalse(CallSession.objects.filter(ticket=ticket).exists())

    def test_resolved_request_keeps_its_history(self):
        """Resolving ends the conversation; it must not erase it."""
        ticket = self._start_request()
        self._customer_says(ticket, "Hi")
        self._agent_says(ticket, "Hi there")
        self._resolve(ticket)
        self._as(self.customer)
        res = self.client.get(f"/api/live-chat/{ticket.id}/messages/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

    # -- 10. Authorization --------------------------------------------------
    def test_customer_cannot_resolve_their_own_request(self):
        ticket = self._start_request()
        res = self._resolve(ticket, as_user=self.customer)
        self.assertIn(res.status_code, (401, 403))
        self.assertIn(self._status(ticket), ACTIVE_STATUSES)

    def test_unrelated_customer_cannot_resolve_someone_elses_request(self):
        ticket = self._start_request()
        res = self._resolve(ticket, as_user=self.other_customer)
        self.assertIn(res.status_code, (401, 403))
        self.assertIn(self._status(ticket), ACTIVE_STATUSES)
