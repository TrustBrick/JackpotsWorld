import json
import logging

from authapp.services import content_translation_service as cts

logger = logging.getLogger(__name__)

LANGUAGE_HEADER = "HTTP_X_SITE_LANGUAGE"

# The public, read-only content endpoints the site's pages are built from.
# Filter-option endpoints are deliberately absent: their values are sent back
# as query parameters, so translating them would break filtering.
TRANSLATED_PREFIXES = (
    "/api/landing-settings/", "/api/hero-stats/", "/api/why-choose-us/", "/api/trust-badges/",
    "/api/gift-items/", "/api/gift-steps/", "/api/vip-tiers/", "/api/testimonials/",
    "/api/destinations/", "/api/featured-destination-showcases/", "/api/premium-partners/",
    "/api/section-media/", "/api/vip-service-images/", "/api/tour-packages/",
    "/api/cruise-packages/", "/api/faqs/", "/api/events/", "/api/promotions/",
    "/api/poker/", "/api/teen-patti/", "/api/andhar-bahar/content/",
    "/api/andhar-bahar/events/", "/api/experiences/",
)


class ContentTranslationMiddleware:
    """Translates public content API responses into the visitor's language.

    The site sends `X-Site-Language: <code>` on its public content requests
    once a visitor picks a language other than English. Matching GET
    responses have their display fields translated by
    services/content_translation_service before they leave the server. Any
    other request — and any failure here — passes through untouched, so the
    worst case is always the English the endpoint already returned.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if not request.path.startswith("/api/"):
            return response
        if any(request.path.startswith(p) for p in TRANSLATED_PREFIXES):
            # The same URL answers differently per language; tell any cache.
            response["Vary"] = ", ".join(filter(None, [response.get("Vary"), "X-Site-Language"]))
        lang = (request.META.get(LANGUAGE_HEADER) or "").strip()
        if (
            request.method != "GET"
            or response.status_code != 200
            or not cts.is_supported(lang)
            or "/filters/" in request.path
            or not any(request.path.startswith(p) for p in TRANSLATED_PREFIXES)
            or not response.get("Content-Type", "").startswith("application/json")
            or getattr(response, "streaming", False)
        ):
            return response
        try:
            data = json.loads(response.content)
            translated = cts.translate_payload(data, lang)
            if translated is not data:
                response.content = json.dumps(translated, ensure_ascii=False).encode("utf-8")
                if response.has_header("Content-Length"):
                    response["Content-Length"] = str(len(response.content))
            response["Content-Language"] = lang
        except Exception:
            logger.exception("content translation failed for %s (%s)", request.path, lang)
        return response
