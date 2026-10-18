"""Machine translation of public Back Office content (X-Site-Language)."""
from unittest.mock import patch

from django.test import TestCase

from authapp.models.content_translation_models import ContentTranslation
from authapp.models.faq_models import FAQ
from authapp.services import content_translation_service as cts


def fake_provider(texts, lang):
    return [f"<{lang}>{t}" for t in texts]


class TranslatePayloadTests(TestCase):
    def test_only_display_fields_are_translated(self):
        data = {
            "title": "Premium Lounge", "status": "upcoming", "slug": "premium-lounge",
            "image": "https://cdn.example.com/a.jpg", "color": "#ffffff",
            "benefits": ["Free drinks", "VIP entry"],
            "nested": [{"description": "Sea view rooms", "id": 7}],
        }
        out = cts.translate_payload(data, "hi", provider=fake_provider)
        self.assertEqual(out["title"], "<hi>Premium Lounge")
        self.assertEqual(out["benefits"], ["<hi>Free drinks", "<hi>VIP entry"])
        self.assertEqual(out["nested"][0]["description"], "<hi>Sea view rooms")
        for key in ("status", "slug", "image", "color"):
            self.assertEqual(out[key], data[key])
        self.assertEqual(out["nested"][0]["id"], 7)

    def test_each_string_is_sent_to_the_provider_once(self):
        calls = []

        def counting(texts, lang):
            calls.append(list(texts))
            return fake_provider(texts, lang)

        cts.translate_payload({"title": "Hello there"}, "ja", provider=counting)
        cts.translate_payload([{"title": "Hello there"}, {"title": "New text"}], "ja", provider=counting)
        self.assertEqual(calls, [["Hello there"], ["New text"]])
        self.assertEqual(ContentTranslation.objects.filter(lang="ja").count(), 2)

    def test_provider_failure_falls_back_to_english_and_is_not_cached(self):
        out = cts.translate_payload({"title": "Hello there"}, "hi", provider=lambda t, l: None)
        self.assertEqual(out["title"], "Hello there")
        self.assertFalse(ContentTranslation.objects.exists())

    def test_unsupported_or_english_is_a_no_op(self):
        data = {"title": "Hello there"}
        self.assertIs(cts.translate_payload(data, "en", provider=fake_provider), data)
        self.assertIs(cts.translate_payload(data, "xx", provider=fake_provider), data)


@patch("authapp.services.content_translation_service._call_provider", side_effect=fake_provider)
class ContentTranslationMiddlewareTests(TestCase):
    def setUp(self):
        FAQ.objects.all().delete()
        FAQ.objects.create(question="Is this online gambling?", answer="No, it is not.", is_active=True)

    def _faq(self, **headers):
        res = self.client.get("/api/faqs/", **headers)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        rows = body if isinstance(body, list) else body.get("results", body)
        return res, rows[0]

    def test_translates_when_a_language_is_chosen(self, _provider):
        res, faq = self._faq(HTTP_X_SITE_LANGUAGE="hi")
        self.assertEqual(faq["question"], "<hi>Is this online gambling?")
        self.assertEqual(faq["answer"], "<hi>No, it is not.")
        self.assertEqual(res["Content-Language"], "hi")
        self.assertIn("X-Site-Language", res["Vary"])

    def test_english_and_no_header_are_untouched(self, provider):
        for headers in ({}, {"HTTP_X_SITE_LANGUAGE": "en"}):
            _res, faq = self._faq(**headers)
            self.assertEqual(faq["question"], "Is this online gambling?")
        provider.assert_not_called()

    def test_private_endpoints_are_never_translated(self, provider):
        self.client.get("/api/wallet/balances/", HTTP_X_SITE_LANGUAGE="hi")
        self.client.get("/api/poker/filters/", HTTP_X_SITE_LANGUAGE="hi")
        provider.assert_not_called()
