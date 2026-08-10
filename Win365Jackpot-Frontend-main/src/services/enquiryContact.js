// src/services/enquiryContact.js
//
// Decides which WhatsApp number every enquiry button on the site should open.
//
//   Sri Lanka          -> +94 71 780 8877
//   Everywhere else    -> +91 95738 07779   (this is the India number, and the
//                                            rule for all other countries too)
//
// Country comes from the visitor's IP. Two sources, in order:
//
//   1. /cdn-cgi/trace — same-origin, served by Cloudflare's edge, which already
//      fronts this site. No API key, no third-party request, no rate limit,
//      and it can't be blocked by an ad blocker. Its `loc=` field is the
//      ISO-3166 country Cloudflare resolved for the connection.
//   2. A public IP geolocation API, used only when (1) is unavailable — local
//      dev, or a visitor whose DNS still reaches the origin directly and so
//      never passes through Cloudflare.
//
// If both fail, or either is slow, callers fall back to the default number, so
// an enquiry button is never left without a working destination.

// Digits only. Set on request to the bare 10-digit number, without the +91
// country code. Note wa.me reads whatever it is given as a full international
// number, so it will interpret the leading "95" as a country code — restore
// the "91" prefix here if enquiry links need to reach the Indian number.
export const SRI_LANKA_NUMBER = '94717808877'
export const DEFAULT_NUMBER   = '9573807779'

const SRI_LANKA_CODE = 'LK'
const CACHE_KEY      = 'jw_enquiry_country'
const TIMEOUT_MS     = 3500

const CF_TRACE_URL = '/cdn-cgi/trace'
const FALLBACK_URL = 'https://ipapi.co/json/'

// One in-flight detection shared by every component that asks, so a page with
// several enquiry buttons still makes at most one request.
let inFlight = null

/** Maps an ISO-3166 alpha-2 country code to the number that should be used. */
export function numberForCountry(code) {
  return String(code || '').toUpperCase() === SRI_LANKA_CODE
    ? SRI_LANKA_NUMBER
    : DEFAULT_NUMBER
}

function readCachedCountry() {
  try {
    return sessionStorage.getItem(CACHE_KEY) || null
  } catch {
    return null // private mode / storage disabled
  }
}

function writeCachedCountry(code) {
  try {
    sessionStorage.setItem(CACHE_KEY, code)
  } catch {
    /* non-fatal: we just detect again next page load */
  }
}

async function fetchWithTimeout(url, { headers } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, headers })
    if (!res.ok) throw new Error(`${url} responded ${res.status}`)
    return res
  } finally {
    clearTimeout(timer)
  }
}

/** Cloudflare's trace endpoint returns plain `key=value` lines. */
async function countryFromCloudflare() {
  const res  = await fetchWithTimeout(CF_TRACE_URL)
  const text = await res.text()
  const line = text.split('\n').find(l => l.startsWith('loc='))
  const code = line?.slice(4).trim()
  // `loc=XX` is Cloudflare's "unknown" answer.
  return code && code !== 'XX' ? code.toUpperCase() : null
}

async function countryFromPublicApi() {
  const res  = await fetchWithTimeout(FALLBACK_URL, { headers: { Accept: 'application/json' } })
  const data = await res.json()
  const code = data?.country_code || data?.country
  return code ? String(code).toUpperCase() : null
}

/**
 * Resolves to an ISO-3166 alpha-2 code, or null if the country can't be
 * determined. Never rejects — callers treat null as "use the default".
 */
export async function detectCountryCode() {
  const cached = readCachedCountry()
  if (cached) return cached

  if (inFlight) return inFlight

  inFlight = (async () => {
    for (const source of [countryFromCloudflare, countryFromPublicApi]) {
      try {
        const code = await source()
        if (code) {
          writeCachedCountry(code)
          return code
        }
      } catch {
        // Try the next source; a failure here is expected off-Cloudflare.
      }
    }
    return null
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

/**
 * The number to use right now, without waiting for detection. Returns the
 * detected number if we've already resolved the country this session,
 * otherwise the default — which is also the correct answer for every country
 * except Sri Lanka, so the common case is right on first paint.
 */
export function getEnquiryNumberSync() {
  return numberForCountry(readCachedCountry())
}

/** Resolves to the correct number for this visitor. Never rejects. */
export async function getEnquiryNumber() {
  return numberForCountry(await detectCountryCode())
}

/** Builds a wa.me link; `message` is encoded here so callers don't have to. */
export function buildWhatsAppLink(number, message = '') {
  const digits = String(number || DEFAULT_NUMBER).replace(/\D/g, '')
  const text   = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${digits}${text}`
}
