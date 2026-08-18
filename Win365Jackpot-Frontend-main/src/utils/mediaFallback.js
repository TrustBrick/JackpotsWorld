// Deterministic fallback banner images for Event/Poker cards whose `image`
// field is empty. Reuses the casino property photos already shipped in
// /public/images (used elsewhere by CountryPackages) instead of inventing
// new assets — same image every time for a given id, never random/flickering.
const FALLBACK_IMAGES = [
  '/assets/images/corona-vietnam.jpg',
  '/assets/images/wynn-macau.jpg',
  '/assets/images/venitian-macau.jpg',
  '/assets/images/cod-macau.jpg',
  '/assets/images/lisbo-macau.jpg',
  '/assets/images/deltinroyal-india.jpg',
  '/assets/images/casinopride-india.jpg',
  '/assets/images/majesticpride-india.jpg',
  '/assets/images/Solaire-ph.jpg',
  '/assets/images/cod-ph.jpg',
  '/assets/images/ballagio-srilanka.jpeg',
  '/assets/images/marina-srilanka.jpg',
]

const COUNTRY_IMAGES = {
  vietnam: '/assets/images/corona-vietnam.jpg',
  macau: '/assets/images/wynn-macau.jpg',
  india: '/assets/images/deltinroyal-india.jpg',
  philippines: '/assets/images/Solaire-ph.jpg',
  'sri lanka': '/assets/images/marina-srilanka.jpg',
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
  [`india|${normalizeCasinoKey('Majestic Pride')}`]: '/assets/images/majesticpride-india.jpg',
  [`srilanka|${normalizeCasinoKey('Majestic Pride')}`]: '/assets/images/majesticpride-srilanka.jpg',
  [`srilanka|${normalizeCasinoKey('City of Dreams')}`]: '/assets/images/cod-srilanka.jpg',
  [`philippines|${normalizeCasinoKey('City of Dreams Manila')}`]: '/assets/images/cod-ph.jpg',
  [`macau|${normalizeCasinoKey('City of Dreams')}`]: '/assets/images/cod-macau.jpg',
}
const CASINO_IMAGE_BY_NAME = {
  [normalizeCasinoKey('Deltin Royale')]: '/assets/images/deltinroyal-india.jpg',
  [normalizeCasinoKey('Deltin Royal')]: '/assets/images/deltinroyal-india.jpg',
  [normalizeCasinoKey('Deltin Jaqk')]: '/assets/images/deltinjaqk-india.jpg',
  [normalizeCasinoKey('Big Daddy Casino')]: '/assets/images/bigdaddy-india.png',
  [normalizeCasinoKey('Big Daddy')]: '/assets/images/bigdaddy-india.png',
  [normalizeCasinoKey('Casino Pride')]: '/assets/images/casinopride-india.jpg',
  [normalizeCasinoKey('Wynn Macau')]: '/assets/images/wynn-macau.jpg',
  [normalizeCasinoKey('Wynn')]: '/assets/images/wynn-macau.jpg',
  [normalizeCasinoKey('The Venetian')]: '/assets/images/venitian-macau.jpg',
  [normalizeCasinoKey('Venetian')]: '/assets/images/venitian-macau.jpg',
  [normalizeCasinoKey('Lisboa Grand')]: '/assets/images/lisbo-macau.jpg',
  [normalizeCasinoKey('Solaire Resorts & Casino')]: '/assets/images/Solaire-ph.jpg',
  [normalizeCasinoKey('Solaire Resort Casino')]: '/assets/images/Solaire-ph.jpg',
  [normalizeCasinoKey('Solaire')]: '/assets/images/Solaire-ph.jpg',
  [normalizeCasinoKey('Bellagio Casino')]: '/assets/images/ballagio-srilanka.jpeg',
  [normalizeCasinoKey('Bellagio')]: '/assets/images/ballagio-srilanka.jpeg',
  [normalizeCasinoKey('Ballagio')]: '/assets/images/ballagio-srilanka.jpeg',
  [normalizeCasinoKey('Ballys Casino')]: '/assets/images/ballys-srilanka.jpg',
  [normalizeCasinoKey("Bally's")]: '/assets/images/ballys-srilanka.jpg',
  [normalizeCasinoKey('Ballys')]: '/assets/images/ballys-srilanka.jpg',
  [normalizeCasinoKey('Marina')]: '/assets/images/marina-srilanka.jpg',
  [normalizeCasinoKey('Casino Corona')]: '/assets/images/corona-vietnam.jpg',
  [normalizeCasinoKey('Crown Casino')]: '/assets/images/crown-vietnam.jpeg',
  [normalizeCasinoKey('The Grand Ho Tram')]: '/assets/images/grand-vietnam.png',
  [normalizeCasinoKey('Grand Ho Tram')]: '/assets/images/grand-vietnam.png',
  [normalizeCasinoKey('Grand Casino')]: '/assets/images/grand-vietnam.png',
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
