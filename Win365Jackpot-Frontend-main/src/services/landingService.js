// src/services/landingService.js
// Public read endpoints for the landing page's admin-managed content —
// mirrors locationService.js's apiGet + createCache pattern. New items
// added via the Admin Panel "Landing Page" tab show up here automatically.
import { apiGet, createCache } from "./apiClient"

const cache = createCache(60_000)

// The Landing Page mounts several independent components that each fetch
// their own slice (Hero.jsx + GlobalReachCard.jsx + WhyChooseUs.jsx all call
// fetchLandingSettings on mount, for instance) — since none of them has
// resolved yet, the TTL cache above alone can't stop the second and third
// from also missing it and each firing their own request. This tracks
// requests currently in flight per key so concurrent callers for the same
// endpoint+params share one network request instead of one each.
const inFlight = new Map()

function cached(path) {
  return async (params = {}, { force = false } = {}) => {
    const key = `${path}:${JSON.stringify(params)}`
    if (!force) {
      const hit = cache.get(key)
      if (hit) return hit
      const pending = inFlight.get(key)
      if (pending) return pending
    }
    const request = apiGet(path, params)
      .then(data => { cache.set(key, data); return data })
      .finally(() => { if (inFlight.get(key) === request) inFlight.delete(key) })
    inFlight.set(key, request)
    return request
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
// Hero showcase. Deliberately its own endpoint rather than a slice of
// fetchDestinations — the hero and the destinations section share no data.
export const fetchPremiumPartners   = cached("/api/premium-partners/")
export const fetchVipServiceImages  = cached("/api/vip-service-images/")
export const fetchTourPackages      = cached("/api/tour-packages/")

// Call after an Admin Panel "Landing Page" save/update/delete succeeds, so
// the public Landing Page (and any preview of it in the same browser tab)
// reflects the change on its next fetch instead of serving up to 60s of
// stale cached content. The 60s TTL itself stays — this only drops it early
// on the one event (an admin write) that actually invalidates it; it does
// not touch eventService/pokerService/promotionService's own caches, since
// each createCache() call above owns an independent store.
export function invalidateLandingCache() {
  cache.clear()
}
