# -*- coding: utf-8 -*-
"""Finish the job 0080 started on the "Why Choose Us" cards.

0080 keyed its rewrites to the exact strings migration 0023 seeded, so an
admin's edits would survive. On production those cards HAD been edited -- away
from the seed and toward the frontend's old fallback constants, which were
different text -- so four rows matched nothing and were skipped. Verified live
after deploying 0080:

    Seamless Buy-in & Buy-out      (seed said "Instant Payments")
      "Deposit and withdraw seamlessly across all types of currencies at casinos."
    Exclusive VIP Privilege        (seed said "Exclusive Bonuses")
      "...available only on Jackpots World."
    15+ Countries Access           (seed said "10+ Country Access")
    Every Booking to Every Bet     (seed said "VIP Membership")
    Smart Tools to Track Your Betting Sessions  (seed said "Win Rate Analytics")

Two of those -- "Every Booking to Every Bet" and "Smart Tools to Track Your
Betting Sessions" -- are phrases the compliance review named explicitly, and
they stayed live on the site after a deploy that was supposed to remove them.

So this migration matches on the PHRASE, not on the seeded value, the way
0080 already did for the hero badge and trust banner (which is why those two
landed correctly). A claim has to go however the row was worded when someone
last touched it.

Titles an admin has legitimately customised are preserved where the title is
not itself the problem: "15+ Countries Access" keeps its 15, and "Exclusive
VIP Privilege" keeps its name -- only the descriptions that misdescribe who
provides the service are replaced.

Reversal is a no-op. There is no correct "restore" for a claim that the
business cannot substantiate, and the previous wording is recorded above and
in 0080 if it is ever genuinely needed.
"""
from django.db import migrations


# Any card whose title or description contains one of these is the analytics
# card, under whatever name it has been given. It described monitoring of
# gambling activity this platform has no access to and the business confirmed
# it is unsubstantiated, so it is deleted rather than reworded.
DELETE_PHRASES = ["Win Rate", "Betting Session"]

# (phrase, new_title or None to keep the existing one, new_description)
REWRITES = [
    (
        "Every Booking to Every Bet",
        "Play Anywhere. Keep Your Points.",
        "Your JackpotsWorld membership stays with you wherever you visit our "
        "partner destinations. Your referral and membership details remain "
        "connected to your account.",
    ),
    (
        "Deposit and withdraw",
        "Trip Planning Made Simple",
        "One team to arrange your travel, stay and casino introduction. Your "
        "gaming transactions stay between you and the venue.",
    ),
    (
        "only on Jackpots World",
        None,
        "Member perks and partner offers arranged through your JackpotsWorld "
        "referral, provided by the destination casino.",
    ),
    (
        "unlocks access to casinos",
        None,
        "One membership, referrals to offline casino destinations in Vietnam, "
        "Macau, India, Sri Lanka, Philippines and more.",
    ),
    (
        "unlocks casino opportunities",
        None,
        "One membership, referrals to offline casino destinations in Vietnam, "
        "Macau, India, Sri Lanka, Philippines and more.",
    ),
]


def sweep(apps, schema_editor):
    WhyChooseUsFeature = apps.get_model("authapp", "WhyChooseUsFeature")

    for phrase in DELETE_PHRASES:
        WhyChooseUsFeature.objects.filter(title__contains=phrase).delete()
        WhyChooseUsFeature.objects.filter(description__contains=phrase).delete()

    for phrase, new_title, new_description in REWRITES:
        rows = list(WhyChooseUsFeature.objects.filter(title__contains=phrase))
        rows += [
            r for r in WhyChooseUsFeature.objects.filter(description__contains=phrase)
            if r.pk not in {x.pk for x in rows}
        ]
        for row in rows:
            if new_title:
                row.title = new_title
            row.description = new_description
            row.save()


def noop_reverse(apps, schema_editor):
    """Deliberately does nothing. Restoring an unsubstantiated claim is not
    something a rollback should do on its own."""


class Migration(migrations.Migration):

    dependencies = [
        ("authapp", "0083_seed_hero_card_from_background"),
    ]

    operations = [
        migrations.RunPython(sweep, noop_reverse),
    ]
