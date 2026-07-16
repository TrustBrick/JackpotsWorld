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

// Real property photos for named casinos, reused from the destinations
// gallery so a Promotions card for a casino we already have a photo of
// shows that photo instead of a blank "no image" placeholder. Keys are
// normalized (lowercase, letters/digits only) casino names; disambiguated
// by country first since a few names (Majestic Pride, City of Dreams)
// exist as different properties in more than one country.
function normalizeCasinoKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}
const CASINO_IMAGE_BY_COUNTRY_AND_NAME = {
  [`india|${normalizeCasinoKey('Majestic Pride')}`]: '/images/majesticpride-india.jpg',
  [`srilanka|${normalizeCasinoKey('Majestic Pride')}`]: '/images/majesticpride-srilanka.jpg',
  [`srilanka|${normalizeCasinoKey('City of Dreams')}`]: '/images/cod-srilanka.jpg',
  [`philippines|${normalizeCasinoKey('City of Dreams Manila')}`]: '/images/cod-ph.jpg',
  [`macau|${normalizeCasinoKey('City of Dreams')}`]: '/images/cod-macau.jpg',
}
const CASINO_IMAGE_BY_NAME = {
  [normalizeCasinoKey('Deltin Royale')]: '/images/deltinroyal-india.jpg',
  [normalizeCasinoKey('Deltin Royal')]: '/images/deltinroyal-india.jpg',
  [normalizeCasinoKey('Deltin Jaqk')]: '/images/deltinjaqk-india.jpg',
  [normalizeCasinoKey('Big Daddy Casino')]: '/images/bigdaddy-india.png',
  [normalizeCasinoKey('Big Daddy')]: '/images/bigdaddy-india.png',
  [normalizeCasinoKey('Casino Pride')]: '/images/casinopride-india.jpg',
  [normalizeCasinoKey('Wynn Macau')]: '/images/wynn-macau.jpg',
  [normalizeCasinoKey('Wynn')]: '/images/wynn-macau.jpg',
  [normalizeCasinoKey('The Venetian')]: '/images/venitian-macau.jpg',
  [normalizeCasinoKey('Venetian')]: '/images/venitian-macau.jpg',
  [normalizeCasinoKey('Lisboa Grand')]: '/images/lisbo-macau.jpg',
  [normalizeCasinoKey('Solaire Resorts & Casino')]: '/images/Solaire-ph.jpg',
  [normalizeCasinoKey('Solaire Resort Casino')]: '/images/Solaire-ph.jpg',
  [normalizeCasinoKey('Solaire')]: '/images/Solaire-ph.jpg',
  [normalizeCasinoKey('Bellagio Casino')]: '/images/ballagio-srilanka.jpeg',
  [normalizeCasinoKey('Bellagio')]: '/images/ballagio-srilanka.jpeg',
  [normalizeCasinoKey('Ballagio')]: '/images/ballagio-srilanka.jpeg',
  [normalizeCasinoKey('Ballys Casino')]: '/images/ballys-srilanka.jpg',
  [normalizeCasinoKey("Bally's")]: '/images/ballys-srilanka.jpg',
  [normalizeCasinoKey('Ballys')]: '/images/ballys-srilanka.jpg',
  [normalizeCasinoKey('Marina')]: '/images/marina-srilanka.jpg',
  [normalizeCasinoKey('Casino Corona')]: '/images/corona-vietnam.jpg',
  [normalizeCasinoKey('Crown Casino')]: '/images/crown-vietnam.jpeg',
  [normalizeCasinoKey('The Grand Ho Tram')]: '/images/grand-vietnam.png',
  [normalizeCasinoKey('Grand Ho Tram')]: '/images/grand-vietnam.png',
  [normalizeCasinoKey('Grand Casino')]: '/images/grand-vietnam.png',
}

/** Looks up a real property photo for a named casino (Promotions cards),
 * falling back to null (caller shows its existing "no image" placeholder)
 * rather than guessing wrong for a casino we don't have a photo of. */
export function getCasinoFallbackImage(casinoName, country) {
  if (!casinoName) return null
  const nameKey = normalizeCasinoKey(casinoName)
  const countryKey = normalizeCasinoKey(country)
  if (countryKey) {
    const byCountry = CASINO_IMAGE_BY_COUNTRY_AND_NAME[`${countryKey}|${nameKey}`]
    if (byCountry) return byCountry
  }
  return CASINO_IMAGE_BY_NAME[nameKey] || null
}

// The `?25,000,000` / `?185,000` mojibake pattern: a lost currency symbol
// (almost always the Philippine Peso, ₱) that a legacy latin1 DB column
// silently replaced with a literal "?". A real question mark is never
// immediately followed by a digit in normal writing, so this is a safe,
// general substitution rather than a per-record hardcoded fix.
export function fixMojibakeCurrency(text) {
  if (!text) return text
  return text.replace(/\?(?=\d)/g, '₱')
}
