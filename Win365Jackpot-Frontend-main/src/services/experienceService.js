// src/services/experienceService.js
//
// The public site's non-casino pillars — luxury travel, hotels & resorts,
// dining & entertainment and VIP concierge — plus the enquiry each card can
// send.
//
// ONE REQUEST FOR FOUR SECTIONS. /api/experiences/ returns every pillar
// grouped by category, because these are four bands of one landing page whose
// parts are meaningless apart. Four requests would show the page assembling
// itself in stages on a slow connection, which is the opposite of the
// cinematic read the sections are for.
//
// Same apiGet + createCache shape as landingService / andharBaharService, so
// this behaves like every other public read on the site.
import { apiGet, apiPostAuthed, createCache } from './apiClient'

const cache = createCache(60_000)
const CONTENT_PATH = '/api/experiences/'
const ENQUIRY_PATH = '/api/experiences/enquiries/'

let inFlight = null

/**
 * Every pillar, grouped: { categories: [{category,label}], experiences: {slug: [...]} }
 *
 * Concurrent callers share one in-flight request rather than each firing their
 * own — four sections mount at once on the landing page, and without this the
 * page would make the same call four times.
 *
 * The unused first argument is the useAutoFetch contract: that hook calls
 * fetchFn(params, { force }). This endpoint takes no params, but keeping the
 * shape lets the sections use the same hook as every other section on the site
 * rather than a bespoke one.
 */
export async function fetchExperiences(_params = {}, { force = false } = {}) {
  if (!force) {
    const hit = cache.get(CONTENT_PATH)
    if (hit) return hit
    if (inFlight) return inFlight
  }
  const request = apiGet(CONTENT_PATH)
    .then(data => { cache.set(CONTENT_PATH, data); return data })
    .finally(() => { if (inFlight === request) inFlight = null })
  inFlight = request
  return request
}

export function invalidateExperienceCache() {
  cache.clear()
  inFlight = null
}

/**
 * Send one enquiry.
 *
 * apiPostAuthed despite this being a PUBLIC endpoint: that helper attaches the
 * bearer token only when the visitor happens to have one and posts fine
 * without, which is exactly right here. A signed-in member's enquiry gets
 * attributed to their account server-side; an anonymous visitor's is accepted
 * just the same. It is reused rather than cloned under a better name because
 * an identical second helper is one more thing to keep in step.
 *
 * Returns a flat result the form can render directly. A 400 carries DRF's
 * per-field errors so the form can point at the field that needs fixing; a 429
 * is the rate limit, which deserves its own wording rather than a generic
 * failure.
 */
export async function sendExperienceEnquiry(body) {
  const { ok, status, data } = await apiPostAuthed(ENQUIRY_PATH, body)
  if (ok) {
    return {
      ok: true,
      id: data?.id,
      enquiryKey: data?.enquiry_key || '',
      message: data?.message || 'Thank you — a VIP host will be in touch shortly.',
    }
  }
  return {
    ok: false,
    status,
    // Field-keyed so the form can attach each message to its own input.
    fieldErrors: (data && typeof data === 'object' && !Array.isArray(data)) ? data : {},
    message:
      status === 429
        ? 'You have sent several enquiries already. Please give us a little time to reply.'
        : 'We could not send that just now. Please try again.',
  }
}
