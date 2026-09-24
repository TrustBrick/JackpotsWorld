"""
authapp/tests_brand_name.py
─────────────────────────────────────────────────────────────────────────────
The brand is one word, "Jackpotsworld". Migration 0112 rewrites the separated
spelling in Back Office content; these replay it against rows written with
the old spelling.
"""

from importlib import import_module

from django.apps import apps as global_apps
from django.test import TestCase

from authapp.models.faq_models import FAQ

mig = import_module("authapp.migrations.0112_brand_name_one_word")


class BrandNameMigrationTests(TestCase):
    def test_every_listed_content_model_exists(self):
        """A typo in the allowlist would be skipped silently by the migration."""
        for name in mig.CONTENT_MODELS:
            global_apps.get_model("authapp", name)

    def test_logs_and_conversations_are_not_rewritten(self):
        for record in ("ChatMessage", "WhatsAppEnquiry", "EmailLog", "ActivityLog", "Notification"):
            self.assertNotIn(record, mig.CONTENT_MODELS)

    def test_separated_name_is_joined_in_content(self):
        faq = FAQ.objects.create(
            question="What is JACKPOTS WORLD?",
            answer="Joining the Jackpots World program is free. JackpotsWorld titles stay.",
        )
        mig.join_brand_name(global_apps, None)
        faq.refresh_from_db()
        self.assertEqual(faq.question, "What is Jackpotsworld?")
        self.assertEqual(faq.answer, "Joining the Jackpotsworld program is free. JackpotsWorld titles stay.")

    def test_idempotent(self):
        faq = FAQ.objects.create(question="Q", answer="About Jackpots World.")
        mig.join_brand_name(global_apps, None)
        mig.join_brand_name(global_apps, None)
        faq.refresh_from_db()
        self.assertEqual(faq.answer, "About Jackpotsworld.")
