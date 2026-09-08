"""Seed the new Back-Office-managed content, and rescale commission-rule
specificity for the added `game` dimension.

THREE INDEPENDENT JOBS, ALL REVERSIBLE:

1. RESCALE CommissionRule.specificity. 0085 added `game` as a fourth scope
   dimension and doubled the other three weights (see
   commission_rule_models._WEIGHT_*). `specificity` is denormalised and only
   recomputed in save(), so every existing row still holds a value on the old
   0–7 scale. Left alone, an old affiliate-scoped rule (stored 4) would rank
   BELOW a new country-scoped one (computed 2 → but stored via save() as 2…)
   — i.e. the two scales would be compared against each other and precedence
   would be silently wrong. Recomputing every row is what makes the rescale a
   no-op in behaviour rather than a reshuffle.

   This is the one part of this migration that must run: it protects live
   earnings. The reverse recomputes on the old weights, so rolling back 0085
   leaves consistent values too.

2. SEED the landing + affiliate FAQs. The landing four are copied verbatim
   from the wording that was hardcoded in components/BusinessModelFAQ.jsx, so
   the page says exactly what it said before it became editable. See
   faq_models.py's docstring for why that matters.

3. SEED the Andhar Bahar highlights and how-to-play steps. Content only —
   AndharBaharContent's own defaults live on the model, so the singleton needs
   no seed row here (it is created on first read by load()).

Seeding is get_or_create-shaped and skipped entirely if rows already exist, so
re-running against a database an admin has already curated never resurrects a
deleted row or overwrites an edit.
"""
from django.db import migrations

# The exact wording that was hardcoded in the frontend. Copied, not reworded:
# these are compliance statements about what the business is not.
LANDING_FAQS = [
    (
        "Is JackpotsWorld an online casino?",
        "No. JackpotsWorld is an offline casino referral and VIP concierge platform. We connect "
        "members with casino destinations and provide the relevant referral for their visit. "
        "Gaming takes place directly at the selected casino.",
    ),
    (
        "Can I place a bet through JackpotsWorld?",
        "No. Casino gaming does not take place on the JackpotsWorld website. Members visit the "
        "relevant offline casino to participate directly with the casino.",
    ),
    (
        "Does JackpotsWorld hold my gambling funds?",
        "No. JackpotsWorld does not hold or custody funds used for casino gaming. Any "
        "gaming-related financial transactions are handled directly by the relevant casino.",
    ),
    (
        "How does the referral work?",
        "Register with JackpotsWorld, select your destination, and contact our team. We provide "
        "the appropriate referral for your casino visit.",
    ),
]

# Copied from the hardcoded list in pages/Affiliates.jsx, same reasoning.
AFFILIATE_FAQS = [
    (
        "Is there a cost to join the affiliate program?",
        "No — joining the Jackpots World affiliate program is completely free.",
    ),
    (
        "How and when do I get paid?",
        "Commissions are calculated weekly and monthly based on your referred players' activity "
        "and paid out directly to your registered account.",
    ),
    (
        "Can I promote more than one partner casino?",
        "Yes — your affiliate link covers our entire network of partner casinos, events, and "
        "promotions.",
    ),
    (
        "Which games can I refer players for?",
        "Poker, Teen Patti and Andhar Bahar. Your referral link can target a specific game, and "
        "commission is attributed to whichever game the player's qualifying activity actually "
        "took place in.",
    ),
    (
        "How is my commission rate decided?",
        "Commission rates are configured by our affiliate team and can vary by game, country, "
        "destination and affiliate tier. Your current rates are shown in your affiliate "
        "dashboard, and your account manager can talk you through them.",
    ),
]

# Benefit cards. Every one describes the experience — pace, simplicity, venue
# quality — and none asserts a win, an edge or an outcome.
HIGHLIGHTS = [
    ("Zap", "#F59E0B", "Fast-Paced Gameplay",
     "Rounds resolve in moments. There is no long build-up, which is why Andhar Bahar tables "
     "keep moving all evening."),
    ("Sparkles", "#D4AF37", "Simple to Understand",
     "One joker card, two sides, one question. Nothing to memorise and nothing to calculate — "
     "you can follow your first round immediately."),
    ("Flame", "#EF4444", "Exciting Rounds",
     "Every card dealt is a moment. The tension builds card by card until the match lands on "
     "Andhar or Bahar."),
    ("Crown", "#A78BFA", "Premium Casino Experience",
     "Professional dealers, proper table service and the atmosphere of a real casino floor — "
     "not a screen."),
    ("Layers", "#34D399", "Multiple Betting Opportunities",
     "Side bets and table variations differ by venue, so there is usually more than one way to "
     "play a round. Your host explains what each table offers."),
    ("MapPin", "#38BDF8", "Trusted Offline Destinations",
     "We only introduce members to partner casinos we have visited and vetted, across our "
     "destination network."),
]

STEPS = [
    ("The joker is drawn",
     "The dealer places one card face up in the middle of the table. That card sets the rank "
     "everyone is now watching for."),
    ("Choose your side",
     "Players back either Andhar (inside) or Bahar (outside) — the side they believe will show "
     "a matching card first."),
    ("Cards are dealt alternately",
     "The dealer deals to Andhar and Bahar in turn, one card at a time, until a card matches "
     "the joker's rank."),
    ("The matching side wins the round",
     "Whichever side the matching card lands on takes the round. Payouts follow the table's "
     "posted rules, which vary by casino."),
]


def _rescale_specificity(apps, schema_editor, weights):
    """Recompute every rule's stored scope weight under `weights`.

    Done with plain updates rather than model.save() because the historical
    model an operation gets from `apps` has no custom save() — that is the
    whole reason a denormalised column needs a migration when its formula
    changes.
    """
    CommissionRule = apps.get_model("authapp", "CommissionRule")
    w_aff, w_cas, w_country, w_game = weights
    for rule in CommissionRule.objects.all().iterator():
        rule.specificity = (
            (w_aff if rule.affiliate_id else 0)
            + (w_cas if rule.casino_id else 0)
            + (w_country if (rule.country or "").strip() else 0)
            + (w_game if getattr(rule, "game", "") else 0)
        )
        rule.save(update_fields=["specificity"])


def forwards(apps, schema_editor):
    _rescale_specificity(apps, schema_editor, (8, 4, 2, 1))

    FAQ = apps.get_model("authapp", "FAQ")
    for category, rows in (("landing", LANDING_FAQS), ("affiliate", AFFILIATE_FAQS)):
        # Only seed a category that is genuinely empty. An admin who has
        # already curated (or deliberately emptied) one must not have this
        # migration write into it on a later re-run.
        if FAQ.objects.filter(category=category).exists():
            continue
        for order, (question, answer) in enumerate(rows):
            FAQ.objects.create(
                category=category, question=question, answer=answer,
                order=order, is_active=True,
            )

    Highlight = apps.get_model("authapp", "AndharBaharHighlight")
    if not Highlight.objects.exists():
        for order, (icon, color, title, description) in enumerate(HIGHLIGHTS):
            Highlight.objects.create(
                icon_name=icon, color=color, title=title,
                description=description, order=order, is_active=True,
            )

    Step = apps.get_model("authapp", "AndharBaharStep")
    if not Step.objects.exists():
        for order, (title, description) in enumerate(STEPS):
            Step.objects.create(
                title=title, description=description, order=order, is_active=True,
            )


def backwards(apps, schema_editor):
    # Put specificity back on the pre-0085 scale so a rollback leaves the
    # precedence order consistent with the old weights.
    _rescale_specificity(apps, schema_editor, (4, 2, 1, 0))

    # Seeded content is removed by exact question/title match only, so an
    # admin's own additions survive a rollback.
    FAQ = apps.get_model("authapp", "FAQ")
    FAQ.objects.filter(category="landing", question__in=[q for q, _ in LANDING_FAQS]).delete()
    FAQ.objects.filter(category="affiliate", question__in=[q for q, _ in AFFILIATE_FAQS]).delete()

    apps.get_model("authapp", "AndharBaharHighlight").objects.filter(
        title__in=[t for _, _, t, _ in HIGHLIGHTS],
    ).delete()
    apps.get_model("authapp", "AndharBaharStep").objects.filter(
        title__in=[t for t, _ in STEPS],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0085_andhar_bahar_faq_game_and_support_comms"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
