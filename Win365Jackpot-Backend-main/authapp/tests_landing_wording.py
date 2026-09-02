# -*- coding: utf-8 -*-
"""Guards the public landing copy against re-acquiring gambling-operator wording.

JackpotsWorld is an offline casino referral and VIP concierge platform. It does
not run an online casino, take bets, process wagers, hold player gambling funds
or guarantee winnings. Wording that says otherwise is not a style problem: it
misrepresents the business to anyone reviewing the site, including regulators.

Migration 0080 removed that wording from the seeded rows. These tests fail if it
comes back -- via a new seed, a re-run of an old one, or a future migration that
reintroduces the phrasing.

They run against the migrated database, so they check what the API will actually
serve, not what a constant in a component says.
"""
from django.test import TestCase

from authapp.models.landing_models import (
    LandingSettings, WhyChooseUsFeature, TrustBadge, Testimonial, HeroStat,
    GiftStep, VipTierBenefit,
)


# Phrases that must not appear in any public landing string. Each one was on
# the live site and each implies something untrue about who runs the gaming,
# who holds the money, or what has been independently verified.
BANNED_PHRASES = [
    "Asia's #1",                      # ranking claim, no substantiation
    "Winning Players",                # asserts verified gambling winners
    "Won Today",                      # fabricated winnings figure
    "Every Booking to Every Bet",     # puts JackpotsWorld on the bet
    "Win Rate Analytics",             # monitoring of gambling activity
    "Betting Sessions",               # same
    "fully licensed and regulated",   # blanket licensing claim
    "only on Jackpots World",         # casino offers presented as ours
    "Deposit and withdraw",           # implies we move gambling money
    "added to your balance",          # implies we hold a gambling balance
    "every bet",                      # "your partner for every bet"
    "Casino Gaming Across",           # implies we provide the gaming
]


def _all_public_landing_strings():
    """Every admin-managed string the landing page renders."""
    out = []
    s = LandingSettings.load()
    out += [
        s.hero_badge_text, s.hero_cta_primary_label, s.hero_cta_secondary_label,
        s.hero_tagline, s.global_reach_tagline, s.trust_banner_heading,
        s.trust_banner_subtext,
    ]
    out += [f.title for f in WhyChooseUsFeature.objects.all()]
    out += [f.description for f in WhyChooseUsFeature.objects.all()]
    out += [b.label for b in TrustBadge.objects.all()]
    out += [h.label for h in HeroStat.objects.all()]
    out += [g.label for g in GiftStep.objects.all()]
    out += [g.description for g in GiftStep.objects.all()]
    out += [v.name for v in VipTierBenefit.objects.all()]
    out += [v.description for v in VipTierBenefit.objects.all()]
    return [x for x in out if x]


class LandingWordingTests(TestCase):

    def test_no_banned_phrase_in_any_public_landing_string(self):
        haystack = " || ".join(_all_public_landing_strings())
        for phrase in BANNED_PHRASES:
            self.assertNotIn(
                phrase, haystack,
                f"Landing copy re-acquired banned wording: {phrase!r}. "
                f"See migration 0080 and this module's docstring.",
            )

    def test_unsubstantiated_certification_badges_absent(self):
        """"Licensed Partners" / "Fair Play Certified" / "5 Star Rated" assert
        certifications and ratings with no verified source behind them."""
        for label in ("Licensed Partners", "Fair Play Certified", "5 Star Rated"):
            self.assertFalse(
                TrustBadge.objects.filter(label=label).exists(),
                f"Unsubstantiated trust badge present: {label}",
            )

    def test_factual_badges_survived(self):
        """The correction must not have taken the honest badges with it."""
        for label in ("SSL Secured", "Pan-Asia Coverage"):
            self.assertTrue(
                TrustBadge.objects.filter(label=label).exists(),
                f"Factual trust badge was removed: {label}",
            )

    def test_no_testimonial_publishes_a_winnings_figure(self):
        """`amount_won` is a real field, but publishing a figure requires a
        real member who consented to it. The six rows seeded by 0023 were
        fabricated. A row here means someone has re-added invented social
        proof -- or has added a genuine one, in which case delete this
        assertion deliberately rather than by accident."""
        offenders = list(
            Testimonial.objects.exclude(amount_won="")
            .values_list("name", "amount_won")
        )
        self.assertEqual(
            offenders, [],
            f"Testimonials publish winnings figures: {offenders}",
        )

    def test_no_hero_stat_reports_gambling_outcomes(self):
        """A hero stat is a headline number. This platform has no source of
        truth for what anyone won, so it cannot carry one."""
        labels = [h.label.lower() for h in HeroStat.objects.all()]
        for banned in ("won today", "winnings", "payout", "jackpots won"):
            self.assertNotIn(
                banned, labels,
                f"Hero stat reports a gambling outcome: {banned}",
            )

    def test_referral_positioning_present(self):
        """The corrected wording is actually in place, not merely absent."""
        s = LandingSettings.load()
        self.assertNotIn("#1", s.hero_badge_text)
        self.assertIn("Members", s.trust_banner_heading)
