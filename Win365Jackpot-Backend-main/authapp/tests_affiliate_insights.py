"""
Affiliate insights and per-game referral attribution.

Two things are being proved here, and they are related:

  1. EVERY FIGURE COMES FROM A ROW. Each test creates real referrals and real
     commission rows and then asserts the number the affiliate would actually
     see. Where the data does not exist — no attributed game, no tiered rule —
     the payload says so with a null rather than a plausible-looking value.

  2. GAME ATTRIBUTION IS ABOUT ACTIVITY, NOT MARKETING. A referral link can
     name a game (AffiliateClickLog.game), but commission is attributed to the
     game the player's qualifying activity actually happened in. A player
     referred through a poker link who then plays Andhar Bahar generates Andhar
     Bahar commission, and the tests below hold that line.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from authapp.constants.games import GAME_ANDHAR_BAHAR, GAME_POKER, GAME_TEEN_PATTI, normalise_game
from authapp.models.affiliate_models import (
    AffiliateClickLog,
    AffiliateProfile,
    ReferralCommission,
)
from authapp.models.casino_models import Casino
from authapp.models.commission_rule_models import CommissionLedgerEntry, CommissionRule
from authapp.services import affiliate_dashboard_service, commission_engine_service

User = get_user_model()


class AffiliateInsightsTestBase(TestCase):
    def setUp(self):
        self.affiliate = User.objects.create_user(
            email="ins-aff@example.com", password="pw12345!", name="Affiliate",
        )
        self.profile = AffiliateProfile.objects.create(
            user=self.affiliate, is_active=True, commission_rate=Decimal("10.00"),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.affiliate)

    def refer(self, email, *, country="India", active=True, logged_in=True):
        user = User.objects.create_user(email=email, password="pw12345!", name=email.split("@")[0])
        user.referred_by = self.affiliate
        user.country = country
        user.is_active = active
        if logged_in:
            user.last_login = timezone.now()
        user.save()
        return user

    def commission(self, player, amount, *, game="", status="pending", commission_type="rolling"):
        return ReferralCommission.objects.create(
            affiliate=self.affiliate, referred_user=player,
            deposit_amount=Decimal("100"), commission_rate=Decimal("10"),
            amount=Decimal(str(amount)), status=status,
            commission_type=commission_type, game=game,
        )

    def insights(self):
        res = self.client.get("/api/affiliate/insights/")
        self.assertEqual(res.status_code, 200, res.content[:400])
        return res.data


class ReferralMetricTests(AffiliateInsightsTestBase):
    def test_counts_and_conversion_come_from_real_rows(self):
        a = self.refer("ins-p1@example.com")
        self.refer("ins-p2@example.com")
        self.refer("ins-p3@example.com")
        # Only one of the three has qualifying activity.
        self.commission(a, 25)

        data = self.insights()["referrals"]
        self.assertEqual(data["total_referrals"], 3)
        self.assertEqual(data["qualified_players"], 1)
        self.assertEqual(data["conversion_rate"], 33.3)

    def test_conversion_rate_with_no_referrals_is_zero_not_nan(self):
        data = self.insights()["referrals"]
        self.assertEqual(data["total_referrals"], 0)
        self.assertEqual(data["conversion_rate"], 0.0)
        self.assertIsInstance(data["conversion_rate"], float)

    def test_active_means_recently_seen_not_merely_not_banned(self):
        """The old "Active Referrals" card read User.is_active, which is an
        ACCOUNT state — it counted every player who had not been banned, which
        was ~all of them. Active here is a recency window."""
        self.refer("ins-recent@example.com", logged_in=True)
        stale = self.refer("ins-stale@example.com", logged_in=True)
        User.objects.filter(pk=stale.pk).update(
            last_login=timezone.now() - timezone.timedelta(days=120),
        )
        self.refer("ins-never@example.com", logged_in=False)

        data = self.insights()["referrals"]
        self.assertEqual(data["total_referrals"], 3)
        self.assertEqual(data["active_referrals"], 1)

    def test_funnel_buckets_sum_to_the_total(self):
        for i in range(4):
            self.refer(f"ins-f{i}@example.com")
        player = User.objects.filter(referred_by=self.affiliate).first()
        self.commission(player, 10)

        d = self.insights()["referrals"]
        self.assertEqual(
            d["registered_only"] + d["deposit_players"] + d["qualified_players"],
            d["total_referrals"],
        )


class EarningsTests(AffiliateInsightsTestBase):
    def test_lifetime_is_pending_plus_paid_and_excludes_rejected(self):
        p = self.refer("ins-e1@example.com")
        self.commission(p, 100, status="pending")
        self.commission(p, 50, status="paid")
        self.commission(p, 999, status="rejected")

        d = self.insights()["earnings"]
        self.assertEqual(d["pending_earnings"], 100.0)
        self.assertEqual(d["paid_earnings"], 50.0)
        self.assertEqual(d["total_earnings"], 150.0)
        # Reported, but never counted as earnings — it was reviewed and
        # declined.
        self.assertEqual(d["rejected_earnings"], 999.0)


class PerGameTests(AffiliateInsightsTestBase):
    def test_every_supported_game_appears_even_with_no_activity(self):
        d = self.insights()["by_game"]
        self.assertEqual(
            {g["game"] for g in d["games"]},
            {GAME_POKER, GAME_TEEN_PATTI, GAME_ANDHAR_BAHAR},
        )
        for g in d["games"]:
            self.assertEqual(g["total"], 0.0)

    def test_top_game_is_null_until_there_is_attributed_activity(self):
        """No fabricated winner. A dashboard that names a top game before any
        game has earned anything is inventing one."""
        p = self.refer("ins-g0@example.com")
        # Attributed to nothing — the shape every pre-existing commission has.
        self.commission(p, 500, game="")

        d = self.insights()["by_game"]
        self.assertIsNone(d["top_game"])
        self.assertEqual(d["unattributed"]["total"], 500.0)

    def test_top_game_is_the_one_that_actually_earned_most(self):
        p = self.refer("ins-g1@example.com")
        self.commission(p, 30, game=GAME_POKER)
        self.commission(p, 120, game=GAME_ANDHAR_BAHAR)
        self.commission(p, 45, game=GAME_TEEN_PATTI)

        d = self.insights()["by_game"]
        self.assertEqual(d["top_game"]["game"], GAME_ANDHAR_BAHAR)
        self.assertEqual(d["top_game"]["total"], 120.0)

    def test_the_parts_add_up_to_the_whole(self):
        """Unattributed is surfaced rather than dropped, so per-game totals
        plus unattributed always reconcile with lifetime earnings."""
        p = self.refer("ins-g2@example.com")
        self.commission(p, 10, game=GAME_POKER)
        self.commission(p, 20, game=GAME_TEEN_PATTI)
        self.commission(p, 70, game="")

        data = self.insights()
        by_game = sum(g["total"] for g in data["by_game"]["games"])
        self.assertEqual(
            by_game + data["by_game"]["unattributed"]["total"],
            data["earnings"]["total_earnings"],
        )

    def test_supported_games_shows_the_rate_the_engine_would_actually_use(self):
        """Not a marketing number maintained by hand — resolved through the
        same rule engine that would price a real commission."""
        CommissionRule.objects.create(
            name="Poker rolling", commission_type="rolling", rate_type="percentage",
            rate=Decimal("7.5"), game=GAME_POKER, is_active=True,
        )
        games = {g["game"]: g for g in self.insights()["supported_games"]}
        self.assertEqual(games[GAME_POKER]["rates"]["rolling"]["rate"], 7.5)
        # No rule for the others, so the older plan/flat-rate layer decides and
        # the payload says nothing rather than inventing a percentage.
        self.assertFalse(games[GAME_ANDHAR_BAHAR]["has_configured_rate"])


class TierTests(AffiliateInsightsTestBase):
    def test_no_tier_ladder_is_invented_when_no_tiered_rule_applies(self):
        self.assertIsNone(self.insights()["tier"])

    def test_tier_progress_reads_the_real_rule(self):
        rule = CommissionRule.objects.create(
            name="Volume ladder", commission_type="rolling", rate_type="tiered",
            affiliate=self.affiliate, is_active=True,
        )
        rule.tiers.create(
            name="Bronze", metric="referred_players", min_value=0, max_value=4,
            rate=Decimal("5"), order=0, is_active=True,
        )
        rule.tiers.create(
            name="Silver", metric="referred_players", min_value=5,
            rate=Decimal("8"), order=1, is_active=True,
        )
        for i in range(3):
            self.refer(f"ins-t{i}@example.com")

        tier = self.insights()["tier"]
        self.assertIsNotNone(tier)
        self.assertEqual(tier["current_tier"]["name"], "Bronze")
        self.assertEqual(tier["next_tier"]["name"], "Silver")
        self.assertEqual(tier["next_tier"]["remaining"], 2.0)
        self.assertFalse(tier["at_top_tier"])


class ReferralLinkTests(AffiliateInsightsTestBase):
    def test_a_game_link_is_offered_for_each_supported_game(self):
        links = self.insights()["links"]
        self.assertEqual(links["referral_code"], self.affiliate.referral_code)
        self.assertEqual(
            {g["game"] for g in links["games"]},
            {GAME_POKER, GAME_TEEN_PATTI, GAME_ANDHAR_BAHAR},
        )
        for g in links["games"]:
            self.assertIn(f"ref={self.affiliate.referral_code}", g["param"])
            self.assertIn(f"game={g['game']}", g["param"])

    def test_click_tracking_records_the_link_game(self):
        client = APIClient()
        res = client.post(
            "/api/affiliate/track-click/",
            {
                "referral_code": self.affiliate.referral_code,
                "game": "andhar-bahar",
                "landing_path": "/",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        # "andhar-bahar" normalises to the one stored slug — the Back Office
        # and any hand-written link cannot introduce a second spelling.
        self.assertEqual(
            AffiliateClickLog.objects.get(pk=res.data["click_id"]).game,
            GAME_ANDHAR_BAHAR,
        )

    def test_the_game_is_inferred_from_the_landing_page_when_not_stated(self):
        client = APIClient()
        res = client.post(
            "/api/affiliate/track-click/",
            {"referral_code": self.affiliate.referral_code, "landing_path": "/teen-patti"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(
            AffiliateClickLog.objects.get(pk=res.data["click_id"]).game,
            GAME_TEEN_PATTI,
        )

    def test_an_unrelated_landing_page_infers_nothing(self):
        client = APIClient()
        res = client.post(
            "/api/affiliate/track-click/",
            {"referral_code": self.affiliate.referral_code, "landing_path": "/promotions"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(AffiliateClickLog.objects.get(pk=res.data["click_id"]).game, "")


class GameAttributionTests(AffiliateInsightsTestBase):
    """The chain: Affiliate -> Referral -> Player -> Game -> Activity ->
    Commission. These drive the real engine rather than writing rows by hand."""

    def setUp(self):
        super().setUp()
        self.casino, _ = Casino.objects.get_or_create(
            country="India", name="Deltin Attribution", defaults={"is_active": True},
        )
        self.player = self.refer("ins-attr@example.com")

    def test_the_engine_stamps_the_game_on_both_the_ledger_and_the_money_row(self):
        CommissionRule.objects.create(
            name="Any game rolling", commission_type="rolling", rate_type="percentage",
            rate=Decimal("10"), is_active=True,
        )
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            reference_id="SLIP-AB-1", game=GAME_ANDHAR_BAHAR,
        )
        self.assertTrue(result.applied)

        entry = CommissionLedgerEntry.objects.get(reference_id="SLIP-AB-1")
        self.assertEqual(entry.game, GAME_ANDHAR_BAHAR)
        # The money row carries the same game, so the two can never disagree.
        self.assertEqual(entry.referral_commission.game, GAME_ANDHAR_BAHAR)

    def test_a_game_scoped_rule_prices_only_its_own_game(self):
        CommissionRule.objects.create(
            name="Generic", commission_type="rolling", rate_type="percentage",
            rate=Decimal("5"), is_active=True,
        )
        CommissionRule.objects.create(
            name="Andhar Bahar premium", commission_type="rolling", rate_type="percentage",
            rate=Decimal("20"), game=GAME_ANDHAR_BAHAR, is_active=True,
        )

        ab = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            reference_id="SLIP-AB-2", game=GAME_ANDHAR_BAHAR,
        )
        poker = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("1000"),
            reference_id="SLIP-PK-2", game=GAME_POKER,
        )
        self.assertEqual(ab.entry.commission_rate, Decimal("20.000"))
        self.assertEqual(poker.entry.commission_rate, Decimal("5.000"))

    def test_marketing_intent_does_not_decide_attribution(self):
        """A player referred through a POKER link who plays Andhar Bahar
        generates Andhar Bahar commission. The click's game is the intent of
        the referral; the activity's game is what pays."""
        AffiliateClickLog.objects.create(
            affiliate=self.affiliate, game=GAME_POKER, registered_user=self.player,
        )
        CommissionRule.objects.create(
            name="Any", commission_type="rolling", rate_type="percentage",
            rate=Decimal("10"), is_active=True,
        )
        commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("500"),
            reference_id="SLIP-MIX", game=GAME_ANDHAR_BAHAR,
        )
        entry = CommissionLedgerEntry.objects.get(reference_id="SLIP-MIX")
        self.assertEqual(entry.game, GAME_ANDHAR_BAHAR)

        d = self.insights()["by_game"]
        self.assertEqual(d["top_game"]["game"], GAME_ANDHAR_BAHAR)

    def test_duplicate_processing_of_one_slip_creates_one_entry(self):
        """Idempotency survives the game column being added — the uniqueness
        is still (affiliate, player, type, reference)."""
        CommissionRule.objects.create(
            name="Any", commission_type="rolling", rate_type="percentage",
            rate=Decimal("10"), is_active=True,
        )
        for _ in range(3):
            commission_engine_service.evaluate(
                self.player, commission_type="rolling", base_amount=Decimal("100"),
                reference_id="SLIP-DUP", game=GAME_POKER,
            )
        self.assertEqual(
            CommissionLedgerEntry.objects.filter(reference_id="SLIP-DUP").count(), 1,
        )
        self.assertEqual(
            ReferralCommission.objects.filter(
                affiliate=self.affiliate, source_transaction_ref="SLIP-DUP",
            ).count(),
            1,
        )

    def test_unattributed_activity_is_not_priced_by_a_game_rule(self):
        """A deposit recorded with no game context is not evidence of poker
        play, so a poker-scoped rule must not price it."""
        CommissionRule.objects.create(
            name="Poker only", commission_type="rolling", rate_type="percentage",
            rate=Decimal("30"), game=GAME_POKER, is_active=True,
        )
        result = commission_engine_service.evaluate(
            self.player, commission_type="rolling", base_amount=Decimal("100"),
            reference_id="SLIP-NOGAME", game=None,
        )
        # No game-agnostic rule exists, so nothing matched and the caller falls
        # through to the older engines — which is applied=False, not an error.
        self.assertFalse(result.applied)
        self.assertEqual(CommissionLedgerEntry.objects.filter(reference_id="SLIP-NOGAME").count(), 0)


class NormalisationTests(TestCase):
    def test_common_spellings_all_resolve_to_one_slug(self):
        for value in ("teen_patti", "teen-patti", "Teen Patti", "TEEN PATTI"):
            self.assertEqual(normalise_game(value), GAME_TEEN_PATTI, value)
        for value in ("andhar_bahar", "andhar-bahar", "Andhar Bahar"):
            self.assertEqual(normalise_game(value), GAME_ANDHAR_BAHAR, value)

    def test_anything_unrecognised_becomes_unattributed_rather_than_raising(self):
        for value in (None, "", "roulette", "  ", 42):
            self.assertEqual(normalise_game(value), "", repr(value))


class InsightsAuthorizationTests(AffiliateInsightsTestBase):
    def test_insights_require_an_affiliate_account(self):
        outsider = User.objects.create_user(
            email="ins-outsider@example.com", password="pw12345!", name="Outsider",
        )
        client = APIClient()
        client.force_authenticate(outsider)
        self.assertEqual(client.get("/api/affiliate/insights/").status_code, 403)

    def test_insights_reject_anonymous(self):
        client = APIClient()
        self.assertIn(client.get("/api/affiliate/insights/").status_code, (401, 403))

    def test_an_affiliate_sees_only_their_own_figures(self):
        other = User.objects.create_user(
            email="ins-other-aff@example.com", password="pw12345!", name="Other",
        )
        AffiliateProfile.objects.create(user=other, is_active=True)
        their_player = User.objects.create_user(
            email="ins-their-player@example.com", password="pw12345!", name="Theirs",
        )
        their_player.referred_by = other
        their_player.save()
        ReferralCommission.objects.create(
            affiliate=other, referred_user=their_player,
            deposit_amount=Decimal("100"), commission_rate=Decimal("10"),
            amount=Decimal("999"), status="pending", game=GAME_POKER,
        )

        data = self.insights()
        self.assertEqual(data["referrals"]["total_referrals"], 0)
        self.assertEqual(data["earnings"]["total_earnings"], 0.0)

    def test_an_affiliate_cannot_change_their_own_commission_rate(self):
        """Item 21's requirement, asserted rather than assumed: there is no
        affiliate-facing write path to a commission rule."""
        rule = CommissionRule.objects.create(
            name="Mine", commission_type="rolling", rate_type="percentage",
            rate=Decimal("5"), affiliate=self.affiliate, is_active=True,
        )
        for method, path in (
            ("post", "/api/admin-panel/commissions/rules/"),
            ("patch", f"/api/admin-panel/commissions/rules/{rule.pk}/"),
        ):
            with self.subTest(path=path):
                res = getattr(self.client, method)(path, {"rate": "99"}, format="json")
                self.assertIn(res.status_code, (401, 403, 404), path)
        rule.refresh_from_db()
        self.assertEqual(rule.rate, Decimal("5.000"))


class ProgramStatsTests(AffiliateInsightsTestBase):
    """The public Affiliates-page endpoint. It answers "what can I refer
    people for" and nothing else — see the view for why the headcounts it once
    carried were removed."""

    def test_the_public_endpoint_exposes_no_individual_and_no_figures(self):
        for i in range(8):
            self.refer(f"ins-pub{i}@example.com")
        self.commission(
            User.objects.filter(referred_by=self.affiliate).first(), 4321,
            game=GAME_POKER,
        )
        client = APIClient()
        res = client.get("/api/affiliate/program-stats/")
        self.assertEqual(res.status_code, 200)

        body = str(res.data)
        # No names, no emails, no per-affiliate earnings — this is public and
        # unauthenticated.
        self.assertNotIn("ins-aff@example.com", body)
        self.assertNotIn("ins-pub0@example.com", body)
        self.assertNotIn("4321", body)
        # And no roster size either: a prospective affiliate needs to know what
        # they can refer for, not how many partners there are.
        for gone in ("active_affiliates", "referred_players", "countries_reached"):
            self.assertNotIn(gone, res.data, f"{gone} should no longer be published")

    def test_the_payload_is_only_the_supported_games(self):
        """An allowlist, deliberately: a new key on a public unauthenticated
        endpoint is a decision to publish something, not an accident."""
        client = APIClient()
        res = client.get("/api/affiliate/program-stats/")
        self.assertEqual(set(res.data.keys()), {"supported_games"})

    def test_supported_games_are_always_listed_with_their_routes(self):
        client = APIClient()
        res = client.get("/api/affiliate/program-stats/")
        rows = {g["game"]: g for g in res.data["supported_games"]}
        self.assertEqual(
            set(rows), {GAME_POKER, GAME_TEEN_PATTI, GAME_ANDHAR_BAHAR},
        )
        # The route is what lets the card link through to the section.
        self.assertEqual(rows[GAME_ANDHAR_BAHAR]["route"], "/andhar-bahar")
        for row in rows.values():
            self.assertTrue(row["label"], "every game needs a display label")

    def test_it_needs_no_authentication(self):
        """It is the public marketing page's data; requiring a login would
        make the page unrenderable for exactly the audience it is for."""
        self.assertEqual(APIClient().get("/api/affiliate/program-stats/").status_code, 200)
