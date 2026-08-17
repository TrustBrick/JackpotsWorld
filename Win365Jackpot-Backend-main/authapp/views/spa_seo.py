"""
Per-route <head> metadata for the client-rendered SPA shell.

backend/urls.py's spa_index serves one index.html for every client-side
route, so anything that does not execute JavaScript sees identical metadata
on all 37 sitemap URLs. react-helmet-async fixes that after hydration, but
social scrapers (WhatsApp, Telegram, Slack, LinkedIn, Discord) never run
React, so the shell is exactly what a shared link previews as.

This module rewrites the shell's <head> per request. It is a deliberate
mirror of the frontend's src/config/seo.js, src/components/Seo.jsx,
src/components/RouteSeo.jsx and src/utils/seoSchemas.js -- same titles, same
canonical rule, same schema.org shapes -- so the pre-JS HTML and the hydrated
DOM agree. Keep the two in step, exactly as authapp/views/seo_views.py's
STATIC_ROUTES must stay in step with the same config; a change on one side
only shows up as a title that flips on hydration.

Ownership handover: every tag emitted here carries data-rh="true", the
attribute react-helmet-async stamps on tags it manages. On its first commit
Helmet removes every data-rh tag and re-emits its own, so these are replaced
rather than duplicated -- the same mechanism index.html's static tags already
rely on. The shell's own data-rh tags are stripped before ours are inserted,
so the pre-JS HTML carries exactly one of each too.

Nothing here may raise past render_spa_html(): spa_index treats None as
"serve the plain shell", which is the pre-existing behaviour.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading

from django.conf import settings
from django.utils.html import escape

logger = logging.getLogger(__name__)


# -- Mirror of src/config/seo.js ---------------------------------------------
# SITE_BASE_URL is env-overridable so a dev/staging deploy does not advertise
# production canonicals, the same reason seo_views.py reads it.
SITE_URL = str(getattr(settings, 'SITE_BASE_URL', 'https://jackpotsworld.vip')).rstrip('/')
SITE_NAME = 'JackpotsWorld'
TITLE_SUFFIX = f' | {SITE_NAME}'

DEFAULT_OG_IMAGE = f'{SITE_URL}/web-app-manifest-512x512.png'
DEFAULT_TITLE = "JackpotsWorld — Asia's #1 Offline Casino VIP Platform"
DEFAULT_DESCRIPTION = (
    'Premium offline casino packages across Vietnam, Macau, India, Sri Lanka and the '
    'Philippines. VIP travel, exclusive tournaments and world-class gaming. Register free.'
)

ROUTE_SEO = {
    '/': (DEFAULT_TITLE, DEFAULT_DESCRIPTION),
    '/events': (
        f'Casino Events & Gaming Expos{TITLE_SUFFIX}',
        'Browse upcoming casino events, gaming expos and VIP gala nights across Asia. '
        'Dates, venues and ticket access for every event on the JackpotsWorld calendar.',
    ),
    '/promotions': (
        f'Casino Promotions & Welcome Bonuses{TITLE_SUFFIX}',
        'Exclusive casino promotions, rolling bonuses and welcome offers from partner '
        'casinos in India, Macau, Vietnam, Sri Lanka and the Philippines.',
    ),
    '/poker': (
        f'Poker Tournaments & Schedules{TITLE_SUFFIX}',
        'Upcoming poker tournaments with buy-ins, prize pools and seat availability at '
        'premier casinos across Asia and beyond. Register through JackpotsWorld.',
    ),
    '/affiliates': (
        f'Casino Affiliate Program — Earn Commission{TITLE_SUFFIX}',
        'Join the JackpotsWorld affiliate program. Competitive commission plans, '
        'real-time campaign tracking and reliable payouts for casino traffic partners.',
    ),
    '/affiliate-register': (
        f'Become an Affiliate Partner{TITLE_SUFFIX}',
        'Apply to the JackpotsWorld affiliate program and start earning commission on '
        'referred players. Fast approval and a full campaign tracking dashboard.',
    ),
    '/privacy-policy': (
        f'Privacy Policy{TITLE_SUFFIX}',
        'How JackpotsWorld collects, uses, stores and protects your personal data, and '
        'the rights you have over it.',
    ),
    '/cookies-policy': (
        f'Cookies Policy{TITLE_SUFFIX}',
        'Which cookies JackpotsWorld uses, what each one is for, and how to control them '
        'in your browser.',
    ),
}

# Authenticated surfaces and credential-entry forms. Checked before any route
# match or database access -- these must never reach a query, and must never
# carry public metadata.
NOINDEX_PREFIXES = (
    '/dashboard',
    '/admin-panel',
    '/super-admin',
    '/affiliate-panel',
    '/affiliate-login',
    '/sign-in',
    '/sign-up',
    '/kyc',
)

# The only paths that trigger a database read. Bounded digits: an unbounded
# \d+ would let a caller hand MySQL an arbitrarily long integer literal.
_DETAIL_RE = re.compile(r'^/(events|promotions|poker)/(\d{1,18})$')


def absolute_url(pathname='/'):
    """Mirror of absoluteUrl() -- strips trailing slashes so `/events` and
    `/events/` never advertise two different canonicals."""
    if re.match(r'^https?://', pathname, re.IGNORECASE):
        return pathname
    clean = '' if pathname == '/' else pathname.rstrip('/')
    return f'{SITE_URL}{clean}'


def absolute_image(src):
    """Mirror of absoluteImage() -- og:image is ignored by most scrapers
    unless it is a full URL."""
    if not src:
        return DEFAULT_OG_IMAGE
    if re.match(r'^https?://', src, re.IGNORECASE):
        return src
    return f'{SITE_URL}{"" if src.startswith("/") else "/"}{src}'


def to_meta_description(text, max_len=158):
    """Mirror of toMetaDescription() -- collapse markup/whitespace, then hard
    truncate at a word boundary so a long column does not produce a meta tag
    Google just cuts off."""
    if not text:
        return ''
    flat = re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', ' ', str(text))).strip()
    if len(flat) <= max_len:
        return flat
    return re.sub(r'[\s,.;:!-]+\S*$', '', flat[:max_len - 1]) + '…'


def _image_url(field):
    """ImageField -> its URL, or None. Accessing .url on an empty field
    raises ValueError, so the truthiness check is required, not defensive."""
    try:
        return field.url if field else None
    except (ValueError, AttributeError):
        return None


def _compact(obj):
    """Mirror of compact() -- emitting a key with an empty value is worse than
    omitting it; Google flags incomplete structured data rather than ignoring
    the field."""
    return {
        k: v for k, v in obj.items()
        if v is not None and v != '' and not (isinstance(v, (list, dict)) and len(v) == 0)
    }


def _iso_datetime(date_value, time_value):
    """Mirror of isoDateTime(). Date alone is valid schema.org, so a missing
    time is fine."""
    if not date_value:
        return None
    if time_value:
        return f'{date_value.isoformat()}T{time_value.isoformat()}'
    return date_value.isoformat()


def _number(value):
    """Decimal -> the same JSON number JavaScript's Number() would produce,
    so the server and client schemas serialise identically."""
    if value is None:
        return None
    try:
        as_float = float(value)
    except (TypeError, ValueError):
        return None
    return int(as_float) if as_float.is_integer() else as_float


_STATUS_MAP = {
    'upcoming': 'https://schema.org/EventScheduled',
    'live': 'https://schema.org/EventScheduled',
    'completed': 'https://schema.org/EventScheduled',
    'cancelled': 'https://schema.org/EventCancelled',
    'postponed': 'https://schema.org/EventPostponed',
}

_PUBLISHER = {'@type': 'Organization', 'name': SITE_NAME, 'url': SITE_URL}


# -- Mirror of src/utils/seoSchemas.js ---------------------------------------

def event_schema(event):
    """Casino event / expo -> schema.org Event."""
    place = _compact({
        '@type': 'Place',
        'name': event.venue or event.city or event.country,
        'address': _compact({
            '@type': 'PostalAddress',
            'addressLocality': event.city,
            'addressCountry': event.country,
            'streetAddress': event.venue,
        }),
    })
    image = _image_url(event.image)
    return _compact({
        '@context': 'https://schema.org',
        '@type': 'Event',
        'name': event.name,
        'description': to_meta_description(event.description or event.short_description, 300),
        'startDate': _iso_datetime(event.event_date, event.event_time),
        'eventStatus': _STATUS_MAP.get(event.status),
        'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
        'location': place if len(place) > 1 else None,
        'image': absolute_image(image) if image else None,
        'url': absolute_url(f'/events/{event.id}'),
        'organizer': _PUBLISHER,
    })


_CURRENCY_SYMBOLS = {'$': 'USD', '€': 'EUR', '£': 'GBP'}

# A bare symbol followed by a figure. The (?<![A-Za-z]) guard is what keeps
# "HK$100,000" out: a prefixed symbol names a different currency from the
# plain one, and treating them alike is how HKD gets published as USD.
_MONEY_RE = re.compile(r'(?<![A-Za-z])([$€£])\s?([\d,]+(?:\.\d+)?)')


def buyin_currency(name, buy_in):
    """ISO code for `buy_in`, or None when it cannot be established.

    There is no currency column, so the tournament name is the only evidence.
    A symbol is trusted only when it is attached to a figure equal to buy_in
    -- which rules out both ways a name misleads: a headline guarantee rather
    than a buy-in ("PHP 25,000,000 Guaranteed" against buy_in 550), and a
    buy-in quoted in one currency but stored converted into another
    ("HK$100,000" against buy_in 12800, a USD figure).

    Returning None is a real answer, not a failure: the caller omits the
    price rather than denominating it in a currency nobody verified.
    """
    if buy_in is None:
        return None
    try:
        target = float(buy_in)
    except (TypeError, ValueError):
        return None

    hits = {
        _CURRENCY_SYMBOLS[sym]
        for sym, amount in _MONEY_RE.findall(str(name or ''))
        if _safe_float(amount.replace(',', '')) == target
    }
    # Exactly one currency may claim the figure; anything else is ambiguous.
    return hits.pop() if len(hits) == 1 else None


def _safe_float(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _is_online_event(location):
    """Mirror of isOnlineEvent(). schema.org treats online and physical events
    as different shapes, not a cosmetic difference: claiming a Place for an
    online tournament is misrepresentation Google validates against."""
    return bool(re.match(r'^\s*online\b', str(location or ''), re.IGNORECASE))


def poker_schema(tournament):
    """Poker tournament -> schema.org Event, with the buy-in as its Offer."""
    url = absolute_url(f'/poker/{tournament.id}')
    online = _is_online_event(tournament.location)
    if online:
        place = _compact({'@type': 'VirtualLocation', 'url': url})
    else:
        place = _compact({
            '@type': 'Place',
            'name': tournament.casino_name or tournament.location,
            'address': _compact({
                '@type': 'PostalAddress',
                'addressLocality': tournament.location,
            }),
        })

    buy_in = _number(tournament.buy_in)
    # price and priceCurrency travel together: schema.org has no way to state
    # an amount without saying what it is denominated in, so an underivable
    # currency means the figure is withheld rather than guessed at.
    currency = buyin_currency(tournament.name, buy_in)
    priced = buy_in is not None and buy_in > 0 and currency is not None

    # NULL seats mean "unknown", which is not the same as zero. Omit the key
    # instead, so an open tournament is never advertised as sold out.
    seats = tournament.seats_available
    availability = None
    if seats is not None:
        availability = (
            'https://schema.org/InStock' if seats > 0
            else 'https://schema.org/SoldOut'
        )

    offers = _compact({
        '@type': 'Offer',
        'name': 'Tournament buy-in',
        'price': buy_in if priced else None,
        'priceCurrency': currency if priced else None,
        'url': url,
        'availability': availability,
    })
    # Nothing but boilerplate left: no price and no availability is not an
    # offer, it is noise.
    if 'price' not in offers and 'availability' not in offers:
        offers = None

    image = _image_url(tournament.image)
    return _compact({
        '@context': 'https://schema.org',
        '@type': 'Event',
        'name': tournament.name,
        'description': to_meta_description(tournament.description, 300),
        'startDate': _iso_datetime(tournament.event_date, tournament.event_time),
        'eventStatus': _STATUS_MAP.get(tournament.status),
        'eventAttendanceMode': (
            'https://schema.org/OnlineEventAttendanceMode' if online
            else 'https://schema.org/OfflineEventAttendanceMode'
        ),
        'location': place if len(place) > 1 else None,
        'image': absolute_image(image) if image else None,
        'url': url,
        'organizer': _PUBLISHER,
        'offers': offers,
    })


def promotion_meta_description(promo):
    """Mirror of promotionMetaDescription(). Composes real column values in
    the order a reader needs them; nothing is written here that a visitor
    cannot also read on the page itself."""
    def sentence(text):
        value = str(text or '').strip()
        return f'{value}.' if value and not re.search(r'[.!?]$', value) else value

    benefits = promo.benefits if isinstance(promo.benefits, list) else []
    parts = [
        sentence(promo.bonus_details),
        sentence(' · '.join(str(b) for b in benefits[:2])),
        sentence(promo.validity_text),
    ]
    return to_meta_description(' '.join(p for p in parts if p), 158)


def promotion_schema(promo):
    """Casino promotion -> schema.org Offer. No `price`: these are bonus
    offers, not priced products, and inventing a price to satisfy the richer
    Product schema would be misrepresentation."""
    image = _image_url(promo.image)
    return _compact({
        '@context': 'https://schema.org',
        '@type': 'Offer',
        'name': promo.title,
        'description': to_meta_description(promo.bonus_details or promo.description, 300),
        'image': absolute_image(image) if image else None,
        'url': absolute_url(f'/promotions/{promo.id}'),
        'seller': _compact({
            '@type': 'Organization',
            'name': promo.casino_name or SITE_NAME,
        }),
        'areaServed': promo.country or None,
        'availability': (
            'https://schema.org/InStock' if promo.is_active
            else 'https://schema.org/OutOfStock'
        ),
    })


def breadcrumb_schema(trail):
    """BreadcrumbList for a detail page. The trail is built from the same
    three elements the visible <Breadcrumbs> renders, so markup and
    structured data cannot drift."""
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
            {
                '@type': 'ListItem',
                'position': i + 1,
                'name': name,
                'item': absolute_url(path),
            }
            for i, (name, path) in enumerate(trail)
        ],
    }


def organization_schema():
    """Mirror of RouteSeo.jsx's organizationSchema(). Emitted on every public
    page -- schema.org expects the publisher on any page, not just the home
    page, and it is the piece Google uses to build the brand entity."""
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': f'{SITE_URL}/#organization',
                'name': SITE_NAME,
                'url': SITE_URL,
                'logo': {
                    '@type': 'ImageObject',
                    'url': f'{SITE_URL}/web-app-manifest-512x512.png',
                    'width': 512,
                    'height': 512,
                },
                'description': DEFAULT_DESCRIPTION,
                'areaServed': ['Vietnam', 'Macau', 'India', 'Sri Lanka', 'Philippines'],
            },
            {
                '@type': 'WebSite',
                '@id': f'{SITE_URL}/#website',
                'url': SITE_URL,
                'name': SITE_NAME,
                'publisher': {'@id': f'{SITE_URL}/#organization'},
                'inLanguage': 'en',
            },
        ],
    }


# -- Tag rendering -----------------------------------------------------------

def _meta(attr, key, value):
    return f'    <meta data-rh="true" {attr}="{key}" content="{escape(value)}" />'


def _json_ld(payload):
    r"""json.dumps only -- never string interpolation. The <, > and & escapes
    close the </script> breakout that JSON encoding alone leaves open;
    \uXXXX stays valid JSON so parsers are unaffected. data-cfasync="false"
    asks Cloudflare Rocket Loader to leave the tag alone (it rewrites script
    `type` attributes on this site) and is inert if it does not."""
    body = json.dumps(payload, ensure_ascii=True, separators=(',', ':'))
    body = body.replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    return (
        '    <script type="application/ld+json" data-rh="true" '
        f'data-cfasync="false">{body}</script>'
    )


def _public_head(title, description, canonical, og_type='website', image=None, schemas=()):
    image_url = image or DEFAULT_OG_IMAGE
    tags = [
        f'    <title>{escape(title)}</title>',
        _meta('name', 'description', description),
        f'    <link data-rh="true" rel="canonical" href="{escape(canonical)}" />',
        _meta('name', 'robots', 'index, follow, max-image-preview:large'),
        _meta('property', 'og:site_name', SITE_NAME),
        _meta('property', 'og:type', og_type),
        _meta('property', 'og:title', title),
        _meta('property', 'og:description', description),
        _meta('property', 'og:url', canonical),
        _meta('property', 'og:image', image_url),
        _meta('property', 'og:image:alt', title),
        _meta('name', 'twitter:card', 'summary_large_image'),
        _meta('name', 'twitter:title', title),
        _meta('name', 'twitter:description', description),
        _meta('name', 'twitter:image', image_url),
    ]
    tags.extend(_json_ld(s) for s in schemas if s)
    return tags


def _private_head():
    """Authenticated surfaces, credential forms and unknown paths. A generic
    title and a noindex directive only -- no description, canonical, Open
    Graph or structured data, so nothing about these surfaces is published."""
    return [
        f'    <title>{escape(DEFAULT_TITLE)}</title>',
        _meta('name', 'robots', 'noindex, nofollow'),
    ]


# -- Route resolution --------------------------------------------------------

def _detail_meta(kind, pk):
    """One indexed primary-key lookup against the same model and is_active
    filter the public API's RetrieveAPIView already uses. Explicit only():
    created_by, user, KYC, wallet and admin columns are never selected."""
    # Imported lazily so importing this module never pulls in the model layer
    # (and so a model import error cannot break URL loading).
    if kind == 'events':
        from authapp.models.events_models import CasinoEvent
        row = CasinoEvent.objects.filter(pk=pk, is_active=True).only(
            'id', 'name', 'country', 'city', 'venue', 'event_date', 'event_time',
            'short_description', 'description', 'status', 'image',
        ).first()
        if row is None:
            return None
        suffix = f' — {row.city}' if row.city else ''
        title = f'{row.name}{suffix}{TITLE_SUFFIX}'
        description = to_meta_description(row.short_description or row.description)
        trail = [('Home', '/'), ('Events', '/events'), (row.name, f'/events/{row.id}')]
        entity = event_schema(row)
        image = _image_url(row.image)

    elif kind == 'promotions':
        from authapp.models.promotion_models import Promotion
        row = Promotion.objects.filter(pk=pk, is_active=True).only(
            'id', 'title', 'casino_name', 'country', 'bonus_details', 'description',
            'benefits', 'validity_text', 'image', 'is_active',
        ).first()
        if row is None:
            return None
        suffix = f' — {row.casino_name}' if row.casino_name else ''
        title = f'{row.title}{suffix}{TITLE_SUFFIX}'
        description = promotion_meta_description(row)
        trail = [('Home', '/'), ('Promotions', '/promotions'), (row.title, f'/promotions/{row.id}')]
        entity = promotion_schema(row)
        image = _image_url(row.image)

    else:  # poker
        from authapp.models.poker_models import PokerTournament
        row = PokerTournament.objects.filter(pk=pk, is_active=True).only(
            'id', 'name', 'casino_name', 'location', 'event_date', 'event_time',
            'buy_in', 'seats_available', 'status', 'description', 'image',
        ).first()
        if row is None:
            return None
        title = f'{row.name}{TITLE_SUFFIX}'
        description = to_meta_description(
            row.description
            or f'{row.name} at {row.casino_name or ""}, {row.location or ""}.'
        )
        trail = [('Home', '/'), ('Poker', '/poker'), (row.name, f'/poker/{row.id}')]
        entity = poker_schema(row)
        image = _image_url(row.image)

    return {
        'title': title,
        'description': description,
        'canonical': absolute_url(f'/{kind}/{row.id}'),
        'image': absolute_image(image) if image else None,
        'schemas': [organization_schema(), entity, breadcrumb_schema(trail)],
    }


def _normalise(path):
    if not path.startswith('/'):
        path = f'/{path}'
    if path != '/':
        path = path.rstrip('/') or '/'
    return path


def _is_private(path):
    return any(path == p or path.startswith(f'{p}/') for p in NOINDEX_PREFIXES)


def head_tags_for(path):
    """The <head> lines for one pathname. The deny-list is evaluated before
    any route match, so private paths cannot reach a query."""
    path = _normalise(path)

    if _is_private(path):
        return _private_head()

    static_entry = ROUTE_SEO.get(path)
    if static_entry is not None:
        title, description = static_entry
        return _public_head(
            title, description, absolute_url(path),
            schemas=[organization_schema()],
        )

    match = _DETAIL_RE.match(path)
    if match:
        meta = _detail_meta(match.group(1), int(match.group(2)))
        # Missing or inactive record: the public API 404s for the same input.
        # Emit no metadata rather than inventing any, and keep it out of the
        # index -- the SPA still renders its own not-found state.
        if meta is None:
            return _private_head()
        return _public_head(
            meta['title'], meta['description'], meta['canonical'],
            og_type='article', image=meta['image'], schemas=meta['schemas'],
        )

    # Unknown path -- the SPA's catch-all redirect target. Keep it out of the
    # index instead of letting it accumulate as a thin home-page duplicate.
    return _private_head()


# -- Shell template ----------------------------------------------------------
# index.html is read, stripped and split once per worker process, then reused.
# The mtime guard means a redeploy's new shell is picked up without a restart.

_TITLE_RE = re.compile(r'[ \t]*<title\b[^>]*>.*?</title>[ \t]*\r?\n?', re.IGNORECASE | re.DOTALL)
_RH_TAG_RE = re.compile(
    r'[ \t]*<(?:meta|link)\b[^>]*\bdata-rh=(["\'])true\1[^>]*>[ \t]*\r?\n?',
    re.IGNORECASE,
)

_SHELL_LOCK = threading.Lock()
_SHELL_CACHE = {}


def _shell(index_path):
    """(prefix, suffix) around the </head> insertion point, with the shell's
    own Helmet-managed tags removed so ours are the only copy."""
    mtime = os.path.getmtime(index_path)
    cached = _SHELL_CACHE.get(index_path)
    if cached is not None and cached[0] == mtime:
        return cached[1], cached[2]

    with open(index_path, 'r', encoding='utf-8') as handle:
        html = handle.read()

    stripped = _RH_TAG_RE.sub('', _TITLE_RE.sub('', html))
    close = stripped.lower().rfind('</head>')
    if close == -1:
        raise ValueError('index.html has no </head>')

    prefix, suffix = stripped[:close], stripped[close:]
    with _SHELL_LOCK:
        _SHELL_CACHE[index_path] = (mtime, prefix, suffix)
    return prefix, suffix


def render_spa_html(path, index_path):
    """Full HTML for one route, or None to fall back to the plain shell.

    Returning None rather than raising keeps spa_index's contract simple:
    any failure here degrades to exactly the behaviour that existed before
    this module, never a 500.
    """
    try:
        prefix, suffix = _shell(index_path)
        body = '\n'.join(head_tags_for(path))
        return f'{prefix}{body}\n  {suffix}'
    except Exception:
        logger.exception('SPA SEO injection failed for %s', path)
        return None
