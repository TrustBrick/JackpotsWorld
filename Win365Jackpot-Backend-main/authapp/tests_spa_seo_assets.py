"""
Every bundled asset URL the server-rendered SEO layer emits must live under
/assets/.

This is not a style rule. Cloudflare challenges static paths outside
/assets/ (see docs/MEDIA_ARCHITECTURE.md §2), so a URL like
https://jackpotsworld.vip/web-app-manifest-512x512.png returns 403 to every
client that cannot solve a JS challenge — which is every social scraper and
every crawler. That is exactly the bug this test was written for: spa_seo.py
is a hand-maintained mirror of src/config/seo.js, and when the frontend moved
its icons under /assets/ the Python copy was missed, leaving og:image,
twitter:image and the schema.org Organization logo pointing at a 403.

Nothing else guards that mirror — the two files can only drift silently — so
the assertion here is deliberately structural (no bundled asset outside
/assets/) rather than a match against one hardcoded string, which would have
to be edited in lockstep and would catch nothing.
"""
import json
import re

from django.test import SimpleTestCase

from authapp.views import spa_seo

_ASSET_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico',
                     '.mp4', '.webm', '.webmanifest', '.css', '.js')


class SpaSeoAssetPathTests(SimpleTestCase):
    def _asset_paths(self, emitted):
        """Own-origin URLs pointing at a static file, as site-relative paths."""
        # head_tags_for() returns a list of tag strings, the schema helpers
        # return dicts — normalise both to one searchable blob.
        if isinstance(emitted, (list, tuple)):
            emitted = '\n'.join(emitted)
        elif not isinstance(emitted, str):
            emitted = json.dumps(emitted)

        site = spa_seo.SITE_URL
        found = set()
        for url in re.findall(r'https?://[^\s"\'<>]+', emitted):
            if not url.startswith(site):
                continue
            path = url[len(site):] or '/'
            if path.lower().endswith(_ASSET_EXTENSIONS):
                found.add(path)
        return found

    def _assert_all_under_assets(self, emitted, context):
        offenders = {
            p for p in self._asset_paths(emitted)
            if not p.startswith('/assets/')
        }
        self.assertEqual(
            offenders, set(),
            f'{context}: bundled asset URL(s) outside /assets/ — Cloudflare '
            f'returns 403 for these to any client that cannot run JS: '
            f'{sorted(offenders)}',
        )

    def test_default_og_image_is_under_assets(self):
        self.assertTrue(
            spa_seo.DEFAULT_OG_IMAGE.startswith(f'{spa_seo.SITE_URL}/assets/'),
            f'DEFAULT_OG_IMAGE must be served from /assets/, got '
            f'{spa_seo.DEFAULT_OG_IMAGE!r}',
        )

    def test_organization_schema_logo_is_under_assets(self):
        self._assert_all_under_assets(
            spa_seo.organization_schema(), 'organization_schema()'
        )

    def test_public_route_head_tags_use_assets_only(self):
        # The routes that actually get shared as links.
        for path in ('/', '/poker', '/teen-patti', '/events', '/promotions',
                     '/packages'):
            with self.subTest(path=path):
                self._assert_all_under_assets(
                    spa_seo.head_tags_for(path) or '',
                    f'head_tags_for({path!r})',
                )
