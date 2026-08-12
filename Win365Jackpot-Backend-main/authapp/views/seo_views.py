"""
SEO endpoints served by Django rather than shipped as static files.

Only /sitemap.xml lives here. robots.txt is a static file in the frontend's
public/ folder and is served straight out of the built dist/ by Whitenoise —
it never changes at runtime, so there is nothing for Django to compute.

Whitenoise runs as middleware *before* Django's URL resolver, so if a
sitemap.xml file ever appears in the frontend build it would shadow this
view and silently serve a stale, static sitemap. Keep sitemap.xml out of
public/.
"""
from xml.sax.saxutils import escape

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.cache import cache_page

from authapp.models.events_models import CasinoEvent
from authapp.models.poker_models import PokerTournament
from authapp.models.promotion_models import Promotion


# Canonical public origin. Overridable via .env so the dev/staging deploys
# don't publish a sitemap full of production URLs (which would be an
# invalid cross-domain sitemap and get the whole file rejected).
SITE_BASE_URL = getattr(settings, 'SITE_BASE_URL', 'https://jackpotsworld.vip')


# (path, changefreq, priority) — only public, indexable routes. Must stay in
# step with the noindex list in the frontend's src/config/seo.js and the
# Disallow rules in public/robots.txt; a URL that is noindex or disallowed
# must never appear in a sitemap, since that is a direct contradiction
# Search Console reports as an error.
STATIC_ROUTES = [
    ('/',                   'daily',   '1.0'),
    ('/events',             'daily',   '0.9'),
    ('/promotions',         'daily',   '0.9'),
    ('/poker',              'daily',   '0.9'),
    ('/affiliates',         'weekly',  '0.7'),
    ('/affiliate-register', 'monthly', '0.5'),
    ('/privacy-policy',     'yearly',  '0.3'),
    ('/cookies-policy',     'yearly',  '0.3'),
]


def _url_entry(path, lastmod=None, changefreq=None, priority=None):
    parts = ['  <url>', f'    <loc>{escape(SITE_BASE_URL + path)}</loc>']
    if lastmod:
        parts.append(f'    <lastmod>{lastmod.date().isoformat()}</lastmod>')
    if changefreq:
        parts.append(f'    <changefreq>{changefreq}</changefreq>')
    if priority:
        parts.append(f'    <priority>{priority}</priority>')
    parts.append('  </url>')
    return '\n'.join(parts)


# Rebuilt at most once an hour. Without this every crawler hit runs three
# full table scans; content here changes far too slowly to justify that.
@cache_page(60 * 60)
def sitemap_xml(request):
    entries = [
        _url_entry(path, changefreq=freq, priority=prio)
        for path, freq, prio in STATIC_ROUTES
    ]

    # only(): these querysets exist purely to build URLs and lastmods, so
    # pulling the full rows (descriptions, JSON blobs, image paths) would be
    # wasted I/O on every rebuild.
    for event in CasinoEvent.objects.filter(is_active=True).only('id', 'updated_at'):
        entries.append(_url_entry(
            f'/events/{event.id}', lastmod=event.updated_at,
            changefreq='weekly', priority='0.8',
        ))

    for promo in Promotion.objects.filter(is_active=True).only('id', 'updated_at'):
        entries.append(_url_entry(
            f'/promotions/{promo.id}', lastmod=promo.updated_at,
            changefreq='weekly', priority='0.8',
        ))

    for tournament in PokerTournament.objects.filter(is_active=True).only('id', 'updated_at'):
        entries.append(_url_entry(
            f'/poker/{tournament.id}', lastmod=tournament.updated_at,
            changefreq='weekly', priority='0.8',
        ))

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(entries)
        + '\n</urlset>\n'
    )
    return HttpResponse(xml, content_type='application/xml')
