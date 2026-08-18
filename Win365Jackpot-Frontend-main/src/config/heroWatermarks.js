/**
 * Built-in background watermark footage for the Poker and Teen Patti heroes.
 *
 * These are the *fallbacks*, not the source of truth: whatever the Back
 * Office has uploaded into the "background" slot for a section (GET
 * /api/section-media/?section=…) always wins. These only render when no row
 * is configured, or when the configured file fails to load — see
 * components/shared/HeroBackgroundVideo.jsx.
 *
 * Why bundled files rather than seeded database rows: everything in here
 * ships inside the deploy artifact, so it is present on every instance the
 * moment that instance boots. Uploaded media is not — it lives in shared
 * storage that can lag, and historically an instance replacement destroyed
 * it outright. A hero's watermark is decorative, but "decorative and
 * reliably there" is the whole point of a watermark, so it must not depend
 * on an upload having survived.
 *
 * Poker and Teen Patti MUST NOT share an asset (spec Part 12). They are
 * listed separately here, and each hero imports only its own key, so
 * pointing both at one file takes a deliberate edit to this file rather
 * than happening by accident through a shared default.
 *
 * Paths are served from public/assets/ — see docs/MEDIA_ARCHITECTURE.md for
 * why every static asset URL in this app begins with /assets/.
 */

export const HERO_WATERMARKS = {
  // Casino floor footage — poker tables, chips, dealers.
  poker: {
    video: '/assets/videos/casino-floor.mp4',
    poster: null,
  },
  // VIP lounge footage — deliberately different footage from Poker's.
  teen_patti: {
    video: '/assets/videos/vip-lounge.mp4',
    poster: null,
  },
}
