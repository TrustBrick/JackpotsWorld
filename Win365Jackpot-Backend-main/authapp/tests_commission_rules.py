"""
authapp/tests_commission_rules.py
─────────────────────────────────────────────────────────────────────────────
Covers the Country+Casino+Tier commission engine: rule precedence (Part 34),
tiers (Part 32), conditions (Part 31), the calculation itself (Part 35), and
the guarantee that adding rules never disturbs the two older commission layers.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.affiliate_models import AffiliateProfile, ReferralCommission
from authapp.models.casino_models import Casino
from authapp.models.commission_rule_models import (
    CommissionCondition, CommissionLedgerEntry, CommissionRule, CommissionTier,
)
from authapp.models.offline_deposit import OfflineDepositLog
from authapp.models.user_model import User
from authapp.services import commission_engine_service, commission_rule_service


def _rule(**overrides):
    defaults = {
        "name": "Rule", "commission_type": "rolling",
        "rate_type": "percentage", "rate": Decimal("10.000"),
        "is_active": True,
    }
    defaults.update(overrides)
    return CommissionRule.objects.create(**defaults)


class CommissionRulePrecedenceTests(APITestCase):
    """Part 34's precedence ladder, asserted one rung at a time."""

    def setUp(self):
        self.affiliate = User.objects.create_user(email="aff@example.com", password="pw12345!", name="Aff")
        self.other_affiliate = User.objects.create_user(email="aff2@example.com", password="pw12345!", name="Aff2")
        self.casino, _ = Casino.objects.get_or_create(
            country="Sri Lanka", name="Bellagio Casino", defaults={"is_active": True},
        )
        self.other_casino, _ = Casino.objects.get_or_create(
            country="India", name="Deltin Royale", defaults={"is_active": True},
        )

    def _resolve(self, **kwargs):
        params = dict(commission_type="rolling", country="Sri Lanka", casino=self.casino)
        params.update(kwargs)
        return commission_rule_service.resolve_rule(self.affiliate, **params)

    def test_specificity_is_scored_so_precedence_matches_the_spec(self):
        combos = [
            ({"affiliate": self.affiliate, "casino": self.casino, "country": "Sri Lanka"}, 7),
            ({"affiliate": self.affiliate, "casino": self.casino}, 6),
            ({"affiliate": self.affiliate, "country": "Sri Lanka"}, 5),
            ({"affiliate": self.affiliate}, 4),
            ({"casino": self.casino, "country": "Sri Lanka"}, 3),
            ({"casino": self.casino}, 2),
            ({"country": "Sri Lanka"}, 1),
            ({}, 0),
        ]
        for scope, expected in combos:
            rule = _rule(name=f"scope-{expected}", **scope)
            self.assertEqual(rule.specificity, expected, scope)

    def test_most_specific_rule_wins_over_every_broader_rule(self):
        _rule(name="global", rate=Decimal("1"))
        _rule(name="country", country="Sri Lanka", rate=Decimal("2"))
        _rule(name="casino+country", casino=self.casino, country="Sri Lanka", rate=Decimal("3"))
        _rule(name="affiliate+country", affiliate=self.affiliate, country="Sri Lanka", rate=Decimal("4"))
        winner = _rule(
            name="affiliate+casino+country", affiliate=self.affiliate,
            casino=self.casino, country="Sri Lanka", rate=Decimal("5"),
        )

        self.assertEqual(self._resolve(), winner)

    def test_falls_back_down_the_ladder_as_rules_are_removed(self):
        expected_order = []
        for name, scope in [
            ("affiliate+casino+country", {"affiliate": self.affiliate, "casino": self.casino, "country": "Sri Lanka"}),
            ("affiliate+country", {"affiliate": self.affiliate, "country": "Sri Lanka"}),
            ("casino+country", {"casino": self.casino, "country": "Sri Lanka"}),
            ("country", {"country": "Sri Lanka"}),
            ("global", {}),
        ]:
            expected_order.append(_rule(name=name, **scope))

        for rule in expected_order:
            self.assertEqual(self._resolve(), rule, f"expected {rule.name}")
            rule.delete()

        self.assertIsNone(self._resolve())

    def test_priority_only_breaks_ties_within_one_specificity_level(self):
        low = _rule(name="country-low", country="Sri Lanka", priority=0, rate=Decimal("2"))
        high = _rule(name="country-high", country="Sri Lanka", priority=99, rate=Decimal("3"))
        self.assertEqual(self._resolve(), high)

        # A far more specific rule with the lowest possible priority still wins.
        specific = _rule(
            name="affiliate-specific", affiliate=self.affiliate,
            casino=self.casino, country="Sri Lanka", priority=-100, rate=Decimal("9"),
        )
        self.assertEqual(self._resolve(), specific)
        self.assertNotEqual(self._resolve(), high)
        del low

    def test_another_affiliates_rule_never_matches(self):
        _rule(name="theirs", affiliate=self.other_affiliate, country="Sri Lanka", rate=Decimal("12"))
        self.assertIsNone(self._resolve())

    def test_a_rule_for_a_different_casino_never_matches(self):
        _rule(name="india-only", casino=self.other_casino, country="India")
        self.assertIsNone(self._resolve())

    def test_country_matching_is_case_insensitive(self):
        rule = _rule(name="lowercase", country="sri lanka")
        self.assertEqual(self._resolve(country="SRI LANKA"), rule)

    def test_inactive_rules_are_ignored(self):
        _rule(name="off", country="Sri Lanka", is_active=False)
        self.assertIsNone(self._resolve())

    def test_rules_outside_their_date_window_are_ignored(self):
        today = timezone.now().date()
        _rule(name="expired", country="Sri Lanka", end_date=today - timedelta(days=1))
        _rule(name="future", country="Sri Lanka", start_date=today + timedelta(days=1))
        self.assertIsNone(self._resolve())

        current = _rule(
            name="current", country="Sri Lanka",
            start_date=today - timedelta(days=1), end_date=today + timedelta(days=1),
        )
        self.assertEqual(self._resolve(), current)

    def test_commission_type_partitions_rules(self):
        _rule(name="deposit-rule", country="Sri Lanka", commission_type="deposit")
        self.assertIsNone(self._resolve(commission_type="rolling"))

    def test_explain_resolution_reports_why_each_rule_lost(self):
        _rule(name="theirs", affiliate=self.other_affiliate, country="Sri Lanka")
        winner = _rule(name="mine", affiliate=self.affiliate, country="Sri Lanka")

        report = commission_rule_service.explain_resolution(
            self.affiliate, commission_type="rolling", country="Sri Lanka", casino=self.casino,
        )

        self.assertEqual(report["selected_rule_id"], winner.id)
        rejected = next(r for r in report["candidates"] if r["name"] == "theirs")
        self.assertIn("different affiliate", rejected["excluded_because"])


class CommissionCalculationTests(APITestCase):
    def setUp(self):
        self.affiliate = User.objects.create_user(email="calc@example.com", password="pw12345!", name="Calc")
        AffiliateProfile.objects.create(user=self.affiliate, is_active=True)
        self.player = User.objects.create_user(
            email="p1@example.com", password="pw12345!", name="P1",
            referred_by=self.affiliate, country="Sri Lanka",
        )
        self.casino, _ = Casino.objects.get_or_create(
            country="Sri Lanka", name="Bellagio Casino", defaults={"is_active": True},
        )

    def test_percentage_rule_creates_a_qualified_ledger_entry_and_money_row(self):
        _rule(name="10pct", country="Sri Lanka", rate=Decimal("10"))

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-1",
        )

        self.assertTrue(result.applied)
        self.assertEqual(result.entry.status, "qualified")
        self.assertEqual(result.entry.commission_amount, Decimal("100.00"))
        self.assertEqual(result.entry.country, "Sri Lanka")
        self.assertEqual(result.entry.casino, self.casino)
        # The money row mirrors the plan engine's bookkeeping.
        self.assertIsNotNone(result.entry.referral_commission)
        self.assertEqual(result.entry.referral_commission.amount, Decimal("100.00"))
        self.affiliate.refresh_from_db()
        self.assertEqual(self.affiliate.affiliate_profile.total_earned, Decimal("100.00"))

    def test_fixed_amount_rule_ignores_the_base_amount(self):
        _rule(name="flat50", country="Sri Lanka", rate_type="fixed", fixed_amount=Decimal("50"))

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("999999"),
            casino_name="Bellagio Casino", reference_id="SLIP-FIXED",
        )

        self.assertEqual(result.entry.commission_amount, Decimal("50.00"))

    def test_max_commission_caps_the_payout(self):
        _rule(name="capped", country="Sri Lanka", rate=Decimal("50"), max_commission=Decimal("120"))

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-CAP",
        )

        self.assertEqual(result.entry.commission_amount, Decimal("120.00"))
        self.assertIn("Capped at max_commission", result.entry.calculation_trace)

    def test_below_minimum_qualifying_amount_produces_a_qualifying_entry_not_a_payout(self):
        _rule(name="min1000", country="Sri Lanka", rate=Decimal("10"),
              min_qualifying_amount=Decimal("1000"))

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("500"),
            casino_name="Bellagio Casino", reference_id="SLIP-MIN",
        )

        self.assertEqual(result.entry.status, "qualifying")
        self.assertEqual(result.entry.commission_amount, Decimal("0"))
        self.assertIsNone(result.entry.referral_commission)
        self.assertEqual(ReferralCommission.objects.count(), 0)

    def test_unmet_condition_blocks_payout_and_records_why(self):
        rule = _rule(name="needs-10-players", country="Sri Lanka", rate=Decimal("10"))
        CommissionCondition.objects.create(
            rule=rule, metric="referred_players", operator="gte", value=Decimal("10"),
            description="Minimum 10 referred players",
        )

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-COND",
        )

        self.assertEqual(result.entry.status, "qualifying")
        self.assertIn("Minimum 10 referred players", result.entry.qualification_reason)
        snapshot = result.entry.conditions_snapshot[0]
        self.assertFalse(snapshot["met"])
        self.assertEqual(snapshot["required"], "10.00")
        self.assertEqual(snapshot["actual"], "1")

    def test_met_condition_allows_payout(self):
        rule = _rule(name="needs-1-player", country="Sri Lanka", rate=Decimal("10"))
        CommissionCondition.objects.create(
            rule=rule, metric="referred_players", operator="gte", value=Decimal("1"),
        )

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-OK",
        )

        self.assertEqual(result.entry.status, "qualified")
        self.assertTrue(result.entry.conditions_snapshot[0]["met"])

    def test_tiered_rule_picks_the_band_matching_measured_performance(self):
        rule = _rule(name="tiered", country="Sri Lanka", rate_type="tiered")
        for name, lo, hi, rate in [
            ("Tier 1", 1, 10, "5"), ("Tier 2", 11, 25, "8"),
            ("Tier 3", 26, 50, "12"), ("Tier 4", 51, None, "15"),
        ]:
            CommissionTier.objects.create(
                rule=rule, name=name, metric="referred_players",
                min_value=Decimal(lo), max_value=Decimal(hi) if hi else None,
                rate=Decimal(rate), order=int(lo),
            )

        # One referred player so far → Tier 1 (5%).
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-T1",
        )
        self.assertEqual(result.entry.tier_name, "Tier 1")
        self.assertEqual(result.entry.commission_amount, Decimal("50.00"))

        # Grow to 12 referred players → Tier 2 (8%).
        for i in range(11):
            User.objects.create_user(
                email=f"extra{i}@example.com", password="pw12345!",
                referred_by=self.affiliate, country="Sri Lanka",
            )
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-T2",
        )
        self.assertEqual(result.entry.tier_name, "Tier 2")
        self.assertEqual(result.entry.commission_amount, Decimal("80.00"))

    def test_unbounded_top_tier_matches_any_high_value(self):
        rule = _rule(name="open-top", country="Sri Lanka", rate_type="tiered")
        CommissionTier.objects.create(
            rule=rule, name="Top", metric="referred_players",
            min_value=Decimal("1"), max_value=None, rate=Decimal("15"),
        )

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-TOP",
        )

        self.assertEqual(result.entry.tier_name, "Top")
        self.assertEqual(result.entry.commission_amount, Decimal("150.00"))

    def test_same_bet_slip_is_never_paid_twice(self):
        _rule(name="10pct", country="Sri Lanka", rate=Decimal("10"))
        kwargs = dict(
            commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-DUP",
        )

        commission_engine_service.evaluate(self.player, **kwargs)
        commission_engine_service.evaluate(self.player, **kwargs)

        self.assertEqual(CommissionLedgerEntry.objects.filter(reference_id="SLIP-DUP").count(), 1)
        self.assertEqual(ReferralCommission.objects.count(), 1)

    def test_no_matching_rule_reports_not_applied_so_the_caller_falls_through(self):
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-NONE",
        )

        self.assertFalse(result.applied)
        self.assertEqual(result.reason, "No matching commission rule.")
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)
        self.assertEqual(ReferralCommission.objects.count(), 0)

    def test_two_affiliates_in_the_same_casino_can_earn_different_rates(self):
        """The headline Part 33 requirement."""
        other_affiliate = User.objects.create_user(email="aff-b@example.com", password="pw12345!")
        AffiliateProfile.objects.create(user=other_affiliate, is_active=True)
        other_player = User.objects.create_user(
            email="p2@example.com", password="pw12345!",
            referred_by=other_affiliate, country="Sri Lanka",
        )

        _rule(name="A gets 10", affiliate=self.affiliate, casino=self.casino,
              country="Sri Lanka", rate=Decimal("10"))
        _rule(name="B gets 12", affiliate=other_affiliate, casino=self.casino,
              country="Sri Lanka", rate=Decimal("12"))

        a = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-A",
        )
        b = commission_engine_service.evaluate(
            other_player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-B",
        )

        self.assertEqual(a.entry.commission_amount, Decimal("100.00"))
        self.assertEqual(b.entry.commission_amount, Decimal("120.00"))

    def test_same_affiliate_earns_different_rates_in_different_countries(self):
        india_player = User.objects.create_user(
            email="p-in@example.com", password="pw12345!",
            referred_by=self.affiliate, country="India",
        )
        Casino.objects.get_or_create(country="India", name="Deltin Royale", defaults={"is_active": True})

        _rule(name="SL 10", affiliate=self.affiliate, country="Sri Lanka", rate=Decimal("10"))
        _rule(name="IN 7", affiliate=self.affiliate, country="India", rate=Decimal("7"))

        sl = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-SL",
        )
        india = commission_engine_service.evaluate(
            india_player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Deltin Royale", reference_id="SLIP-IN",
        )

        self.assertEqual(sl.entry.commission_amount, Decimal("100.00"))
        self.assertEqual(india.entry.commission_amount, Decimal("70.00"))

    def test_editing_a_rule_does_not_rewrite_history(self):
        rule = _rule(name="mutable", country="Sri Lanka", rate=Decimal("10"))
        first = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-BEFORE",
        )

        rule.rate = Decimal("20")
        rule.save()

        second = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-AFTER",
        )

        first.entry.refresh_from_db()
        self.assertEqual(first.entry.commission_rate, Decimal("10.000"))
        self.assertEqual(first.entry.commission_amount, Decimal("100.00"))
        self.assertEqual(second.entry.commission_amount, Decimal("200.00"))

    def test_deleting_a_rule_preserves_the_ledger_history(self):
        rule = _rule(name="doomed", country="Sri Lanka", rate=Decimal("10"))
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-KEEP",
        )
        entry_id = result.entry.id

        rule.delete()

        entry = CommissionLedgerEntry.objects.get(pk=entry_id)
        self.assertIsNone(entry.rule)
        self.assertEqual(entry.rule_name, "doomed")
        self.assertEqual(entry.commission_amount, Decimal("100.00"))

    def test_calculation_trace_is_recorded(self):
        _rule(name="traced", country="Sri Lanka", rate=Decimal("10"))
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-TRACE",
        )

        trace = result.entry.calculation_trace
        self.assertIn("Rule 'traced'", trace)
        self.assertIn("Rate 10.000% × base 1000 = ", trace)


class CommissionLayeringTests(APITestCase):
    """The promise that this engine is purely additive."""

    def setUp(self):
        self.affiliate = User.objects.create_user(email="legacy@example.com", password="pw12345!")
        AffiliateProfile.objects.create(user=self.affiliate, is_active=True, commission_rate=Decimal("10"))
        self.player = User.objects.create_user(
            email="legacy-p@example.com", password="pw12345!",
            referred_by=self.affiliate, country="Sri Lanka",
        )

    def test_affiliate_with_no_rules_is_untouched_by_the_engine(self):
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-LEGACY",
        )

        self.assertFalse(result.applied)
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)
        self.assertEqual(ReferralCommission.objects.count(), 0)
        self.affiliate.refresh_from_db()
        self.assertEqual(self.affiliate.affiliate_profile.total_earned, Decimal("0"))

    def test_player_without_a_referrer_is_a_no_op(self):
        orphan = User.objects.create_user(email="orphan@example.com", password="pw12345!", country="Sri Lanka")
        _rule(name="global", rate=Decimal("10"))

        result = commission_engine_service.evaluate(
            orphan, commission_type="rolling", base_amount=Decimal("1000"),
        )

        self.assertFalse(result.applied)
        self.assertEqual(result.reason, "Player has no referring affiliate.")


class CommissionApiSecurityTests(APITestCase):
    """Part 47 — the boundaries that keep commission configuration and other
    affiliates' earnings out of reach."""

    def setUp(self):
        self.admin = User.objects.create_superuser(email="cadmin@example.com", password="pw12345!")
        self.affiliate = User.objects.create_user(email="me@example.com", password="pw12345!")
        AffiliateProfile.objects.create(user=self.affiliate, is_active=True)
        self.rival = User.objects.create_user(email="rival@example.com", password="pw12345!")
        AffiliateProfile.objects.create(user=self.rival, is_active=True)
        self.player = User.objects.create_user(email="pl@example.com", password="pw12345!")

        self.entry = CommissionLedgerEntry.objects.create(
            affiliate=self.affiliate, commission_type="rolling",
            commission_amount=Decimal("100"), status="qualified", country="Sri Lanka",
        )
        self.rival_entry = CommissionLedgerEntry.objects.create(
            affiliate=self.rival, commission_type="rolling",
            commission_amount=Decimal("999"), status="qualified", country="India",
        )

    def test_normal_user_cannot_reach_any_admin_commission_endpoint(self):
        self.client.force_authenticate(self.player)
        for url in (
            "/api/admin-panel/commissions/dashboard/",
            "/api/admin-panel/commissions/rules/",
            "/api/admin-panel/commissions/ledger/",
            "/api/admin-panel/commissions/tiers/",
            "/api/admin-panel/commissions/conditions/",
        ):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN, url)

    def test_affiliate_cannot_create_or_modify_rules(self):
        self.client.force_authenticate(self.affiliate)
        create = self.client.post("/api/admin-panel/commissions/rules/", {
            "name": "Self-serve 99%", "commission_type": "rolling", "rate": "99",
        })
        self.assertEqual(create.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(CommissionRule.objects.filter(name="Self-serve 99%").exists())

    def test_affiliate_ledger_never_leaks_another_affiliates_entries(self):
        self.client.force_authenticate(self.affiliate)
        res = self.client.get("/api/affiliate/commissions/ledger/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(Decimal(res.data["results"][0]["commission_amount"]), Decimal("100.00"))

    def test_affiliate_summary_is_scoped_to_the_requesting_affiliate(self):
        self.client.force_authenticate(self.affiliate)
        res = self.client.get("/api/affiliate/commissions/summary/")

        self.assertEqual(Decimal(res.data["total_earned"]), Decimal("100.00"))

    def test_affiliate_serializer_hides_admin_only_internals(self):
        self.entry.calculation_trace = "secret internals"
        self.entry.admin_notes = "internal note"
        self.entry.save()
        self.client.force_authenticate(self.affiliate)

        row = self.client.get("/api/affiliate/commissions/ledger/").data["results"][0]

        for hidden in ("calculation_trace", "admin_notes", "rule", "rule_name", "reviewed_by"):
            self.assertNotIn(hidden, row)

    def test_non_affiliate_cannot_reach_affiliate_commission_endpoints(self):
        self.client.force_authenticate(self.player)
        for url in ("/api/affiliate/commissions/summary/", "/api/affiliate/commissions/ledger/"):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN, url)

    def test_commission_amount_cannot_be_edited_through_the_api(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch(
            f"/api/admin-panel/commissions/ledger/{self.entry.id}/",
            {"commission_amount": "999999", "admin_notes": "tweaked"},
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.commission_amount, Decimal("100"))
        self.assertEqual(self.entry.admin_notes, "tweaked")

    def test_status_cannot_skip_straight_to_paid(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            f"/api/admin-panel/commissions/ledger/{self.entry.id}/transition/", {"status": "paid"},
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, "qualified")

    def test_full_approval_chain_walks_qualified_to_paid(self):
        self.client.force_authenticate(self.admin)
        for step in ("approved", "payable", "paid"):
            res = self.client.post(
                f"/api/admin-panel/commissions/ledger/{self.entry.id}/transition/", {"status": step},
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK, f"{step}: {res.data}")

        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, "paid")
        self.assertIsNotNone(self.entry.approved_at)
        self.assertIsNotNone(self.entry.paid_at)

    def test_a_paid_commission_is_terminal(self):
        self.entry.status = "paid"
        self.entry.save()
        self.client.force_authenticate(self.admin)

        res = self.client.post(
            f"/api/admin-panel/commissions/ledger/{self.entry.id}/transition/", {"status": "cancelled"},
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_transitions_notify_the_affiliate(self):
        self.client.force_authenticate(self.admin)
        self.client.post(
            f"/api/admin-panel/commissions/ledger/{self.entry.id}/transition/", {"status": "approved"},
        )

        self.assertTrue(self.affiliate.notifications.filter(title="Commission approved").exists())

    def test_admin_can_duplicate_a_rule_with_its_tiers_and_conditions(self):
        rule = _rule(name="Template", country="Sri Lanka", rate_type="tiered")
        CommissionTier.objects.create(rule=rule, name="T1", min_value=Decimal("1"), rate=Decimal("5"))
        CommissionCondition.objects.create(rule=rule, metric="referred_players", value=Decimal("5"))
        self.client.force_authenticate(self.admin)

        res = self.client.post(f"/api/admin-panel/commissions/rules/{rule.id}/duplicate/")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        copy = CommissionRule.objects.get(name="Template (copy)")
        self.assertFalse(copy.is_active)  # copies start disabled
        self.assertEqual(copy.tiers.count(), 1)
        self.assertEqual(copy.conditions.count(), 1)
        self.assertEqual(rule.tiers.count(), 1)  # original untouched

    def test_rule_rejects_a_casino_country_mismatch(self):
        casino, _ = Casino.objects.get_or_create(
            country="Sri Lanka", name="Bellagio Casino", defaults={"is_active": True},
        )
        self.client.force_authenticate(self.admin)

        res = self.client.post("/api/admin-panel/commissions/rules/", {
            "name": "Mismatch", "commission_type": "rolling", "rate": "10",
            "country": "India", "casino": casino.id,
        })

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("casino", res.data)
