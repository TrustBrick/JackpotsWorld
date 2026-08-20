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
 *
 * ── These files MUST be landscape, and wide ────────────────────────────────
 * A watermark is painted with `object-fit: cover` across a hero band that is
 * roughly 4:1 (about 1494x361 on a desktop viewport), because a background
 * has to fill its box — letterboxing a page background is not an option.
 * `cover` therefore scales the clip until it covers the *width*, and anything
 * taller than the band is cropped away.
 *
 * That makes the source's shape decisive, in two ways at once:
 *   • Shape. A 16:9 clip loses its top and bottom to the crop but stays
 *     recognisable. A 9:16 portrait clip has to be blown up over four times
 *     to span the width, leaving roughly a seventh of the frame on screen.
 *   • Resolution. The clip is upscaled by (band width / clip width). A
 *     1280-wide source needs about 1.2x and stays sharp; a 360-wide source
 *     needs about 4x and turns to mush.
 *
 * Poker was pointed at casino-floor.mp4 — a 360x640 phone clip — which failed
 * both tests and rendered as an unreadable 4x zoom. Anything used here should
 * be landscape and at least ~1280 wide. casino-floor.mp4 is still used, in
 * the VIP Experience tiles on the landing page, where it is contained rather
 * than covered and shows in full.
 */

export const HERO_WATERMARKS = {
  // Casino destination footage, 1280x720, so it spans the band at ~1.2x and
  // stays sharp. Deliberately not casino-floor.mp4: that clip is portrait
  // (see above), which is what made this watermark unreadable.
  //
  // This is a watermark-weight derivative of vietnam.mp4 rather than that file
  // itself: same frames, but no audio track (the element is hard-muted, so the
  // audio was 128kbps of pure waste), 24fps, and a much higher CRF. 8.4MB to
  // 2.9MB. The quality loss is real but invisible here — the layer is painted
  // at 0.28 opacity through brightness(0.55) and a scrim, which is roughly a
  // tenth of full luminance, far too dark to resolve compression detail.
  // vietnam.mp4 stays as it is for the destinations carousel, which shows it
  // full-strength. Regenerate with:
  //   ffmpeg -i vietnam.mp4 -an -r 24 -c:v libx264 -crf 34
  //     -preset veryslow -profile:v main -pix_fmt yuv420p
  //     -movflags +faststart poker-watermark.mp4
  poker: {
    video: '/assets/videos/poker-watermark.mp4',
    poster: null,
  },
  // VIP lounge footage — 640x360, landscape, and deliberately different
  // footage from Poker's.
  teen_patti: {
    video: '/assets/videos/vip-lounge.mp4',
    poster: null,
  },
}
