import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import HeroMediaShowcase from './HeroMediaShowcase'
import { fetchSectionMedia } from '../../services/landingService'
import { useAutoFetch } from '../../hooks/useAutoFetch'

/* ─────────────────────────────────────────────────────────────────────────
   SectionHeroMedia — the Poker and Teen Patti hero media, rendered in the
   same framed template as the landing page's Top Premium Partners band.

   Sits alongside the low-opacity watermark those heroes paint behind their
   copy (shared/HeroBackgroundVideo), which is unchanged — this is an
   addition, not a replacement. The same footage therefore appears twice on
   one screen: as the backdrop it always was, and again full-strength in a
   frame with the same gold border, media-shaped box, mute control, badge pill
   and slide dots as the Premium Partners band, because it is literally the
   same component. Both consumers read the same cached() service, so the two
   of them share one network request; the browser does decode the file twice,
   which is the price of showing it in both places at once.

   Data comes from GET /api/section-media/?section=… — the rows an admin
   manages under Back Office → Manage Poker Media / Teen Patti Media. Every
   active row for the section becomes a slide, so a section with more than one
   configured slot rotates the way the partners band does, and a section with
   one shows a single frame with no dots. Nothing is read from any other
   endpoint.

   ── The bundled fallback ─────────────────────────────────────────────────
   `fallbackVideo` / `fallbackPoster` are the build-time assets in
   config/heroWatermarks.js, used only while the API is still in flight or
   when the section has no active row at all. They exist so the band is never
   an empty box on a cold first paint, which is exactly when someone is most
   likely to be looking at it.

   They were encoded for the old watermark layer, though — heavily compressed
   on the reasoning that nothing at 28% opacity through a brightness(0.55)
   filter could resolve compression detail. That reasoning does not survive
   the move into a full-strength frame: poker-watermark.mp4 is CRF 34 and
   vip-lounge.mp4 is only 640x360, so both will look soft at showcase size.
   The fix is an upload, not a code change — a Back Office row always wins
   over these. Treat the fallback as "better than a hole in the hero", not as
   the intended picture.

   Analytics is attached only to admin-configured media. The bundled fallback
   is decorative filler, and counting views on it would put a number in the
   dashboard that no one chose to publish.

   ── The intro hold ────────────────────────────────────────────────────────
   The card does not appear at first paint. The hero's background watermark
   gets the screen to itself for a beat, and only then does the card open into
   the page — the same sequence the landing hero runs, where the oversized
   wordmark holds over the backdrop before collapsing and handing its space to
   the Premium Partners band. The rules are copied from Hero.jsx deliberately,
   down to the constant: the same 4s, the same "any interaction ends the hold
   early" list, and the same reduced-motion exemption. A visitor who starts
   scrolling has stopped watching the intro, so making them wait out the rest
   of it would be the opposite of the point.
   ───────────────────────────────────────────────────────────────────────── */

// Hero.jsx's HERO_INTRO_HOLD_MS. Duplicated rather than imported: Hero.jsx is
// the landing page's own component and pulling a constant out of it would tie
// two unrelated pages' timing together, so that a retimed landing intro
// silently retimed Poker and Teen Patti too. If they should move in step,
// promote the constant to config/ rather than importing across pages.
const INTRO_HOLD_MS = 4000

// The open itself. Matches the entry transition HeroMediaShowcase uses for its
// own fade-up, so the card's arrival is one gesture rather than two.
const REVEAL_SEC = 0.7
const REVEAL_EASE = [0.25, 0.46, 0.45, 0.94]

// Events that count as "the visitor has moved on from the intro". Same list as
// Hero.jsx: passive and once, so this can never become a per-frame listener.
const INTERACTION_EVENTS = ['scroll', 'wheel', 'touchmove', 'keydown', 'pointerdown']

export default function SectionHeroMedia({
  section,
  fallbackVideo,
  fallbackPoster,
  // Pill text for any row whose `label` is blank. The model's label field is
  // the admin's own wording ("FEATURED", "CASINO EXPERIENCE"); this is what
  // shows when they left it empty.
  badgeLabel = '',
  // Off, unlike the landing band. The hold below usually ends on a real
  // gesture, but it can also just time out — and a card that opens by itself
  // and starts talking is not what anyone asked for. The control is right
  // there to turn it on.
  defaultSoundOn = false,
  marginBottom,
  // How long the background gets the screen to itself before the card opens.
  // 0 shows it immediately.
  introHoldMs = INTRO_HOLD_MS,
}) {
  const reduceMotion = useReducedMotion()

  // Visitors who asked for reduced motion skip the intro entirely and start
  // revealed: they still get the card, just without it opening.
  const [revealed, setRevealed] = useState(() => !!reduceMotion)
  // The growing box has to clip its contents, or the frame's own glow and
  // shadow spill out of a height the animation has not reached yet. Dropped
  // the moment the open finishes, so the finished card keeps the full
  // box-shadow the Premium Partners band has.
  const [clipped, setClipped] = useState(() => !reduceMotion)

  useEffect(() => {
    if (reduceMotion) { setRevealed(true); setClipped(false); return undefined }

    const reveal = () => setRevealed(true)
    const timer = setTimeout(reveal, introHoldMs)

    // Someone who starts scrolling or interacting has stopped watching the
    // background — open the card immediately rather than making them wait out
    // the hold.
    const onInteract = () => { clearTimeout(timer); reveal() }
    INTERACTION_EVENTS.forEach(e =>
      window.addEventListener(e, onInteract, { passive: true, once: true }),
    )

    return () => {
      clearTimeout(timer)
      INTERACTION_EVENTS.forEach(e => window.removeEventListener(e, onInteract))
    }
  }, [reduceMotion, introHoldMs])

  // Unclip when the open actually finishes, rather than on a timer set to the
  // same duration. The two are not interchangeable: the growth is driven by
  // requestAnimationFrame and a timeout is not, so in a throttled tab the
  // timer wins the race and drops the clip while the box is still a few
  // pixels tall — which paints the whole card, at full size, outside a box
  // that has not grown to hold it. Measured at 0.7s nominal stretching past
  // 2s under throttling, so this is not theoretical.
  //
  // Guarded on `revealed`: with `initial={false}` framer also reports
  // "complete" for the collapsed baseline it applies at mount, and unclipping
  // then would leak the card through a zero-height box for the whole hold.
  const handleRevealComplete = useCallback(() => {
    if (revealed) setClipped(false)
  }, [revealed])

  // useAutoFetch, not a one-shot effect: re-polls every 60s so a visitor
  // already sitting on this page picks up a Back Office media change without
  // navigating away and back — matches every other landing section.
  const { data } = useAutoFetch(fetchSectionMedia, { section }, { intervalMs: 60_000 })

  const configured = useMemo(() => (
    Array.isArray(data)
      ? data.map(row => ({
          id: row.id,
          video: row.video || '',
          image: row.poster_image || '',
          // Per-row override of the section's default pill.
          badge: row.label || '',
          // No name or caption: the page's own heading sits directly above
          // this band, and a plate restating it would say the same thing
          // twice on one screen.
        }))
      : []
  ), [data])

  const fallback = useMemo(() => (
    fallbackVideo || fallbackPoster
      ? [{ id: `${section}-fallback`, video: fallbackVideo || '', image: fallbackPoster || '' }]
      : []
  ), [section, fallbackVideo, fallbackPoster])

  // A row with neither a video nor a poster contributes no slide, so a section
  // whose only row is empty falls through to the fallback rather than showing
  // a blank frame.
  //
  // Memoised, like the two halves it is built from: the showcase derives its
  // rotation timer from this list's identity, and handing it a fresh array on
  // every render is what restarts that timer on renders that changed nothing.
  const usable = useMemo(() => configured.filter(item => item.video || item.image), [configured])
  const items = useMemo(() => (usable.length > 0 ? usable : fallback), [usable, fallback])

  // Height, not just opacity: the card is ~400px tall, and revealing it by
  // fading alone would drop that much page under everything below it in one
  // frame. Growing the box instead lets the rest of the page slide down with
  // it, so the open reads as the card making room for itself rather than as a
  // layout jump four seconds after load.
  //
  // The showcase is mounted throughout — collapsed, not absent. Its <video>
  // preloads metadata during the hold, so the frame already knows the media's
  // real ratio when it opens and settles into the right shape immediately
  // instead of starting at the 2.4 default and resizing. That costs nothing
  // extra here: the watermark behind the hero is fetching the very same file.
  //
  // A zero-height box does not intersect the viewport, so the showcase's own
  // observer keeps playback paused for the whole hold — the card is not
  // playing to itself behind a collapsed wrapper.
  return (
    <motion.div
      initial={false}
      animate={{ height: revealed ? 'auto' : 0, opacity: revealed ? 1 : 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: REVEAL_SEC, ease: REVEAL_EASE }}
      onAnimationComplete={handleRevealComplete}
      style={{ overflow: clipped ? 'hidden' : 'visible' }}
    >
      <HeroMediaShowcase
        items={items}
        badgeLabel={badgeLabel}
        soundKey={`section-hero-${section}`}
        defaultSoundOn={defaultSoundOn}
        analyticsKind={`${section}_hero`}
        analyticsIdPrefix={usable.length > 0 ? `section-${section}` : ''}
        marginBottom={marginBottom}
      />
    </motion.div>
  )
}
