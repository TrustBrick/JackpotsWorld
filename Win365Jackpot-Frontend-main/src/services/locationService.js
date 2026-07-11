// src/services/locationService.js
import { apiGet, createCache } from "./apiClient"

const cache = createCache(60_000)

/**
 * fetchLocations()
 * Returns the active SupportedLocation list, ordered — powers the homepage
 * scrolling locations ribbon. New locations added via the Admin Panel
 * "Manage Locations" tab show up here automatically on the next refresh.
 */
export async function fetchLocations(params = {}, { force = false } = {}) {
  const key = JSON.stringify(params)
  if (!force) {
    const hit = cache.get(key)
    if (hit) return hit
  }
  const data = await apiGet("/api/locations/", params)
  cache.set(key, data)
  return data
}
