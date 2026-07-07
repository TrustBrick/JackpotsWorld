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

export async function registerForTournament(id) {
  const { ok, status, data } = await apiPostAuthed(`/api/poker/${id}/register/`, {})
  return { ok, status, message: data.message || data.error || "Something went wrong." }
}
