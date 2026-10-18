"""Back Office request handling and agent-initiated contact.

Covers the 2026-10 round of admin/user-panel changes:

  * Service Requests list carries who raised the request (name + contact),
    and an agent can only move a request between Pending / Processing /
    Completed.
  * Deposit requests have no manual Processing step; completing one writes a
    ledger row tagged with the requested casino, the same "[CASINO:X] [C] DAC
    $n" shape as every other casino row, and the admin list can be narrowed
    to one player for the request card in Offline Transactions.
  * An offline Deposit at Casino (DAC) ledger row names the casino.
  * The player's Account Overview is computed per country / casino.
  * Presence heartbeat, the agent contact picker, and agent-started chats.
"""
from datetime import timedelta
from decimal import Decimal
from itertools import count
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models.affiliate_models import AffiliateProfile
from authapp.models.casino_models import Casino
from authapp.models.support_ticket_models import ChatMessage, SupportTicket
from authapp.models.wallet_models import WalletTransaction
from authapp.models.wallet_request_models import DepositRequest
from authapp.services import presence_service
from authapp.services.casino_wallet_service import credit_casino_wallet, debit_casino_wallet
from authapp.services.wallet_service import credit_main_wallet
from authapp.tests_live_chat import silence_opening_greeting

User = get_user_model()


class _Base(APITestCase):
    def setUp(self):
        silence_opening_greeting()
        counter = count()
        patcher = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"TEST{wtype}{next(counter):06d}",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.player = User.objects.create_user(
            email="player@example.com", password="pw-Test-1", user_uid="ARPLAY01",
            name="Priya Player", phone="9876543210", dial_code="+91", country="IN",
        )
        self.admin = User.objects.create_user(
            email="admin@example.com", password="pw-Test-1", user_uid="ARADMN01",
            is_staff=True, is_superuser=True,
        )


class ServiceRequestAdminTests(_Base):
    def setUp(self):
        super().setUp()
        self.ticket = SupportTicket.objects.create(
            user=self.player, subject="Withdrawal help", message="Where is my payout?",
        )
        self.client.force_authenticate(self.admin)

    def test_list_includes_name_and_contact(self):
        res = self.client.get("/api/admin-panel/support/tickets/")
        self.assertEqual(res.status_code, 200)
        rows = res.json()
        rows = rows if isinstance(rows, list) else rows["results"]
        row = next(r for r in rows if r["id"] == self.ticket.id)
        self.assertEqual(row["name"], "Priya Player")
        self.assertEqual(row["email"], "player@example.com")
        self.assertEqual(row["phone"], "+91 9876543210")
        self.assertFalse(row["is_affiliate"])

    def test_status_moves_through_the_three_states(self):
        url = f"/api/admin-panel/support/tickets/{self.ticket.id}/"
        for status in ("in_progress", "resolved", "open"):
            res = self.client.patch(url, {"status": status}, format="json")
            self.assertEqual(res.status_code, 200, res.content)
            self.ticket.refresh_from_db()
            self.assertEqual(self.ticket.status, status)

    def test_other_statuses_are_refused(self):
        res = self.client.patch(
            f"/api/admin-panel/support/tickets/{self.ticket.id}/", {"status": "closed"}, format="json",
        )
        self.assertEqual(res.status_code, 400)


class DepositRequestTests(_Base):
    def setUp(self):
        super().setUp()
        self.casino, _ = Casino.objects.get_or_create(country="India", name="Ballys Test Casino")
        self.req = DepositRequest.objects.create(
            user=self.player, amount=Decimal("1000"), casino=self.casino, status="pending",
            request_reference="DEP-TEST-0001",
        )
        self.client.force_authenticate(self.admin)

    def test_completing_a_request_tags_the_ledger_row_with_its_casino(self):
        res = self.client.post(f"/api/admin-panel/deposit-requests/{self.req.id}/approve/", {}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, "approved")
        note = self.req.wallet_transaction.note
        self.assertTrue(note.startswith("[CASINO:Ballys Test Casino] [C] DAC $1000"), note)

    def test_manual_processing_is_refused(self):
        res = self.client.post(f"/api/admin-panel/deposit-requests/{self.req.id}/processing/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, "pending")

    def test_list_filters_to_one_players_open_requests(self):
        other = User.objects.create_user(email="o@example.com", password="pw-Test-1", user_uid="AROTHR01")
        DepositRequest.objects.create(user=other, amount=Decimal("5"), status="pending", request_reference="DEP-TEST-0002")
        legacy = DepositRequest.objects.create(user=self.player, amount=Decimal("7"), status="processing", request_reference="DEP-TEST-0003")
        DepositRequest.objects.create(user=self.player, amount=Decimal("9"), status="approved", request_reference="DEP-TEST-0004")

        res = self.client.get(f"/api/admin-panel/deposit-requests/?user_id={self.player.id}&status=pending")
        self.assertEqual(res.status_code, 200)
        ids = {r["id"] for r in res.json()["results"]}
        self.assertEqual(ids, {self.req.id, legacy.id})


class OfflineDacLedgerTests(_Base):
    def test_dac_ledger_row_names_the_casino(self):
        credit_main_wallet(self.player, "C", Decimal("2000"), txn_type="DMA", note="seed", actor=self.admin)
        self.client.force_authenticate(self.admin)
        res = self.client.post("/api/admin-panel/deposits/offline/", {
            "user_id": self.player.id, "type": "cash", "transaction_type": "DAC",
            "wallet_type": "C", "amount": "1000", "casino_name": "Ballys Casino", "country": "India",
        }, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        row = WalletTransaction.objects.filter(user=self.player, transaction_type="DAC").latest("created_at")
        self.assertTrue(row.note.startswith("[CASINO:Ballys Casino] [C] DAC $1000"), row.note)


class AccountOverviewTests(_Base):
    def test_totals_follow_the_country_and_casino_filters(self):
        credit_casino_wallet(self.player, "Goa Royale", "C", Decimal("500"), self.admin, "DAC", country="India")
        debit_casino_wallet(self.player, "Goa Royale", "C", Decimal("200"), self.admin, "LAC", country="India")
        credit_casino_wallet(self.player, "Colombo Star", "C", Decimal("300"), self.admin, "DAC", country="Sri Lanka")
        credit_casino_wallet(self.player, "Colombo Star", "C", Decimal("50"), self.admin, "WIN", country="Sri Lanka")
        self.client.force_authenticate(self.player)

        all_ = self.client.get("/api/wallet/account-overview/").json()
        self.assertEqual(all_["total_deposited"], 800.0)
        self.assertEqual(all_["total_won"], 50.0)
        self.assertEqual(all_["total_lost"], 200.0)
        countries = {o["country"]: o["casinos"] for o in all_["options"]}
        self.assertEqual(countries, {"India": ["Goa Royale"], "Sri Lanka": ["Colombo Star"]})

        lk = self.client.get("/api/wallet/account-overview/?country=Sri Lanka").json()
        self.assertEqual(lk["total_deposited"], 300.0)
        goa = self.client.get("/api/wallet/account-overview/?casino=Goa Royale").json()
        self.assertEqual(goa["total_deposited"], 500.0)
        self.assertEqual(goa["total_won"], 0.0)


class PresenceAndAgentContactTests(_Base):
    def test_heartbeat_marks_the_user_online(self):
        self.client.force_authenticate(self.player)
        res = self.client.post("/api/live-chat/presence/", {"portal": "player"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.player.refresh_from_db()
        self.assertTrue(presence_service.is_online(self.player))
        self.assertIsNone(res.json()["session_id"])

    def test_contacts_show_who_is_online(self):
        User.objects.filter(pk=self.player.pk).update(last_seen_at=timezone.now())
        stale = User.objects.create_user(email="gone@example.com", password="pw-Test-1", user_uid="ARGONE01", name="Gone")
        User.objects.filter(pk=stale.pk).update(last_seen_at=timezone.now() - timedelta(hours=2))
        self.client.force_authenticate(self.admin)

        online = self.client.get("/api/admin-panel/live-chat/contacts/").json()["results"]
        self.assertEqual([c["id"] for c in online], [self.player.id])
        self.assertTrue(online[0]["is_online"])

        found = self.client.get("/api/admin-panel/live-chat/contacts/?q=gone").json()["results"]
        self.assertEqual([c["id"] for c in found], [stale.id])
        self.assertFalse(found[0]["is_online"])

    def test_agent_starts_a_chat_and_the_player_is_told_on_the_next_heartbeat(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post("/api/admin-panel/live-chat/start/",
                               {"user_id": self.player.id, "participant_type": "player"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        ticket_id = res.json()["session"]["id"]
        # Starting again rejoins the same conversation.
        again = self.client.post("/api/admin-panel/live-chat/start/",
                                 {"user_id": self.player.id, "participant_type": "player"}, format="json")
        self.assertEqual(again.json()["session"]["id"], ticket_id)

        ticket = SupportTicket.objects.get(pk=ticket_id)
        msg = ChatMessage.objects.create(ticket=ticket, sender_type="admin", sender=self.admin, message="Hello!")

        self.client.force_authenticate(self.player)
        beat = self.client.post("/api/live-chat/presence/", {"portal": "player"}, format="json").json()
        self.assertEqual(beat["session_id"], ticket_id)
        self.assertEqual(beat["latest_admin_message_id"], msg.id)

    def test_affiliate_chat_requires_an_active_affiliate(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post("/api/admin-panel/live-chat/start/",
                               {"user_id": self.player.id, "participant_type": "affiliate"}, format="json")
        self.assertEqual(res.status_code, 400)
        AffiliateProfile.objects.create(user=self.player, is_active=True)
        res = self.client.post("/api/admin-panel/live-chat/start/",
                               {"user_id": self.player.id, "participant_type": "affiliate"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["session"]["participant_type"], "affiliate")

    def test_non_admin_cannot_use_the_agent_endpoints(self):
        self.client.force_authenticate(self.player)
        self.assertEqual(self.client.get("/api/admin-panel/live-chat/contacts/").status_code, 403)
        self.assertEqual(
            self.client.post("/api/admin-panel/live-chat/start/", {"user_id": self.player.id}, format="json").status_code,
            403,
        )
