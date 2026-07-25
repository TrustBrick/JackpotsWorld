# Customer Support Assistant — rule-based workflow engine.
#
# The chat widget (src/components/ChatBot.jsx) calls POST /api/chat/message/,
# which calls get_chat_provider().get_response(message, history, user).
# `user` is the authenticated Django user if the request carried a valid
# access token, otherwise None (the widget is also used pre-login).
#
# Operating rules this engine follows (see project support spec):
#   - Never assume: account-specific answers only use data actually read
#     from this user's own wallet/transaction/KYC records — never guessed.
#   - Never perform financial actions (deposit/withdraw/transfer/adjust
#     balances/grant bonuses/reverse transactions/refund) — always explain
#     and point to escalation instead.
#   - Sensitive categories (missing funds, fraud, lockouts, compliance,
#     KYC disputes, payment disputes) are always escalated to a human via a
#     SupportTicket rather than answered definitively by the bot.
#
# To add a real LLM later: implement a new ChatProvider subclass with the
# same get_response(message, history, user) -> dict signature and branch to
# it in get_chat_provider() — no call-site changes needed anywhere else.

from decimal import Decimal

FALLBACK_REPLY = (
    "I couldn't find a specific answer to that. Could you tell me a bit more "
    "about what you need help with? You can also reach our team directly on "
    "WhatsApp or Telegram, or raise a ticket from the Live Support tab in "
    "your Dashboard."
)

LOGIN_REQUIRED_REPLY = (
    "I can help more precisely if you're signed in — that way I can check "
    "your actual wallet balance, transaction history and KYC status. "
    "Please sign in and try again, or contact our support team directly."
)

# ─────────────────────────────────────────────────────────────────────────
# General knowledge base — no account access needed.
# `keywords` are matched case-insensitively as substrings against the
# incoming message; the entry with the most keyword hits wins.
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
        "answer": "If you're having trouble logging in, double-check your email and password are correct. If you've forgotten your password, use the 'Forgot Password' link on the sign-in screen. Still stuck? Contact our support team.",
    },
    {
        "topic": "casino_info",
        "keywords": ["casino", "casinos", "partner casino", "which casino", "destinations", "location"],
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
        "topic": "vip_program",
        "keywords": ["vip", "vip level", "vip tier", "loyalty", "jackpot tier"],
        "answer": "Our VIP Program rewards you as you play more, with tiers from Bronze up through the Jackpot tiers, each unlocking better bonuses and perks. Check the VIP Levels page for the full breakdown.",
    },
    {
        "topic": "referral_program",
        "keywords": ["referral", "refer a friend", "invite", "referral code", "referral link"],
        "answer": "Share your personal referral link (found in your Dashboard's Referral tab) with friends — when they sign up and deposit, you earn referral rewards automatically.",
    },
    {
        "topic": "affiliate_program",
        "keywords": ["affiliate", "affiliate program", "affiliate dashboard", "commission"],
        "answer": "Our Affiliate Program lets approved partners earn ongoing commission on every player they refer. Apply from the Affiliates page — approved affiliates get their own dashboard with full click, referral and commission tracking.",
    },
    {
        "topic": "responsible_gambling",
        "keywords": ["responsible gambling", "self-exclusion", "self exclusion", "deposit limit", "cooling off", "gambling problem", "addiction"],
        "answer": "We take responsible gambling seriously. From your Dashboard's Responsible Gambling tab you can set deposit limits, request a cooling-off period, or self-exclude. If you need help, please also reach out to a local support service.",
    },
    {
        "topic": "contact_support",
        "keywords": ["human", "agent", "representative", "talk to someone", "real person"],
        "answer": "You can reach our support team via WhatsApp or Telegram (buttons in the bottom corner), by raising a ticket from the Live Support tab in your Dashboard, or by emailing support@jackpotsworld.casino.",
    },
    {
        "topic": "faq",
        "keywords": ["faq", "frequently asked", "how does this work"],
        "answer": "You can find answers to common questions in the FAQ section of the Live Support tab in your Dashboard, or just ask me directly — I can help with registration, wallet, deposits, withdrawals, poker, events, promotions, VIP, referrals, affiliates and responsible gambling.",
    },
]
MIN_MATCHES = 1

# ─────────────────────────────────────────────────────────────────────────
# Account-aware topics — answered generically when signed out, enriched
# with the user's own (read-only) data when signed in.
# ─────────────────────────────────────────────────────────────────────────
ACCOUNT_TOPICS = {
    "wallet": {
        "keywords": ["wallet", "balance", "cash wallet", "non-cash", "otp credits", "rolling points", "how much do i have", "my balance"],
        "generic": "Your Wallet tab shows your Cash, Non-Cash, OTP Credit and Rolling Points balances, plus your full transaction history. You can find it in your Dashboard sidebar under 'Wallet'.",
    },
    "deposits": {
        "keywords": ["deposit", "add funds", "top up", "topup", "fund my account"],
        "generic": "Deposits are made offline through our partner casinos — visit a casino, deposit, and our team records it to your Wallet. Ask your host or contact support for the exact steps for your casino.",
    },
    "withdrawals": {
        "keywords": ["withdraw", "withdrawal", "cash out", "payout", "get my money"],
        "generic": "Withdrawals are processed through the same partner casino you deposited at. Contact our support team with your Wallet balance and casino details and we'll guide you through it.",
    },
    "kyc": {
        "keywords": ["kyc", "verify my account", "verification status", "identity verification", "document verification"],
        "generic": "KYC verification is completed from your Dashboard's KYC section — upload a valid ID and a selfie, and our team reviews it, typically within 1-2 business days.",
    },
}

WALLET_LABELS = {"C": "Cash", "NC": "Non-Cash", "O": "OTP Credit", "RP": "Rolling Points"}

# ─────────────────────────────────────────────────────────────────────────
# Escalation categories — never answered definitively by the bot. Always
# acknowledged, always routed to a human (SupportTicket when the user is
# signed in; direct-contact instructions otherwise).
# ─────────────────────────────────────────────────────────────────────────
ESCALATION_CATEGORIES = [
    {
        "category": "missing_funds",
        "keywords": ["missing money", "money missing", "money is missing", "funds missing", "funds are missing",
                     "balance disappeared", "money disappeared", "missing from my account", "not in my account",
                     "didn't receive my", "did not receive my", "never received my", "missing deposit", "missing withdrawal"],
        "note": "Missing-funds reports are treated as a priority and checked against your full transaction history.",
        "timeline": "24 hours",
    },
    {
        "category": "fraud",
        "keywords": ["fraud", "scam", "unauthorized", "unauthorised", "hacked", "someone accessed my account", "suspicious activity", "stolen"],
        "note": "Account-security reports are escalated immediately to our security team.",
        "timeline": "a few hours",
    },
    {
        "category": "account_lockout",
        "keywords": ["locked out", "account locked", "account suspended", "account banned", "account disabled", "can't access my account", "cannot access my account"],
        "note": "Account access issues are reviewed by our compliance team before any account is reopened.",
        "timeline": "24 hours",
    },
    {
        "category": "compliance",
        "keywords": ["compliance", "regulator", "regulation", "license issue", "licence issue"],
        "note": "Compliance matters are handled directly by our compliance team.",
        "timeline": "2-3 business days",
    },
    {
        "category": "kyc_dispute",
        "keywords": ["kyc rejected", "kyc denied", "verification rejected", "verification failed", "document rejected"],
        "note": "KYC decisions are reviewed manually before any resubmission is requested.",
        "timeline": "1-2 business days",
    },
    {
        "category": "payment_dispute",
        "keywords": ["dispute", "chargeback", "wrong amount", "incorrect amount", "double charged", "charged twice", "overcharged"],
        "note": "Payment disputes are checked against your transaction records before any adjustment is made.",
        "timeline": "2-3 business days",
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
    "authorized administrator after verification. {escalation_note} "
    "You can expect an update within {timeline}."
)


def _matches_any(message, keywords):
    msg = message.lower()
    return any(kw in msg for kw in keywords)


def _score(message, keywords):
    msg = message.lower()
    return sum(1 for kw in keywords if kw in msg)


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
    """Rule-based Customer Support workflow: acknowledge -> verify (own
    account data when signed in) -> classify -> respond with next steps and
    a realistic timeline -> auto-escalate sensitive categories."""

    def get_response(self, message, history, user=None):
        message = message or ""
        authenticated = bool(user and getattr(user, "is_authenticated", False))

        # 1) Financial-action requests — never actioned, always explained.
        if _matches_any(message, FINANCIAL_ACTION_KEYWORDS):
            escalation = self._escalate(message, user, authenticated, category="financial_action_request",
                                         note="Your request has been logged for an authorized administrator to review.",
                                         timeline="24 hours")
            reply = FINANCIAL_ACTION_REPLY.format(
                escalation_note=escalation["note_text"], timeline=escalation["timeline"],
            )
            return {"reply": reply, "matched_topic": "financial_action_request", "escalated": escalation["escalated"], "ticket_id": escalation["ticket_id"]}

        # 2) Sensitive categories — always escalate, never answered directly.
        esc_match = _match_escalation(message)
        if esc_match:
            escalation = self._escalate(message, user, authenticated, category=esc_match["category"],
                                         note=esc_match["note"], timeline=esc_match["timeline"])
            reply = (
                f"I'm sorry you're dealing with this — I've flagged it for our team right away. "
                f"{escalation['note_text']} You can expect an update within {escalation['timeline']}. "
                f"For anything urgent, you can also reach us directly via WhatsApp or Telegram."
            )
            return {"reply": reply, "matched_topic": esc_match["category"], "escalated": escalation["escalated"], "ticket_id": escalation["ticket_id"]}

        # 3) Account-aware topics — enrich with the user's own data if signed in.
        account_topic = _match_account_topic(message)
        if account_topic:
            reply = self._account_reply(account_topic, user, authenticated)
            return {"reply": reply, "matched_topic": account_topic, "escalated": False, "ticket_id": None}

        # 4) General knowledge base.
        kb_match = _match_knowledge_base(message)
        if kb_match:
            return {"reply": kb_match["answer"], "matched_topic": kb_match["topic"], "escalated": False, "ticket_id": None}

        return {"reply": FALLBACK_REPLY, "matched_topic": None, "escalated": False, "ticket_id": None}

    def _escalate(self, message, user, authenticated, category, note, timeline):
        if authenticated:
            ticket = _create_escalation_ticket(user, message, category, note)
            return {
                "escalated": True,
                "ticket_id": str(ticket.id) if hasattr(ticket, "id") else ticket.pk,
                "note_text": f"I've raised ticket #{ticket.pk} with our support team — {note}",
                "timeline": timeline,
            }
        return {
            "escalated": False,
            "ticket_id": None,
            "note_text": "Please sign in and raise a ticket from the Live Support tab (or message us on WhatsApp/Telegram) so our team can verify your account and follow up.",
            "timeline": timeline,
        }

    def _account_reply(self, topic, user, authenticated):
        cfg = ACCOUNT_TOPICS[topic]
        if not authenticated:
            return f"{cfg['generic']} {LOGIN_REQUIRED_REPLY}"

        if topic == "wallet":
            _, summary = _get_wallet_summary(user)
            return f"Here's your current wallet: {summary}. You can see the full breakdown and transaction history in your Dashboard's Wallet tab."

        if topic == "kyc":
            status = _get_kyc_status(user)
            if status == "approved":
                return "Your KYC is approved — you're fully verified and there's nothing further needed on your end."
            if status == "rejected":
                return "Your last KYC submission was rejected. Please resubmit clear documents from your Dashboard's KYC section, or contact support for the specific reason."
            if status == "pending":
                return "Your KYC submission is currently pending review by our team — this typically takes 1-2 business days. We'll notify you once it's reviewed."
            return "You haven't submitted KYC verification yet. You can do this from your Dashboard's KYC section — it typically takes 1-2 business days to review."

        if topic == "withdrawals":
            kyc_status = _get_kyc_status(user)
            last_wac = _get_recent_transaction(user, wallet_type="C")
            if kyc_status != "approved":
                return (
                    f"{cfg['generic']} I also checked your account — your KYC status is '{kyc_status}', "
                    f"and withdrawals generally require approved KYC first. Please complete verification from "
                    f"your Dashboard's KYC section if you haven't already."
                )
            if last_wac:
                return (
                    f"{cfg['generic']} Your most recent Cash wallet transaction was a "
                    f"{last_wac.get_transaction_type_display()} of ${last_wac.amount:,.2f} on "
                    f"{last_wac.created_at.strftime('%d %b %Y')}. If you're asking about a specific withdrawal "
                    f"that hasn't shown up, let me know the amount and date and I'll escalate it for you."
                )
            return cfg["generic"]

        if topic == "deposits":
            last_dac = _get_recent_transaction(user, wallet_type="C")
            if last_dac:
                return (
                    f"{cfg['generic']} Your most recent Cash wallet transaction was a "
                    f"{last_dac.get_transaction_type_display()} of ${last_dac.amount:,.2f} on "
                    f"{last_dac.created_at.strftime('%d %b %Y')}."
                )
            return cfg["generic"]

        return cfg["generic"]


def get_chat_provider():
    # Later: read settings.CHAT_PROVIDER and branch to a real LLM-backed
    # provider here — everything else in the request path stays the same.
    return SupportWorkflowProvider()
