"""Same-day bet slips in Admin → Offline Transactions → Rolling Points.

When a player already has a bet slip on a betting date, the next slip that
day is numbered automatically (and the date carried over) instead of being
retyped by the admin.
"""
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models.casino_models import Casino
from authapp.models.offline_deposit import OfflineDepositLog
from authapp.models.super_admin_models import AdminWallet
from authapp.models.user_model import User
from authapp.services.bet_slip_service import _increment, next_slip_number

SRI_LANKA = "Sri Lanka"


class SlipIncrementTests(APITestCase):
    def test_keeps_prefix_and_zero_padding(self):
        self.assertEqual(_increment("SLP-20261018-001"), "SLP-20261018-002")
        self.assertEqual(_increment("SLP-20261018-009"), "SLP-20261018-010")
        self.assertEqual(_increment("A99"), "A100")

    def test_non_numeric_slip_gets_a_suffix(self):
        self.assertEqual(_increment("ABC"), "ABC-2")


class SameDaySlipTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="slip-admin@example.com", password="pw12345!", name="Admin",
            is_staff=True, is_superuser=True,
        )
        self.player = User.objects.create_user(
            email="slip-player@example.com", password="pw12345!", name="Slip Player",
        )
        Casino.objects.get_or_create(
            country=SRI_LANKA, name="Bellagio Casino", defaults={"is_active": True},
        )
        AdminWallet.objects.get_or_create(
            pk=1,
            defaults={
                "cash_balance": Decimal("1000000"),
                "non_cash_balance": Decimal("1000000"),
                "otp_balance": Decimal("1000000"),
            },
        )
        self.client.force_authenticate(self.admin)
        self.today = timezone.now().date().isoformat()
        # Fund the player's casino wallet: DMA into main, then DAC into the casino.
        for payload in (
            {"transaction_type": "DMA", "wallet_type": "C", "amount": "5000"},
            {"transaction_type": "DAC", "wallet_type": "C", "amount": "5000",
             "casino_name": "Bellagio Casino", "country": SRI_LANKA},
        ):
            r = self._offline(**payload)
            self.assertEqual(r.status_code, 200, r.data)

    def _offline(self, **payload):
        payload.setdefault("user_id", self.player.id)
        return self.client.post("/api/admin-panel/deposits/offline/", payload, format="json")

    def _slip(self, slip_number, betting_date=None):
        return self._offline(
            type="rolling_points", casino_name="Bellagio Casino", country=SRI_LANKA,
            slip_number=slip_number, betting_date=betting_date or self.today,
            total_bets=1, total_bet_amount="1000",
        )

    def _day_slips(self, betting_date=None, user_id=None):
        return self.client.get(
            "/api/admin-panel/deposits/day-slips/",
            {"user_id": user_id or self.player.id, "betting_date": betting_date or self.today},
        )

    def test_no_slip_yet_means_nothing_to_autofill(self):
        r = self._day_slips()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["slips"], [])
        self.assertIsNone(r.data["next_slip_number"])

    def test_second_slip_of_the_day_is_numbered_from_the_first(self):
        self.assertEqual(self._slip("SLP-20261018-001").status_code, 200)
        r = self._day_slips()
        self.assertEqual([s["slip_number"] for s in r.data["slips"]], ["SLP-20261018-001"])
        self.assertEqual(r.data["next_slip_number"], "SLP-20261018-002")

    def test_blank_slip_on_a_day_with_slips_is_generated_on_submit(self):
        self.assertEqual(self._slip("SLP-20261018-001").status_code, 200)
        r = self._slip("")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(OfflineDepositLog.objects.filter(
            user=self.player, slip_number="SLP-20261018-002", betting_date=self.today,
        ).exists())
        self.assertEqual(self._day_slips().data["next_slip_number"], "SLP-20261018-003")

    def test_next_number_skips_one_taken_by_another_player(self):
        other = User.objects.create_user(email="o@example.com", password="pw12345!", name="O")
        OfflineDepositLog.objects.create(
            user=other, entry_type="rolling_points", slip_number="SLP-20261018-002",
        )
        self.assertEqual(self._slip("SLP-20261018-001").status_code, 200)
        self.assertEqual(next_slip_number(self.player, self.today), "SLP-20261018-003")

    def test_other_days_are_not_counted(self):
        self.assertEqual(self._slip("SLP-20261018-001").status_code, 200)
        r = self._day_slips(betting_date="2026-01-01")
        self.assertEqual(r.data["slips"], [])
        self.assertIsNone(r.data["next_slip_number"])

    def test_bad_input_and_non_admins_are_refused(self):
        self.assertEqual(self._day_slips(betting_date="18-10-2026").status_code, 400)
        self.assertEqual(self._day_slips(user_id=999999).status_code, 404)
        self.client.force_authenticate(self.player)
        self.assertEqual(self._day_slips().status_code, 403)
