"""
authapp/services/audit_labels.py
─────────────────────────────────────────────────────────────────────────────
Turns a request into the sentence a person would use for it.

"POST /api/admin-panel/live-chat/calls/41/accept/" is a fact, but it is not an
answer. "Picked up a call" is. The audit trail is read by people asking what
somebody did, so the row should say what they did.

HOW IT WORKS
────────────
Two passes over the path, most specific first:

  1. ACTION_RULES — endpoints that are a verb in themselves (accept, end,
     hold, transfer, approve, reject, sync). These get a hand-written phrase
     per method, because "POST .../end/" means "ended the call", not
     "created an end".

  2. NOUN_RULES — ordinary CRUD collections. The noun comes from the path and
     the verb from the method, so POST /poker/ is "Added a poker tournament"
     and DELETE /poker/12/ is "Deleted a poker tournament". One rule covers a
     whole resource instead of four.

Ordering is load-bearing in both lists: `/poker/sources/` has to be tested
before `/poker/`, or every source edit would be reported as a tournament edit.
The tests assert that specific paths keep beating general ones.

WHEN NOTHING MATCHES
────────────────────
`describe()` returns None and the caller keeps the plain "POST /path" form.
An unrecognised endpoint should look unrecognised rather than be forced into
the nearest label — a wrong sentence in an audit trail is worse than a raw
path, because the raw path is obviously raw and the wrong sentence is not.
That is also what keeps this safe as the platform grows: a route added later
degrades to the old behaviour instead of being mislabelled.
"""

import re

# Verb per HTTP method, for the CRUD rules.
VERBS = {
    "POST": "Added",
    "PUT": "Updated",
    "PATCH": "Updated",
    "DELETE": "Deleted",
}

# Endpoints whose path IS the action. {method: phrase}, "*" for any method.
ACTION_RULES = [
    # ── Calls ────────────────────────────────────────────────────────────────
    (r"/live-chat/calls/[^/]+/accept/",      {"*": "Picked up a call"}),
    (r"/live-chat/calls/[^/]+/connected/",   {"*": "Call connected"}),
    (r"/live-chat/calls/[^/]+/end/",         {"*": "Ended a call"}),
    (r"/live-chat/calls/[^/]+/reject/",      {"*": "Rejected an incoming call"}),
    (r"/live-chat/calls/[^/]+/failed/",      {"*": "Call failed"}),
    (r"/live-chat/calls/[^/]+/hold/",        {"*": "Put a call on hold"}),
    (r"/live-chat/calls/[^/]+/resume/",      {"*": "Took a call off hold"}),
    (r"/live-chat/calls/[^/]+/transfer/",    {"*": "Transferred a call"}),
    (r"/live-chat/calls/[^/]+/recording/",   {"POST": "Uploaded a call recording",
                                              "DELETE": "Deleted a call recording"}),
    (r"/live-chat/calls/[^/]+/?$",           {"DELETE": "Deleted a call from history"}),
    (r"/live-chat/transfers/[^/]+/accept/",  {"*": "Accepted a transferred call"}),
    (r"/live-chat/transfers/[^/]+/decline/", {"*": "Declined a transferred call"}),
    (r"/live-chat/transfers/[^/]+/cancel/",  {"*": "Cancelled a call transfer"}),
    (r"/live-chat/[^/]+/callback/",          {"*": "Requested a callback"}),
    (r"/live-chat/[^/]+/messages/",          {"*": "Replied in live chat"}),

    # ── Money ────────────────────────────────────────────────────────────────
    (r"/deposit-requests/[^/]+/approve/",    {"*": "Approved a deposit request"}),
    (r"/deposit-requests/[^/]+/reject/",     {"*": "Rejected a deposit request"}),
    (r"/deposit-requests/[^/]+/cancel/",     {"*": "Cancelled a deposit request"}),
    (r"/deposit-requests/[^/]+/processing/", {"*": "Moved a deposit to processing"}),
    (r"/withdrawal-requests/[^/]+/approve/", {"*": "Approved a withdrawal"}),
    (r"/withdrawal-requests/[^/]+/reject/",  {"*": "Rejected a withdrawal"}),
    (r"/withdrawal-requests/[^/]+/cancel/",  {"*": "Cancelled a withdrawal"}),
    (r"/withdrawal-requests/[^/]+/paid/",    {"*": "Marked a withdrawal paid"}),
    (r"/withdrawal-requests/[^/]+/processing/", {"*": "Moved a withdrawal to processing"}),
    (r"/affiliate-withdrawals/[^/]+/approve/",  {"*": "Approved an affiliate withdrawal"}),
    (r"/affiliate-withdrawals/[^/]+/reject/",   {"*": "Rejected an affiliate withdrawal"}),
    (r"/affiliate-withdrawals/[^/]+/cancel/",   {"*": "Cancelled an affiliate withdrawal"}),
    (r"/affiliate-withdrawals/[^/]+/mark-paid/", {"*": "Marked an affiliate withdrawal paid"}),
    (r"/affiliate-withdrawals/[^/]+/processing/", {"*": "Moved an affiliate withdrawal to processing"}),
    (r"/transactions/[^/]+/approve/",        {"*": "Approved a transaction"}),
    (r"/wallet/update/",                     {"*": "Adjusted a player wallet"}),
    (r"/wallet/bonus/",                      {"*": "Added a bonus to a wallet"}),
    (r"/wallet/otp/",                        {"*": "Added OTP wallet credit"}),
    (r"/users/[^/]+/add-wallet/",            {"*": "Credited a player wallet"}),
    (r"/users/[^/]+/add-bonus/",             {"*": "Added a bonus to a player"}),
    (r"/users/add-points/",                  {"*": "Added rolling points"}),
    (r"/users/[^/]+/set-vip/",               {"*": "Changed a player VIP level"}),
    (r"/deposits/offline/",                  {"*": "Recorded an offline deposit"}),
    (r"/casino-visits/[^/]+/delete/",        {"*": "Deleted a casino visit"}),
    (r"/casino-visits/",                     {"*": "Recorded a casino visit"}),
    (r"/commissions/manual/",                {"*": "Created a manual commission"}),
    (r"/commissions/ledger/[^/]+/transition/", {"*": "Changed a commission status"}),
    (r"/affiliates/commissions/[^/]+/mark-paid/", {"*": "Marked a commission paid"}),
    (r"/affiliates/grant/",                  {"*": "Granted affiliate status"}),

    # ── Players / staff ──────────────────────────────────────────────────────
    (r"/kyc/[^/]+/update/",                  {"*": "Reviewed a KYC submission"}),
    (r"/staff/[^/]+/request-delete/",        {"*": "Requested deletion of a staff account"}),
    (r"/staff/[^/]+/delete/",                {"*": "Deleted a staff account"}),
    (r"/staff/confirm/",                     {"*": "Confirmed a staff account"}),
    (r"/notifications/send/",                {"*": "Sent a notification"}),
    (r"/rewards/create/",                    {"*": "Created a reward"}),
    (r"/gifts-rewards/[^/]+/cancel/",        {"*": "Cancelled a gift"}),
    (r"/gifts-rewards/[^/]+/expire/",        {"*": "Expired a gift"}),
    (r"/gifts-rewards/[^/]+/reissue/",       {"*": "Reissued a gift"}),
    (r"/players/[^/]+/communication/",       {"*": "Changed a player communication setting"}),

    # ── Content actions ──────────────────────────────────────────────────────
    (r"/poker/sources/[^/]+/sync/",          {"*": "Synced a poker source"}),
    (r"/poker/sources/sync-all/",            {"*": "Synced all poker sources"}),
    (r"/poker/[^/]+/review/",                {"*": "Reviewed a poker tournament"}),
    (r"/faqs/reorder/",                      {"*": "Reordered the FAQs"}),
    (r"/commissions/rules/[^/]+/duplicate/", {"*": "Duplicated a commission rule"}),
    (r"/wheel/bonus/[^/]+/assign/",          {"*": "Assigned a bonus wheel to players"}),
    (r"/email-logs/[^/]+/retry/",            {"*": "Retried a failed email"}),
    (r"/me/theme/",                          {"*": "Changed their own panel theme"}),
]

# Ordinary CRUD. Verb from the method, noun from here. Order matters: the
# more specific path must come first.
NOUN_RULES = [
    # Poker — sources before tournaments, or every source edit reads as a
    # tournament edit.
    (r"/poker/sources/",                 "a poker source"),
    (r"/poker/registrations/",           "a poker registration"),
    (r"/poker/",                         "a poker tournament"),
    (r"/section-media/poker/",           "a poker section image"),

    # Teen Patti / Andhar Bahar
    (r"/teen-patti/registrations/",      "a Teen Patti registration"),
    (r"/teen-patti/",                    "a Teen Patti event"),
    (r"/section-media/teen-patti/",      "a Teen Patti section image"),
    (r"/andhar-bahar/events/",           "an Andhar Bahar event"),
    (r"/andhar-bahar/highlights/",       "an Andhar Bahar highlight"),
    (r"/andhar-bahar/registrations/",    "an Andhar Bahar registration"),
    (r"/andhar-bahar/media/",            "an Andhar Bahar image"),
    (r"/andhar-bahar/steps/",            "an Andhar Bahar step"),
    (r"/andhar-bahar/content/",          "the Andhar Bahar page"),

    # Events
    (r"/events/tickets/",                "an event ticket request"),
    (r"/events/",                        "an event"),

    # Landing page and marketing content
    (r"/landing-settings/",              "the landing page settings"),
    (r"/hero-stats/",                    "a landing page hero stat"),
    (r"/why-choose-us/",                 "a landing page 'why choose us' item"),
    (r"/trust-badges/",                  "a landing page trust badge"),
    (r"/testimonials/",                  "a testimonial"),
    (r"/premium-partners/",              "a premium partner"),
    (r"/featured-destination-showcases/", "a featured destination showcase"),
    (r"/destination-media/",             "a destination image"),
    (r"/destinations/",                  "a destination"),
    (r"/tour-packages/",                 "a tour package"),
    (r"/cruise-package-details/",        "a cruise package detail"),
    (r"/cruise-package-media/",          "a cruise package image"),
    (r"/cruise-packages/",               "a cruise package"),
    (r"/vip-tier-benefits/",             "a VIP tier benefit"),
    (r"/vip-service-images/",            "a VIP service image"),
    (r"/vip-tiers/",                     "a VIP tier"),
    (r"/gift-items/",                    "a gift item"),
    (r"/gift-steps/",                    "a gift step"),
    (r"/experiences/",                   "an experience"),
    (r"/experience-enquiries/",          "an experience enquiry"),
    (r"/enquiry-messages/",              "an enquiry message"),
    (r"/promotions/[^/]+/gallery/",      "a promotion gallery image"),
    (r"/promotions/",                    "a promotion"),
    (r"/locations/",                     "a location"),
    (r"/faqs/",                          "an FAQ"),

    # Support
    (r"/support-departments/",           "a support department"),
    (r"/support-scripts/",               "a support script"),
    (r"/support-settings/",              "the support settings"),
    (r"/live-support-settings/",         "the live support settings"),
    (r"/support/tickets/",               "a support ticket"),
    (r"/voice-call-settings/",           "the voice call settings"),
    (r"/live-chat/call-control-config/", "the call control settings"),

    # Wheels, spin, bonuses
    (r"/wheel/bonus/[^/]+/rewards/",     "a bonus wheel reward"),
    (r"/wheel/bonus/",                   "a bonus wheel"),
    (r"/wheel/signup/rewards/",          "a signup wheel reward"),
    (r"/wheel/signup/settings/",         "the signup wheel settings"),
    (r"/spin-config/",                   "a spin configuration"),
    (r"/spin-settings/",                 "the spin settings"),
    (r"/bonus-config/",                  "the bonus configuration"),

    # Commissions
    (r"/commissions/rules/",             "a commission rule"),
    (r"/commissions/tiers/",             "a commission tier"),
    (r"/commissions/conditions/",        "a commission condition"),
    (r"/commissions/ledger/",            "a commission ledger entry"),
    (r"/affiliate-commissions/plans/",   "a commission plan"),
    (r"/affiliates/[^/]+/commission-assignment/", "an affiliate commission assignment"),

    # Analytics / campaigns
    (r"/analytics/campaign-manage/",     "a campaign"),

    # People
    (r"/staff/",                         "a staff account"),
    (r"/users/[^/]+/level/",             "a player level"),
    (r"/users/",                         "a player account"),
    (r"/casino-catalog/",                "the casino catalogue"),
]

# Endpoints that are a single settings record: POST means "saved", not
# "created a second one".
SINGLETON = re.compile(
    r"/(landing-settings|support-settings|live-support-settings|voice-call-settings"
    r"|spin-settings|bonus-config|casino-catalog|call-control-config"
    r"|wheel/signup/settings|andhar-bahar/content)/"
)

_ACTIONS = [(re.compile(p), t) for p, t in ACTION_RULES]
_NOUNS = [(re.compile(p), n) for p, n in NOUN_RULES]


def describe(method, path):
    """
    A human sentence for this request, or None if the path is not recognised.

    None is a deliberate outcome, not a failure: the caller falls back to
    "POST /path", which is honest about not knowing.
    """
    if not path:
        return None
    method = (method or "").upper()

    for rx, table in _ACTIONS:
        if rx.search(path):
            phrase = table.get(method) or table.get("*")
            if phrase:
                return phrase

    for rx, noun in _NOUNS:
        if rx.search(path):
            if SINGLETON.search(path):
                return f"Updated {noun}"
            verb = VERBS.get(method)
            if verb:
                return f"{verb} {noun}"
    return None
