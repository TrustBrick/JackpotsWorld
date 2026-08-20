"""
authapp/tests_commission_rules.py
─────────────────────────────────────────────────────────────────────────────
Covers the Country+Casino+Tier commission engine: rule precedence (Part 34),
tiers (Part 32), conditions (Part 31), the calculation itself (Part 35), and
the guarantee that adding rules never disturbs the two older commission layers.
"""
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from authapp.models.affiliate_models import AffiliateProfile, ReferralCommission
from authapp.models.casino_models import Casino
from authapp.models.commission_rule_models import (
    CommissionCondition, CommissionLedgerEntry, CommissionRule, CommissionTier,
)
from authapp.models.offline_deposit import OfflineDepositLog
from authapp.models.super_admin_models import AdminWallet
from authapp.models.user_model import User
from authapp.models.wallet_request_models import DepositRequest
from authapp.services import commission_engine_service, commission_rule_service
from authapp.services.wallet_request_service import admin_approve_deposit


# Two representations of the same country, deliberately kept apart because the
# schema keeps them apart: CommissionRule.country and Casino.country hold the
# name, User.country is a 2-char ISO-3166 alpha-2 column. The engine matches
# rules on the name, so the name is what a caller has to supply -- which is
# exactly what the admin deposit views pass. Writing a name into User.country
# would not fit the column, and matching on the code would find no rule.
SRI_LANKA, SRI_LANKA_ISO = "Sri Lanka", "LK"
INDIA, INDIA_ISO = "India", "IN"


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
            referred_by=self.affiliate, country="LK",
        )
        self.casino, _ = Casino.objects.get_or_create(
            country="Sri Lanka", name="Bellagio Casino", defaults={"is_active": True},
        )

    def test_percentage_rule_creates_a_qualified_ledger_entry_and_money_row(self):
        _rule(name="10pct", country="Sri Lanka", rate=Decimal("10"))

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-1",
            country=SRI_LANKA,
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
            country=SRI_LANKA,
        )

        self.assertEqual(result.entry.commission_amount, Decimal("50.00"))

    def test_max_commission_caps_the_payout(self):
        _rule(name="capped", country="Sri Lanka", rate=Decimal("50"), max_commission=Decimal("120"))

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-CAP",
            country=SRI_LANKA,
        )

        self.assertEqual(result.entry.commission_amount, Decimal("120.00"))
        self.assertIn("Capped at max_commission", result.entry.calculation_trace)

    def test_below_minimum_qualifying_amount_produces_a_qualifying_entry_not_a_payout(self):
        _rule(name="min1000", country="Sri Lanka", rate=Decimal("10"),
              min_qualifying_amount=Decimal("1000"))

        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("500"),
            casino_name="Bellagio Casino", reference_id="SLIP-MIN",
            country=SRI_LANKA,
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
            country=SRI_LANKA,
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
            country=SRI_LANKA,
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
            country=SRI_LANKA,
        )
        self.assertEqual(result.entry.tier_name, "Tier 1")
        self.assertEqual(result.entry.commission_amount, Decimal("50.00"))

        # Grow to 12 referred players → Tier 2 (8%).
        for i in range(11):
            User.objects.create_user(
                email=f"extra{i}@example.com", password="pw12345!",
                referred_by=self.affiliate, country="LK",
            )
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-T2",
            country=SRI_LANKA,
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
            country=SRI_LANKA,
        )

        self.assertEqual(result.entry.tier_name, "Top")
        self.assertEqual(result.entry.commission_amount, Decimal("150.00"))

    def test_same_bet_slip_is_never_paid_twice(self):
        _rule(name="10pct", country="Sri Lanka", rate=Decimal("10"))
        kwargs = dict(
            commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-DUP",
            country=SRI_LANKA,
        )

        commission_engine_service.evaluate(self.player, **kwargs)
        commission_engine_service.evaluate(self.player, **kwargs)

        self.assertEqual(CommissionLedgerEntry.objects.filter(reference_id="SLIP-DUP").count(), 1)
        self.assertEqual(ReferralCommission.objects.count(), 1)

    def test_a_repeated_bet_slip_reports_applied_so_the_caller_does_not_fall_through(self):
        """The second attempt is a no-op, but it must not look like "no rule
        matched" -- that is the signal the caller uses to pay via the older
        per-affiliate plan, which would reintroduce the double payment by
        another route."""
        _rule(name="10pct", country="Sri Lanka", rate=Decimal("10"))
        kwargs = dict(
            commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-REPEAT",
            country=SRI_LANKA,
        )

        commission_engine_service.evaluate(self.player, **kwargs)
        second = commission_engine_service.evaluate(self.player, **kwargs)

        self.assertTrue(second.applied)
        self.assertEqual(second.reason, "Already processed.")

    def test_entries_without_a_reference_are_exempt_from_the_uniqueness_rule(self):
        """Losing commissions carry no bet slip. They store NULL, not "",
        precisely so any number of them can coexist -- if they collided, the
        constraint would block legitimate repeat payouts. (Deposit entries do
        carry a reference, deliberately: see deposit_reference().)"""
        _rule(name="10pct", country="Sri Lanka", rate=Decimal("10"), commission_type="losing")

        for _ in range(3):
            commission_engine_service.evaluate(
                self.player, commission_type="losing", base_amount=Decimal("1000"),
                casino_name="Bellagio Casino", country=SRI_LANKA,
            )

        entries = CommissionLedgerEntry.objects.filter(commission_type="losing")
        self.assertEqual(entries.count(), 3)
        # NULL, not "" -- the blank string would collide on the second row.
        self.assertEqual(entries.filter(reference_id__isnull=True).count(), 3)

    def test_an_unqualified_losing_row_is_refreshed_rather_than_duplicated(self):
        """Open rows carry no money, so re-evaluating one must advance it, not
        stack another beside it. Before this, a losing rule whose minimum was
        not yet reached left one dead zero-value row per recorded loss."""
        _rule(name="10pct over 2500", country="Sri Lanka", rate=Decimal("10"),
              commission_type="losing", min_qualifying_amount=Decimal("2500"))

        for base in (Decimal("1000"), Decimal("1800"), Decimal("2400")):
            commission_engine_service.evaluate(
                self.player, commission_type="losing", base_amount=base,
                casino_name="Bellagio Casino", country=SRI_LANKA,
            )

        entry = CommissionLedgerEntry.objects.get(commission_type="losing")
        self.assertEqual(entry.status, "qualifying")
        self.assertEqual(entry.base_amount, Decimal("2400.00"))
        self.assertEqual(ReferralCommission.objects.count(), 0)

        # Crossing the minimum settles that same row into a real commission.
        commission_engine_service.evaluate(
            self.player, commission_type="losing", base_amount=Decimal("3000"),
            casino_name="Bellagio Casino", country=SRI_LANKA,
        )

        self.assertEqual(CommissionLedgerEntry.objects.filter(commission_type="losing").count(), 1)
        entry.refresh_from_db()
        self.assertEqual(entry.status, "qualified")
        self.assertEqual(entry.commission_amount, Decimal("300.00"))
        self.assertEqual(ReferralCommission.objects.count(), 1)

        # ...and the next real loss is a genuinely new award, so it gets its
        # own row rather than overwriting the settled one.
        commission_engine_service.evaluate(
            self.player, commission_type="losing", base_amount=Decimal("4000"),
            casino_name="Bellagio Casino", country=SRI_LANKA,
        )

        self.assertEqual(CommissionLedgerEntry.objects.filter(commission_type="losing").count(), 2)
        self.assertEqual(ReferralCommission.objects.count(), 2)

    def test_no_matching_rule_reports_not_applied_so_the_caller_falls_through(self):
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-NONE",
            country=SRI_LANKA,
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
            referred_by=other_affiliate, country="LK",
        )

        _rule(name="A gets 10", affiliate=self.affiliate, casino=self.casino,
              country="Sri Lanka", rate=Decimal("10"))
        _rule(name="B gets 12", affiliate=other_affiliate, casino=self.casino,
              country="Sri Lanka", rate=Decimal("12"))

        a = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-A",
            country=SRI_LANKA,
        )
        b = commission_engine_service.evaluate(
            other_player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-B",
            country=SRI_LANKA,
        )

        self.assertEqual(a.entry.commission_amount, Decimal("100.00"))
        self.assertEqual(b.entry.commission_amount, Decimal("120.00"))

    def test_same_affiliate_earns_different_rates_in_different_countries(self):
        india_player = User.objects.create_user(
            email="p-in@example.com", password="pw12345!",
            referred_by=self.affiliate, country="IN",
        )
        Casino.objects.get_or_create(country="India", name="Deltin Royale", defaults={"is_active": True})

        _rule(name="SL 10", affiliate=self.affiliate, country="Sri Lanka", rate=Decimal("10"))
        _rule(name="IN 7", affiliate=self.affiliate, country="India", rate=Decimal("7"))

        sl = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-SL",
            country=SRI_LANKA,
        )
        india = commission_engine_service.evaluate(
            india_player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Deltin Royale", reference_id="SLIP-IN",
            country=INDIA,
        )

        self.assertEqual(sl.entry.commission_amount, Decimal("100.00"))
        self.assertEqual(india.entry.commission_amount, Decimal("70.00"))

    def test_editing_a_rule_does_not_rewrite_history(self):
        rule = _rule(name="mutable", country="Sri Lanka", rate=Decimal("10"))
        first = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-BEFORE",
            country=SRI_LANKA,
        )

        rule.rate = Decimal("20")
        rule.save()

        second = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-AFTER",
            country=SRI_LANKA,
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
            country=SRI_LANKA,
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
            country=SRI_LANKA,
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
            referred_by=self.affiliate, country="LK",
        )

    def test_affiliate_with_no_rules_is_untouched_by_the_engine(self):
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id="SLIP-LEGACY",
            country=SRI_LANKA,
        )

        self.assertFalse(result.applied)
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)
        self.assertEqual(ReferralCommission.objects.count(), 0)
        self.affiliate.refresh_from_db()
        self.assertEqual(self.affiliate.affiliate_profile.total_earned, Decimal("0"))

    def test_player_without_a_referrer_is_a_no_op(self):
        orphan = User.objects.create_user(email="orphan@example.com", password="pw12345!", country="LK")
        _rule(name="global", rate=Decimal("10"))

        result = commission_engine_service.evaluate(
            orphan, commission_type="rolling", base_amount=Decimal("1000"),
        )

        self.assertFalse(result.applied)
        self.assertEqual(result.reason, "Player has no referring affiliate.")


class CommissionCountryResolutionTests(APITestCase):
    """The country a rule is matched on comes from the caller, not the player.

    admin_offline_deposit_views records a country against every cash and
    rolling entry and hands it to the engine. The rolling branch used to omit
    it, leaving evaluate() to fall back to User.country -- an ISO-3166 alpha-2
    code, against CommissionRule.country's name. "LK" never equals
    "Sri Lanka", so every country-scoped rule silently failed to match and the
    payout fell through to the older per-affiliate plan. These tests pin the
    contract that fix depends on: the name matches, the code does not, and the
    scopes that never involved a country are unaffected either way.
    """

    def setUp(self):
        self.affiliate = User.objects.create_user(email="cr@example.com", password="pw12345!", name="CR")
        AffiliateProfile.objects.create(user=self.affiliate, is_active=True)
        self.player = User.objects.create_user(
            email="cr-p@example.com", password="pw12345!", name="CRP",
            referred_by=self.affiliate, country=SRI_LANKA_ISO,
        )
        self.casino, _ = Casino.objects.get_or_create(
            country=SRI_LANKA, name="Bellagio Casino", defaults={"is_active": True},
        )

    def _rolling(self, reference_id, **kwargs):
        """The rolling call exactly as admin_offline_deposit_views now makes
        it -- country included."""
        return commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            casino_name="Bellagio Casino", reference_id=reference_id, **kwargs,
        )

    def test_country_scoped_rule_matches_when_the_caller_supplies_the_name(self):
        rule = _rule(name="SL 10", country=SRI_LANKA, rate=Decimal("10"))

        result = self._rolling("SLIP-CR-1", country=SRI_LANKA)

        self.assertTrue(result.applied, result.reason)
        self.assertEqual(result.entry.rule, rule)
        self.assertEqual(result.entry.commission_amount, Decimal("100.00"))
        self.assertEqual(result.entry.country, SRI_LANKA)

    def test_country_and_casino_scoped_rule_matches(self):
        _rule(name="SL only", country=SRI_LANKA, rate=Decimal("10"))
        specific = _rule(
            name="SL + Bellagio", country=SRI_LANKA, casino=self.casino, rate=Decimal("15"),
        )

        result = self._rolling("SLIP-CR-2", country=SRI_LANKA)

        self.assertTrue(result.applied, result.reason)
        # casino+country (specificity 3) outranks country alone (1).
        self.assertEqual(result.entry.rule, specific)
        self.assertEqual(result.entry.commission_amount, Decimal("150.00"))

    def test_a_rule_for_another_country_never_matches(self):
        _rule(name="IN 7", country=INDIA, rate=Decimal("7"))

        result = self._rolling("SLIP-CR-3", country=SRI_LANKA)

        self.assertFalse(result.applied)
        self.assertEqual(result.reason, "No matching commission rule.")
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)

    def test_iso_code_from_the_player_record_matches_nothing(self):
        """The bug itself, pinned so it cannot come back.

        Passing the player's own country -- an ISO code -- is what the rolling
        branch effectively did by omitting the argument. It must not match a
        rule stored under the country's name.
        """
        _rule(name="SL 10", country=SRI_LANKA, rate=Decimal("10"))

        by_code = self._rolling("SLIP-CR-4", country=self.player.country)
        self.assertEqual(self.player.country, SRI_LANKA_ISO)
        self.assertFalse(by_code.applied)

        # Same rule, same player, same casino -- only the representation differs.
        by_name = self._rolling("SLIP-CR-5", country=SRI_LANKA)
        self.assertTrue(by_name.applied, by_name.reason)

    def test_omitting_country_falls_back_to_the_player_and_still_misses(self):
        """Regression guard for the call site: a caller that forgets `country`
        gets the old broken behaviour, which is why the argument is passed
        explicitly rather than left to the fallback."""
        _rule(name="SL 10", country=SRI_LANKA, rate=Decimal("10"))

        result = self._rolling("SLIP-CR-6")

        self.assertFalse(result.applied)

    def test_scopes_without_a_country_are_unaffected(self):
        """Global, affiliate-only and casino-only rules never involved a
        country, so they matched before the fix and must still match now --
        with or without a country in the context."""
        for reference_id, kwargs in (("SLIP-CR-7", {"country": SRI_LANKA}), ("SLIP-CR-8", {})):
            with self.subTest(reference_id=reference_id):
                CommissionLedgerEntry.objects.all().delete()
                CommissionRule.objects.all().delete()
                _rule(name="global", rate=Decimal("5"))

                result = self._rolling(reference_id, **kwargs)

                self.assertTrue(result.applied, result.reason)
                self.assertEqual(result.entry.commission_amount, Decimal("50.00"))

    def test_affiliate_scoped_rule_still_matches_without_a_country(self):
        rule = _rule(name="aff only", affiliate=self.affiliate, rate=Decimal("8"))

        result = self._rolling("SLIP-CR-9")

        self.assertTrue(result.applied, result.reason)
        self.assertEqual(result.entry.rule, rule)


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


class DepositCommissionTriggerTests(APITestCase):
    """The Deposit Commission branch, end to end through the real admin
    endpoints.

    Deposit was the one commission_type the rule engine could calculate but
    nothing ever asked it to: the offline deposit view only ever called
    evaluate() with "rolling" (bet slip) and "losing" (LAC), and the online
    deposit-approval service called nothing at all. A Back Office rule of type
    "Deposit Commission" was therefore configurable, visibly saved, and dead --
    its ledger stayed empty no matter how much the referred player deposited.
    These tests drive the two deposit paths and the bet-slip path that can
    finally satisfy a gated deposit rule, and pin the one-per-player rule that
    keeps a cumulative base from being priced twice.
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            email="dep-admin@example.com", password="pw12345!", name="Admin",
            is_staff=True, is_superuser=True,
        )
        self.affiliate = User.objects.create_user(
            email="dep-aff@example.com", password="pw12345!", name="Dep Aff",
        )
        AffiliateProfile.objects.create(user=self.affiliate, is_active=True)
        self.player = User.objects.create_user(
            email="dep-player@example.com", password="pw12345!", name="Dep Player",
            referred_by=self.affiliate, country=SRI_LANKA_ISO,
        )
        self.casino, _ = Casino.objects.get_or_create(
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

    # ── helpers driving the real endpoints ───────────────────────────────────

    def _offline(self, **payload):
        payload.setdefault("user_id", self.player.id)
        return self.client.post("/api/admin-panel/deposits/offline/", payload, format="json")

    def _fund_main(self, amount):
        response = self._offline(transaction_type="DMA", wallet_type="C", amount=str(amount))
        self.assertEqual(response.status_code, 200, response.data)

    def _deposit_at_casino(self, amount):
        """DMA into the main wallet, then DAC it into the casino -- the exact
        two-step an admin performs to record an offline deposit."""
        self._fund_main(amount)
        response = self._offline(
            transaction_type="DAC", wallet_type="C", amount=str(amount),
            casino_name="Bellagio Casino", country=SRI_LANKA,
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response

    def _bet_slip(self, slip_number, bet_amount):
        response = self._offline(
            type="rolling_points", casino_name="Bellagio Casino", country=SRI_LANKA,
            slip_number=slip_number, total_bets=1, total_bet_amount=str(bet_amount),
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response

    def _deposit_entries(self):
        return CommissionLedgerEntry.objects.filter(
            affiliate=self.affiliate, commission_type="deposit",
        )

    # ── the reported failure ────────────────────────────────────────────────

    def test_recorded_deposit_produces_a_deposit_commission_ledger_entry(self):
        rule = _rule(
            name="Aff deposit 10%", affiliate=self.affiliate,
            commission_type="deposit", rate=Decimal("10"),
        )

        self._deposit_at_casino(Decimal("10000"))

        entry = self._deposit_entries().get()
        self.assertEqual(entry.rule, rule)
        self.assertEqual(entry.status, "qualified")
        self.assertEqual(entry.base_amount, Decimal("10000.00"))
        self.assertEqual(entry.commission_rate, Decimal("10.000"))
        self.assertEqual(entry.commission_amount, Decimal("1000.00"))
        self.assertEqual(entry.referred_player, self.player)
        self.assertEqual(entry.country, SRI_LANKA)
        self.assertEqual(entry.casino, self.casino)

        # And the money row the affiliate dashboard reads from.
        commission = entry.referral_commission
        self.assertIsNotNone(commission)
        self.assertEqual(commission.commission_type, "deposit")
        self.assertEqual(commission.amount, Decimal("1000.00"))
        self.assertEqual(commission.status, "pending")
        self.affiliate.refresh_from_db()
        self.assertEqual(self.affiliate.affiliate_profile.total_earned, Decimal("1000.00"))

    def test_an_approved_online_deposit_request_also_triggers_it(self):
        """get_deposit_totals() counts approved DepositRequests as well as
        offline DAC entries, so both have to reach the engine or the base
        amount and the trigger would disagree."""
        rule = _rule(
            name="Aff deposit 10%", affiliate=self.affiliate,
            commission_type="deposit", rate=Decimal("10"),
        )
        request_obj = DepositRequest.objects.create(
            user=self.player, amount=Decimal("4000"), status="pending",
        )

        admin_approve_deposit(request_obj=request_obj, actor=self.admin)

        entry = self._deposit_entries().get()
        self.assertEqual(entry.rule, rule)
        self.assertEqual(entry.base_amount, Decimal("4000.00"))
        self.assertEqual(entry.commission_amount, Decimal("400.00"))

    # ── one-per-player / duplicate protection ───────────────────────────────

    def test_a_second_deposit_never_awards_the_commission_again(self):
        """The base is the player's *cumulative* deposit total, so a second
        entry would pay a second time on money the first already covered."""
        _rule(
            name="Aff deposit 10%", affiliate=self.affiliate,
            commission_type="deposit", rate=Decimal("10"),
        )

        self._deposit_at_casino(Decimal("10000"))
        self._deposit_at_casino(Decimal("7000"))
        self._deposit_at_casino(Decimal("3000"))

        self.assertEqual(self._deposit_entries().count(), 1)
        self.assertEqual(
            ReferralCommission.objects.filter(commission_type="deposit").count(), 1,
        )
        entry = self._deposit_entries().get()
        self.assertEqual(entry.commission_amount, Decimal("1000.00"))
        self.affiliate.refresh_from_db()
        self.assertEqual(self.affiliate.affiliate_profile.total_earned, Decimal("1000.00"))

    def test_repeated_evaluation_of_an_awarded_deposit_is_an_applied_no_op(self):
        """applied=False is the signal a caller uses to fall through to the
        older engines. A no-op must not look like "no rule matched", or the
        same deposit gets paid again by another route."""
        _rule(
            name="Aff deposit 10%", affiliate=self.affiliate,
            commission_type="deposit", rate=Decimal("10"),
        )
        self._deposit_at_casino(Decimal("10000"))

        repeat = commission_engine_service.evaluate(
            self.player, commission_type="deposit",
            casino_name="Bellagio Casino", country=SRI_LANKA,
        )

        self.assertTrue(repeat.applied)
        self.assertEqual(repeat.reason, "Deposit commission already awarded for this player.")
        self.assertEqual(self._deposit_entries().count(), 1)

    def test_the_uniqueness_constraint_backs_the_one_per_player_rule(self):
        """The read-then-write check in evaluate() can be raced; the database
        constraint cannot. Deposit entries carry a deterministic reference so
        the constraint applies to them, unlike the reference-less losing rows.
        """
        _rule(
            name="Aff deposit 10%", affiliate=self.affiliate,
            commission_type="deposit", rate=Decimal("10"),
        )
        self._deposit_at_casino(Decimal("10000"))
        entry = self._deposit_entries().get()
        self.assertEqual(
            entry.reference_id,
            commission_engine_service.deposit_reference(self.player),
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CommissionLedgerEntry.objects.create(
                    affiliate=self.affiliate, referred_player=self.player,
                    commission_type="deposit", reference_id=entry.reference_id,
                )

    def test_an_admin_rejected_deposit_commission_is_not_resurrected(self):
        _rule(
            name="Aff deposit 10%", affiliate=self.affiliate,
            commission_type="deposit", rate=Decimal("10"),
        )
        self._deposit_at_casino(Decimal("10000"))
        entry = self._deposit_entries().get()
        entry.status = "rejected"
        entry.save(update_fields=["status"])

        self._deposit_at_casino(Decimal("5000"))

        self.assertEqual(self._deposit_entries().count(), 1)
        entry.refresh_from_db()
        self.assertEqual(entry.status, "rejected")

    # ── condition-gated deposit rules ───────────────────────────────────────

    def test_a_gated_rule_opens_one_row_and_qualifies_it_in_place(self):
        """A deposit rule gated on wagering can only be satisfied by a bet
        slip, so the deposit event opens a "qualifying" row and the bet slip
        completes it -- one row that moves through the flow, not two rows."""
        rule = _rule(
            name="Aff deposit 10% after 5k wagered", affiliate=self.affiliate,
            commission_type="deposit", rate=Decimal("10"),
        )
        CommissionCondition.objects.create(
            rule=rule, metric="betting_amount", operator="gte", value=Decimal("5000"),
        )

        self._deposit_at_casino(Decimal("10000"))

        entry = self._deposit_entries().get()
        self.assertEqual(entry.status, "qualifying")
        self.assertEqual(entry.commission_amount, Decimal("0.00"))
        self.assertIn("Conditions not yet met", entry.qualification_reason)
        self.assertEqual(ReferralCommission.objects.filter(commission_type="deposit").count(), 0)
        opened_at = entry.created_at

        self._bet_slip("SLIP-GATE-1", Decimal("2000"))
        entry.refresh_from_db()
        self.assertEqual(self._deposit_entries().count(), 1)
        self.assertEqual(entry.status, "qualifying")

        self._bet_slip("SLIP-GATE-2", Decimal("4000"))

        self.assertEqual(self._deposit_entries().count(), 1)
        entry.refresh_from_db()
        self.assertEqual(entry.status, "qualified")
        self.assertEqual(entry.commission_amount, Decimal("1000.00"))
        self.assertEqual(entry.created_at, opened_at)
        self.assertIsNotNone(entry.referral_commission)
        self.assertEqual(ReferralCommission.objects.filter(commission_type="deposit").count(), 1)

    def test_min_qualifying_amount_holds_the_row_open_until_deposits_reach_it(self):
        _rule(
            name="Aff deposit 10% over 15k", affiliate=self.affiliate,
            commission_type="deposit", rate=Decimal("10"),
            min_qualifying_amount=Decimal("15000"),
        )

        self._deposit_at_casino(Decimal("10000"))
        entry = self._deposit_entries().get()
        self.assertEqual(entry.status, "qualifying")
        self.assertEqual(entry.base_amount, Decimal("10000.00"))

        self._deposit_at_casino(Decimal("8000"))

        self.assertEqual(self._deposit_entries().count(), 1)
        entry.refresh_from_db()
        self.assertEqual(entry.status, "qualified")
        self.assertEqual(entry.base_amount, Decimal("18000.00"))
        self.assertEqual(entry.commission_amount, Decimal("1800.00"))

    # ── the additive guarantee ──────────────────────────────────────────────

    def test_an_affiliate_with_no_deposit_rule_is_completely_unaffected(self):
        """The whole point of the layering: wiring a new trigger must not
        change what anyone earns until an admin creates a rule that matches."""
        _rule(
            name="Aff rolling 5%", affiliate=self.affiliate,
            commission_type="rolling", rate=Decimal("5"),
        )

        self._deposit_at_casino(Decimal("10000"))

        self.assertEqual(self._deposit_entries().count(), 0)
        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)
        self.assertEqual(ReferralCommission.objects.count(), 0)

        # ...and the rolling rule still pays on the bet slip exactly as before.
        self._bet_slip("SLIP-ADDITIVE", Decimal("1000"))
        rolling = CommissionLedgerEntry.objects.get(commission_type="rolling")
        self.assertEqual(rolling.commission_amount, Decimal("50.00"))

    def test_a_deposit_by_a_player_with_no_referrer_is_a_no_op(self):
        _rule(name="global deposit", commission_type="deposit", rate=Decimal("10"))
        self.player.referred_by = None
        self.player.save(update_fields=["referred_by"])

        self._deposit_at_casino(Decimal("10000"))

        self.assertEqual(CommissionLedgerEntry.objects.count(), 0)


class DepositCommissionVisibilityTests(APITestCase):
    """The ledger is only fixed if both audiences can actually see the entry
    it produced -- the Back Office searching by the affiliate's code, and the
    affiliate themselves."""

    def setUp(self):
        self.admin = User.objects.create_user(
            email="vis-admin@example.com", password="pw12345!", is_staff=True, is_superuser=True,
        )
        self.affiliate = User.objects.create_user(
            email="vis-aff@example.com", password="pw12345!", name="Vis Aff",
        )
        AffiliateProfile.objects.create(user=self.affiliate, is_active=True)
        self.affiliate_code = self.affiliate.user_uid
        self.player = User.objects.create_user(
            email="vis-player@example.com", password="pw12345!",
            referred_by=self.affiliate, country=SRI_LANKA_ISO,
        )
        _rule(
            name="Vis deposit 10%", affiliate=self.affiliate,
            commission_type="deposit", rate=Decimal("10"),
        )
        request_obj = DepositRequest.objects.create(
            user=self.player, amount=Decimal("6000"), status="pending",
        )
        admin_approve_deposit(request_obj=request_obj, actor=self.admin)

    def test_back_office_ledger_finds_it_by_affiliate_code(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            "/api/admin-panel/commissions/ledger/", {"search": self.affiliate_code},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["affiliate_uid"], self.affiliate_code)
        self.assertEqual(row["commission_type"], "deposit")
        self.assertEqual(Decimal(row["commission_amount"]), Decimal("600.00"))
        self.assertEqual(row["status"], "qualified")

    def test_the_affiliate_sees_the_same_entry_on_their_own_ledger(self):
        self.client.force_authenticate(self.affiliate)

        response = self.client.get("/api/affiliate/commissions/ledger/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["commission_type"], "deposit")
        self.assertEqual(Decimal(row["commission_amount"]), Decimal("600.00"))
        self.assertEqual(row["reference_id"], commission_engine_service.deposit_reference(self.player))
        # Rule internals stay out of the affiliate-facing payload (Part 40).
        self.assertNotIn("rule_name", row)
        self.assertNotIn("calculation_trace", row)

    def test_the_affiliate_summary_counts_it(self):
        self.client.force_authenticate(self.affiliate)

        response = self.client.get("/api/affiliate/commissions/summary/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data["total_earned"]), Decimal("600.00"))
        self.assertEqual(response.data["statuses"]["qualified"]["count"], 1)
