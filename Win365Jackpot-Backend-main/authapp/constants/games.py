"""
authapp/constants/games.py
─────────────────────────────────────────────────────────────────────────────
The single vocabulary of games a referral can be attributed to and a
commission rule can be scoped by.

ONE list, imported everywhere, because the alternative — a games list in the
commission models, another in the affiliate models, another in the frontend —
is how "andhar_bahar" and "andharbahar" end up as two different games nobody
can reconcile. Adding a game here makes it available to the commission rule
editor, referral attribution and the affiliate dashboard at once.

Slugs are stable identifiers and must never be renamed: they are stored in
CommissionRule.game, CommissionLedgerEntry.game, ReferralCommission.game and
AffiliateClickLog.game, so a rename would orphan live rows. The display label
is what the UI shows, and that CAN change freely.

`GAME_UNSPECIFIED` ("") is deliberately part of the vocabulary rather than an
error case. Every row that existed before game attribution was introduced has
it, and so does any activity a trigger site genuinely cannot attribute (an
offline deposit recorded with no game context). A rule with game="" matches
ANY game — that is what keeps every pre-existing rule working exactly as it
did before this column existed.
"""

GAME_POKER = "poker"
GAME_TEEN_PATTI = "teen_patti"
GAME_ANDHAR_BAHAR = "andhar_bahar"

# "" — not attributed to any one game. See the module docstring.
GAME_UNSPECIFIED = ""

# The real, referable games. Used for the affiliate "Supported Games" list and
# anywhere a game must actually be chosen.
GAME_CHOICES = [
    (GAME_POKER, "Poker"),
    (GAME_TEEN_PATTI, "Teen Patti"),
    (GAME_ANDHAR_BAHAR, "Andhar Bahar"),
]

# What a scoped/attributed column may hold — the games above plus "not
# attributed". This is the choices list for every model field.
GAME_FIELD_CHOICES = [(GAME_UNSPECIFIED, "Any / Not game-specific")] + GAME_CHOICES

GAME_SLUGS = tuple(slug for slug, _ in GAME_CHOICES)

GAME_LABELS = dict(GAME_FIELD_CHOICES)

# Public site route for each game, so a referral link can point a visitor at
# the game they were referred for without the frontend hardcoding a second
# mapping.
GAME_ROUTES = {
    GAME_POKER: "/poker",
    GAME_TEEN_PATTI: "/teen-patti",
    GAME_ANDHAR_BAHAR: "/andhar-bahar",
}


def normalise_game(value):
    """Coerce arbitrary input to a valid slug, or "" (any game).

    Accepts the slug itself, the display label, and common hyphen/space
    spellings, because this runs on query params and referral-link input where
    "teen-patti" is at least as likely as "teen_patti". Anything unrecognised
    becomes "" rather than raising — an unattributable referral is a normal
    outcome, not a request-level error.
    """
    if not value:
        return GAME_UNSPECIFIED
    key = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    if key in GAME_SLUGS:
        return key
    for slug, label in GAME_CHOICES:
        if key == label.lower().replace(" ", "_"):
            return slug
    return GAME_UNSPECIFIED
