// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for on-page SEO.
//
// The app is a client-rendered SPA, so every route ships the same index.html
// shell. Without this table each of the ~18 routes would inherit the one
// static <title>/<meta description> baked into index.html and look like
// duplicate content to a crawler. <RouteSeo> (rendered once inside the
// router) reads this map on every navigation; pages with content that only
// exists at runtime — /events/:id and friends — render their own <Seo> on top
// of it once the record loads.
//
// SITE_URL must be the canonical production origin: it prefixes every
// canonical URL, og:url and absolute image URL emitted anywhere in the app.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE_URL = 'https://jackpotsworld.vip'
export const SITE_NAME = 'JackpotsWorld'
export const TITLE_SUFFIX = ` | ${SITE_NAME}`

// Falls back to the 512px PWA icon that already ships in public/. Swap this
// for a purpose-built 1200x630 share card when one exists — social previews
// crop a square icon badly, and og:image is the single highest-impact asset
// for click-through on shared links.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/icons/web-app-manifest-512x512.png`

// No ranking claim. "Asia's #1" has no independent substantiation, and a
// <title> is the most-quoted string on the site: it lands in search results,
// social cards and every reviewer's screenshot.
//
// The description leads with what this business is, because the previous one
// ("world-class gaming") read as an online casino. JackpotsWorld refers
// members to offline venues; the gaming happens there, not here.
export const DEFAULT_TITLE = 'JackpotsWorld — Premium Offline Casino VIP Platform'
export const DEFAULT_DESCRIPTION =
  'Offline casino referral and VIP travel platform. Discover partner casino ' +
  'destinations across Vietnam, Macau, India, Sri Lanka and the Philippines, get ' +
  'your JackpotsWorld referral, and play directly at the casino. Register free.'

export const TWITTER_HANDLE = '' // set once a real @handle exists

/**
 * Static per-route metadata, keyed by exact pathname.
 *
 * `noindex: true` keeps a route out of search results. Applied to every
 * authenticated surface and to credential-entry forms, which have no search
 * value and should never be a landing page from organic search.
 */
export const ROUTE_SEO = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  '/events': {
    title: `Casino Events & Gaming Expos${TITLE_SUFFIX}`,
    description:
      'Browse upcoming casino events, gaming expos and VIP gala nights across Asia. ' +
      'Dates, venues and ticket access for every event on the JackpotsWorld calendar.',
  },
  '/promotions': {
    title: `Casino Promotions & Welcome Bonuses${TITLE_SUFFIX}`,
    description:
      'Exclusive casino promotions, rolling bonuses and welcome offers from partner ' +
      'casinos in India, Macau, Vietnam, Sri Lanka and the Philippines.',
  },
  '/poker': {
    title: `Poker Tournaments & Schedules${TITLE_SUFFIX}`,
    description:
      'Upcoming poker tournaments with buy-ins, prize pools and seat availability at ' +
      'premier casinos across Asia and beyond. Register through JackpotsWorld.',
  },
  '/teen-patti': {
    title: `Teen Patti Events & Registration${TITLE_SUFFIX}`,
    description:
      'Live and upcoming Teen Patti events at partner casinos across Asia. ' +
      'Entry fees, prize pools and seat availability — reserve your seat on JackpotsWorld.',
  },
  '/affiliates': {
    title: `Casino Affiliate Program — Earn Commission${TITLE_SUFFIX}`,
    description:
      'Join the JackpotsWorld affiliate program. Competitive commission plans, ' +
      'real-time campaign tracking and reliable payouts for casino traffic partners.',
  },
  '/affiliate-register': {
    title: `Become an Affiliate Partner${TITLE_SUFFIX}`,
    description:
      'Apply to the JackpotsWorld affiliate program and start earning commission on ' +
      'referred players. Fast approval and a full campaign tracking dashboard.',
  },
  '/privacy-policy': {
    title: `Privacy Policy${TITLE_SUFFIX}`,
    description:
      'How JackpotsWorld collects, uses, stores and protects your personal data, and ' +
      'the rights you have over it.',
  },
  '/cookies-policy': {
    title: `Cookies Policy${TITLE_SUFFIX}`,
    description:
      'Which cookies JackpotsWorld uses, what each one is for, and how to control them ' +
      'in your browser.',
  },

  // ── Never index: credential entry + authenticated surfaces ────────────────
  '/sign-in':         { title: `Sign In${TITLE_SUFFIX}`,  description: 'Sign in to your JackpotsWorld account.', noindex: true },
  '/sign-up':         { title: `Create Account${TITLE_SUFFIX}`, description: 'Create a free JackpotsWorld account.', noindex: true },
  '/dashboard':       { title: `Dashboard${TITLE_SUFFIX}`, noindex: true },
  '/admin-panel':     { title: `Admin${TITLE_SUFFIX}`,     noindex: true },
  '/super-admin':     { title: `Super Admin${TITLE_SUFFIX}`, noindex: true },
  '/affiliate-panel': { title: `Affiliate Panel${TITLE_SUFFIX}`, noindex: true },
  '/affiliate-login': { title: `Affiliate Login${TITLE_SUFFIX}`, noindex: true },
}

/**
 * Path prefixes that are noindex regardless of the exact pathname — covers
 * nested/unknown sub-routes under an authenticated area, which ROUTE_SEO's
 * exact-match keys would otherwise miss.
 */
export const NOINDEX_PREFIXES = [
  '/dashboard',
  '/admin-panel',
  '/super-admin',
  '/affiliate-panel',
  '/affiliate-login',
  '/sign-in',
  '/sign-up',
  '/kyc',
]

/** Detail routes resolve their own metadata after fetching, so the static
 *  table deliberately has no entry — these prefixes just suppress the
 *  "unknown route" fallback from claiming them first. */
export const DYNAMIC_PREFIXES = ['/events/', '/promotions/', '/poker/', '/teen-patti/']

export function isNoindexPath(pathname) {
  return NOINDEX_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

export function isDynamicDetailPath(pathname) {
  return DYNAMIC_PREFIXES.some(p => pathname.startsWith(p))
}

/** Absolute canonical URL for a path. Strips any trailing slash so `/events`
 *  and `/events/` never advertise two different canonicals. */
export function absoluteUrl(pathname = '/') {
  if (/^https?:\/\//i.test(pathname)) return pathname
  const clean = pathname === '/' ? '' : pathname.replace(/\/+$/, '')
  return `${SITE_URL}${clean}`
}

/** Media coming back from the API is already absolute in production, but is
 *  host-relative in some responses — make it absolute either way, since
 *  og:image is ignored by most scrapers unless it is a full URL. */
export function absoluteImage(src) {
  if (!src) return DEFAULT_OG_IMAGE
  if (/^https?:\/\//i.test(src)) return src
  return `${SITE_URL}${src.startsWith('/') ? '' : '/'}${src}`
}

/** Collapses markup/whitespace and hard-truncates at a word boundary so a
 *  long DB description doesn't produce a meta tag Google will just cut off. */
export function toMetaDescription(text, max = 158) {
  if (!text) return ''
  const flat = String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1).replace(/[\s,.;:!-]+\S*$/, '')}…`
}
