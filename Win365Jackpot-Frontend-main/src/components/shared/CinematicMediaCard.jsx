import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'

/**
 * CinematicMediaCard — one Back-Office-managed video/poster panel used
 * beside the Teen Patti and Poker heroes (JACKPOTSWORLD spec Parts 6-7).
 *
 * Deliberately NOT a video-player look: no controls, no play button, small
 * fixed aspect, always muted/looped/autoplaying like a broadcast loop rather
 * than something the visitor operates. Playback is gated on the same
 * IntersectionObserver + document-visibility pattern as
 * PremiumPartnerHeroMedia, so an off-screen or backgrounded card never plays.
 *
 * `item` is one row from GET /api/section-media/?section=... (or undefined/
 * null if that slot has nothing configured) — this component renders
 * nothing in that case rather than a placeholder, per the "don't fabricate
 * content" requirement. `item.label` is admin-authored text (e.g.
 * "FEATURED", "CASINO EXPERIENCE") and is the only badge ever shown — there
 * is no live-viewer count anywhere in this component, since this app has no
 * real live-viewership data source to draw one from.
 */

const VISIBILITY_THRESHOLD = 0.4

function usePlayableVideo(active) {
  const videoRef = useRef(null)
  const pendingPlayRef = useRef(null)

  const play = useCallback(async () => {
    const v = videoRef.current
    if (!v || !v.paused) return
    try {
      pendingPlayRef.current = v.play()
      await pendingPlayRef.current
    } catch {
      /* Autoplay refused or the element unmounted mid-play — the poster
         frame simply stays visible, which is a fine resting state here
         since these cards are always muted anyway (no sound to miss). */
    } finally {
      pendingPlayRef.current = null
    }
  }, [])

  const pause = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    if (pendingPlayRef.current) {
      try { await pendingPlayRef.current } catch { /* handled in play() */ }
    }
    if (videoRef.current && !videoRef.current.paused) videoRef.current.pause()
  }, [])

  useEffect(() => {
    if (active) play(); else pause()
  }, [active, play, pause])

  useEffect(() => () => { const v = videoRef.current; if (v && !v.paused) v.pause() }, [])

  return videoRef
}

export default function CinematicMediaCard({ item, align = 'left', className = '' }) {
  const reduceMotion = useReducedMotion()
  const [videoFailed, setVideoFailed] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(
    () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden')
  )
  const { ref: inViewRef, inView } = useInView({ threshold: VISIBILITY_THRESHOLD })

  useEffect(() => {
    const onVisibility = () => setDocumentVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // A video plays only with real motion allowed; prefers-reduced-motion
  // visitors get the static poster instead of an autoplaying loop.
  const useVideo = item?.media_type === 'video' && !videoFailed && !reduceMotion
  const active = inView && documentVisible && useVideo
  const videoRef = usePlayableVideo(active)

  if (!item) return null
  const posterSrc = item.poster_image || undefined
  const showVideo = useVideo && item.video

  return (
    <motion.div
      ref={inViewRef}
      initial={{ opacity: 0, x: reduceMotion ? 0 : (align === 'left' ? -24 : 24) }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
      style={{
        position: 'relative',
        borderRadius: 20,
        overflow: 'hidden',
        border: '1px solid rgba(212,175,55,0.4)',
        boxShadow: '0 14px 34px rgba(0,0,0,0.55), 0 0 24px rgba(212,175,55,0.12)',
        background: '#0A0005',
      }}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          src={item.video}
          poster={posterSrc}
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : posterSrc ? (
        <img
          src={posterSrc}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : null}

      {/* Cinematic vignette — darkens the edges and keeps any badge legible
          without a separate scrim element. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 45%, rgba(10,0,5,0.65) 100%), linear-gradient(to top, rgba(10,0,5,0.55) 0%, transparent 40%)',
        }}
      />

      {item.label && (
        <div
          style={{
            position: 'absolute', top: 10, left: 10, zIndex: 2,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: '1px solid rgba(212,175,55,0.55)', borderRadius: 999,
            padding: '4px 10px', background: 'rgba(10,0,5,0.55)', backdropFilter: 'blur(6px)',
            fontFamily: "'Manrope', sans-serif", fontSize: 10, fontWeight: 800,
            letterSpacing: '0.14em', textTransform: 'uppercase', color: '#D4AF37',
          }}
        >
          {item.label}
        </div>
      )}
    </motion.div>
  )
}
