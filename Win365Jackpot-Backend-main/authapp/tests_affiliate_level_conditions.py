"""
authapp/tests_affiliate_level_conditions.py
─────────────────────────────────────────────────────────────────────────────
AFFILIATE-LEVELS, automatic part: admins set minimums per level in the Back
Office and affiliates move up when they meet them. Agreed defaults: every
filled-in minimum must be met, lifetime totals, up only, hand-set levels are
locked until an admin chooses "Automatic" again.

Promotion happens after the transaction commits, so these drive it through
captureOnCommitCallbacks(execute=True) -- the way it actually runs.
"""

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from authapp.models import ActivityLog, User
from authapp.models.affiliate_models import (
    AffiliateLevelCondition, AffiliateProfile, ReferralCommission,
)
from authapp.models.wallet_request_models import DepositRequest
from authapp.services import affiliate_level_service

URL = "/api/admin-panel/affiliate-level-conditions/"


class AffiliateLevelConditionTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="cond-admin@jackpotsworld.vip", password="Adm1n-Pass!")
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)

        self.affiliate = User.objects.create_user(email="cond-aff@example.com", password="Aff1l-Pass!")
        self.profile = AffiliateProfile.objects.create(
            user=self.affiliate, is_active=True, commission_rate=Decimal("10"), approved_by=self.admin,
        )
        self.n = 0

    # ── helpers ──────────────────────────────────────────────────────────────

    def set_conditions(self, **levels):
        rows = [{"level": lvl, **mins} for lvl, mins in levels.items()]
        with self.captureOnCommitCallbacks(execute=True):
            res = self.admin_client.put(URL, {"conditions": rows}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return res

    def refer(self):
        """A referral sign-up the way the OTP flow does it: create, then set
        referred_by with update_fields."""
        self.n += 1
        with self.captureOnCommitCallbacks(execute=True):
            player = User.objects.create_user(email=f"cond-p{self.n}@example.com", password="Pl-ayer12!")
            player.referred_by = self.affiliate
            player.save(update_fields=["referred_by"])
        return player

    def deposit(self, player, amount):
        with self.captureOnCommitCallbacks(execute=True):
            DepositRequest.objects.create(
                user=player, amount=Decimal(str(amount)), status="approved",
                request_reference=f"TST-{player.pk}-{amount}",
            )

    def commission(self, player, amount):
        with self.captureOnCommitCallbacks(execute=True):
            ReferralCommission.objects.create(
                affiliate=self.affiliate, referred_user=player, deposit_amount=Decimal("100"),
                commission_rate=Decimal("10"), amount=Decimal(str(amount)), status="pending",
            )

    def level(self):
        self.profile.refresh_from_db()
        return self.profile.level

    # ── the rules ────────────────────────────────────────────────────────────

    def test_nothing_moves_while_no_conditions_are_set(self):
        """An unconfigured level must never be handed out -- otherwise every
        affiliate would be Diamond the moment this shipped."""
        p = self.refer()
        self.deposit(p, 5000)
        self.commission(p, 500)
        self.assertEqual(self.level(), "vip")
        self.set_conditions(bronze={}, silver={}, gold={}, diamond={})
        self.assertEqual(self.level(), "vip")

    def test_referral_signups_promote_when_the_minimum_is_reached(self):
        self.set_conditions(bronze={"min_referred_players": 2})
        self.refer()
        self.assertEqual(self.level(), "vip")
        self.refer()
        self.assertEqual(self.level(), "bronze")
        log = ActivityLog.objects.filter(action="affiliate_level_changed", target_user=self.affiliate).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.meta["to"], "bronze")

    def test_a_deposit_promotes(self):
        self.set_conditions(bronze={"min_deposit_volume": "1000"})
        p = self.refer()
        self.deposit(p, 400)
        self.assertEqual(self.level(), "vip")
        self.deposit(p, 600)
        self.assertEqual(self.level(), "bronze")

    def test_every_filled_minimum_must_be_met(self):
        self.set_conditions(bronze={"min_referred_players": 1, "min_commission_earned": "100"})
        p = self.refer()
        self.assertEqual(self.level(), "vip")   # players met, commission not
        self.commission(p, 100)
        self.assertEqual(self.level(), "bronze")

    def test_lands_on_the_highest_level_met(self):
        self.set_conditions(
            bronze={"min_referred_players": 1},
            silver={"min_referred_players": 2},
            gold={"min_referred_players": 3},
        )
        for _ in range(3):
            self.refer()
        self.assertEqual(self.level(), "gold")

    def test_never_moves_down_automatically(self):
        self.set_conditions(bronze={"min_referred_players": 1})
        self.refer()
        self.assertEqual(self.level(), "bronze")
        self.set_conditions(bronze={"min_referred_players": 50})
        self.assertEqual(self.level(), "bronze")

    def test_saving_conditions_moves_affiliates_who_already_qualify(self):
        self.refer(); self.refer()
        res = self.set_conditions(silver={"min_referred_players": 2})
        self.assertEqual(res.data["affiliates_moved_up"], 1)
        self.assertEqual(self.level(), "silver")

    # ── manual override ──────────────────────────────────────────────────────

    def test_a_hand_set_level_is_locked_until_set_back_to_automatic(self):
        self.set_conditions(gold={"min_referred_players": 1})
        url = f"/api/admin-panel/affiliates/{self.affiliate.pk}/level/"
        res = self.admin_client.patch(url, {"level": "bronze"}, format="json")
        self.assertTrue(res.data["level_locked"])

        self.refer()                              # meets Gold, but locked
        self.assertEqual(self.level(), "bronze")

        res = self.admin_client.patch(url, {"automatic": True}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["level_locked"])
        self.assertEqual(res.data["level"], "gold")

    def test_automatic_never_lowers_a_level(self):
        url = f"/api/admin-panel/affiliates/{self.affiliate.pk}/level/"
        self.admin_client.patch(url, {"level": "diamond"}, format="json")
        res = self.admin_client.patch(url, {"automatic": True}, format="json")
        self.assertEqual(res.data["level"], "diamond")

    # ── the Back Office API ──────────────────────────────────────────────────

    def test_get_lists_every_level_above_vip(self):
        res = self.admin_client.get(URL)
        self.assertEqual([r["level"] for r in res.data["conditions"]], ["bronze", "silver", "gold", "diamond"])
        self.assertTrue(all(r["min_referred_players"] is None for r in res.data["conditions"]))

    def test_blank_clears_a_minimum(self):
        self.set_conditions(bronze={"min_referred_players": 5, "min_deposit_volume": "100"})
        self.set_conditions(bronze={"min_referred_players": "", "min_deposit_volume": "100"})
        cond = AffiliateLevelCondition.objects.get(level="bronze")
        self.assertIsNone(cond.min_referred_players)
        self.assertEqual(cond.min_deposit_volume, Decimal("100.00"))

    def test_bad_input_is_refused(self):
        for rows in (
            [{"level": "vip", "min_referred_players": 1}],
            [{"level": "platinum"}],
            [{"level": "bronze", "min_referred_players": "lots"}],
            [{"level": "bronze", "min_deposit_volume": "-5"}],
        ):
            res = self.admin_client.put(URL, {"conditions": rows}, format="json")
            self.assertEqual(res.status_code, 400, rows)
        self.assertFalse(AffiliateLevelCondition.objects.exists())

    def test_only_admins_can_see_or_set_conditions(self):
        aff = APIClient()
        aff.force_authenticate(self.affiliate)
        self.assertEqual(aff.get(URL).status_code, 403)
        self.assertEqual(aff.put(URL, {"conditions": []}, format="json").status_code, 403)

    # ── what the affiliate sees ──────────────────────────────────────────────

    def test_dashboard_shows_progress_to_the_next_level(self):
        self.set_conditions(bronze={"min_referred_players": 3, "min_deposit_volume": "500"})
        p = self.refer()
        self.deposit(p, 500)
        aff = APIClient()
        aff.force_authenticate(self.affiliate)
        prog = aff.get("/api/affiliate/dashboard/").data["level_progress"]
        self.assertEqual(prog["level"], "bronze")
        reqs = {r["metric"]: r for r in prog["requirements"]}
        self.assertEqual((reqs["referred_players"]["current"], reqs["referred_players"]["required"]), (1, 3))
        self.assertFalse(reqs["referred_players"]["met"])
        self.assertTrue(reqs["deposit_volume"]["met"])

    def test_metrics_match_the_dashboard_figures(self):
        p = self.refer()
        self.deposit(p, 250)
        self.commission(p, 30)
        m = affiliate_level_service.metrics_for(self.affiliate)
        aff = APIClient()
        aff.force_authenticate(self.affiliate)
        stats = aff.get("/api/affiliate/dashboard/").data["stats"]
        self.assertEqual(m["referred_players"], stats["total_referred"])
        self.assertEqual(m["qualified_players"], stats["qualified_players"])
        self.assertEqual(float(m["deposit_volume"]), stats["total_deposits"])
        self.assertEqual(float(m["commission_earned"]), stats["commission_earned"])
