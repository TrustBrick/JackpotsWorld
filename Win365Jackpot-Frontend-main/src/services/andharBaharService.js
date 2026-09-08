// src/services/andharBaharService.js
// Public read endpoints for the Andhar Bahar page — same apiGet + createCache
// shape as teenPattiService / pokerService / landingService.
//
// The page content arrives in ONE request. /api/andhar-bahar/content/ returns
// the hero copy, highlights, how-to-play steps, the first batch of events, the
// page FAQs and the hero media together, because they are one page whose parts
// are meaningless apart — five requests would show it assembling itself in
// stages on a slow connection. The events endpoint below is only hit once a
// visitor actually filters.
import {
  apiGet, apiGetAuthed, apiGetMaybeAuthed, apiPostAuthed, authKey, createCache,
} from "./apiClient"

const cache = createCache(60_000)

// Shared with landingService's `cached`: concurrent callers for the same key
// share one in-flight request instead of each firing their own.
const inFlight = new Map()

/**
 * `authed` marks a path whose response depends on who is asking — the event
 * payloads carry `is_registered` / `can_register` for the signed-in member.
 * Those paths are fetched with the token when there is one, and their cache
 * entries are keyed by auth state so one visitor's answer is never replayed
 * for a different one (including the same person after signing out).
 */
function cached(path, { authed = false } = {}) {
  return async (params = {}, { force = false } = {}) => {
    const key = `${path}:${authed ? authKey() : "public"}:${JSON.stringify(params)}`
    if (!force) {
      const hit = cache.get(key)
      if (hit) return hit
      const pending = inFlight.get(key)
      if (pending) return pending
    }
    const request = (authed ? apiGetMaybeAuthed : apiGet)(path, params)
      .then(data => { cache.set(key, data); return data })
      .finally(() => { if (inFlight.get(key) === request) inFlight.delete(key) })
    inFlight.set(key, request)
    return request
  }
}

// The first two carry per-member registration state; the filter options are
// the same list for everyone, so they stay a plain public fetch.
export const fetchAndharBaharContent = cached("/api/andhar-bahar/content/", { authed: true })
export const fetchAndharBaharEvents  = cached("/api/andhar-bahar/events/", { authed: true })
export const fetchAndharBaharFilters = cached("/api/andhar-bahar/events/filters/")

/**
 * Register interest in one event. Interest capture, not a booking — there is
 * no seat to hold (see the backend model), so this records that the member
 * wants to be told about it and a host follows up.
 *
 * The cache is dropped on success because `is_registered` / `can_register`
 * ride on the event payload: without this the card would keep showing
 * "Register" for up to the full 60s TTL after the member just used it.
 */
export async function registerForAndharBaharEvent(id) {
  const { ok, status, data } = await apiPostAuthed(`/api/andhar-bahar/events/${id}/register/`, {})
  if (ok) cache.clear()
  return {
    ok,
    status,
    code: data?.code || "",
    created: !!data?.created,
    message: data?.message || data?.error || "Something went wrong.",
  }
}

export async function fetchMyAndharBaharRegistrations() {
  const { ok, data } = await apiGetAuthed("/api/andhar-bahar/my-registrations/")
  return ok ? (Array.isArray(data) ? data : data?.results || []) : []
}

// Call after a Back Office Andhar Bahar save/update/delete succeeds, so the
// public page reflects the change on its next fetch instead of serving up to
// 60s of stale content — same pattern as invalidateLandingCache /
// invalidateTeenPattiCache. Only clears this module's store.
export function invalidateAndharBaharCache() {
  cache.clear()
}
