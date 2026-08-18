// src/services/pokerService.js
import { apiGet, apiPostAuthed, createCache } from "./apiClient"

const cache = createCache(60_000)

/**
 * fetchPokerTournaments({ page, status })
 * Returns DRF's paginated shape: { count, next, previous, results }.
 */
export async function fetchPokerTournaments(params = {}, { force = false } = {}) {
  const key = JSON.stringify(params)
  if (!force) {
    const hit = cache.get(key)
    if (hit) return hit
  }
  const data = await apiGet("/api/poker/", params)
  cache.set(key, data)
  return data
}

export async function fetchPokerDetail(id) {
  return apiGet(`/api/poker/${id}/`)
}

/** Distinct countries/cities/series/game types that actually have published
 *  events, for the filter bar. */
export async function fetchPokerFilters() {
  return apiGet("/api/poker/filters/")
}

export async function registerForTournament(id) {
  const { ok, status, data } = await apiPostAuthed(`/api/poker/${id}/register/`, {})
  return { ok, status, message: data.message || data.error || "Something went wrong." }
}

// Call after an Admin Panel Poker save/update/delete succeeds — otherwise an
// uploaded/replaced Tournament Image sits behind this module's own 60s TTL
// (independent of landingService's cache) for every visitor, including the
// admin's own next view. Same pattern as landingService.invalidateLandingCache.
export function invalidatePokerCache() {
  cache.clear()
}
