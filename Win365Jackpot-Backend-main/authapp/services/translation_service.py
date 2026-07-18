# MULTILINGUAL-CHAT: new file — local preview feature, safe to delete entirely.
#
# Same shape as chat_service.py's ChatProvider/get_chat_provider() pattern:
# one interface, one working (mock) implementation, provider stubs to fill
# in later. Swapping providers is a one-line config change in
# get_translation_provider() — no call-site changes anywhere else.
import requests
from django.conf import settings as django_settings

LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi", "te": "Telugu", "ta": "Tamil",
    "kn": "Kannada", "ml": "Malayalam", "mr": "Marathi", "bn": "Bengali",
    "gu": "Gujarati", "pa": "Punjabi", "si": "Sinhala", "vi": "Vietnamese",
    "zh-CN": "Chinese", "zh-TW": "Chinese", "ms": "Malay", "th": "Thai",
    "fil": "Filipino",
}


class TranslationProvider:
    def translate(self, text, source_lang, target_lang):
        raise NotImplementedError

    def detect_language(self, text):
        raise NotImplementedError


# ─── Mock provider (Phase 1 — no external API, no cost) ────────────────────
# A small phrase dictionary covers the common support phrases (and the exact
# example from the feature spec) so the demo reads naturally; anything else
# falls back to a clearly-labelled passthrough so nobody mistakes it for a
# real translation.
_PHRASES = {
    ("en", "te"): {
        "my deposit has not been credited": "నా డిపాజిట్ రాలేదు",
        "please wait while we verify your deposit": "దయచేసి మీ డిపాజిట్‌ను పరిశీలించే వరకు వేచి ఉండండి",
        "thank you for contacting support": "మద్దతును సంప్రదించినందుకు ధన్యవాదాలు",
        "how can we help you today": "ఈరోజు మేము మీకు ఎలా సహాయం చేయగలం",
        "we are checking your account": "మేము మీ ఖాతాను తనిఖీ చేస్తున్నాము",
        "your withdrawal is being processed": "మీ విత్‌డ్రాయల్ ప్రాసెస్ చేయబడుతోంది",
        "please upload your kyc documents": "దయచేసి మీ KYC పత్రాలను అప్‌లోడ్ చేయండి",
        "your account has been verified": "మీ ఖాతా ధృవీకరించబడింది",
        "your issue has been resolved": "మీ సమస్య పరిష్కరించబడింది",
        "please contact us if you need further assistance": "మరింత సహాయం కావాలంటే దయచేసి మమ్మల్ని సంప్రదించండి",
        "we have received your request": "మేము మీ అభ్యర్థనను స్వీకరించాము",
        "information about our packages": "మా ప్యాకేజీల గురించి సమాచారం",
    },
    ("te", "en"): {
        "నా డిపాజిట్ రాలేదు": "My deposit has not been credited.",
        "నేను ప్యాకేజీల గురించి తెలుసుకోవాలనుకుంటున్నాను": "I want to know about the packages.",
        "నా విత్‌డ్రాయల్ ఇంకా రాలేదు": "My withdrawal has not arrived yet.",
        "నా ఖాతా లాక్ అయింది": "My account is locked.",
        "నేను లాగిన్ చేయలేకపోతున్నాను": "I am unable to log in.",
        "నా KYC వెరిఫికేషన్ పెండింగ్‌లో ఉంది": "My KYC verification is pending.",
        "నాకు బోనస్ రాలేదు": "I have not received my bonus.",
        "నా వాలెట్ బ్యాలెన్స్ తప్పుగా ఉంది": "My wallet balance is incorrect.",
        "ధన్యవాదాలు": "Thank you.",
        "నాకు సహాయం కావాలి": "I need help.",
    },
    ("en", "hi"): {
        "my deposit has not been credited": "मेरा डिपॉजिट जमा नहीं हुआ है",
        "please wait while we verify your deposit": "कृपया प्रतीक्षा करें जब तक हम आपके डिपॉजिट की पुष्टि करते हैं",
        "thank you for contacting support": "सहायता से संपर्क करने के लिए धन्यवाद",
        "how can we help you today": "आज हम आपकी कैसे मदद कर सकते हैं",
        "we are checking your account": "हम आपके खाते की जांच कर रहे हैं",
        "your withdrawal is being processed": "आपकी निकासी संसाधित की जा रही है",
        "please upload your kyc documents": "कृपया अपने केवाईसी दस्तावेज़ अपलोड करें",
        "your account has been verified": "आपका खाता सत्यापित हो गया है",
        "your issue has been resolved": "आपकी समस्या हल हो गई है",
        "please contact us if you need further assistance": "अधिक सहायता चाहिए तो कृपया हमसे संपर्क करें",
        "we have received your request": "हमें आपका अनुरोध प्राप्त हो गया है",
        "information about our packages": "हमारे पैकेजों के बारे में जानकारी",
    },
    ("hi", "en"): {
        "मेरा डिपॉजिट जमा नहीं हुआ है": "My deposit has not been credited.",
        "मुझे पैकेजों के बारे में जानना है": "I want to know about the packages.",
        "मेरी निकासी अभी तक नहीं आई": "My withdrawal has not arrived yet.",
        "मेरा खाता लॉक हो गया है": "My account is locked.",
        "मैं लॉगिन नहीं कर पा रहा हूं": "I am unable to log in.",
        "मेरा केवाईसी सत्यापन लंबित है": "My KYC verification is pending.",
        "मुझे बोनस नहीं मिला": "I have not received my bonus.",
        "मेरा वॉलेट बैलेंस गलत है": "My wallet balance is incorrect.",
        "धन्यवाद": "Thank you.",
        "मुझे मदद चाहिए": "I need help.",
    },
}


class MockTranslationProvider(TranslationProvider):
    def translate(self, text, source_lang, target_lang):
        if not text or source_lang == target_lang:
            return text
        table = _PHRASES.get((source_lang, target_lang), {})
        hit = table.get(text.strip().lower())
        if hit:
            return hit
        target_name = LANGUAGE_NAMES.get(target_lang, target_lang)
        return f"[MOCK translation to {target_name}] {text}"

    def detect_language(self, text):
        # No real detection offline — callers should prefer the explicit
        # LanguageDetector priority chain over this; kept for interface
        # completeness / so a real provider can be dropped in later.
        return "en"


# ─── Real providers — implement translate()/detect_language() and flip
# SupportSettings.translation_provider to switch, no other changes ──────────
class OpenAITranslationProvider(TranslationProvider):
    """Genuine translation via the OpenAI Chat Completions API. Needs
    OPENAI_API_KEY set locally (never in .env.production/AWS — this makes a
    real network call, which is fine for local preview but out of scope for
    the "no external calls" mock default)."""

    def translate(self, text, source_lang, target_lang):
        if not text or source_lang == target_lang:
            return text
        api_key = getattr(django_settings, "OPENAI_API_KEY", "")
        if not api_key:
            return f"[OpenAI translation error: OPENAI_API_KEY not set in .env] {text}"
        target_name = LANGUAGE_NAMES.get(target_lang, target_lang)
        try:
            resp = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": getattr(django_settings, "OPENAI_TRANSLATE_MODEL", "gpt-4o-mini"),
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                f"You are a translation engine. Translate the user's message into "
                                f"{target_name}. Reply with ONLY the translated text — no quotes, "
                                f"no explanation, no extra commentary."
                            ),
                        },
                        {"role": "user", "content": text},
                    ],
                    "temperature": 0.2,
                },
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as exc:
            # Fail loud-but-safe: keep the original text visible in the
            # placeholder so a broken key/network never hides the message.
            return f"[OpenAI translation failed: {exc}] {text}"

    def detect_language(self, text):
        raise NotImplementedError


class AWSTranslateProvider(TranslationProvider):
    def translate(self, text, source_lang, target_lang):
        raise NotImplementedError("Wire up AWS credentials and implement this before selecting this provider.")

    def detect_language(self, text):
        raise NotImplementedError


class GoogleTranslateProvider(TranslationProvider):
    def translate(self, text, source_lang, target_lang):
        raise NotImplementedError("Wire up a Google Cloud Translate API key and implement this before selecting this provider.")

    def detect_language(self, text):
        raise NotImplementedError


_PROVIDERS = {
    "mock": MockTranslationProvider,
    "openai": OpenAITranslationProvider,
    "aws_translate": AWSTranslateProvider,
    "google_translate": GoogleTranslateProvider,
}


def get_translation_provider():
    from authapp.models.support_settings_models import SupportSettings
    provider_key = SupportSettings.load().translation_provider
    return _PROVIDERS.get(provider_key, MockTranslationProvider)()


class TranslationService:
    """Thin facade views call into — keeps the provider lookup + the
    translated_at bookkeeping in one place instead of duplicated per view."""

    def __init__(self, provider=None):
        self.provider = provider or get_translation_provider()

    def translate(self, text, source_lang, target_lang):
        return self.provider.translate(text, source_lang, target_lang)
