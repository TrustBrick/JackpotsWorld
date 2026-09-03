# -*- coding: utf-8 -*-
"""Replays production's ACTUAL edited rows through the 0084 phrase sweep.

0080 keyed its rewrites to the strings migration 0023 seeded, so an admin's
edits would survive. Production's cards had been edited away from that seed --
toward the frontend's old fallback constants, which were different text -- so
four rows matched nothing, and two phrases the compliance review named
explicitly ("Every Booking to Every Bet" and "Smart Tools to Track Your Betting
Sessions") were still live on the site after 0080 deployed.

The fixture below is verbatim from GET /api/why-choose-us/ on the live origin
on 2026-09-03, immediately after that deploy. It is the regression case: if a
future change goes back to exact-string matching for these claims, these tests
fail.
"""
from importlib import import_module

from django.apps import apps as global_apps
from django.test import TestCase

from authapp.models.landing_models import WhyChooseUsFeature

sweep_mod = import_module("authapp.migrations.0084_why_choose_us_phrase_sweep")

LIVE = [
    ("Selected Partner Venues",
     "We work with selected offline casino destinations and local partners. "
     "Your privacy and your data are our priority."),
    ("Seamless Buy-in & Buy-out",
     "Deposit and withdraw seamlessly across all types of currencies at casinos."),
    ("Exclusive VIP Privilege",
     "Special welcome cash, gifts, offers, and cashback deals available only on "
     "Jackpots World."),
    ("15+ Countries Access",
     "One registration unlocks access to casinos in Vietnam, Macau, India, "
     "Sri Lanka, Philippines and more."),
    ("24/7 Live Support",
     "Our multilingual support team is available round the clock via WhatsApp, "
     "chat, and call."),
    ("Full Trip Packages",
     "We handle flights, hotels, transfers and your casino introduction. "
     "Hassle-free from home to the venue."),
    ("Every Booking to Every Bet",
     "Earn loyalty points on every booking. Unlock exclusive perks, private "
     "rooms, and concierge service."),
    ("Smart Tools to Track Your Betting Sessions",
     "Smart tools to track your sessions, analyse your results, and optimise "
     "your gaming strategy."),
]

BANNED = [
    "Every Booking to Every Bet",
    "Betting Session",
    "Win Rate",
    "Deposit and withdraw",
    "only on Jackpots World",
]


class WhyChooseUsSweepTests(TestCase):

    def setUp(self):
        WhyChooseUsFeature.objects.all().delete()
        for i, (title, desc) in enumerate(LIVE):
            WhyChooseUsFeature.objects.create(title=title, description=desc, order=i)
        sweep_mod.sweep(global_apps, None)

    def _all_text(self):
        return " || ".join(
            f"{f.title} {f.description}" for f in WhyChooseUsFeature.objects.all()
        )

    def test_no_banned_phrase_survives(self):
        text = self._all_text()
        for phrase in BANNED:
            self.assertNotIn(phrase, text, f"still live: {phrase}")

    def test_analytics_card_deleted(self):
        self.assertFalse(
            WhyChooseUsFeature.objects.filter(title__contains="Betting Session").exists())
        self.assertEqual(WhyChooseUsFeature.objects.count(), len(LIVE) - 1)

    def test_every_bet_card_retitled_not_deleted(self):
        """That card describes a real membership benefit; only its framing was
        wrong, so it is reworded rather than removed."""
        self.assertTrue(
            WhyChooseUsFeature.objects.filter(
                title="Play Anywhere. Keep Your Points.").exists())

    def test_admin_customised_titles_preserved(self):
        """15+ was the admin's number, not the seed's 10+, and "Exclusive VIP
        Privilege" was their wording. Only the descriptions misdescribed who
        provides the service, so the titles must survive."""
        self.assertTrue(
            WhyChooseUsFeature.objects.filter(title="15+ Countries Access").exists())
        self.assertTrue(
            WhyChooseUsFeature.objects.filter(title="Exclusive VIP Privilege").exists())

    def test_untouched_rows_are_untouched(self):
        for title in ("Selected Partner Venues", "24/7 Live Support", "Full Trip Packages"):
            row = WhyChooseUsFeature.objects.get(title=title)
            self.assertEqual(row.description, dict(LIVE)[title], title)

    def test_idempotent(self):
        before = self._all_text()
        sweep_mod.sweep(global_apps, None)
        self.assertEqual(self._all_text(), before)
