"""Pre-translate the public site's Back Office content.

    python manage.py translate_site_content            # every supported language
    python manage.py translate_site_content --lang hi ja

Requests each public content endpoint once per language, exactly as a
visitor's browser would, so the translations are cached before anyone waits
for them. Safe to re-run: text that is already translated is not sent again,
so a re-run after Back Office edits only pays for what changed.
"""
from django.core.management.base import BaseCommand
from django.test import Client

from authapp.middleware.content_translation import TRANSLATED_PREFIXES
from authapp.models.content_translation_models import ContentTranslation
from authapp.services.content_translation_service import SUPPORTED_LANGUAGES


class Command(BaseCommand):
    help = "Machine-translate public Back Office content into the site languages and cache it."

    def add_arguments(self, parser):
        parser.add_argument("--lang", nargs="*", help="Language codes (default: all supported).")

    def handle(self, *args, **opts):
        langs = opts.get("lang") or sorted(SUPPORTED_LANGUAGES)
        unknown = [l for l in langs if l not in SUPPORTED_LANGUAGES]
        if unknown:
            self.stderr.write(f"Unsupported language(s): {', '.join(unknown)}")
            return
        client = Client(HTTP_HOST="localhost")
        for lang in langs:
            before = ContentTranslation.objects.filter(lang=lang).count()
            for path in TRANSLATED_PREFIXES:
                res = client.get(path, HTTP_X_SITE_LANGUAGE=lang)
                if res.status_code != 200:
                    self.stdout.write(f"  {lang} {path}: HTTP {res.status_code}")
            after = ContentTranslation.objects.filter(lang=lang).count()
            self.stdout.write(f"{lang}: {after} strings cached ({after - before} new)")
