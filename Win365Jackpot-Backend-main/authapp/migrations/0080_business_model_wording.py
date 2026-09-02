# -*- coding: utf-8 -*-
"""Correct public wording that misrepresented the business model.

JackpotsWorld is an offline casino referral and VIP travel/concierge
platform. It does not operate an online casino, accept bets, process wagers,
hold or custody player gambling funds, issue gambling credit, or guarantee
winnings. Members are referred to partner venues and play directly at those
venues.

Migration 0023 seeded landing copy that read the other way round, and those
rows -- not the frontend's fallback constants -- are what the live site
renders. Editing the components alone would have changed nothing in
production, which is why this migration exists.

WHAT IS REWRITTEN

  LandingSettings (singleton)
      Ranking claim, "Winning Players", "every bet", "Casino Gaming".
  WhyChooseUsFeature
      Blanket licensing claim, deposit/withdraw wording, "only on Jackpots
      World", "Every Booking to Every Bet". The "Win Rate Analytics" card is
      DELETED rather than reworded -- it described monitoring of gambling
      activity this platform has no access to, and the business confirmed the
      feature is not substantiated. There is no honest version of that card.
  TrustBadge
      "Licensed Partners" and "Fair Play Certified" are certification claims
      with nothing behind them; "5 Star Rated" is a rating with no source.
      All three are deleted. "SSL Secured" and "Pan-Asia Coverage" are
      factual and stay.
  GiftStep
      "Play & Win -- Earn with every game -- Baccarat, Slots, Roulette" read
      as JackpotsWorld running the games.
  VipTierBenefit
      "credited", "added to your balance" read as JackpotsWorld holding a
      gambling balance and paying bonuses into it.
  Testimonial
      The six seeded testimonials are fabricated -- invented names, cities
      and winnings ("$8.5 Lakhs", "$12 Lakhs", "Rs.185,000"). They are deleted
      outright. The model, the API and the Back Office tab are untouched, so
      real testimonials can be added; `amount_won` is left in place but
      should stay empty unless a member has consented to publishing a
      specific figure.
  HeroStat
      The "Won Today" row is deleted. Its value was never the admin's anyway
      -- Hero.jsx generated it from a date-seeded PRNG and overrode whatever
      was stored. Both the generator and the override are gone from the
      frontend in the same change.

HOW IT IS APPLIED

  Every rewrite is keyed to the exact string migration 0023 wrote. A row an
  admin has since edited will not match and is left alone, so this cannot
  silently discard someone's work -- the trade-off is that an edited row keeps
  whatever wording it has, and has to be corrected in the Back Office.
  Deletions are matched the same way, on the seeded title/label.

  Reversible: the reverse restores the exact prior text. It does NOT recreate
  deleted rows -- reinstating fabricated testimonials and unsubstantiated
  certification badges is not something a rollback should do on its own. The
  original values are recorded in 0023 if they are ever genuinely needed.

Nothing about payments, referral logic, casino integrations or schema is
touched here. This migration only changes words.
"""
from django.db import migrations


# ── LandingSettings: (field, old, new) ──────────────────────────────────────
SETTINGS_REWRITES = [
    (
        "hero_badge_text",
        "Asia's #1 Offline Casinos VIP's Platform",
        "Premium Offline Casino VIP Platform",
    ),
    # The 0022 spelling, in case this install was seeded before 0025.
    (
        "hero_badge_text",
        "Asia's #1 Offline Casino's VIP's Platform",
        "Premium Offline Casino VIP Platform",
    ),
    (
        "hero_cta_primary_label",
        "\U0001f3b0 Register — FREE",
        "Get Your Referral",
    ),
    (
        "hero_cta_secondary_label",
        "Packages ✨",
        "Explore Packages",
    ),
    (
        "global_reach_tagline",
        "Experience World-Class Casino Gaming Across",
        "Discover World-Class Casino Destinations Across",
    ),
    (
        "trust_banner_heading",
        "Join 50,000+ Winning Players Across Asia",
        "Join 50,000+ Members Across Asia",
    ),
    (
        "trust_banner_subtext",
        "From first-time casino visitors to high-rollers — Jackpots World is "
        "your trusted partner for every bet.",
        "From first-time casino visitors to high-rollers — Jackpots World is "
        "your trusted partner for every trip.",
    ),
]

# ── LandingSettings, matched by PHRASE rather than exact value ──────────────
# Exact matching protects an admin's edits, which is right for wording. It is
# wrong for these two, because the thing being removed is a *claim*, and an
# edited row still carries it: this project's own dev database holds
# "Asia's #1 Offline Casinos VIP's Platform [QA test]", which no exact rule
# would ever touch. A row that still asserts a #1 ranking, or describes members
# as verified winners, has to be corrected however it was edited.
#
# Kept deliberately narrow. The fragments below appear in no legitimate
# wording, and each replaces the whole field rather than splicing text, so the
# result is always a sentence someone wrote rather than a patched hybrid.
SETTINGS_PHRASE_REWRITES = [
    ("hero_badge_text", "Asia's #1", "Premium Offline Casino VIP Platform"),
    ("trust_banner_heading", "Winning Players", "Join 50,000+ Members Across Asia"),
]

# ── WhyChooseUsFeature: (seeded title, new title, seeded desc, new desc) ────
FEATURE_REWRITES = [
    (
        "Secure & Licensed",
        "Selected Partner Venues",
        "All casino partners are fully licensed and regulated. Your safety and "
        "privacy are our top priority.",
        "We work with selected offline casino destinations and local partners. "
        "Your privacy and your data are our priority.",
    ),
    (
        "Instant Payments",
        "Trip Planning Made Simple",
        "Deposit and withdraw seamlessly across all types of currencies at casinos.",
        "One team to arrange your travel, stay and casino introduction. Your "
        "gaming transactions stay between you and the venue.",
    ),
    (
        "Exclusive Bonuses",
        "Exclusive VIP Privilege",
        "Special welcome bonuses, reload offers, and cashback deals available "
        "only on Jackpots World.",
        "Member perks and partner offers arranged through your JackpotsWorld "
        "referral, provided by the destination casino.",
    ),
    (
        "10+ Country Access",
        "10+ Countries Covered",
        "One registration unlocks casino opportunities in Vietnam, Macau, India, "
        "Sri Lanka, Philippines and more.",
        "One membership, referrals to offline casino destinations in Vietnam, "
        "Macau, India, Sri Lanka, Philippines and more.",
    ),
    (
        "Full Trip Packages",
        "Full Trip Packages",
        "We handle flights, hotels, transfers, and casino entry. Hassle-free "
        "from home to high-stakes table.",
        "We handle flights, hotels, transfers and your casino introduction. "
        "Hassle-free from home to the venue.",
    ),
    (
        "VIP Membership",
        "Play Anywhere. Keep Your Points.",
        "Earn loyalty points on every booking. Unlock exclusive perks, private "
        "rooms, and concierge service.",
        "Your JackpotsWorld membership stays with you wherever you visit our "
        "partner destinations. Your referral and membership details remain "
        "connected to your account.",
    ),
]

# Deleted, not reworded. See the module docstring.
FEATURE_DELETIONS = [
    (
        "Win Rate Analytics",
        "Smart tools to track your sessions, analyse performance, and optimise "
        "your gaming strategy.",
    ),
]

# ── GiftStep: (seeded label, new label, seeded desc, new desc) ──────────────
GIFT_STEP_REWRITES = [
    (
        "Play & Win",
        "Play at the Casino",
        "Earn with every game — Baccarat, Slots, Roulette & more",
        "Visit a partner destination and play directly at the venue",
    ),
    (
        "Go Highroller",
        "Go Highroller",
        "Qualify as a Highroller and unlock the exclusive prize vault",
        "Reach Highroller membership and unlock the exclusive prize vault",
    ),
]

# ── VipTierBenefit: (seeded name, seeded desc, new desc) ────────────────────
# The benefit's `name` is kept; only the description wording that implied a
# JackpotsWorld-held gambling balance changes.
VIP_BENEFIT_REWRITES = [
    (
        "Level Up Bonus",
        "One-time bonus credited when you reach this tier",
        "One-time membership reward when you reach this tier",
    ),
    (
        "Weekly Bonus",
        "Weekly reward credited based on your activity",
        "Weekly membership reward based on your recorded activity",
    ),
    (
        "Monthly Bonus",
        "Monthly loyalty bonus added to your balance",
        "Monthly loyalty reward for your membership",
    ),
]

# ── TrustBadge labels to delete ─────────────────────────────────────────────
BADGE_DELETIONS = ["Licensed Partners", "Fair Play Certified", "5 Star Rated"]

# ── HeroStat labels to delete ───────────────────────────────────────────────
HERO_STAT_DELETIONS = ["Won Today"]

# ── Testimonial names seeded by 0023 (all fabricated) ───────────────────────
SEEDED_TESTIMONIAL_NAMES = [
    "Rajesh K.", "Priya S.", "Nguyen T.", "Arjun M.", "Kasun P.", "Carlos R.",
]


def _rewrite_settings(LandingSettings, forward):
    obj = LandingSettings.objects.filter(pk=1).first()
    if obj is None:
        return
    changed = False
    for field, old, new in SETTINGS_REWRITES:
        frm, to = (old, new) if forward else (new, old)
        if getattr(obj, field, None) == frm:
            setattr(obj, field, to)
            changed = True

    # Second pass, forward only: catch a row that still carries the claim but
    # no longer matches the seed exactly. Reversing does not re-introduce a
    # ranking or "winners" claim -- there is no edit worth restoring there.
    if forward:
        for field, phrase, new in SETTINGS_PHRASE_REWRITES:
            current = getattr(obj, field, None) or ""
            if phrase in current:
                setattr(obj, field, new)
                changed = True

    if changed:
        obj.save()


def apply_forward(apps, schema_editor):
    LandingSettings = apps.get_model("authapp", "LandingSettings")
    WhyChooseUsFeature = apps.get_model("authapp", "WhyChooseUsFeature")
    TrustBadge = apps.get_model("authapp", "TrustBadge")
    GiftStep = apps.get_model("authapp", "GiftStep")
    VipTierBenefit = apps.get_model("authapp", "VipTierBenefit")
    Testimonial = apps.get_model("authapp", "Testimonial")
    HeroStat = apps.get_model("authapp", "HeroStat")

    _rewrite_settings(LandingSettings, forward=True)

    for old_title, new_title, old_desc, new_desc in FEATURE_REWRITES:
        WhyChooseUsFeature.objects.filter(
            title=old_title, description=old_desc,
        ).update(title=new_title, description=new_desc)

    for title, desc in FEATURE_DELETIONS:
        WhyChooseUsFeature.objects.filter(title=title, description=desc).delete()

    TrustBadge.objects.filter(label__in=BADGE_DELETIONS).delete()
    HeroStat.objects.filter(label__in=HERO_STAT_DELETIONS).delete()

    for old_label, new_label, old_desc, new_desc in GIFT_STEP_REWRITES:
        GiftStep.objects.filter(
            label=old_label, description=old_desc,
        ).update(label=new_label, description=new_desc)

    for name, old_desc, new_desc in VIP_BENEFIT_REWRITES:
        VipTierBenefit.objects.filter(
            name=name, description=old_desc,
        ).update(description=new_desc)

    # Fabricated social proof. Matched on the seeded name AND a non-empty
    # amount_won, so a real testimonial that happens to share a first name and
    # initial is not caught.
    Testimonial.objects.filter(
        name__in=SEEDED_TESTIMONIAL_NAMES,
    ).exclude(amount_won="").delete()


def apply_reverse(apps, schema_editor):
    """Restores rewritten text. Deliberately does NOT recreate deleted rows --
    fabricated testimonials and unevidenced certification badges should not
    come back automatically. 0023 still records them if ever needed."""
    LandingSettings = apps.get_model("authapp", "LandingSettings")
    WhyChooseUsFeature = apps.get_model("authapp", "WhyChooseUsFeature")
    GiftStep = apps.get_model("authapp", "GiftStep")
    VipTierBenefit = apps.get_model("authapp", "VipTierBenefit")

    _rewrite_settings(LandingSettings, forward=False)

    for old_title, new_title, old_desc, new_desc in FEATURE_REWRITES:
        WhyChooseUsFeature.objects.filter(
            title=new_title, description=new_desc,
        ).update(title=old_title, description=old_desc)

    for old_label, new_label, old_desc, new_desc in GIFT_STEP_REWRITES:
        GiftStep.objects.filter(
            label=new_label, description=new_desc,
        ).update(label=old_label, description=old_desc)

    for name, old_desc, new_desc in VIP_BENEFIT_REWRITES:
        VipTierBenefit.objects.filter(
            name=name, description=new_desc,
        ).update(description=old_desc)


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0079_call_direction"),
    ]

    # Data only. The matching AlterField operations for the changed model
    # defaults are generated separately by makemigrations -- defaults affect
    # only rows created from here on, while the rows already in the database
    # are this migration's job.
    operations = [
        migrations.RunPython(apply_forward, apply_reverse),
    ]
