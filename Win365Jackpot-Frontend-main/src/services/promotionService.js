// src/services/promotionService.js
import { apiGet, createCache } from "./apiClient"

const cache = createCache(60_000)

/**
 * fetchPromotions({ country })
 * Returns { countries: [{ country, promotions: [...] }, ...] } — already
 * grouped by country server-side so the UI can render one country card
 * per entry with a horizontally-scrolling strip inside it.
 */
export async function fetchPromotions(params = {}, { force = false } = {}) {
  const key = JSON.stringify(params)
  if (!force) {
    const hit = cache.get(key)
    if (hit) return hit
  }
  const data = await apiGet("/api/promotions/", params)
  cache.set(key, data)
  return data
}

export async function fetchPromotionDetail(id) {
  return apiGet(`/api/promotions/${id}/`)
}
