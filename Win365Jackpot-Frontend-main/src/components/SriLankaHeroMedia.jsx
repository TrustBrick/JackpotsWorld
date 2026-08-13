import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Volume2, VolumeX } from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchDestinations } from '../services/landingService'

/* ─────────────────────────────────────────────────────────────────────────
   Sri Lanka premium-partner hero media.

   Revealed inside the space the hero title frees up when it collapses from
   the stacked intro state to the compact one (see Hero.jsx).

   Media comes from the same admin-managed destinations API that powers the
   Casino Destinations section, so whatever an admin uploads for Sri Lanka
   shows up here too — including a video, which the repo currently has none
   of for this country (only Vietnam ships one). Until a video exists this
   renders the bundled Sri Lanka property photos as a slow cinematic
   crossfade; the moment a `media_type: "video"` record appears for Sri
   Lanka, the video path below takes over with no further code change.
   ───────────────────────────────────────────────────────────────────────── */

const DESTINATION_NAME = 'Sri Lanka'

// Same bundled assets CountryPackages' fallback list already points at — no
// new files, no duplicated uploads. Used until the API answers, and as the
// per-item fallback for admin records with no uploaded file yet (matching
// how CountryPackages resolves its own destination media).
const FALLBACK_MEDIA = [
  { src: '/images/ballagio-srilanka.jpeg',       label: 'Ballagio' },
  { src: '/images/marina-srilanka.jpg',          label: 'Marina' },
  { src: '/images/ballys-srilanka.jpg',          label: "Bally's" },
  { src: '/images/cod-srilanka.jpg',             label: 'City of Dreams' },
  { src: '/images/majesticpride-srilanka.jpg',   label: 'Majestic Pride' },
  { src: '/images/ballagio-lobby-srilanka.jpeg', label: 'Ballagio Lobby' },
]
const FALLBACK_SRC_BY_LABEL = new Map(FALLBACK_MEDIA.map(m => [m.label, m.src]))

// How long each photo holds before crossfading to the next.
const SLIDE_MS = 3800

// Fraction of the media box that must be on screen for it to count as
// "active". 0.5 keeps playback tied to the media actually being watched
// without flickering on/off during ordinary scrolling.
const VISIBILITY_THRESHOLD = 0.5

/** Normalizes an API destination's media list into { src, label, isVideo }. */
function normalizeMedia(destination) {
  const items = (destination?.images || [])
    .map(m => ({
      src: m.media || FALLBACK_SRC_BY_LABEL.get(m.label),
      label: m.label,
      isVideo: m.media_type === 'video',
    }))
    .filter(m => m.src)
  return items.length > 0 ? items : FALLBACK_MEDIA.map(m => ({ ...m, isVideo: false }))
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
function HeroVideo({ src, poster, active, onError }) {
  const videoRef = useRef(null)
  const pendingPlayRef = useRef(null)
  const [muted, setMuted] = useState(true)

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

  // Pause on unmount so a route change can't leave audio running.
  useEffect(() => () => { const v = videoRef.current; if (v && !v.paused) v.pause() }, [])

  // Sound starts off: muted autoplay is the only kind every browser allows,
  // and attempting audio without a prior gesture just gets rejected. If the
  // visitor has already interacted with the page, the browser will honour an
  // unmuted start, so take that opportunity when the API reports it.
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
        loop
        muted={muted}
        playsInline
        preload="metadata"
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
        aria-label={muted ? 'Unmute Sri Lanka video' : 'Mute Sri Lanka video'}
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

/* ── Photo crossfade ─────────────────────────────────────────────────────── */
function HeroPhotos({ items, active, reduceMotion }) {
  const [idx, setIdx] = useState(0)

  // Only advance while the band is actually being looked at — an off-screen
  // or backgrounded tab shouldn't be running a timer or decoding images.
  useEffect(() => {
    if (!active || reduceMotion || items.length < 2) return
    const id = setInterval(() => setIdx(p => (p + 1) % items.length), SLIDE_MS)
    return () => clearInterval(id)
  }, [active, reduceMotion, items.length])

  const current = items[Math.min(idx, items.length - 1)]

  return (
    <AnimatePresence mode="sync">
      <motion.img
        key={current.src}
        src={current.src}
        alt={`${current.label} — Sri Lanka`}
        // The first frame is the one revealed straight after the intro, so it
        // loads eagerly; the rest are only ever reached later.
        loading={idx === 0 ? 'eager' : 'lazy'}
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
export default function SriLankaHeroMedia() {
  const reduceMotion = useReducedMotion()
  const [videoFailed, setVideoFailed] = useState(false)
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

  const { data: destinations } = useAutoFetch(fetchDestinations, {}, { intervalMs: 60_000 })
  const sriLanka = Array.isArray(destinations)
    ? destinations.find(d => d?.name === DESTINATION_NAME)
    : null
  const media = normalizeMedia(sriLanka)

  // One video at most, and only when it hasn't errored — never several
  // media elements loading at once.
  const video = videoFailed ? null : media.find(m => m.isVideo)
  const photos = media.filter(m => !m.isVideo)
  const photoItems = photos.length > 0 ? photos : FALLBACK_MEDIA.map(m => ({ ...m, isVideo: false }))

  const active = inView && documentVisible

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
        {video
          ? <HeroVideo src={video.src} poster={photoItems[0]?.src} active={active} onError={() => setVideoFailed(true)} />
          : <HeroPhotos items={photoItems} active={active} reduceMotion={reduceMotion} />
        }

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
            🇱🇰 {sriLanka?.name || DESTINATION_NAME}
          </span>
          <span style={{
            fontSize: 'clamp(8px,1.3vw,11px)', fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.55)',
          }}>
            {sriLanka?.tagline || 'Jewel of the Indian Ocean'}
          </span>
        </div>
      </div>
    </motion.div>
  )
}
