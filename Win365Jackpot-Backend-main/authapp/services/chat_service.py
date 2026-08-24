# Customer Support Assistant — rule-based workflow engine.
#
# The chat widget (src/components/ChatBot.jsx) calls POST /api/chat/message/,
# which calls get_chat_provider().get_response(message, history, user).
# `user` is the authenticated Django user if the request carried a valid
# access token, otherwise None (the widget is also used pre-login).
#
# CONVERSATION LAYER — added on top of the pre-existing topic/escalation
# matching below (see "root cause" note in the inspection report this shipped
# with: the matcher had no small-talk, frustration, or context layer, so
# "hi"/"thanks"/"ok" all fell through to the generic fallback, and `history`
# was accepted but never read). None of this invents account-specific facts —
# see NEVER INVENT below; it only makes the SHAPE of the conversation natural.
# Source of truth for all of this wording: the Jackpots World VIP Customer
# Support Call & Live Chat Script Manual (Aug 2026) — cited by section number
# in comments below. Its golden rule, CHECK FIRST. RESPOND SECOND., is why
# every account-specific branch below still only ever states what was
# actually read from this user's own records.
#
# Operating rules this engine follows (see project support spec + the manual):
#   - Never assume: account-specific answers only use data actually read
#     from this user's own wallet/transaction/KYC/VIP/affiliate records —
#     never guessed, and never accepted as free text from an unauthenticated
#     visitor (see NOTE on "typed account IDs" below).
#   - Never perform financial actions (deposit/withdraw/transfer/adjust
#     balances/grant bonuses/reverse transactions/refund) — always explain
#     and point to escalation instead.
#   - Sensitive categories (missing funds, fraud, lockouts, compliance,
#     KYC disputes, payment disputes) are always escalated to a human via a
#     SupportTicket rather than answered definitively by the bot.
#   - NEVER INVENT a timeline, a policy, a document requirement, a points
#     threshold, or a reward outcome. Manual §10/§11/§12/§13/§14/§34 all
#     forbid this explicitly, and the bot previously violated it in several
#     places (hardcoded "24 hours", "2-3 business days", an invented KYC
#     document list, an invented withdrawal/KYC policy sentence) — all
#     removed. Where the manual itself has no confirmed timeline, this bot
#     says so, using its "let me verify"/escalation wording instead of a
#     guess.
#
# NOTE on "typed account IDs" — a deliberate departure from the manual's own
# example flow. The manual's model conversation has the customer type a UID
# into the chat and the AGENT looks it up in the Admin Portal. This bot has no
# Admin Portal access and no notion of "the account the customer just typed" —
# its only trustworthy identity signal is the authenticated request's own JWT
# user (see get_chat_provider's caller). Accepting an arbitrary typed ID and
# pretending to check it would let anyone probe any account from a public,
# unauthenticated chat box — an IDOR, not a feature. So "confirm your account
# details" here means "please sign in", never "please type your UID", and once
# signed in nothing further needs to be asked — the account is already known.
# Conversation memory (see _infer_topic_from_history) still does the *useful*
# part of the manual's example: not re-asking something already established
# in this conversation.
#
# To add a real LLM later: implement a new ChatProvider subclass with the
# same get_response(message, history, user) -> dict signature and branch to
# it in get_chat_provider() — no call-site changes needed anywhere else.

import random
import re
from decimal import Decimal
from functools import lru_cache

FALLBACK_REPLIES = (
    # Manual §22 "Unknown Answer" family — varied, never the exact same string
    # every time (see §22 in general, "vary wording" per the natural-language
    # rules), but never inventing an answer either.
    "I want to make sure I give you the correct information. Could you tell me a bit more about what you need help with? You can also reach our team on WhatsApp or Telegram, or raise a ticket from the Live Support tab in your Dashboard.",
    "That's a good question — I don't want to guess and give you something incorrect. Could you share a bit more detail? Our team is also reachable on WhatsApp, Telegram, or through a ticket in your Dashboard's Live Support tab.",
    "I don't want to give you incorrect information here. Could you tell me more about what's happening? If it's urgent, WhatsApp or Telegram will get you a faster answer, or you can raise a ticket from Live Support.",
)

LOGIN_REQUIRED_REPLY = (
    "I can check that precisely once you're signed in — that way I can look at "
    "your actual account instead of guessing. Please sign in and ask again, or "
    "contact our support team directly."
)
# A shorter nudge for a visitor who has already been told this once in the
# conversation — avoids repeating the same paragraph every turn (§35 "Do not
# repeat yourself" applies to the bot's own turns, not just topic scripts).
LOGIN_REQUIRED_REPLY_SHORT = "That one needs you signed in too, for the same reason — I can only check your own account, not guess at it."


# ─────────────────────────────────────────────────────────────────────────
# Matching — word-boundary, not substring. The previous version used plain
# `kw in message.lower()`, which matches a keyword anywhere inside a longer
# word (e.g. "hi" inside "history", "this", "which" — a real false-positive
# class) as well as inside an unrelated longer phrase. `\b...\b` fixes both
# without changing how multi-word phrases ("sign up", "forgot password")
# match — a word boundary just anchors their first and last words.
# ─────────────────────────────────────────────────────────────────────────
@lru_cache(maxsize=512)
def _kw_pattern(keyword):
    return re.compile(r"\b" + re.escape(keyword.lower()) + r"\b")


def _norm(message):
    return (message or "").strip().lower()


def _matches_any(message, keywords):
    msg = _norm(message)
    return any(_kw_pattern(kw).search(msg) for kw in keywords)


def _score(message, keywords):
    msg = _norm(message)
    return sum(1 for kw in keywords if _kw_pattern(kw).search(msg))


def _is_bare_mention(message, bare_forms):
    """True when the ENTIRE trimmed message is just one of `bare_forms` (a
    short list like ["deposit"] / ["withdrawal", "withdraw"]) — i.e. the
    customer said only the topic word and nothing else ("deposit", not "I
    made a deposit yesterday"). Deliberately exact, not a keyword score, so
    a real, fuller question about the same topic is never misrouted into a
    clarifying question it doesn't need (§19's own examples are all bare
    one-word messages)."""
    norm = _norm(message).strip(" ?!.,")
    return norm in bare_forms


# ─────────────────────────────────────────────────────────────────────────
# Small talk — checked first, and matched against the WHOLE message (not a
# substring score), so a real question that happens to start politely
# ("thanks, but my withdrawal is still pending") is not swallowed by the
# thanks pattern — the manual's Golden Rule questions still get checked.
# Wording follows the project's support-bot spec for these exact scenarios.
# ─────────────────────────────────────────────────────────────────────────
_SMALL_TALK = [
    ("greeting", re.compile(r"^(hi+|hello+|hey+|hiya|yo|howdy|good\s?(morning|afternoon|evening))[\s!.,]*$", re.I), (
        "Hi! Welcome to Jackpots World VIP Support 😊 How can I help you today?",
        "Hello! Welcome to Jackpots World VIP Support. How can I assist you today?",
        "Hi there! Welcome to Jackpots World VIP. What can I help you with today?",
    )),
    ("thanks", re.compile(r"^(thanks?( you)?|thank\s?u|ty|much\s?appreciated|appreciate\s?it)[\s!.,]*$", re.I), (
        "You're very welcome! Is there anything else I can help you with?",
        "Happy to help! Let me know if there's anything else.",
    )),
    ("ack", re.compile(r"^(ok(ay)?|k|alright|got\s?it|sure|noted|understood|cool|fine)[\s!.,]*$", re.I), (
        "Sure. If you need anything else, I'm here to help.",
        "Sounds good — I'm here if anything else comes up.",
    )),
    ("how_are_you", re.compile(r"^how('?s| is| are) (you|it going|things)( doing)?[\s?!.]*$", re.I), (
        "I'm doing well, thank you! How can I help you today?",
    )),
]


def _match_small_talk(message):
    msg = _norm(message)
    for topic, pattern, replies in _SMALL_TALK:
        if pattern.match(msg):
            return topic, random.choice(replies)
    return None, None


# ─────────────────────────────────────────────────────────────────────────
# Frustration / immediate-action / guarantee-seeking — meta-intents layered
# on top of whatever topic (if any) the same message also names. Manual §20,
# §21, §28.
# ─────────────────────────────────────────────────────────────────────────
FRUSTRATION_KEYWORDS = [
    "ridiculous", "nobody is helping", "no one is helping", "waited too long", "been waiting forever",
    "unacceptable", "fed up", "sick of this", "this is a joke", "worst support", "useless",
]
IMMEDIATE_ACTION_KEYWORDS = [
    "fix this now", "do this now", "right now", "immediately", "need my money now", "i need this now",
]
GUARANTEE_KEYWORDS = [
    "guarantee", "promise me", "can you guarantee", "will you promise", "promise this will",
]
# Manual §27/§29's own cue phrases ("Any update?", "What's the status?", "Did
# you check my request?") — gates when a topic-less message is allowed to
# fall back to whatever was last discussed (_infer_topic_from_history).
# Deliberately narrow: an unrelated topic-less message ("ok thanks", "ha ha")
# must NOT get hijacked into continuing a stale topic just because history
# has one sitting in it.
FOLLOWUP_CUE_KEYWORDS = [
    "any update", "any news", "what's the status", "whats the status", "what is the status",
    "did you check", "still waiting", "any progress", "still pending", "what about it",
    "still no", "has it been", "any word",
]

FRUSTRATION_OPENERS = (
    "I understand your frustration, and I want to help. ",
    "I understand your concern, and I want to help you. ",
)
IMMEDIATE_ACTION_OPENER = (
    "I understand this is important to you. I want to make sure I give you accurate information, "
    "so it needs to be handled through the applicable process rather than something I can act on myself here. "
)
GUARANTEE_OPENER = (
    "I understand you'd like a firm confirmation. I don't want to give you an unconfirmed guarantee, "
    "so here's what I can actually confirm: "
)


# ─────────────────────────────────────────────────────────────────────────
# General knowledge base — no account access needed.
# ─────────────────────────────────────────────────────────────────────────
KNOWLEDGE_BASE = [
    {
        "topic": "account_registration",
        "keywords": ["register", "registration", "sign up", "signup", "create account", "new account", "join"],
        "answer": "To create an account, click Sign Up in the top navigation, enter your name, phone number and email, verify the OTP sent to you, and set a password. It only takes a minute.",
    },
    {
        "topic": "login_issues",
        "keywords": ["login", "log in", "sign in", "can't login", "cannot login", "password reset", "forgot password"],
        "answer": "I understand you're having trouble signing in. Double-check your email and password are correct, and if you've forgotten your password, use the 'Forgot Password' link on the sign-in screen. If you're still stuck, let me know what happens when you try — an error message, if you see one — and I'll get our team to look into it.",
    },
    {
        "topic": "casino_info",
        "keywords": ["casino", "casinos", "partner casino", "which casino", "destinations"],
        "answer": "We partner with leading casinos across India, Sri Lanka, Vietnam, Macau and the Philippines. Check the Destinations page for the full list and details on each property.",
    },
    {
        "topic": "poker",
        "keywords": ["poker", "tournament", "poker event", "buy-in", "buyin"],
        "answer": "Our Poker page lists upcoming and live tournaments at partner casinos, including buy-ins and schedules. Sign in and click Register on any tournament to reserve your seat.",
    },
    {
        "topic": "events",
        "keywords": ["event", "events", "casino event", "festival"],
        "answer": "Check the Events page for upcoming casino festivals, galas and high-stakes weekends. Click into any event for full details and to register.",
    },
    {
        "topic": "promotions",
        "keywords": ["promotion", "promotions", "offer", "deal"],
        "answer": "Our Promotions page lists current bonuses and offers from partner casinos, refreshed regularly. Check back often — offers vary by casino and country.",
    },
    {
        "topic": "referral_program",
        "keywords": ["referral", "refer a friend", "invite", "referral code", "referral link"],
        "answer": "Share your personal referral link (found in your Dashboard's Referral tab) with friends — when they sign up and deposit, you earn referral rewards automatically.",
    },
    {
        "topic": "responsible_gambling",
        "keywords": ["responsible gambling", "self-exclusion", "self exclusion", "deposit limit", "cooling off", "gambling problem", "addiction"],
        "answer": "We take responsible gambling seriously. From your Dashboard's Responsible Gambling tab you can set deposit limits, request a cooling-off period, or self-exclude. If you need help, please also reach out to a local support service.",
    },
    {
        "topic": "contact_support",
        "keywords": ["human", "agent", "representative", "talk to someone", "real person"],
        "answer": "You can reach our support team via WhatsApp or Telegram (buttons in the bottom corner), by raising a ticket from the Live Support tab in your Dashboard, or by emailing support@jackpotsworld.vip.",
    },
    {
        "topic": "faq",
        "keywords": ["faq", "frequently asked", "how does this work"],
        "answer": "You can find answers to common questions in the FAQ section of the Live Support tab in your Dashboard, or just ask me directly — I can help with registration, wallet, deposits, withdrawals, poker, events, promotions, VIP, affiliates and responsible gambling.",
    },
]
MIN_MATCHES = 1

# ─────────────────────────────────────────────────────────────────────────
# Account-aware topics — answered generically when signed out, enriched
# with the user's own (read-only) data when signed in. `bare_forms` backs
# §19's "incomplete message" clarifying-question behaviour — see
# _is_bare_mention.
# ─────────────────────────────────────────────────────────────────────────
ACCOUNT_TOPICS = {
    "wallet": {
        "keywords": ["wallet", "balance", "cash wallet", "non-cash", "otp credits", "rolling points", "how much do i have", "my balance"],
        "bare_forms": {"wallet", "balance"},
        "clarify": "Sure, I can help with your wallet. Are you checking your current balance, or looking for a specific transaction?",
        "generic": "Your Wallet tab shows your Cash, Non-Cash, OTP Credit and Rolling Points balances, plus your full transaction history. You can find it in your Dashboard sidebar under 'Wallet'.",
    },
    "deposits": {
        "keywords": ["deposit", "add funds", "top up", "topup", "fund my account", "deposited"],
        "bare_forms": {"deposit", "deposits"},
        "clarify": "Sure, I can help with that. Are you checking the status of a deposit you've already made, or would you like help with something else related to deposits?",
        "generic": "Deposits are made offline through our partner casinos — visit a casino, deposit, and our team records it to your Wallet. Ask your host or contact support for the exact steps for your casino.",
    },
    "withdrawals": {
        "keywords": ["withdraw", "withdrawal", "cash out", "payout", "get my money"],
        "bare_forms": {"withdrawal", "withdrawals", "withdraw"},
        "clarify": "Of course. Are you checking the status of a withdrawal you've already requested, or is there another issue with your withdrawal?",
        "generic": "Withdrawals are processed through the same partner casino you deposited at. Contact our support team with your Wallet balance and casino details and we'll guide you through it.",
    },
    "kyc": {
        "keywords": ["kyc", "verify my account", "verification status", "identity verification", "document verification"],
        "bare_forms": {"kyc"},
        "clarify": "Sure — are you checking your current verification status, or do you have a question about the verification process itself?",
        "generic": "KYC verification is completed from your Dashboard's KYC section, and our team reviews it.",
    },
    "vip": {
        "keywords": ["vip level", "vip tier", "vip points", "vip status", "jackpot tier", "loyalty", "next level", "next vip level"],
        "bare_forms": {"vip"},
        "clarify": "Sure. Are you looking to check your current VIP level, VIP points, rewards, or something else?",
        "generic": "Our VIP Program rewards you as you play more, with tiers from Bronze up through the Jackpot tiers, each unlocking better bonuses and perks. Check the VIP Levels page for the full breakdown.",
    },
    "affiliate": {
        "keywords": ["affiliate", "affiliate program", "affiliate dashboard", "commission", "affiliate application", "affiliate request", "affiliate status"],
        "bare_forms": {"affiliate"},
        "clarify": "Sure, I can help with that. Are you checking an affiliate application, commission, earnings, or another affiliate-related question?",
        "generic": "Our Affiliate Program lets approved partners earn ongoing commission on every player they refer. Apply from the Affiliates page — approved affiliates get their own dashboard with full click, referral and commission tracking.",
    },
    "support_ticket": {
        "keywords": ["ticket", "support ticket", "support request", "raised a ticket", "my ticket", "my request", "case number"],
        "bare_forms": {"ticket"},
        "clarify": "Sure — are you checking the status of a ticket you've already raised, or would you like to raise a new one?",
        "generic": "I can check the current status of your support request. Could you please share your ticket details, or raise a new one from the Live Support tab in your Dashboard?",
    },
}

# VIP/gifts and rewards questions (§14) never get a confirmed eligibility/
# model/date answer from this bot — the manual is explicit that only the
# Admin Portal can confirm those, and this bot has no reward-eligibility
# data source to read from. This is intentionally NOT folded into the "vip"
# topic above (which handles level/points, real data this bot CAN read).
REWARD_KEYWORDS = [
    "iphone", "rolex", "mercedes", "car giveaway", "vip gift", "vip reward", "my reward", "my gift", "free gift",
]
REWARD_REPLY = (
    "Thank you for asking about VIP rewards. I don't want to guess at eligibility, the specific item, or a "
    "delivery date — that needs to be checked and confirmed for your account and VIP level. Let me flag this "
    "so it's reviewed through the applicable process."
)

WALLET_LABELS = {"C": "Cash", "NC": "Non-Cash", "O": "OTP Credit", "RP": "Rolling Points"}

# ─────────────────────────────────────────────────────────────────────────
# Escalation categories — never answered definitively by the bot. Always
# acknowledged, always routed to a human (SupportTicket when the user is
# signed in; direct-contact instructions otherwise). No `timeline` field any
# more — see the module docstring's NEVER INVENT note; the manual is explicit
# (§10/§11/§34) that a timeline may never be promised unless confirmed, and
# nothing in this codebase confirms one.
# ─────────────────────────────────────────────────────────────────────────
ESCALATION_CATEGORIES = [
    {
        "category": "missing_funds",
        "keywords": ["missing money", "money missing", "money is missing", "funds missing", "funds are missing",
                     "balance disappeared", "money disappeared", "missing from my account", "not in my account",
                     "didn't receive my", "did not receive my", "never received my", "missing deposit", "missing withdrawal"],
        "note": "Missing-funds reports are treated as a priority and checked against your full transaction history.",
    },
    {
        "category": "fraud",
        "keywords": ["fraud", "scam", "unauthorized", "unauthorised", "hacked", "someone accessed my account", "suspicious activity", "stolen"],
        "note": "Account-security reports are escalated immediately to our security team.",
    },
    {
        "category": "account_lockout",
        "keywords": ["locked out", "account locked", "account suspended", "account banned", "account disabled", "can't access my account", "cannot access my account"],
        "note": "Account access issues are reviewed by our compliance team before any account is reopened.",
    },
    {
        "category": "compliance",
        "keywords": ["compliance", "regulator", "regulation", "license issue", "licence issue"],
        "note": "Compliance matters are handled directly by our compliance team.",
    },
    {
        "category": "kyc_dispute",
        "keywords": ["kyc rejected", "kyc denied", "verification rejected", "verification failed", "document rejected"],
        "note": "KYC decisions are reviewed manually before any resubmission is requested.",
    },
    {
        "category": "payment_dispute",
        "keywords": ["dispute", "chargeback", "wrong amount", "incorrect amount", "double charged", "charged twice", "overcharged"],
        "note": "Payment disputes are checked against your transaction records before any adjustment is made.",
    },
]

# Requests asking the assistant to move money or otherwise mutate an
# account — must never be actioned, only explained + escalated.
FINANCIAL_ACTION_KEYWORDS = [
    "please deposit", "please withdraw", "process my withdrawal", "process my deposit",
    "add bonus", "give me a bonus", "grant me a bonus", "reverse my transaction", "reverse this transaction",
    "refund me", "give me a refund", "transfer money to", "credit my account", "add funds to my account",
    "increase my balance", "adjust my balance",
]

FINANCIAL_ACTION_REPLY = (
    "I'm not able to move funds, change balances, grant bonuses or reverse "
    "transactions myself — those actions can only be carried out by an "
    "authorized administrator after verification. {escalation_note}"
)


def _match_knowledge_base(message):
    best, best_score = None, 0
    for entry in KNOWLEDGE_BASE:
        score = _score(message, entry["keywords"])
        if score > best_score:
            best, best_score = entry, score
    return best if best and best_score >= MIN_MATCHES else None


def _match_account_topic(message):
    best_key, best_score = None, 0
    for key, cfg in ACCOUNT_TOPICS.items():
        score = _score(message, cfg["keywords"])
        if score > best_score:
            best_key, best_score = key, score
    return best_key if best_score >= MIN_MATCHES else None


def _match_escalation(message):
    best, best_score = None, 0
    for entry in ESCALATION_CATEGORIES:
        score = _score(message, entry["keywords"])
        if score > best_score:
            best, best_score = entry, score
    return best if best and best_score >= MIN_MATCHES else None


def _infer_topic_from_history(history):
    """Manual §19/§29: a follow-up like "any update?" or "what about it?"
    should continue the topic already being discussed, not fall through to
    the generic fallback. Scans the conversation's own prior USER turns
    (never the bot's) for the most recent account-topic match — real
    continuity from what was actually said, nothing inferred beyond that."""
    if not isinstance(history, list):
        return None
    for turn in reversed(history):
        if not isinstance(turn, dict) or turn.get("role") != "user":
            continue
        content = turn.get("content") or ""
        topic = _match_account_topic(content)
        if topic:
            return topic
    return None


def _is_repeat_of_last_user_topic(message, topic, history):
    """Manual §27 "Customer repeats the same question": true when the
    PREVIOUS user turn already matched the same topic as this one."""
    if not isinstance(history, list) or not topic:
        return False
    user_turns = [t for t in history if isinstance(t, dict) and t.get("role") == "user"]
    if len(user_turns) < 2:
        return False
    prev = user_turns[-2].get("content") or ""  # -1 is the current message itself
    return _match_account_topic(prev) == topic


# ─────────────────────────────────────────────────────────────────────────
# SupportScript — the manual's own wording, stored in the DB (migration
# 0070) so the Back Office can edit it in one place shared with the live-
# agent quick-replies. Falling back to a literal if a row is missing/
# deactivated mirrors live_chat_service._post_opening_greeting's own
# defensive pattern: a missing script row must never break the bot.
# ─────────────────────────────────────────────────────────────────────────
def _script(key, fallback):
    try:
        from authapp.models.support_script_models import SupportScript
        row = SupportScript.objects.filter(key=key, is_active=True).first()
        if row and row.body.strip():
            return row.body.strip()
    except Exception:
        pass
    return fallback


# ─────────────────────────────────────────────────────────────────────────
# Read-only account context — strictly scoped to the signed-in user's own
# records. Never touches another user's data.
# ─────────────────────────────────────────────────────────────────────────
def _get_wallet_summary(user):
    from authapp.models.wallet_models import WalletAccount
    balances = {w.wallet_type: w.balance for w in WalletAccount.objects.filter(user=user)}
    parts = []
    for code, label in (("C", "Cash"), ("NC", "Non-Cash"), ("O", "OTP Credit"), ("RP", "Rolling Points")):
        bal = balances.get(code, Decimal("0"))
        parts.append(f"{label} ${bal:,.2f}" if code != "RP" else f"{label} {bal:,.0f}")
    return balances, ", ".join(parts)


def _get_recent_transaction(user, wallet_type=None):
    from authapp.models.wallet_models import WalletTransaction
    qs = WalletTransaction.objects.filter(user=user)
    if wallet_type:
        qs = qs.filter(wallet__wallet_type=wallet_type)
    return qs.order_by("-created_at").first()


def _get_kyc_status(user):
    from authapp.models.kyc_model import KYCSubmission
    kyc = KYCSubmission.objects.filter(user=user, kyc_type="player").first()
    return kyc.status if kyc else "not submitted"


def _get_affiliate_status(user):
    """(status, profile) where status is 'not_applied' | 'pending' | 'approved'.
    Real, derivable from AffiliateProfile as it's actually used elsewhere in
    this codebase (see affiliate_views.py): a row is created with
    is_active=False on application, then flipped to True + approved_by set on
    approval — there is no separate "application" model to read instead."""
    from authapp.models.affiliate_models import AffiliateProfile
    profile = AffiliateProfile.objects.filter(user=user).first()
    if not profile:
        return "not_applied", None
    return ("approved" if profile.is_active else "pending"), profile


def _create_escalation_ticket(user, message, category, note):
    from authapp.models.support_ticket_models import SupportTicket
    ticket = SupportTicket.objects.create(
        user=user,
        subject=f"[Auto-escalated: {category}] {message[:150]}",
        message=(
            f"Auto-escalated by Customer Support chat.\n"
            f"Category: {category}\n"
            f"Note: {note}\n\n"
            f"Player message:\n{message}"
        ),
    )
    return ticket


class ChatProvider:
    def get_response(self, message, history, user=None):
        raise NotImplementedError


class SupportWorkflowProvider(ChatProvider):
    """Rule-based Customer Support workflow: greet/acknowledge naturally ->
    identify (signed-in user only) -> check real account data -> respond with
    only confirmed information -> escalate sensitive categories to a human.
    Never invents a timeline, policy, requirement, or reward outcome."""

    def get_response(self, message, history, user=None):
        message = message or ""
        authenticated = bool(user and getattr(user, "is_authenticated", False))

        # 0) Small talk — checked first and against the WHOLE message, so it
        # can never swallow a real question (see _match_small_talk).
        st_topic, st_reply = _match_small_talk(message)
        if st_topic:
            return {"reply": st_reply, "matched_topic": f"small_talk_{st_topic}", "escalated": False, "ticket_id": None}

        # 1) Financial-action requests — never actioned, always explained.
        if _matches_any(message, FINANCIAL_ACTION_KEYWORDS):
            escalation = self._escalate(message, user, authenticated, category="financial_action_request",
                                         note="Your request has been logged for an authorized administrator to review.")
            reply = FINANCIAL_ACTION_REPLY.format(escalation_note=escalation["note_text"])
            return {"reply": reply, "matched_topic": "financial_action_request", "escalated": escalation["escalated"], "ticket_id": escalation["ticket_id"]}

        # 2) Sensitive categories — always escalate, never answered directly.
        esc_match = _match_escalation(message)
        if esc_match:
            escalation = self._escalate(message, user, authenticated, category=esc_match["category"], note=esc_match["note"])
            reply = (
                f"I'm sorry you're dealing with this — I've flagged it for our team right away. "
                f"{escalation['note_text']} For anything urgent, you can also reach us directly via WhatsApp or Telegram."
            )
            return {"reply": reply, "matched_topic": esc_match["category"], "escalated": escalation["escalated"], "ticket_id": escalation["ticket_id"]}

        # 3) VIP rewards/gifts (§14) — never a confirmed eligibility/model/date.
        if _matches_any(message, REWARD_KEYWORDS):
            return {"reply": REWARD_REPLY, "matched_topic": "vip_rewards", "escalated": False, "ticket_id": None}

        # 4) Frustration / immediate-action / guarantee-seeking meta-intents,
        # layered on top of whichever real topic (if any) the message also
        # names — acknowledge, then still actually answer if a topic exists.
        is_frustrated = _matches_any(message, FRUSTRATION_KEYWORDS)
        wants_now = _matches_any(message, IMMEDIATE_ACTION_KEYWORDS)
        wants_guarantee = _matches_any(message, GUARANTEE_KEYWORDS)
        opener = ""
        meta_topic = None
        if is_frustrated:
            opener, meta_topic = random.choice(FRUSTRATION_OPENERS), "frustrated_customer"
        elif wants_now:
            opener, meta_topic = IMMEDIATE_ACTION_OPENER, "immediate_action_demand"
        elif wants_guarantee:
            opener, meta_topic = GUARANTEE_OPENER, "guarantee_request"

        # 5) Bare one-word topic mentions (§19) — a clarifying question, not
        # the full generic answer, UNLESS a meta-intent above already gives
        # this message a clear direction (e.g. "withdrawal!!" from an angry
        # customer still deserves the real check, not another question).
        if not meta_topic:
            for key, cfg in ACCOUNT_TOPICS.items():
                if _is_bare_mention(message, cfg["bare_forms"]):
                    return {"reply": cfg["clarify"], "matched_topic": f"{key}_clarify", "escalated": False, "ticket_id": None}

        # 6) Account-aware topics — enrich with the user's own data if signed
        # in. A message matching one of §27/§29's own follow-up cues ("any
        # update?", "what's the status?") and naming no topic of its own
        # continues whatever was last discussed instead of hitting the
        # fallback — gated narrowly on those cues specifically so an
        # unrelated topic-less message doesn't get hijacked into a stale
        # topic just because one exists somewhere in history.
        account_topic = _match_account_topic(message)
        if not account_topic and _matches_any(message, FOLLOWUP_CUE_KEYWORDS):
            account_topic = _infer_topic_from_history(history)
        if account_topic:
            is_repeat = _is_repeat_of_last_user_topic(message, account_topic, history)
            reply = self._account_reply(account_topic, user, authenticated, repeat=is_repeat)
            return {"reply": f"{opener}{reply}", "matched_topic": account_topic, "escalated": False, "ticket_id": None}

        # 7) A meta-intent with no identifiable topic — pure manual wording,
        # nothing further to check.
        if meta_topic:
            closing = _script("escalation", "I've checked the available information, but this requires further checking. I'll have it reviewed through the appropriate internal process.")
            return {"reply": f"{opener}{closing}", "matched_topic": meta_topic, "escalated": False, "ticket_id": None}

        # 8) General knowledge base.
        kb_match = _match_knowledge_base(message)
        if kb_match:
            return {"reply": kb_match["answer"], "matched_topic": kb_match["topic"], "escalated": False, "ticket_id": None}

        return {"reply": random.choice(FALLBACK_REPLIES), "matched_topic": None, "escalated": False, "ticket_id": None}

    def _escalate(self, message, user, authenticated, category, note):
        if authenticated:
            ticket = _create_escalation_ticket(user, message, category, note)
            return {
                "escalated": True,
                "ticket_id": str(ticket.id) if hasattr(ticket, "id") else ticket.pk,
                "note_text": f"I've raised ticket #{ticket.pk} with our support team — {note} It is being handled through the applicable internal process.",
            }
        return {
            "escalated": False,
            "ticket_id": None,
            "note_text": "Please sign in and raise a ticket from the Live Support tab (or message us on WhatsApp/Telegram) so our team can verify your account and follow up.",
        }

    def _account_reply(self, topic, user, authenticated, repeat=False):
        cfg = ACCOUNT_TOPICS[topic]
        if not authenticated:
            return f"{cfg['generic']} {LOGIN_REQUIRED_REPLY_SHORT if repeat else LOGIN_REQUIRED_REPLY}"

        status_line = _script("status_update", "I have checked, and current status is showing as [STATUS].")
        repeat_prefix = "I understand you're asking again — " if repeat else ""

        if topic == "wallet":
            _, summary = _get_wallet_summary(user)
            return f"{repeat_prefix}Here's your current wallet: {summary}. You can see the full breakdown and transaction history in your Dashboard's Wallet tab."

        if topic == "kyc":
            status = _get_kyc_status(user)
            if status == "approved":
                return f"{repeat_prefix}I've checked, and your verification is showing as approved — you're fully verified."
            if status == "rejected":
                return f"{repeat_prefix}I've checked, and your last verification submission is showing as rejected. Please resubmit from your Dashboard's KYC section, or contact support for the specific reason."
            if status == "pending":
                return f"{repeat_prefix}I've checked, and your verification is currently showing as pending review. {_script('checking', 'Thank you for waiting.')}"
            return f"{repeat_prefix}I've checked, and you haven't submitted verification yet. You can do this from your Dashboard's KYC section."

        if topic == "vip":
            return (
                f"{repeat_prefix}I've checked your account — you're currently VIP level {user.vip_level}, "
                f"with {user.vip_xp} points toward the next level (progress: {user.vip_progress_pct}%). "
                f"You can see the full tier breakdown on the VIP Levels page."
            )

        if topic == "affiliate":
            status, profile = _get_affiliate_status(user)
            if status == "not_applied":
                return f"{repeat_prefix}I've checked, and I don't see an affiliate application on your account yet. You can apply from the Affiliates page."
            if status == "pending":
                return f"{repeat_prefix}I've checked, and your affiliate request is showing as pending. {_script('checking', 'It is being reviewed through the applicable process.')}"
            return (
                f"{repeat_prefix}I've checked — your affiliate account is approved, at a {profile.commission_rate}% commission rate. "
                f"Total earned so far is ${profile.total_earned:,.2f}, with ${profile.total_pending:,.2f} pending payout. "
                f"You can see the full breakdown in your Affiliate Dashboard."
            )

        if topic == "support_ticket":
            from authapp.models.support_ticket_models import SupportTicket
            # Not the live-chat thread itself — the tickets raised from the
            # ticket form (§17), which is what "I raised a ticket" means.
            ticket = SupportTicket.objects.filter(user=user, is_live_chat=False).order_by("-created_at").first()
            if not ticket:
                return f"{repeat_prefix}I don't see an open support ticket on your account. You can raise one from the Live Support tab in your Dashboard, and I'll be able to check it here."
            return f"{repeat_prefix}{status_line.replace('[STATUS]', ticket.get_status_display())} It is being handled through the applicable internal process."

        if topic == "withdrawals":
            kyc_status = _get_kyc_status(user)
            last_wac = _get_recent_transaction(user, wallet_type="C")
            if kyc_status != "approved":
                return (
                    f"{repeat_prefix}{cfg['generic']} I also checked your account — your verification status is showing as "
                    f"'{kyc_status}', and that needs to be approved before a withdrawal can be processed. You can complete "
                    f"verification from your Dashboard's KYC section if you haven't already."
                )
            if last_wac:
                return (
                    f"{repeat_prefix}{cfg['generic']} Your most recent Cash wallet transaction was a "
                    f"{last_wac.get_transaction_type_display()} of ${last_wac.amount:,.2f} on "
                    f"{last_wac.created_at.strftime('%d %b %Y')}. If you're asking about a specific withdrawal "
                    f"that hasn't shown up, let me know the amount and date and I'll escalate it for you."
                )
            return f"{repeat_prefix}{cfg['generic']}"

        if topic == "deposits":
            last_dac = _get_recent_transaction(user, wallet_type="C")
            if last_dac:
                return (
                    f"{repeat_prefix}{cfg['generic']} Your most recent Cash wallet transaction was a "
                    f"{last_dac.get_transaction_type_display()} of ${last_dac.amount:,.2f} on "
                    f"{last_dac.created_at.strftime('%d %b %Y')}."
                )
            return f"{repeat_prefix}{cfg['generic']}"

        return f"{repeat_prefix}{cfg['generic']}"


def get_chat_provider():
    # Later: read settings.CHAT_PROVIDER and branch to a real LLM-backed
    # provider here — everything else in the request path stays the same.
    return SupportWorkflowProvider()
