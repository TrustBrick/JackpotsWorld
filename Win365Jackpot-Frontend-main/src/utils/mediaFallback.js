// Deterministic fallback banner images for Event/Poker cards whose `image`
// field is empty. Reuses the casino property photos already shipped in
// /public/images (used elsewhere by CountryPackages) instead of inventing
// new assets — same image every time for a given id, never random/flickering.
const FALLBACK_IMAGES = [
  '/images/corona-vietnam.jpg',
  '/images/wynn-macau.jpg',
  '/images/venitian-macau.jpg',
  '/images/cod-macau.jpg',
  '/images/lisbo-macau.jpg',
  '/images/deltinroyal-india.jpg',
  '/images/casinopride-india.jpg',
  '/images/majesticpride-india.jpg',
  '/images/Solaire-ph.jpg',
  '/images/cod-ph.jpg',
  '/images/ballagio-srilanka.jpeg',
  '/images/marina-srilanka.jpg',
]

const COUNTRY_IMAGES = {
  vietnam: '/images/corona-vietnam.jpg',
  macau: '/images/wynn-macau.jpg',
  india: '/images/deltinroyal-india.jpg',
  philippines: '/images/Solaire-ph.jpg',
  'sri lanka': '/images/marina-srilanka.jpg',
}

function hashToIndex(seed, length) {
  const str = String(seed ?? '')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return hash % length
}

/** Picks a stable fallback image for a card, preferring a country match.
 * `country` may be an exact country name (Events) or a "City, Country"
 * free-text string (Poker's `location` field) — matched as a substring. */
export function getFallbackImage({ id, country }) {
  const needle = String(country || '').trim().toLowerCase()
  const matchKey = Object.keys(COUNTRY_IMAGES).find(key => needle.includes(key))
  if (matchKey) return COUNTRY_IMAGES[matchKey]
  return FALLBACK_IMAGES[hashToIndex(id, FALLBACK_IMAGES.length)]
}
