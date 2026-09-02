import React, { useMemo } from 'react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchPremiumPartners } from '../services/landingService'
import { flagFromCountryCode } from '../utils/countryFlags'
import HeroMediaShowcase from './shared/HeroMediaShowcase'

/* ─────────────────────────────────────────────────────────────────────────
   Top Premium Partners hero media.

   Revealed inside the space the hero title frees up when it collapses from
   the stacked intro state to the compact one (see Hero.jsx).

   Data comes solely from /api/premium-partners/, which returns only partners
   an admin has marked active + featured + top-premium. This component reads
   nothing from the destinations API and has no fallback to it: the hero
   showcase, the Casino Destinations section and the location ticker are three
   independent systems. Nothing here is hardcoded — the partners shown, their
   order and their media are entirely Back Office controlled.

   Presentation lives in shared/HeroMediaShowcase — the same framing, video
   player, mute control, crossfade, gold badge and caption treatment this
   component used to carry inline, unchanged, and now shared with the Poker
   and Teen Patti heroes. This file is the data half only: fetch the partners,
   shape them into showcase items, and hand them over.
   ───────────────────────────────────────────────────────────────────────── */

export default function PremiumPartnerHeroMedia() {
  // Server-ordered by the admin's display_order, so no client-side sorting.
  const { data: partners } = useAutoFetch(fetchPremiumPartners, {}, { intervalMs: 60_000 })

  // Memoised so the showcase's slide list keeps its identity across the
  // re-renders Hero.jsx produces on its own 60s interval — the rotation timer
  // downstream keys off it.
  const items = useMemo(() => (
    Array.isArray(partners)
      ? partners.map(p => ({
          id: p.id,
          video: p.hero_video || '',
          image: p.hero_image || '',
          name: p.name,
          flag: flagFromCountryCode(p.flag_country_code),
          // Falls back to the place when no description is set, so the caption
          // line is never empty — but never invents either.
          caption: p.description || [p.city, p.country].filter(Boolean).join(', '),
        }))
      : []
  ), [partners])

  return (
    <HeroMediaShowcase
      items={items}
      badgeLabel="Premium Partner"
      soundKey="premium-partner-hero"
      // Defaults to wanting sound — this band only appears once the hero has
      // collapsed, which itself follows a scroll, tap or keypress, so audible
      // playback is usually already permitted by then. When it isn't, the
      // control inside says so.
      defaultSoundOn
      analyticsKind="premium_partner"
      analyticsIdPrefix="partner"
    />
  )
}
