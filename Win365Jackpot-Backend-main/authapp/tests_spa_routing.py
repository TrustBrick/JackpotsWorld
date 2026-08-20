"""
The SPA catch-all must not answer for /assets/.

Bundled media (images, videos, icons) all live under /assets/. Whitenoise's
middleware serves the files that exist; anything that reaches the URL
resolver under that prefix is a file that is NOT on disk. Before this was
excluded from the catch-all, those requests got the SPA shell — '200
text/html' where image or video bytes were expected — so a missing asset
rendered as a silently broken <img>, a <video> that failed with the same
generic MEDIA_ELEMENT_ERROR a Cloudflare challenge produces, and a Network
panel showing 200 with nothing obviously wrong. See
docs/MEDIA_ARCHITECTURE.md.
"""
import os

from django.conf import settings
from django.test import SimpleTestCase, override_settings


@override_settings(ALLOWED_HOSTS=['testserver', '*'])
class AssetRoutingTests(SimpleTestCase):
    def test_missing_asset_returns_404_not_spa_shell(self):
        for path in ('/assets/images/does-not-exist-xyz123.jpg',
                     '/assets/videos/does-not-exist-xyz123.mp4',
                     '/assets/icons/does-not-exist-xyz123.png'):
            with self.subTest(path=path):
                resp = self.client.get(path)
                self.assertEqual(
                    resp.status_code, 404,
                    f'{path} returned {resp.status_code} '
                    f'({resp.headers.get("Content-Type")}) — a missing bundled '
                    f'asset must 404, not fall through to the SPA shell.',
                )

    def test_real_bundled_asset_is_still_served(self):
        """Guard the other direction: the exclusion must not stop Whitenoise
        serving assets that do exist."""
        dist = getattr(settings, 'WHITENOISE_ROOT', None)
        if not dist or not os.path.isdir(os.path.join(dist, 'assets')):
            self.skipTest('no built frontend dist available in this checkout')

        # Pick a real file from the built bundle rather than hardcoding a
        # name that a future rebuild could rename.
        assets_dir = os.path.join(dist, 'assets', 'images')
        if not os.path.isdir(assets_dir):
            self.skipTest('no bundled images in this dist')
        sample = next(
            (f for f in sorted(os.listdir(assets_dir))
             if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))),
            None,
        )
        if sample is None:
            self.skipTest('no bundled image files found')

        resp = self.client.get(f'/assets/images/{sample}')
        self.assertEqual(resp.status_code, 200, f'/assets/images/{sample}')
        self.assertTrue(
            resp.headers.get('Content-Type', '').startswith('image/'),
            f'/assets/images/{sample} served as '
            f'{resp.headers.get("Content-Type")!r}, expected an image type',
        )

    def test_client_side_route_still_gets_the_spa(self):
        for path in ('/poker', '/teen-patti', '/promotions'):
            with self.subTest(path=path):
                resp = self.client.get(path)
                self.assertEqual(resp.status_code, 200, path)
                self.assertIn('text/html', resp.headers.get('Content-Type', ''))
