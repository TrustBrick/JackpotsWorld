// src/services/landingService.js
// Public read endpoints for the landing page's admin-managed content —
// mirrors locationService.js's apiGet + createCache pattern. New items
// added via the Admin Panel "Landing Page" tab show up here automatically.
import { apiGet, createCache } from "./apiClient"

const cache = createCache(60_000)

function cached(path) {
  return async (params = {}, { force = false } = {}) => {
    const key = `${path}:${JSON.stringify(params)}`
    if (!force) {
      const hit = cache.get(key)
      if (hit) return hit
    }
    const data = await apiGet(path, params)
    cache.set(key, data)
    return data
  }
}

export const fetchLandingSettings   = cached("/api/landing-settings/")
export const fetchHeroStats         = cached("/api/hero-stats/")
export const fetchWhyChooseUsFeatures = cached("/api/why-choose-us/")
export const fetchTrustBadges       = cached("/api/trust-badges/")
export const fetchGiftItems         = cached("/api/gift-items/")
export const fetchGiftSteps         = cached("/api/gift-steps/")
export const fetchVipTiers          = cached("/api/vip-tiers/")
export const fetchTestimonials      = cached("/api/testimonials/")
export const fetchDestinations      = cached("/api/destinations/")
export const fetchVipServiceImages  = cached("/api/vip-service-images/")
export const fetchTourPackages      = cached("/api/tour-packages/")
