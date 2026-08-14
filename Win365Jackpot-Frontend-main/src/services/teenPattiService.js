// src/services/teenPattiService.js
// Same shape as pokerService/eventService — plain fetch through apiClient,
// with a short TTL cache on the two read endpoints.
import { apiGet, apiGetAuthed, apiPostAuthed, apiDeleteAuthed, createCache } from "./apiClient"

const cache = createCache(60_000)

/**
 * fetchTeenPattiEvents({ page, status, country, city, casino, date_from, ... })
 * Returns DRF's paginated shape: { count, next, previous, results }.
 */
export async function fetchTeenPattiEvents(params = {}, { force = false } = {}) {
  const key = JSON.stringify(params)
  if (!force) {
    const hit = cache.get(key)
    if (hit) return hit
  }
  const data = await apiGet("/api/teen-patti/", params)
  cache.set(key, data)
  return data
}

export async function fetchTeenPattiFilters() {
  return apiGet("/api/teen-patti/filters/")
}

export async function fetchTeenPattiDetail(id) {
  return apiGet(`/api/teen-patti/${id}/`)
}

export async function fetchMyTeenPattiRegistrations() {
  const { ok, data } = await apiGetAuthed("/api/teen-patti/my-registrations/")
  return ok ? data.results || [] : []
}

/**
 * Claiming or releasing a seat changes is_registered/seats_remaining on the
 * list responses, so the cache is dropped on every write — otherwise the grid
 * would keep showing the pre-registration state for up to the full 60s TTL.
 */
export async function registerForTeenPattiEvent(id) {
  const { ok, status, data } = await apiPostAuthed(`/api/teen-patti/${id}/register/`, {})
  if (ok) cache.clear()
  return {
    ok,
    status,
    code: data.code || "",
    message: data.message || data.error || "Something went wrong.",
    registration: data.registration || null,
  }
}

export async function cancelTeenPattiRegistration(id) {
  const { ok, status, data } = await apiDeleteAuthed(`/api/teen-patti/${id}/register/`)
  if (ok) cache.clear()
  return {
    ok,
    status,
    code: data.code || "",
    message: data.message || data.error || "Something went wrong.",
  }
}
