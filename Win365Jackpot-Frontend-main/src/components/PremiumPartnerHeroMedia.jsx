import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Volume2, VolumeX } from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { attemptPlay, useSoundPreference, useUserActivation } from '../hooks/useAudioAutoplay'
import { fetchPremiumPartners } from '../services/landingService'
import { flagFromCountryCode } from '../utils/countryFlags'
import { useVideoAnalytics } from '../hooks/useVideoAnalytics'

/* ─────────────────────────────────────────────────────────────────────────
   Top Premium Partners hero media.

   Revealed inside the space the hero title frees up when it collapses from
   the stacked intro state to the compact one (see Hero.jsx).

   Data comes solely from /api/premium-partners/, which returns only
   partners an admin has marked active + featured + top-premium. This
   component reads nothing from the destinations API and has no fallback to
   it: the hero showcase, the Casino Destinations section and the location
   ticker are three independent systems. Nothing here is hardcoded — the
   partners shown, their order and their media are entirely Back Office
   controlled.

   Presentation is unchanged from the previous single-country version: same
   framing, same video player and mute control, same crossfade, same gold
   badge and caption treatment.
   ───────────────────────────────────────────────────────────────────────── */

// How long a still image holds before crossfading to the next partner.
const SLIDE_MS = 3800

// Fraction of the media box that must be on screen for it to count as
// "active".
//
// Was 0.5, which is too much for a box this tall: at up to 520px it is a
// large share of a laptop viewport, so ordinary scrolling crossed the 50%
// line repeatedly and each crossing produced another pause()/play() pair —
// playback visibly stopping and restarting while the visitor was still
// looking straight at it. 0.25 still ties playback to media that is
// genuinely on screen while leaving room to scroll without chopping it up.
const VISIBILITY_THRESHOLD = 0.25

// A video slide advances when it ends. This bounds the wait so one very long
// upload can't strand the rotation on a single partner.
const MAX_VIDEO_SLIDE_MS = 30_000

/* ── Media fit ────────────────────────────────────────────────────────────
   The frame is a wide banner (up to 1220 x 520, ~2.35:1) but uploads are
   whatever the admin has: the live Bellagio clip is 848x478 (1.77:1). Fitting
   that with `contain` left ~149px of flat black down each side — those bars
   were the CSS backdrop showing through, not part of the video.

   `cover` removes them without stretching anything, at the cost of a crop.
   How much crop is the only real question, and it is decided per upload from
   the media's own intrinsic size rather than assumed: `cover` has to scale
   the media by max(boxRatio/mediaRatio, mediaRatio/boxRatio), and past a
   point that stops being "fill the frame" and becomes "zoom into a detail".

   1.6 is where that line sits here. The real 16:9 upload needs 2.35/1.77 =
   1.32x, comfortably inside it, so it fills the frame edge to edge. A
   phone-shot portrait clip would need ~4x, so it keeps its full height and
   the surround stays the hero's own dark surface — never flat black. */
const MAX_COVER_ZOOM = 1.6

/** How far `cover` would have to scale this media up to fill this box.
 *  Returns 1 when either ratio isn't known yet, so an unmeasured frame reads
 *  as "no zoom needed" and takes the `cover` branch. */
function coverZoom(mediaRatio, boxRatio) {
  if (!mediaRatio || !boxRatio) return 1
  return mediaRatio > boxRatio ? mediaRatio / boxRatio : boxRatio / mediaRatio
}

/* ── Sheen ────────────────────────────────────────────────────────────────
   The partner name is gold lettering with a soft highlight travelling across
   it, left to right, once every 7s.

   Deliberately a background-position animation on a background-clipped
   gradient: nothing about the text's geometry changes, so the line never
   moves, reflows or shifts the layout around it — the only thing that
   animates is which part of the gradient each glyph is painted from.

   background-size is 300%, and the animation only sweeps position across
   0%..100% of the remaining 200%, which keeps the visible window inside the
   gradient at all times — no tile seam ever crosses the text. The bright
   band sits at the gradient's midpoint and the outer thirds are flat base
   gold, so both ends of the loop show plain gold: the rest phase is clean
   and the restart is invisible rather than a flash.

   Injected here rather than added to Hero.jsx's stylesheet so this component
   carries its own presentation. */
const SHEEN_CSS = `
  @keyframes w365-partner-sheen {
    0%,  14% { background-position: 100% center; }
    66%,100% { background-position:   0% center; }
  }
  .w365-partner-name {
    background-image: linear-gradient(100deg,
      #C9A22B 0%, #C9A22B 30%,
      #E8CE6E 42%, #FFFDF0 50%, #E8CE6E 58%,
      #C9A22B 70%, #C9A22B 100%);
    background-size: 300% 100%;
    background-position: 0% center;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    /* drop-shadow, not text-shadow: with the fill transparent a text-shadow
       would trace the glyphs of an invisible layer. This softly glows the
       clipped result instead. */
    filter: drop-shadow(0 1px 9px rgba(212,175,55,0.30));
    animation: w365-partner-sheen 7s ease-in-out infinite;
  }
  /* Without background-clip: text the rules above would paint the name in
     transparent. Fall back to a plain gold fill. */
  @supports not ((-webkit-background-clip: text) or (background-clip: text)) {
    .w365-partner-name {
      background-image: none;
      color: #E8CE6E;
      -webkit-text-fill-color: #E8CE6E;
      animation: none;
      filter: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .w365-partner-name {
      animation: none;
      background-position: 50% center;
    }
  }
`

function injectSheenCSS() {
  if (typeof document === 'undefined') return
  if (document.getElementById('w365-partner-sheen-css')) return
  const el = document.createElement('style')
  el.id = 'w365-partner-sheen-css'
  el.textContent = SHEEN_CSS
  document.head.appendChild(el)
}

/** One renderable slide per partner: its video when it has one, else its
 *  image. Partners with neither are dropped rather than rendered as an empty
 *  frame. `videoFailedIds` demotes a partner to its image after a playback
 *  error, and drops it entirely if that's all it had. */
function buildSlides(partners, videoFailedIds) {
  if (!Array.isArray(partners)) return []
  return partners
    .map(p => {
      const videoUsable = p.hero_video && !videoFailedIds.has(p.id)
      const src = videoUsable ? p.hero_video : p.hero_image
      if (!src) return null
      return {
        id: p.id,
        src,
        isVideo: !!videoUsable,
        poster: p.hero_image || undefined,
        name: p.name,
        flag: flagFromCountryCode(p.flag_country_code),
        // Falls back to the place when no description is set, so the caption
        // line is never empty — but never invents either.
        caption: p.description || [p.city, p.country].filter(Boolean).join(', '),
      }
    })
    .filter(Boolean)
}

/* ── Video ────────────────────────────────────────────────────────────────
   Playback is driven by one derived boolean — "should this be playing right
   now?" — rather than by the events themselves, so IntersectionObserver and
   document-visibility can never disagree about the resulting state.

   Audio follows the shared policy in hooks/useAudioAutoplay: try audible,
   fall back to muted once if the browser refuses, and take exactly one more
   audible attempt when real user activation actually arrives. There is no
   retry loop and no timer anywhere in here.

   Two separate ideas, deliberately kept apart:
     soundOn — what the visitor wants. Lives in the parent (and outside React
               entirely, in the shared preference store) so a partner rotation
               remounting this component cannot silently discard their choice.
     audible — what the element is actually doing. Diverges from soundOn only
               when the browser has blocked audible playback, which is exactly
               when the unmute control needs to be obvious.

   play() returns a promise that rejects if pause() lands while it's still
   pending ("The play() request was interrupted by a call to pause()"), which
   is exactly what fast scrolling produces. Every call therefore awaits the
   in-flight one first, so they can't race.
   ──────────────────────────────────────────────────────────────────────── */
function HeroVideo({ src, poster, active, loop, soundOn, onSoundChange, onEnded, onError, contentId, title, fit, onNaturalSize }) {
  const videoRef = useRef(null)
  const pendingPlayRef = useRef(null)
  const activated = useUserActivation()
  const [audible, setAudible] = useState(false)

  // ANALYTICS: engagement on this premium-partner content video. Records only
  // on real playback (see the hook), keyed to the partner so the dashboard can
  // report per-partner views/retention.
  useVideoAnalytics(videoRef, {
    contentId,
    title,
    contentKind: "premium_partner",
    enabled: !!contentId,
  })

  const play = useCallback(async (withSound) => {
    if (pendingPlayRef.current) await pendingPlayRef.current
    const v = videoRef.current
    if (!v) return
    const attempt = attemptPlay(v, { withSound })
    pendingPlayRef.current = attempt
    const outcome = await attempt
    // Only clear the slot if it is still ours: a call that queued behind this
    // one has already claimed it, and nulling that would let a later pause()
    // slip past the promise it is supposed to wait for.
    if (pendingPlayRef.current === attempt) pendingPlayRef.current = null
    if (videoRef.current) setAudible(outcome === 'audible')
  }, [])

  const pause = useCallback(async () => {
    if (pendingPlayRef.current) await pendingPlayRef.current
    const v = videoRef.current
    if (v && !v.paused) v.pause()
  }, [])

  // Single source of truth for playback. `active` already folds in viewport
  // visibility, document visibility and the hero intro state. `activated` is
  // a dependency so the one audible retry happens precisely when the
  // browser's answer can have changed — not on a schedule, and not on every
  // render.
  useEffect(() => {
    if (active) play(soundOn)
    else pause()
  }, [active, soundOn, activated, play, pause])

  // Pause on unmount so a slide change or route change can't leave audio
  // running behind the next partner's media.
  useEffect(() => () => { const v = videoRef.current; if (v && !v.paused) v.pause() }, [])

  const toggleSound = () => {
    const next = !audible
    // Remember the choice for the partners that come after this one...
    onSoundChange(next)
    // ...and act on this element now. The click is itself an activation
    // gesture, so an audible attempt made here will be honoured — waiting for
    // the preference to round-trip through state would do nothing when it is
    // already `next` (the blocked-autoplay case, where the visitor wanted
    // sound all along and the browser said no).
    play(next)
  }

  // The visitor asked for sound and is not getting it: the browser is holding
  // it back until they interact. Say so, rather than leaving a 34px icon to
  // carry the message on its own.
  const blocked = active && soundOn && !audible

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        loop={loop}
        // Static, and switched on imperatively once a play() attempt has
        // actually been allowed. `soundOn` cannot drive this attribute: it is
        // what the visitor wants, and it stays true through a refusal — so
        // binding it would put React's idea of the element permanently at odds
        // with the muted fallback the policy forced, and any later prop change
        // would silently undo that fallback. The element is keyed by partner
        // id, so a rotation remounts this component and re-runs the effect
        // that owns the real state.
        muted
        playsInline
        // "metadata" fetched the header and then began playback with no
        // buffered lead at all, so the very first network hiccup was already
        // a stall. This is the video the visitor is here to watch — let the
        // browser buffer ahead of the playhead.
        preload="auto"
        onEnded={onEnded}
        onError={onError}
        // The intrinsic size the fit decision is made from. videoWidth /
        // videoHeight are only populated once metadata has arrived, which is
        // exactly when this fires.
        onLoadedMetadata={e => {
          const v = e.currentTarget
          if (v.videoWidth > 0 && v.videoHeight > 0) onNaturalSize?.(v.videoWidth / v.videoHeight)
        }}
        // No background of its own: with `cover` nothing shows behind it, and
        // in the `contain` fallback the surround should be the frame's own
        // dark surface rather than the flat black bars this used to paint.
        style={{
          width: '100%', height: '100%',
          objectFit: fit, objectPosition: 'center',
          display: 'block', background: 'transparent',
        }}
      />
      <motion.button
        onClick={toggleSound}
        whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
        title={audible ? 'Mute' : 'Unmute'}
        aria-label={audible ? 'Mute partner video' : 'Unmute partner video'}
        style={{
          position: 'absolute', top: 10, left: 10, zIndex: 3,
          height: 34, borderRadius: 999,
          padding: blocked ? '0 12px 0 10px' : 0,
          width: blocked ? 'auto' : 34,
          gap: blocked ? 7 : 0,
          background: audible ? 'rgba(212,175,55,0.25)' : 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(212,175,55,0.35)',
          color: '#F5E07A', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Manrope', sans-serif",
          fontSize: 10.5, fontWeight: 800,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {audible ? <Volume2 size={15} /> : <VolumeX size={15} />}
        {blocked && <span>Tap for sound</span>}
      </motion.button>
    </>
  )
}

/* ── Still image ─────────────────────────────────────────────────────────── */
function HeroPhoto({ slide, eager, reduceMotion, fit, onNaturalSize }) {
  return (
    <AnimatePresence mode="sync">
      <motion.img
        key={slide.src}
        src={slide.src}
        alt={slide.name}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={e => {
          const img = e.currentTarget
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            onNaturalSize?.(img.naturalWidth / img.naturalHeight)
          }
        }}
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          opacity: { duration: reduceMotion ? 0 : 0.9, ease: 'easeInOut' },
          scale: { duration: reduceMotion ? 0 : SLIDE_MS / 1000 + 1, ease: 'linear' },
        }}
        // Shares the video's fit decision rather than being hardcoded to
        // cover: an admin uploading a poster-shaped still gets it whole,
        // exactly as a portrait video would, in this same frame.
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: fit, objectPosition: 'center', display: 'block',
        }}
      />
    </AnimatePresence>
  )
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export default function PremiumPartnerHeroMedia() {
  const reduceMotion = useReducedMotion()
  // Held here, not inside HeroVideo: the video element is keyed by partner id
  // and so remounts on every rotation, which would otherwise reset a visitor's
  // mute back to "on" each time the slide changed. Defaults to wanting sound —
  // this band only appears once the hero has collapsed, which itself follows a
  // scroll, tap or keypress, so audible playback is usually already permitted
  // by then. When it isn't, the control below says so.
  const [soundOn, setSoundOn] = useSoundPreference('premium-partner-hero', true)
  const [videoFailedIds, setVideoFailedIds] = useState(() => new Set())
  const [idx, setIdx] = useState(0)
  const [documentVisible, setDocumentVisible] = useState(
    () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden')
  )

  // triggerOnce is deliberately off — unlike the reveal animations elsewhere
  // on this page, this observer has to keep reporting as the visitor scrolls
  // back and forth so playback can stop and resume.
  const { ref: inViewRef, inView } = useInView({ threshold: VISIBILITY_THRESHOLD })

  useEffect(() => {
    const onVisibility = () => setDocumentVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(injectSheenCSS, [])

  // Server-ordered by the admin's display_order, so no client-side sorting.
  const { data: partners } = useAutoFetch(fetchPremiumPartners, {}, { intervalMs: 60_000 })
  // Memoised because `current` below is derived from this and feeds an
  // effect's dependency array. Rebuilding the array on every render gave
  // every slide a new object identity each time, so that effect tore down
  // and recreated its timer on renders that had changed nothing — and this
  // component re-renders on a schedule it doesn't control, since Hero.jsx
  // re-renders roughly every 60s from its own interval and its auto-fetch
  // polls.
  const slides = useMemo(() => buildSlides(partners, videoFailedIds), [partners, videoFailedIds])

  const count = slides.length
  const safeIdx = count > 0 ? Math.min(idx, count - 1) : 0
  const current = slides[safeIdx]
  const active = inView && documentVisible

  // ── Media fit ───────────────────────────────────────────────────────────
  // Both halves of the comparison are measured, never assumed: the box ratio
  // from the element itself (it is fluid — width tracks the viewport, height
  // is a clamp()), and the media ratio from the file once it reports one.
  //
  // A callback ref, not useRef: this component returns null until a partner
  // has loaded, so the box does not exist during the first commits. A plain
  // ref read from a mount-only effect would be null then and never looked at
  // again; this re-runs the moment the node actually appears.
  const [boxEl, setBoxEl] = useState(null)
  const [boxRatio, setBoxRatio] = useState(null)
  const [mediaRatio, setMediaRatio] = useState(null)

  useEffect(() => {
    if (!boxEl) return undefined
    const measure = () => {
      const { width, height } = boxEl.getBoundingClientRect()
      if (width > 0 && height > 0) setBoxRatio(width / height)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    // Observing the box rather than listening on window covers every way its
    // size can change — viewport resize, orientation, the hero's own layout
    // animation settling — with one subscription.
    const observer = new ResizeObserver(measure)
    observer.observe(boxEl)
    return () => observer.disconnect()
  }, [boxEl])

  // A new partner's media has its own dimensions; drop the previous one's so
  // the fit is never decided from the slide that just left.
  const currentId = current?.id
  const currentIsVideo = !!current?.isVideo
  useEffect(() => { setMediaRatio(null) }, [currentId])

  // Filling the frame is the default, including before the media has reported
  // a size — that is the state this component is in for the first frames
  // after mount, and a brief black-barred flash there is exactly what this
  // change exists to remove.
  const fit = coverZoom(mediaRatio, boxRatio) > MAX_COVER_ZOOM ? 'contain' : 'cover'

  // A partner removed in the Back Office can shorten the list under a stale
  // index; snap back rather than showing the clamped last slide forever.
  useEffect(() => {
    if (count > 0 && idx >= count) setIdx(0)
  }, [count, idx])

  const advance = useCallback(() => {
    setIdx(p => (count > 0 ? (p + 1) % count : 0))
  }, [count])

  // Image slides advance on a timer; video slides advance when they end
  // (with MAX_VIDEO_SLIDE_MS as a backstop). A single partner never rotates.
  //
  // Depends on the two facts it actually reads — which slide, and whether it
  // is a video — rather than on the slide object. `current` is rebuilt on
  // every render, so depending on it restarted this timer on every render,
  // and the MAX_VIDEO_SLIDE_MS backstop could be pushed out indefinitely by
  // renders that had nothing to do with playback.
  useEffect(() => {
    if (!active || count < 2 || currentId === undefined) return
    if (currentIsVideo) {
      const id = setTimeout(advance, MAX_VIDEO_SLIDE_MS)
      return () => clearTimeout(id)
    }
    if (reduceMotion) return
    const id = setTimeout(advance, SLIDE_MS)
    return () => clearTimeout(id)
  }, [active, count, currentId, currentIsVideo, advance, reduceMotion])

  const markVideoFailed = useCallback((id) => {
    setVideoFailedIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  // No eligible partners — render nothing rather than falling back to
  // unrelated data or leaving a broken media element in the layout. The
  // hero's wrapper collapses cleanly around this.
  if (!current) return null

  return (
    <motion.div
      ref={inViewRef}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 18,
        overflow: 'hidden',
        border: '1px solid rgba(212,175,55,0.4)',
        boxShadow: '0 0 42px rgba(212,175,55,0.24), 0 14px 40px rgba(0,0,0,0.5)',
        background: 'rgba(255,255,255,0.02)',
        marginBottom: 'clamp(12px,3vw,24px)',
      }}
    >
      {/* The major visual element of the hero, not a small card — width comes
          from the wide container Hero.jsx wraps this in (up to ~1220px), and
          height scales with it here so the box keeps a consistent banner
          proportion across breakpoints instead of a fixed vh slice. */}
      <div
        ref={setBoxEl}
        style={{
          position: 'relative',
          height: 'clamp(220px,34vw,520px)',
          overflow: 'hidden',
          // Only ever seen in the `contain` fallback, and deliberately the
          // hero's own graded dark magenta rather than the flat #000 the
          // media element used to paint behind itself.
          background: 'radial-gradient(ellipse at 50% 40%, #1d0018 0%, #0A0005 100%)',
        }}
      >
        {/* Only the current partner's media is mounted, so several partner
            videos are never fetched, decoded or played at once. Keying on the
            slide id tears the previous element down on change, which also
            stops its audio. */}
        {current.isVideo ? (
          <HeroVideo
            key={current.id}
            src={current.src}
            poster={current.poster}
            contentId={`partner-${current.id}`}
            title={current.name}
            active={active}
            soundOn={soundOn}
            onSoundChange={setSoundOn}
            fit={fit}
            onNaturalSize={setMediaRatio}
            // A lone partner loops as before; with several, ending is what
            // hands over to the next one.
            loop={count < 2}
            onEnded={count > 1 ? advance : undefined}
            onError={() => markVideoFailed(current.id)}
          />
        ) : (
          <HeroPhoto
            key={current.id}
            slide={current}
            eager={safeIdx === 0}
            reduceMotion={reduceMotion}
            fit={fit}
            onNaturalSize={setMediaRatio}
          />
        )}

        {/* Bottom scrim — keeps the caption legible over any frame, using the
            same dark magenta the hero grades its background video with. */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(10,0,5,0.88) 0%, rgba(22,0,18,0.25) 42%, transparent 70%)',
        }} />

        {/* Premium-partner marker, in the same gold pill language as the
            hero's other badges. */}
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          border: '1px solid rgba(245,224,122,0.7)', borderRadius: 999,
          padding: '4px 11px',
          background: 'rgba(10,0,5,0.55)',
          backdropFilter: 'blur(8px)',
          fontFamily: "'Manrope', sans-serif",
          fontSize: 'clamp(8px,1.4vw,11px)', fontWeight: 900,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: '#F5E07A',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', animation: 'pulse-dot 2s infinite', display: 'inline-block' }} />
          Premium Partner
        </div>

        {/* Partner plate. Stacked rather than the previous single baseline
            row so the name reads as a title with the caption under it, and
            kept to the lower-left corner and its own width so it sits over
            the darkest part of the scrim without spanning the frame or
            covering what is happening in the middle of the shot.

            There is deliberately no "Premium Partner" line here — that badge
            already exists top-right, and a second one would just say the same
            thing twice inside one frame.

            pointerEvents none so it never intercepts a click meant for the
            slide dots sharing this edge. */}
        <div style={{
          position: 'absolute',
          left: 'clamp(12px,2vw,18px)',
          bottom: 'clamp(10px,1.6vw,14px)',
          zIndex: 2,
          maxWidth: 'min(72%, 460px)',
          display: 'flex', flexDirection: 'column', gap: 3,
          fontFamily: "'Manrope', sans-serif",
          pointerEvents: 'none',
        }}>
          {/* The flag sits outside the sheen span on purpose. Everything
              inside it is painted from a background clipped to the glyphs
              with the text fill transparent, which is right for lettering
              and wrong for a colour emoji — this keeps the flag its own
              artwork and lets only the name catch the light. */}
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            {current.flag && (
              <span
                aria-hidden
                style={{ fontSize: 'clamp(15px,2.2vw,23px)', lineHeight: 1.12, flexShrink: 0 }}
              >
                {current.flag}
              </span>
            )}
            <span
              className="w365-partner-name"
              style={{
                fontSize: 'clamp(17px,2.6vw,27px)', fontWeight: 700,
                lineHeight: 1.12, letterSpacing: '0.005em',
              }}
            >
              {current.name}
            </span>
          </span>
          {current.caption && (
            <span style={{
              fontSize: 'clamp(8px,1.3vw,11px)', fontWeight: 700,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.62)',
            }}>
              {current.caption}
            </span>
          )}
        </div>

        {/* Slide dots — only when there is actually more than one partner to
            move between, so a single-partner hero looks exactly as it did. */}
        {count > 1 && (
          <div style={{
            position: 'absolute', bottom: 12, right: 16, zIndex: 3,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setIdx(i)}
                aria-label={`Show ${s.name}`}
                aria-current={i === safeIdx}
                style={{
                  width: i === safeIdx ? 18 : 6, height: 6, borderRadius: 999,
                  border: 'none', padding: 0, cursor: 'pointer',
                  background: i === safeIdx ? '#F5E07A' : 'rgba(255,255,255,0.4)',
                  transition: 'width 0.3s ease, background 0.3s ease',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
