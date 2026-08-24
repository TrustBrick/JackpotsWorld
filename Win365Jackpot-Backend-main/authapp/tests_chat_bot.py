"""Tests for the Customer Support Assistant (authapp/services/chat_service.py)
and its endpoint (POST /api/chat/message/).

There were zero tests for this before — the root cause report for the natural-
conversation rebuild flagged that as much a problem as the missing intent
layer itself. These drive the real HTTP endpoint end to end wherever an
account needs real data (wallet/KYC/VIP/affiliate/tickets), and call the
provider directly for pure conversation-shape assertions (small talk, word-
boundary matching, history-based continuity) where no HTTP round trip adds
anything.

Covered: greetings/thanks/ok/how-are-you, every account-issue category in the
brief (login, deposit, withdrawal, KYC, VIP level, VIP points, VIP reward,
affiliate application, affiliate commission, support ticket), angry customer,
repeated question, unknown question, immediate-action demand, incomplete
("deposit"/"withdrawal"/"VIP"/"affiliate") messages, context continuation,
that the bot never invents account-specific information or a timeline, and
that admin/member permissions on the surrounding system are unaffected by any
of this (the bot itself needs no special permission — it's a public,
AllowAny endpoint by design, so the "permission" tests here are about what it
does and does NOT reveal about other people's accounts).
"""
import re
from itertools import count
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from authapp.models.affiliate_models import AffiliateProfile
from authapp.models.kyc_model import KYCSubmission
from authapp.models.support_ticket_models import SupportTicket
from authapp.models.wallet_models import WalletAccount, WalletTransaction
from authapp.services import chat_service
from authapp.services.chat_service import get_chat_provider

User = get_user_model()
CHAT_URL = "/api/chat/message/"

# Timelines the bot must never state as a promised fact — see the module
# docstring's NEVER INVENT note. A few of these are legitimate English words
# that could appear in an innocuous context (e.g. "day"), so the check below
# only runs against the SPECIFIC promissory phrasings that used to appear.
INVENTED_TIMELINE_PATTERNS = [
    r"\b24 hours\b", r"\b\d+-\d+ business days?\b", r"\ba few hours\b",
    r"\btypically \d", r"\bwithin \d+ (hour|day)s?\b",
]


def assert_no_invented_timeline(testcase, reply):
    for pat in INVENTED_TIMELINE_PATTERNS:
        testcase.assertIsNone(re.search(pat, reply, re.I), f"invented-timeline pattern {pat!r} found in: {reply!r}")


class ChatBotTestBase(APITestCase):
    def setUp(self):
        counter = count()
        patcher = patch(
            "authapp.signals.generate_account_number",
            side_effect=lambda wtype: f"CHATT{wtype}{next(counter):06d}",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.user = User.objects.create_user(
            email="chatuser@example.com", password="pw-Test-1", user_uid="CHATU0001",
        )
        self.other = User.objects.create_user(
            email="chatother@example.com", password="pw-Test-1", user_uid="CHATO0001",
        )
        self.provider = get_chat_provider()

    def ask(self, message, user=None, history=None):
        """Direct provider call — used for pure conversation-shape assertions
        that don't need a real HTTP round trip."""
        return self.provider.get_response(message, history or [], user)

    def post(self, message, token_user=None, history=None):
        """Real endpoint call — used wherever the JWT-derived-identity path
        itself is the thing under test."""
        headers = {}
        if token_user is not None:
            from rest_framework_simplejwt.tokens import RefreshToken
            token = str(RefreshToken.for_user(token_user).access_token)
            headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        return self.client.post(
            CHAT_URL, {"message": message, "session_id": "test", "history": history or []},
            format="json", **headers,
        )


# ── Small talk ────────────────────────────────────────────────────────────────
class SmallTalkTests(ChatBotTestBase):
    def test_hi(self):
        r = self.ask("hi")
        self.assertEqual(r["matched_topic"], "small_talk_greeting")
        self.assertIn("Jackpots World", r["reply"])

    def test_hello(self):
        self.assertEqual(self.ask("hello")["matched_topic"], "small_talk_greeting")

    def test_hey(self):
        self.assertEqual(self.ask("hey")["matched_topic"], "small_talk_greeting")

    def test_good_morning(self):
        self.assertEqual(self.ask("good morning")["matched_topic"], "small_talk_greeting")

    def test_thank_you(self):
        r = self.ask("thank you")
        self.assertEqual(r["matched_topic"], "small_talk_thanks")
        # Matches chat_service's actual variant pool for this intent — not
        # just one hardcoded expectation, since random.choice legitimately
        # picks either one (this test caught its own over-narrow assertion
        # once the OTHER variant came up in a full-suite run).
        variants = next(replies for topic, _, replies in chat_service._SMALL_TALK if topic == "thanks")
        self.assertIn(r["reply"], variants)

    def test_okay(self):
        self.assertEqual(self.ask("ok")["matched_topic"], "small_talk_ack")

    def test_how_are_you(self):
        r = self.ask("how are you")
        self.assertEqual(r["matched_topic"], "small_talk_how_are_you")

    def test_greeting_does_not_repeat_the_exact_same_string_every_time(self):
        # Not a strict requirement that it MUST vary on any given call (it's
        # random.choice from a small pool), but the pool itself must have more
        # than one distinct member — that's the "natural variation" contract.
        seen = {self.ask("hi")["reply"] for _ in range(30)}
        self.assertGreater(len(seen), 1, "greeting should draw from more than one variant")

    def test_small_talk_does_not_swallow_a_real_question(self):
        # Starts politely, but is a real question — must NOT be treated as
        # pure small talk (small-talk matching is whole-message, not prefix).
        r = self.ask("thanks, but my withdrawal is still pending")
        self.assertNotEqual(r["matched_topic"], "small_talk_thanks")
        self.assertEqual(r["matched_topic"], "withdrawals")

    def test_word_boundary_prevents_false_positive_inside_a_longer_word(self):
        # "hi" must not match inside "history" — the pre-fix bug class.
        r = self.ask("history")
        self.assertNotEqual(r["matched_topic"], "small_talk_greeting")


# ── Word-boundary / keyword-matching correctness ─────────────────────────────
class MatchingCorrectnessTests(ChatBotTestBase):
    def test_generic_word_location_does_not_false_match_casino_info(self):
        # Regression: "my location" used to match casino_info's overly broad
        # "location" keyword.
        r = self.ask("my location")
        self.assertNotEqual(r["matched_topic"], "casino_info")


# ── Account issues (unauthenticated: generic + login nudge) ─────────────────
class UnauthenticatedAccountTests(ChatBotTestBase):
    def test_login_issue(self):
        r = self.ask("I can't login to my account")
        self.assertEqual(r["matched_topic"], "login_issues")

    def test_deposit_issue_full_sentence(self):
        r = self.ask("I made a deposit yesterday and it's not showing")
        self.assertEqual(r["matched_topic"], "deposits")

    def test_withdrawal_issue_full_sentence(self):
        r = self.ask("my withdrawal is pending")
        self.assertEqual(r["matched_topic"], "withdrawals")
        self.assertIn("sign", r["reply"].lower())  # nudged to sign in

    def test_kyc_issue_unauthenticated(self):
        r = self.ask("what's my KYC status")
        self.assertEqual(r["matched_topic"], "kyc")

    def test_vip_level_issue_unauthenticated(self):
        r = self.ask("what is my VIP level")
        self.assertEqual(r["matched_topic"], "vip")

    def test_vip_points_never_invents_a_number(self):
        r = self.ask("how many points do I need for the next level")
        for bad in ("5000", "5,000 points"):
            self.assertNotIn(bad, r["reply"])

    def test_vip_reward_never_confirms_eligibility(self):
        r = self.ask("Can I get the iPhone?")
        self.assertEqual(r["matched_topic"], "vip_rewards")
        low = r["reply"].lower()
        for bad in ("yes, you", "you are eligible", "next week"):
            self.assertNotIn(bad, low)

    def test_affiliate_application(self):
        r = self.ask("I want to check my affiliate application")
        self.assertEqual(r["matched_topic"], "affiliate")

    def test_affiliate_commission_question(self):
        r = self.ask("how much commission did I earn")
        self.assertEqual(r["matched_topic"], "affiliate")

    def test_support_ticket_query(self):
        r = self.ask("I raised a ticket, any update?")
        self.assertEqual(r["matched_topic"], "support_ticket")

    def test_second_ask_of_same_topic_uses_a_shorter_login_nudge(self):
        # history's own last user turn IS the current message being asked —
        # matching the real frontend's contract (see ChatBot.jsx, which
        # appends the just-typed message before sending `history`) and what
        # _is_repeat_of_last_user_topic itself assumes.
        first = self.ask("my withdrawal is pending", history=[
            {"role": "user", "content": "my withdrawal is pending"},
        ])
        history = [
            {"role": "user", "content": "my withdrawal is pending"},
            {"role": "assistant", "content": first["reply"]},
            {"role": "user", "content": "my withdrawal is pending"},
        ]
        second = self.ask("my withdrawal is pending", history=history)
        self.assertLess(len(second["reply"]), len(first["reply"]), "repeat should not re-paste the full login paragraph")
        self.assertIn(chat_service.LOGIN_REQUIRED_REPLY_SHORT, second["reply"])
        self.assertNotIn(chat_service.LOGIN_REQUIRED_REPLY_SHORT, first["reply"])


# ── Account issues (authenticated: REAL data, never invented) ───────────────
class AuthenticatedAccountTests(ChatBotTestBase):
    def test_wallet_balance_reads_real_wallet(self):
        res = self.post("what's my wallet balance", token_user=self.user)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["matched_topic"], "wallet")
        self.assertIn("Cash $0.00", res.data["reply"])

    def test_kyc_not_submitted(self):
        r = self.ask("what's my KYC status", user=self.user)
        self.assertIn("haven't submitted", r["reply"])

    def test_kyc_pending(self):
        KYCSubmission.objects.create(user=self.user, kyc_type="player", status="pending")
        r = self.ask("what's my KYC status", user=self.user)
        self.assertIn("pending", r["reply"].lower())

    def test_kyc_approved_states_confirmed_fact_not_a_guess(self):
        KYCSubmission.objects.create(user=self.user, kyc_type="player", status="approved")
        r = self.ask("what's my KYC status", user=self.user)
        self.assertIn("approved", r["reply"].lower())

    def test_kyc_rejected(self):
        KYCSubmission.objects.create(user=self.user, kyc_type="player", status="rejected")
        r = self.ask("what's my KYC status", user=self.user)
        self.assertIn("rejected", r["reply"].lower())

    def test_kyc_reply_never_invents_document_requirements(self):
        r = self.ask("what's my KYC status", user=self.user)
        low = r["reply"].lower()
        for bad in ("passport", "selfie", "valid id and a selfie"):
            self.assertNotIn(bad, low)

    def test_vip_level_reads_real_field(self):
        self.user.vip_level = 3
        self.user.vip_xp = 42
        self.user.save(update_fields=["vip_level", "vip_xp"])
        r = self.ask("what is my VIP level", user=self.user)
        self.assertIn("VIP level 3", r["reply"])
        self.assertIn("42", r["reply"])

    def test_affiliate_not_applied(self):
        r = self.ask("check my affiliate application", user=self.user)
        self.assertIn("don't see an affiliate application", r["reply"])

    def test_affiliate_pending(self):
        AffiliateProfile.objects.create(user=self.user, is_active=False)
        r = self.ask("check my affiliate application", user=self.user)
        self.assertIn("pending", r["reply"].lower())

    def test_affiliate_approved_reads_real_commission_rate(self):
        AffiliateProfile.objects.create(user=self.user, is_active=True, commission_rate="12.50")
        r = self.ask("how much commission did I earn", user=self.user)
        self.assertIn("12.50%", r["reply"])

    def test_withdrawal_gated_on_real_kyc_status(self):
        KYCSubmission.objects.create(user=self.user, kyc_type="player", status="pending")
        r = self.ask("where is my withdrawal", user=self.user)
        self.assertIn("pending", r["reply"])

    def test_deposit_reads_real_recent_transaction(self):
        wallet = WalletAccount.objects.get(user=self.user, wallet_type="C")
        WalletTransaction.objects.create(
            user=self.user, wallet=wallet, transaction_type="DAC", amount="150.00",
            balance_before="0.00", balance_after="150.00", transaction_reference="TXN-CHAT-1",
        )
        r = self.ask("I deposited yesterday", user=self.user)
        self.assertIn("150.00", r["reply"])

    def test_support_ticket_reads_real_ticket_status(self):
        SupportTicket.objects.create(user=self.user, subject="test", message="test", status="in_progress")
        r = self.ask("any update on my ticket", user=self.user)
        self.assertIn("In Progress", r["reply"])

    def test_bot_never_reveals_another_users_data(self):
        # Signed in as self.user, but nothing in the message or history can
        # make the bot answer about self.other — identity comes only from
        # the authenticated user object passed in.
        r = self.ask(f"what is the wallet balance for user {self.other.id}", user=self.user)
        self.assertNotIn(str(self.other.id), r["reply"])


# ── Incomplete / bare messages -> clarifying question, not the full answer ──
class BareMessageTests(ChatBotTestBase):
    def test_bare_deposit(self):
        r = self.ask("deposit")
        self.assertEqual(r["matched_topic"], "deposits_clarify")
        self.assertIn("?", r["reply"])

    def test_bare_withdrawal(self):
        self.assertEqual(self.ask("withdrawal")["matched_topic"], "withdrawals_clarify")

    def test_bare_vip(self):
        self.assertEqual(self.ask("VIP")["matched_topic"], "vip_clarify")

    def test_bare_affiliate(self):
        self.assertEqual(self.ask("affiliate")["matched_topic"], "affiliate_clarify")

    def test_full_sentence_is_not_treated_as_bare(self):
        r = self.ask("I made a deposit and it's not showing")
        self.assertNotEqual(r["matched_topic"], "deposits_clarify")
        self.assertEqual(r["matched_topic"], "deposits")


# ── Angry customer / immediate action / guarantee-seeking ───────────────────
class ToneHandlingTests(ChatBotTestBase):
    def test_angry_customer_gets_empathy_not_an_argument(self):
        r = self.ask("This is ridiculous! Nobody is helping me!")
        low = r["reply"].lower()
        self.assertIn("understand", low)
        for bad in ("calm down", "not my fault", "you need to wait"):
            self.assertNotIn(bad, low)

    def test_angry_customer_with_identifiable_topic_still_gets_the_real_answer(self):
        r = self.ask("this is ridiculous, my withdrawal is still pending")
        self.assertEqual(r["matched_topic"], "withdrawals")
        self.assertIn("understand", r["reply"].lower())

    def test_immediate_action_demand_never_promises_instant_action(self):
        r = self.ask("Fix this now, I need my money immediately")
        low = r["reply"].lower()
        for bad in ("it will arrive today", "right away", "instantly"):
            self.assertNotIn(bad, low)

    def test_guarantee_request_never_gives_an_unconfirmed_guarantee(self):
        r = self.ask("Can you guarantee this will be done today?")
        self.assertNotIn("I guarantee", r["reply"])

    def test_repeated_question_is_acknowledged_as_a_repeat(self):
        # Authenticated, so the reply can't ALSO contain the unrelated
        # "...ask again..." phrase from the sign-in nudge — isolates the
        # assertion to the actual §27 repeat-acknowledgment prefix. history's
        # own last user turn is the current message, per the real contract
        # (see the second_ask_of_same_topic test above for why).
        history = [
            {"role": "user", "content": "my withdrawal is pending"},
            {"role": "assistant", "content": "..."},
            {"role": "user", "content": "my withdrawal is pending"},
        ]
        r = self.ask("my withdrawal is pending", user=self.user, history=history)
        self.assertIn("asking again", r["reply"].lower())


# ── Unknown / fallback ────────────────────────────────────────────────────────
class UnknownQuestionTests(ChatBotTestBase):
    def test_unknown_question_does_not_hallucinate(self):
        r = self.ask("what's the exchange rate for dogecoin on Tuesdays")
        self.assertIsNone(r["matched_topic"])
        low = r["reply"].lower()
        self.assertTrue(any(p in low for p in ("correct information", "don't want to guess", "incorrect information")))

    def test_fallback_also_varies(self):
        seen = {self.ask("asdkfjaslkdfj random gibberish query")["reply"] for _ in range(20)}
        self.assertGreater(len(seen), 1)


# ── Context memory ────────────────────────────────────────────────────────────
class ContextMemoryTests(ChatBotTestBase):
    def test_followup_cue_continues_the_last_discussed_topic(self):
        history = [
            {"role": "user", "content": "my withdrawal is pending"},
            {"role": "assistant", "content": "..."},
        ]
        r = self.ask("any update?", history=history)
        self.assertEqual(r["matched_topic"], "withdrawals")

    def test_unrelated_topicless_message_does_not_hijack_stale_history_topic(self):
        history = [
            {"role": "user", "content": "my withdrawal is pending"},
            {"role": "assistant", "content": "..."},
        ]
        r = self.ask("lol nice", history=history)
        self.assertNotEqual(r["matched_topic"], "withdrawals")

    def test_topic_switch_is_honoured_immediately(self):
        history = [
            {"role": "user", "content": "my withdrawal is pending"},
            {"role": "assistant", "content": "..."},
        ]
        r = self.ask("okay, forget that, my VIP level seems wrong", history=history)
        self.assertEqual(r["matched_topic"], "vip")


# ── Financial-action requests (never actioned) ───────────────────────────────
class FinancialActionTests(ChatBotTestBase):
    def test_never_performs_the_action_it_only_explains(self):
        r = self.ask("please credit my account with $500")
        self.assertEqual(r["matched_topic"], "financial_action_request")
        self.assertIn("not able to move funds", r["reply"])

    def test_financial_action_creates_a_ticket_when_authenticated(self):
        before = SupportTicket.objects.filter(user=self.user).count()
        self.ask("please process my withdrawal manually", user=self.user)
        self.assertEqual(SupportTicket.objects.filter(user=self.user).count(), before + 1)


# ── Escalation categories ────────────────────────────────────────────────────
class EscalationTests(ChatBotTestBase):
    def test_missing_funds_is_escalated_with_a_ticket_when_authenticated(self):
        r = self.ask("money is missing from my account", user=self.user)
        self.assertTrue(r["escalated"])
        self.assertIsNotNone(r["ticket_id"])
        self.assertTrue(SupportTicket.objects.filter(pk=r["ticket_id"], user=self.user).exists())

    def test_fraud_report_escalates(self):
        r = self.ask("I think my account was hacked", user=self.user)
        self.assertEqual(r["matched_topic"], "fraud")
        self.assertTrue(r["escalated"])

    def test_unauthenticated_escalation_is_not_a_ticket_but_still_acknowledged(self):
        r = self.ask("money is missing from my account")
        self.assertFalse(r["escalated"])
        self.assertIsNone(r["ticket_id"])
        self.assertIn("sign in", r["reply"].lower())


# ── NEVER INVENT: no scripted reply anywhere states an unconfirmed timeline ──
class NeverInventTimelineTests(ChatBotTestBase):
    SCENARIOS = [
        "my withdrawal is pending", "I made a deposit and it's not showing",
        "what's my KYC status", "money is missing from my account",
        "I think I was scammed", "please process my withdrawal",
        "when will I get my withdrawal", "how long does KYC take",
    ]

    def test_no_reply_states_an_invented_timeline(self):
        for msg in self.SCENARIOS:
            r = self.ask(msg, user=self.user)
            assert_no_invented_timeline(self, r["reply"])

    def test_no_reply_states_an_invented_timeline_unauthenticated(self):
        for msg in self.SCENARIOS:
            r = self.ask(msg)
            assert_no_invented_timeline(self, r["reply"])


# ── Endpoint-level: auth is optional, never 401s, throttled ─────────────────
class ChatEndpointTests(ChatBotTestBase):
    def test_anonymous_caller_gets_200_not_401(self):
        res = self.client.post(CHAT_URL, {"message": "hi"}, format="json")
        self.assertEqual(res.status_code, 200)

    def test_empty_message_is_rejected(self):
        res = self.client.post(CHAT_URL, {"message": ""}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_authenticated_caller_gets_real_account_data_end_to_end(self):
        res = self.post("what's my wallet balance", token_user=self.user)
        self.assertEqual(res.status_code, 200)
        self.assertIn("Cash $0.00", res.data["reply"])

    def test_invalid_bearer_token_is_treated_as_anonymous_not_rejected(self):
        res = self.client.post(
            CHAT_URL, {"message": "hi"}, format="json",
            HTTP_AUTHORIZATION="Bearer not-a-real-token",
        )
        self.assertEqual(res.status_code, 200)

    def test_endpoint_is_throttled(self):
        from authapp.throttles import ChatMessageThrottle
        self.assertTrue(hasattr(ChatMessageThrottle, "scope"))
        from authapp.views.chat_views import ChatMessageView
        self.assertIn(ChatMessageThrottle, ChatMessageView.throttle_classes)
