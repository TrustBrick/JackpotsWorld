"""
Googlebot must be able to fetch /api/, and must never index it.

robots.txt used to `Disallow: /api/`. Googlebot's renderer obeys robots.txt
for the fetch() calls a page makes while rendering, so every public page
rendered its "Couldn't load … right now" error state for Google and Search
Console flagged /promotions as a Soft 404. These tests pin both halves of
the fix: no robots.txt rule may block /api/, and every /api/ response carries
X-Robots-Tag: noindex so the JSON stays out of search results.
"""
from pathlib import Path

from django.test import SimpleTestCase, TestCase

_BACKEND = Path(__file__).resolve().parent.parent
_ROBOTS_COPIES = [
    _BACKEND / 'jackpotsworld_frontend_dist' / 'robots.txt',
    _BACKEND.parent / 'Win365Jackpot-Frontend-main' / 'public' / 'robots.txt',
]


def _disallow_rules(text):
    return [
        line.split(':', 1)[1].strip()
        for line in text.splitlines()
        if line.strip().lower().startswith('disallow:')
    ]


class RobotsTxtApiTests(SimpleTestCase):
    def test_no_rule_blocks_the_api(self):
        checked = 0
        for path in _ROBOTS_COPIES:
            if not path.exists():
                continue
            checked += 1
            for rule in _disallow_rules(path.read_text(encoding='utf-8')):
                # A rule blocks /api/... if /api/ starts with it (e.g. "/",
                # "/a", "/api") or it starts with /api (e.g. "/api/events/").
                blocks = rule and ('/api/'.startswith(rule) or rule.startswith('/api'))
                self.assertFalse(blocks, f'{path} blocks the API with "Disallow: {rule}"')
        self.assertGreater(checked, 0, 'no robots.txt copy found to check')

    def test_deployed_copy_matches_source(self):
        deployed, source = _ROBOTS_COPIES
        if not source.exists():
            self.skipTest('frontend source not checked out alongside the backend')
        self.assertEqual(
            deployed.read_text(encoding='utf-8'), source.read_text(encoding='utf-8'),
            'jackpotsworld_frontend_dist/robots.txt is stale; rebuild or copy it',
        )


class RootFileCacheTests(SimpleTestCase):
    """robots.txt must not be cacheable for a year: Cloudflare kept serving
    the old /api/-blocking copy after the fix was deployed."""

    def test_root_file_gets_short_max_age(self):
        from backend.settings import _short_cache_for_root_files
        headers = {'Cache-Control': 'max-age=31536000, public'}
        _short_cache_for_root_files(headers, '/x/robots.txt', '/robots.txt')
        self.assertEqual(headers['Cache-Control'], 'public, max-age=300')

    def test_hashed_asset_keeps_long_max_age(self):
        from backend.settings import _short_cache_for_root_files
        headers = {'Cache-Control': 'max-age=31536000, public'}
        _short_cache_for_root_files(headers, '/x/index-abc.js', '/assets/index-abc.js')
        self.assertEqual(headers['Cache-Control'], 'max-age=31536000, public')


class ApiNoIndexHeaderTests(TestCase):
    def test_public_api_response_is_noindex(self):
        response = self.client.get('/api/events/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['X-Robots-Tag'], 'noindex')

    def test_refused_api_response_is_noindex(self):
        response = self.client.get('/api/admin-panel/users/')
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(response['X-Robots-Tag'], 'noindex')

    def test_non_api_response_is_untouched(self):
        response = self.client.get('/sitemap.xml')
        self.assertNotIn('X-Robots-Tag', response)
