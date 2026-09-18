// src/components/experiences/shared.js
//
// The small amount the four pillar sections genuinely have in common. Each
// section owns its own layout and visual identity — that is the point of them
// being four sections and not one repeated grid — so what lives here is the
// data access and the icon lookup, not the presentation.
import { useMemo } from 'react'
import {
  Plane, Ship, BedDouble, Home, Building2, UtensilsCrossed, Martini, Music,
  Drama, Sparkles, Crown, CalendarDays, Car, Headset, MapPin, Star, Gem, Spade,
} from 'lucide-react'
import { useAutoFetch } from '../../hooks/useAutoFetch'
import { fetchExperiences } from '../../services/experienceService'

/**
 * Names an admin can type into `icon_name`, kept in step with the ICON_OPTIONS
 * offered by the Back Office tab. An unknown name falls back to a neutral icon
 * rather than crashing the section, so a typo degrades instead of breaking.
 */
export const ICON_MAP = {
  Plane, Ship, BedDouble, Home, Building2, UtensilsCrossed, Martini, Music,
  Drama, Sparkles, Crown, CalendarDays, Car, Headset, MapPin, Star, Gem,
  // Offline casinos, for the overview band. Kept last so the pillar icons
  // above read as one group.
  Spade,
}

export function iconFor(name) {
  return ICON_MAP[name] || Gem
}

/**
 * Illustration of last resort for a pillar card that has no uploaded image.
 *
 * WHY STATIC FILES AND NOT SEEDED UPLOADS. `Experience.image` is an
 * ImageField served from MEDIA_ROOT, which in production is an S3 bucket. A
 * data migration can put a PATH in the column but cannot put the FILE in the
 * bucket, so seeding image paths would ship a set of broken images to
 * production. These live in the frontend's own /public/assets, which is
 * bundled and present in every environment.
 *
 * KEYED BY ICON, NOT BY TITLE. An admin renaming "Fine Dining" should not
 * silently lose its illustration, and if they change the icon to a ship the
 * picture following along is coherent rather than surprising. It also means
 * a NEW card an admin creates gets a sensible default picture for free.
 *
 * Only the genuinely generic photographs in the repo are used here: an
 * unbranded jet, an unbranded ship, and interiors that identify no venue.
 * Deliberately absent are the named partner-casino photographs (Venetian,
 * Bellagio, Solaire and the rest) — putting one behind a card titled "Hotels
 * & Resorts" would assert an accommodation arrangement with that property
 * that nobody has told me exists.
 *
 * Icons with no honest match (Music, Home, Building2) are absent on purpose:
 * the sections are built to look finished with no picture at all, so "none" is
 * a better answer than "nearly right". There is no live-music photograph in
 * the repo, and no second resort or hotel one.
 */
export const FALLBACK_IMAGES = {
  Plane: '/assets/images/vip/private-jet.png',
  Ship: '/assets/images/vip/luxury-cruise.jpg',
  // The repo's one genuine resort photograph, given to the lead card of the
  // Stays section rather than to a later one. Home and Building2 are left
  // unmapped rather than reusing it: the same picture under two rows of one
  // short list reads as a placeholder, and one illustrated entry among plain
  // ones is normal in an editorial layout.
  BedDouble: '/assets/images/vip/lounge-2.jpg',
  // A private gaming room, no branding visible — the offline-casino signpost.
  Spade: '/assets/images/vip/vip-room-1.jpg',
  UtensilsCrossed: '/assets/images/vip/dance-2.jpg',
  Martini: '/assets/images/vip/lounge-1.jpg',
  Drama: '/assets/images/vip/dance-1.jpg',
  Sparkles: '/assets/images/vip/bar-1.jpg',
  // A private wine cellar: unbranded, and the closest thing in the repo to
  // "somebody is looking after this for you". Crown is also the Casino
  // Introductions icon, but the concierge section renders no imagery, so this
  // only ever surfaces on the overview band.
  Crown: '/assets/images/vip/bar-2.jpg',
  // A live stage performance — genuinely an event. It is the same photograph
  // "Shows & Performances" uses further down the page, which is not ideal;
  // there is no second event photograph in the repo. Uploading one against the
  // Events card in Back Office replaces this and removes the repetition.
  CalendarDays: '/assets/images/vip/dance-1.jpg',
}

/**
 * The picture for one card: whatever Back Office uploaded, else a stock
 * illustration, else nothing.
 *
 * THE GUARD IS THE IMPORTANT PART. A fallback is only used for a card that
 * names no partner and no destination — that is the shape of a generic
 * service card, which is what the seeded rows are. The moment an admin enters
 * a real venue or a real place, the card stops borrowing a stock photograph,
 * because a picture of somewhere else sitting under a named property is a
 * misrepresentation rather than decoration.
 */
export function imageFor(item) {
  if (!item) return ''
  if (item.image) return item.image
  if (item.partner || item.destination) return ''
  return FALLBACK_IMAGES[item.icon_name] || ''
}

/**
 * The cards for one pillar.
 *
 * intervalMs: 0 — these are marketing sections edited occasionally from Back
 * Office, not live data. Polling four sections every minute forever would be
 * traffic for nothing; an admin's edit shows up on the next page load, and the
 * 60s service cache already covers a visitor moving around the site.
 */
export function useExperiencePillar(category) {
  const { grouped, loading, error } = useAllExperiences()

  const items = useMemo(
    () => (grouped[category] || []),
    [grouped, category],
  )

  return { items, loading, error }
}

/**
 * Every pillar at once, for a component that needs more than one.
 *
 * The overview band reads five categories — its own cards plus the four
 * pillars it derives chips from. Calling useExperiencePillar five times would
 * work (the service shares one in-flight request and then the cache) but it
 * would mount five copies of the same loading/error state for one payload.
 */
export function useAllExperiences() {
  const { data, loading, error } = useAutoFetch(fetchExperiences, {}, { intervalMs: 0 })
  const grouped = useMemo(() => data?.experiences || {}, [data])
  return { grouped, categories: data?.categories || [], loading, error }
}

/**
 * Section shell padding and container, so the four pillar sections share the
 * page's rhythm. Both now come from utils/layout.js, which every other section
 * on the page imports too — this file re-exports them so the pillars' existing
 * imports keep working.
 */
export { SECTION_PAD, CONTAINER, HEADER_GAP } from '../../utils/layout'
