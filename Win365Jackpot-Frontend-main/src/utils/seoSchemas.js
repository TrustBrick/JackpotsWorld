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

/** Casino event / expo → schema.org Event.
 *
 *  `basePath` exists because Teen Patti events share this exact schema shape
 *  but live under a different detail route; it defaults to '/events' so every
 *  existing caller is unaffected. */
export function eventSchema(event, basePath = '/events') {
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
    url: absoluteUrl(`${basePath}/${event.id}`),
    organizer: publisher,
  })
}

/** Poker tournament → schema.org Event, with the buy-in as its Offer. */
export function pokerSchema(tournament) {
  if (!tournament) return null
  const place = compact({
    '@type': 'Place',
    name: tournament.casino_name || tournament.location,
    address: compact({ '@type': 'PostalAddress', addressLocality: tournament.location }),
  })

  const buyIn = Number(tournament.buy_in)

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: tournament.name,
    description: toMetaDescription(tournament.description, 300),
    startDate: isoDateTime(tournament.event_date, tournament.event_time),
    eventStatus: STATUS_MAP[tournament.status] || undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: Object.keys(place).length > 1 ? place : undefined,
    image: tournament.image ? absoluteImage(tournament.image) : undefined,
    url: absoluteUrl(`/poker/${tournament.id}`),
    organizer: publisher,
    offers: Number.isFinite(buyIn) && buyIn > 0
      ? compact({
          '@type': 'Offer',
          name: 'Tournament buy-in',
          price: buyIn,
          priceCurrency: 'USD',
          url: absoluteUrl(`/poker/${tournament.id}`),
          availability: tournament.seats_available > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/SoldOut',
        })
      : undefined,
  })
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
