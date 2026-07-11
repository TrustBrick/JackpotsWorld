# AI Live Chat — rule-based provider today, swappable for a real LLM later.
#
# The public chat widget (src/components/ChatBot.jsx) calls
# POST /api/chat/message/, which calls get_chat_provider().get_response(...).
# To add a real LLM later: implement a new ChatProvider subclass (e.g.
# OpenAIProvider/AnthropicProvider) with the same get_response(message,
# history) -> dict signature, then branch to it in get_chat_provider() based
# on a settings flag (e.g. settings.CHAT_PROVIDER) — no call-site changes
# needed anywhere else.

FALLBACK_REPLY = "I couldn't find the answer. Please contact our support team."

# One entry per topic. `keywords` are matched case-insensitively as whole
# words against the incoming message; the entry with the most keyword hits
# wins, provided it clears MIN_MATCHES.
KNOWLEDGE_BASE = [
    {
        "topic": "account_registration",
        "keywords": ["register", "registration", "sign up", "signup", "create account", "new account", "join"],
        "answer": "To create an account, click Sign Up in the top navigation, enter your name, phone number and email, verify the OTP sent to you, and set a password. It only takes a minute.",
    },
    {
        "topic": "login_issues",
        "keywords": ["login", "log in", "sign in", "can't login", "cannot login", "password reset", "forgot password", "locked out"],
        "answer": "If you're having trouble logging in, double-check your email and password are correct. If you've forgotten your password, use the 'Forgot Password' link on the sign-in screen. Still stuck? Contact our support team.",
    },
    {
        "topic": "wallet",
        "keywords": ["wallet", "balance", "cash wallet", "non-cash", "otp credits", "rolling points"],
        "answer": "Your Wallet tab shows your Cash, Non-Cash, OTP Credit and Rolling Points balances, plus your full transaction history. You can find it in your Dashboard sidebar under 'Wallet'.",
    },
    {
        "topic": "deposits",
        "keywords": ["deposit", "add funds", "top up", "topup", "fund my account"],
        "answer": "Deposits are made offline through our partner casinos — visit a casino, deposit, and our team records it to your Wallet. Ask your host or contact support for the exact steps for your casino.",
    },
    {
        "topic": "withdrawals",
        "keywords": ["withdraw", "withdrawal", "cash out", "payout", "get my money"],
        "answer": "Withdrawals are processed through the same partner casino you deposited at. Contact our support team with your Wallet balance and casino details and we'll guide you through it.",
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
        "keywords": ["promotion", "promotions", "bonus", "offer", "deal"],
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
        "keywords": ["support", "help", "contact", "human", "agent", "representative"],
        "answer": "You can reach our support team via WhatsApp or Telegram (buttons in the bottom corner), by raising a ticket from the Live Support tab in your Dashboard, or by emailing support@jackpotsworld.casino.",
    },
    {
        "topic": "faq",
        "keywords": ["faq", "frequently asked", "question", "how does this work"],
        "answer": "You can find answers to common questions in the FAQ section of the Live Support tab in your Dashboard, or just ask me directly — I can help with registration, wallet, deposits, withdrawals, poker, events, promotions, VIP, referrals, affiliates and responsible gambling.",
    },
]

MIN_MATCHES = 1


def _score(message, keywords):
    msg = message.lower()
    return sum(1 for kw in keywords if kw in msg)


def _match_knowledge_base(message):
    best, best_score = None, 0
    for entry in KNOWLEDGE_BASE:
        score = _score(message, entry["keywords"])
        if score > best_score:
            best, best_score = entry, score
    if best and best_score >= MIN_MATCHES:
        return best
    return None


class ChatProvider:
    def get_response(self, message, history):
        raise NotImplementedError


class RuleBasedProvider(ChatProvider):
    def get_response(self, message, history):
        matched = _match_knowledge_base(message or "")
        if matched:
            return {"reply": matched["answer"], "matched_topic": matched["topic"]}
        return {"reply": FALLBACK_REPLY, "matched_topic": None}


def get_chat_provider():
    # Later: read settings.CHAT_PROVIDER and branch to a real LLM-backed
    # provider here (e.g. OpenAIProvider()/AnthropicProvider()) — everything
    # else in the request path stays the same.
    return RuleBasedProvider()
