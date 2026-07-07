// src/services/eventService.js
import { apiGet, apiPostAuthed, createCache } from "./apiClient"

const cache = createCache(60_000)

/**
 * fetchEvents({ page, country, category, status, date, time })
 * Returns DRF's paginated shape: { count, next, previous, results }.
 */
export async function fetchEvents(params = {}, { force = false } = {}) {
  const key = JSON.stringify(params)
  if (!force) {
    const hit = cache.get(key)
    if (hit) return hit
  }
  const data = await apiGet("/api/events/", params)
  cache.set(key, data)
  return data
}

export async function fetchEventDetail(id) {
  return apiGet(`/api/events/${id}/`)
}

export async function requestEventTicket(id) {
  const { ok, status, data } = await apiPostAuthed(`/api/events/${id}/ticket/`, {})
  return { ok, status, message: data.message || data.error || "Something went wrong." }
}
