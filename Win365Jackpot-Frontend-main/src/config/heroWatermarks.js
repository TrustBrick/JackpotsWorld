/**
 * Built-in fallback footage for the Poker and Teen Patti heroes.
 *
 * ── Used in TWO places per hero, at two very different strengths ───────────
 *   1. The background watermark it was named for — a low-opacity cinematic
 *      texture behind the hero copy. See components/shared/HeroBackgroundVideo.jsx.
 *   2. The framed media card added beside it, in the same template the
 *      landing page's Top Premium Partners band uses — see
 *      components/shared/SectionHeroMedia.jsx and the template it wraps,
 *      components/shared/HeroMediaShowcase.jsx. There the footage is drawn
 *      full-strength and `contain`ed in a frame shaped to its own ratio.
 *
 * That second use is what makes the encoding notes below matter again. They
 * were all written for the watermark, where a tenth of full luminance hid
 * everything; the card hides nothing. Where a note only held for the
 * watermark, it says so.
 *
 * These are the *fallbacks*, not the source of truth: whatever the Back
 * Office has uploaded for a section (GET /api/section-media/?section=…)
 * always wins, in both places. These only render while that request is in
 * flight, or when the section has no active row at all.
 *
 * Why bundled files rather than seeded database rows: everything in here
 * ships inside the deploy artifact, so it is present on every instance the
 * moment that instance boots. Uploaded media is not — it lives in shared
 * storage that can lag, and historically an instance replacement destroyed
 * it outright. A fallback is filler, but "filler that is reliably there" is
 * the whole point of it, so it must not depend on an upload having survived.
 *
 * Poker and Teen Patti MUST NOT share an asset (spec Part 12). They are
 * listed separately here, and each hero imports only its own key, so
 * pointing both at one file takes a deliberate edit to this file rather
 * than happening by accident through a shared default.
 *
 * Paths are served from public/assets/ — see docs/MEDIA_ARCHITECTURE.md for
 * why every static asset URL in this app begins with /assets/.
 *
 * ── Posters ────────────────────────────────────────────────────────────────
 * Both entries carry one, and neither is decorative. A <video> paints nothing
 * until it has decoded a frame, so a hero with no poster is an empty band for
 * however long the file takes to arrive — which on a first, uncached visit is
 * exactly when someone is most likely to be looking at it. The poster is the
 * native `poster` attribute, so the browser swaps it for the video the moment
 * there is a frame, with no state to manage.
 *
 * These are single frames pulled from the clips themselves:
 *   ffmpeg -ss 3 -i videos/<clip>.mp4 -frames:v 1 -vf scale=960:-2 -q:v 6  *          posters/<clip>.jpg
 * 960 wide and quality 6 was chosen when the layer rendered at 0.24 opacity
 * through brightness(0.55) and a scrim — roughly a tenth of full luminance,
 * where neither resolution nor compression detail was resolvable. Regenerate
 * larger and at a lower -q:v if these ever need to look good in the showcase
 * frame, where they are drawn full-strength.
 *
 * A Back Office row's own poster_image wins over these when it has one. When
 * it does not, the bundled poster still shows, which means the first frame
 * briefly belongs to a different clip than the uploaded video that replaces
 * it. Behind the watermark's opacity that read as dark texture rather than as
 * a picture; in the media card it is a visible, recognisably wrong still for
 * as long as the video takes to decode. Configure a poster_image on any row
 * whose video is large enough for that gap to be noticeable.
 *
 * ── These files MUST be landscape, and wide ────────────────────────────────
 * The watermark is painted with `object-fit: cover` across a hero band that
 * is roughly 4:1 (about 1494x361 on a desktop viewport), because a background
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
 *
 * The media card relaxes the shape half of that and tightens the resolution
 * half. It takes the media's own ratio and `contain`s it, so nothing is
 * cropped and a portrait clip is letterboxed inside a 1.6:1 floor rather than
 * blown up — but it spans up to ~1200px at full strength, where every
 * softness the watermark hid under 0.28 opacity and a brightness(0.55) filter
 * is plainly visible. Both files below were encoded for the watermark and
 * will look soft in the card. The fix is a Back Office upload, which wins
 * over them in both places.
 */

export const HERO_WATERMARKS = {
  // Casino destination footage, 1280x720, so it spans the ~1200px band at
  // about 1:1 and holds up on shape. Deliberately not casino-floor.mp4: that
  // clip is portrait (see above).
  //
  // This is a watermark-weight derivative of vietnam.mp4 rather than that file
  // itself: same frames, but no audio track (the element was hard-muted, so
  // the audio was 128kbps of pure waste), 24fps, and a much higher CRF. 8.4MB
  // to 2.9MB. That quality loss was invisible behind 0.28 opacity and a
  // brightness(0.55) filter; in the showcase frame it is not, and CRF 34 is
  // visibly soft. It stands as filler for a section with no Back Office row —
  // upload one, or regenerate this at a viewable CRF (~23) with:
  //   ffmpeg -i vietnam.mp4 -an -r 24 -c:v libx264 -crf 34
  //     -preset veryslow -profile:v main -pix_fmt yuv420p
  //     -movflags +faststart poker-watermark.mp4
  // vietnam.mp4 stays as it is for the destinations carousel, which shows it
  // full-strength.
  poker: {
    video: '/assets/videos/poker-watermark.mp4',
    poster: '/assets/posters/poker-watermark.jpg',
  },
  // VIP lounge footage — landscape, and deliberately different footage from
  // Poker's. Only 640x360, so it is upscaled nearly 2x across the showcase
  // band and will look soft; same note as above, a Back Office upload is the
  // fix rather than a code change.
  teen_patti: {
    video: '/assets/videos/vip-lounge.mp4',
    poster: '/assets/posters/vip-lounge.jpg',
  },
}
