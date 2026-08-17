// ─────────────────────────────────────────────────────────────────────────────
// schema.org builders for the API-backed detail pages.
//
// Every builder tolerates a partly-populated record: seeded/legacy rows have
// null images and empty descriptions, and emitting a key with an undefined or
// empty value is worse than omitting it — Google flags incomplete structured
// data rather than ignoring the field. `compact()` drops the empties.
// ─────────────────────────────────────────────────────────────────────────────

import { SITE_URL, SITE_NAME, absoluteUrl, absoluteImage, toMetaDescription } from '../config/seo'

function compact(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => {
      if (v == null || v === '') return false
      if (Array.isArray(v) && v.length === 0) return false
      return true
    })
  )
}

/** Combines the API's separate date + time columns into one ISO-8601 local
 *  datetime. Date alone is valid schema.org, so a missing time is fine. */
function isoDateTime(date, time) {
  if (!date) return undefined
  return time ? `${date}T${time}` : date
}

const STATUS_MAP = {
  upcoming:  'https://schema.org/EventScheduled',
  live:      'https://schema.org/EventScheduled',
  completed: 'https://schema.org/EventScheduled',
  cancelled: 'https://schema.org/EventCancelled',
  postponed: 'https://schema.org/EventPostponed',
}

const publisher = { '@type': 'Organization', name: SITE_NAME, url: SITE_URL }

/** Casino event / expo → schema.org Event. */
export function eventSchema(event) {
  if (!event) return null
  const place = compact({
    '@type': 'Place',
    name: event.venue || event.city || event.country,
    address: compact({
      '@type': 'PostalAddress',
      addressLocality: event.city,
      addressCountry: event.country,
      streetAddress: event.venue,
    }),
  })

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    description: toMetaDescription(event.description || event.short_description, 300),
    startDate: isoDateTime(event.event_date, event.event_time),
    eventStatus: STATUS_MAP[event.status] || undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: Object.keys(place).length > 1 ? place : undefined,
    image: event.image ? absoluteImage(event.image) : undefined,
    url: absoluteUrl(`/events/${event.id}`),
    organizer: publisher,
  })
}

/** Some tournaments are played online rather than at a venue — the location
 *  column carries "Online" for those. schema.org treats the two as different
 *  shapes, not a cosmetic difference: an online event needs
 *  OnlineEventAttendanceMode and a VirtualLocation, and claiming a physical
 *  Place for one is misrepresentation Google validates against. */
function isOnlineEvent(location) {
  return /^\s*online\b/i.test(String(location || ''))
}

const CURRENCY_SYMBOLS = { '$': 'USD', '€': 'EUR', '£': 'GBP' }

// A bare symbol followed by a figure. The (?<![A-Za-z]) guard is what keeps
// "HK$100,000" out: a prefixed symbol names a different currency from the
// plain one, and treating them alike is how HKD gets published as USD.
const MONEY_RE = /(?<![A-Za-z])([$€£])\s?([\d,]+(?:\.\d+)?)/g

/**
 * ISO code for `buyIn`, or undefined when it cannot be established.
 *
 * There is no currency column, so the tournament name is the only evidence.
 * A symbol is trusted only when it is attached to a figure equal to buyIn —
 * which rules out both ways a name misleads: a headline guarantee rather than
 * a buy-in ("PHP 25,000,000 Guaranteed" against buyIn 550), and a buy-in
 * quoted in one currency but stored converted into another ("HK$100,000"
 * against buyIn 12800, a USD figure).
 *
 * Returning undefined is a real answer, not a failure: the caller omits the
 * price rather than denominating it in a currency nobody verified.
 */
export function buyInCurrency(name, buyIn) {
  const target = Number(buyIn)
  if (!Number.isFinite(target)) return undefined

  const hits = new Set()
  for (const [, sym, amount] of String(name || '').matchAll(MONEY_RE)) {
    if (Number(amount.replace(/,/g, '')) === target) hits.add(CURRENCY_SYMBOLS[sym])
  }
  // Exactly one currency may claim the figure; anything else is ambiguous.
  return hits.size === 1 ? [...hits][0] : undefined
}

/** Poker tournament → schema.org Event, with the buy-in as its Offer. */
export function pokerSchema(tournament) {
  if (!tournament) return null
  const online = isOnlineEvent(tournament.location)
  const place = online
    ? compact({
        '@type': 'VirtualLocation',
        url: absoluteUrl(`/poker/${tournament.id}`),
      })
    : compact({
        '@type': 'Place',
        name: tournament.casino_name || tournament.location,
        address: compact({ '@type': 'PostalAddress', addressLocality: tournament.location }),
      })

  const buyIn = Number(tournament.buy_in)
  // price and priceCurrency travel together: schema.org has no way to state
  // an amount without saying what it is denominated in, so an underivable
  // currency means the figure is withheld rather than guessed at.
  const currency = buyInCurrency(tournament.name, buyIn)
  const priced = Number.isFinite(buyIn) && buyIn > 0 && currency !== undefined

  // NULL seats mean "unknown", which is not the same as zero. Omit the key
  // instead, so an open tournament is never advertised as sold out.
  const seats = tournament.seats_available
  const availability = seats === null || seats === undefined
    ? undefined
    : seats > 0
      ? 'https://schema.org/InStock'
      : 'https://schema.org/SoldOut'

  const offers = compact({
    '@type': 'Offer',
    name: 'Tournament buy-in',
    price: priced ? buyIn : undefined,
    priceCurrency: priced ? currency : undefined,
    url: absoluteUrl(`/poker/${tournament.id}`),
    availability,
  })

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: tournament.name,
    description: toMetaDescription(tournament.description, 300),
    startDate: isoDateTime(tournament.event_date, tournament.event_time),
    eventStatus: STATUS_MAP[tournament.status] || undefined,
    eventAttendanceMode: online
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location: Object.keys(place).length > 1 ? place : undefined,
    image: tournament.image ? absoluteImage(tournament.image) : undefined,
    url: absoluteUrl(`/poker/${tournament.id}`),
    organizer: publisher,
    // Nothing but boilerplate left: no price and no availability is not an
    // offer, it is noise.
    offers: offers.price !== undefined || offers.availability !== undefined
      ? offers
      : undefined,
  })
}

/**
 * Meta description for a promotion, assembled from the fields that actually
 * hold data.
 *
 * Every promotion has an empty `description` column, so the previous
 * `bonus_details || description` fallback produced a 68–82 character snippet
 * — roughly half of what Google will display, with the concrete numbers
 * ("Up to $2,000 match bonus") and the validity window left out even though
 * both are already visible on the page.
 *
 * This composes real column values in the order a reader needs them: what the
 * offer is, what you actually get, and when it applies. Nothing is invented
 * and nothing is added that the page does not already show — nothing is
 * written here that a visitor cannot also read on the page itself.
 */
export function promotionMetaDescription(promo) {
  if (!promo) return ''
  // Each fragment is punctuated as its own clause. The columns are stored
  // without trailing periods, so joining them raw runs sentences together
  // ("...wallet credit New players only") in the search snippet.
  const sentence = text => {
    const t = String(text || '').trim()
    return t && !/[.!?]$/.test(t) ? `${t}.` : t
  }
  const parts = [
    sentence(promo.bonus_details),
    sentence((promo.benefits || []).slice(0, 2).join(' · ')),
    sentence(promo.validity_text),
  ]
  return toMetaDescription(parts.filter(Boolean).join(' '), 158)
}

/** Casino promotion → schema.org Offer.
 *  No `price`: these are bonus offers, not priced products, and inventing a
 *  price to satisfy the richer Product schema would be misrepresentation. */
export function promotionSchema(promo) {
  if (!promo) return null
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Offer',
    name: promo.title,
    description: toMetaDescription(promo.bonus_details || promo.description, 300),
    image: promo.image ? absoluteImage(promo.image) : undefined,
    url: absoluteUrl(`/promotions/${promo.id}`),
    seller: compact({
      '@type': 'Organization',
      name: promo.casino_name || SITE_NAME,
    }),
    areaServed: promo.country || undefined,
    availability: promo.is_active ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
  })
}

/** BreadcrumbList for a detail page — gives Google the "Home › Events › X"
 *  trail it shows under the result instead of a bare URL. */
export function breadcrumbSchema(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  }
}
