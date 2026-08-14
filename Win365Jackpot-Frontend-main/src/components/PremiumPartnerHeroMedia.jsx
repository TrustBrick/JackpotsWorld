import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Volume2, VolumeX } from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchPremiumPartners } from '../services/landingService'
import { flagFromCountryCode } from '../utils/countryFlags'

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
// "active". 0.5 keeps playback tied to the media actually being watched
// without flickering on/off during ordinary scrolling.
const VISIBILITY_THRESHOLD = 0.5

// A video slide advances when it ends. This bounds the wait so one very long
// upload can't strand the rotation on a single partner.
const MAX_VIDEO_SLIDE_MS = 30_000

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

   play() returns a promise that rejects if pause() lands while it's still
   pending ("The play() request was interrupted by a call to pause()"), which
   is exactly what fast scrolling produces. Every pause therefore awaits the
   in-flight play first, so the two can't race.
   ──────────────────────────────────────────────────────────────────────── */
function HeroVideo({ src, poster, active, loop, onEnded, onError }) {
  const videoRef = useRef(null)
  const pendingPlayRef = useRef(null)
  // Sound defaults on: by the time this mounts the intro has already
  // collapsed, which only happens after the visitor scrolled, tapped, or
  // pressed a key (or the hold timer elapsed with no interaction at all).
  // A real interaction counts as user activation, so an unmuted play()
  // here is honoured by the browser instead of being autoplay-blocked.
  const [muted, setMuted] = useState(false)

  const play = useCallback(async () => {
    const v = videoRef.current
    if (!v || !v.paused) return
    try {
      pendingPlayRef.current = v.play()
      await pendingPlayRef.current
    } catch {
      // Autoplay refused (policy, or the element was torn down mid-play).
      // Muted playback is always permitted, so fall back to it rather than
      // leaving a dead frame on screen.
      if (v.paused && !v.muted) {
        v.muted = true
        setMuted(true)
        try {
          pendingPlayRef.current = v.play()
          await pendingPlayRef.current
        } catch {
          /* Nothing further to try — the poster/first frame stays visible. */
        }
      }
    } finally {
      pendingPlayRef.current = null
    }
  }, [])

  const pause = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    if (pendingPlayRef.current) {
      try { await pendingPlayRef.current } catch { /* already handled in play() */ }
    }
    if (videoRef.current && !videoRef.current.paused) videoRef.current.pause()
  }, [])

  // Single source of truth for playback. `active` already folds in viewport
  // visibility, document visibility and the hero intro state.
  useEffect(() => {
    if (active) play()
    else pause()
  }, [active, play, pause])

  // Pause on unmount so a slide change or route change can't leave audio
  // running behind the next partner's media.
  useEffect(() => () => { const v = videoRef.current; if (v && !v.paused) v.pause() }, [])

  // Retry unmuted once activation lands after the fact: the initial
  // unmuted play() above can still get autoplay-blocked (e.g. the 4s hold
  // timer fired with zero interaction), which silently falls back to
  // muted. The moment the browser reports real user activation, take the
  // opportunity to switch sound back on.
  useEffect(() => {
    if (!active) return
    if (!navigator.userActivation?.hasBeenActive) return
    const v = videoRef.current
    if (!v || !v.muted) return
    v.muted = false
    setMuted(false)
    play()
  }, [active, play])

  const toggleMuted = () => {
    const v = videoRef.current
    if (!v) return
    const next = !v.muted
    v.muted = next
    setMuted(next)
    if (!next) play()
  }

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        loop={loop}
        muted={muted}
        playsInline
        preload="metadata"
        onEnded={onEnded}
        onError={onError}
        // contain, matching the destinations carousel: uploaded videos can be
        // any aspect ratio and cover would crop whatever doesn't match this
        // fixed-height band.
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
      />
      <motion.button
        onClick={toggleMuted}
        whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.92 }}
        title={muted ? 'Unmute' : 'Mute'}
        aria-label={muted ? 'Unmute partner video' : 'Mute partner video'}
        style={{
          position: 'absolute', top: 10, left: 10, zIndex: 3,
          width: 34, height: 34, borderRadius: '50%',
          background: muted ? 'rgba(0,0,0,0.6)' : 'rgba(212,175,55,0.25)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(212,175,55,0.35)',
          color: '#F5E07A', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </motion.button>
    </>
  )
}

/* ── Still image ─────────────────────────────────────────────────────────── */
function HeroPhoto({ slide, eager, reduceMotion }) {
  return (
    <AnimatePresence mode="sync">
      <motion.img
        key={slide.src}
        src={slide.src}
        alt={slide.name}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          opacity: { duration: reduceMotion ? 0 : 0.9, ease: 'easeInOut' },
          scale: { duration: reduceMotion ? 0 : SLIDE_MS / 1000 + 1, ease: 'linear' },
        }}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', display: 'block',
        }}
      />
    </AnimatePresence>
  )
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export default function PremiumPartnerHeroMedia() {
  const reduceMotion = useReducedMotion()
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

  // Server-ordered by the admin's display_order, so no client-side sorting.
  const { data: partners } = useAutoFetch(fetchPremiumPartners, {}, { intervalMs: 60_000 })
  const slides = buildSlides(partners, videoFailedIds)

  const count = slides.length
  const safeIdx = count > 0 ? Math.min(idx, count - 1) : 0
  const current = slides[safeIdx]
  const active = inView && documentVisible

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
  useEffect(() => {
    if (!active || count < 2 || !current) return
    if (current.isVideo) {
      const id = setTimeout(advance, MAX_VIDEO_SLIDE_MS)
      return () => clearTimeout(id)
    }
    if (reduceMotion) return
    const id = setTimeout(advance, SLIDE_MS)
    return () => clearTimeout(id)
  }, [active, count, current, advance, reduceMotion])

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
      <div style={{ position: 'relative', height: 'clamp(220px,34vw,520px)', overflow: 'hidden' }}>
        {/* Only the current partner's media is mounted, so several partner
            videos are never fetched, decoded or played at once. Keying on the
            slide id tears the previous element down on change, which also
            stops its audio. */}
        {current.isVideo ? (
          <HeroVideo
            key={current.id}
            src={current.src}
            poster={current.poster}
            active={active}
            // A lone partner loops as before; with several, ending is what
            // hands over to the next one.
            loop={count < 2}
            onEnded={count > 1 ? advance : undefined}
            onError={() => markVideoFailed(current.id)}
          />
        ) : (
          <HeroPhoto key={current.id} slide={current} eager={safeIdx === 0} reduceMotion={reduceMotion} />
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

        <div style={{
          position: 'absolute', left: 16, right: 16, bottom: 12, zIndex: 2,
          display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
          fontFamily: "'Manrope', sans-serif",
        }}>
          <span style={{
            fontSize: 'clamp(16px,2.6vw,26px)', fontWeight: 700, lineHeight: 1.1,
            background: 'linear-gradient(135deg,#D4AF37,#F5E07A)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            {current.flag ? `${current.flag} ` : ''}{current.name}
          </span>
          {current.caption && (
            <span style={{
              fontSize: 'clamp(8px,1.3vw,11px)', fontWeight: 700,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.55)',
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
