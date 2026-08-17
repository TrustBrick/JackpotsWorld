import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'

/**
 * HeroBackgroundVideo — the very-low-opacity cinematic watermark layer
 * behind a hero section (JACKPOTSWORLD spec Part 8). Purely atmospheric:
 * absolutely positioned behind every other layer, non-interactive, and
 * rendered at low opacity + darkened so it never competes with the text and
 * buttons stacked on top of it.
 *
 * `item` is the "background" slot row from GET /api/section-media/ (or
 * null/undefined) — renders nothing when absent, so a hero with no
 * background configured keeps its plain existing backdrop unchanged.
 * `prefers-reduced-motion` visitors get the static poster (if any) instead
 * of an autoplaying loop; with neither a poster nor motion allowed, nothing
 * renders.
 */

const VISIBILITY_THRESHOLD = 0.1

export default function HeroBackgroundVideo({ item }) {
  const reduceMotion = useReducedMotion()
  const [videoFailed, setVideoFailed] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(
    () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden')
  )
  const { ref: inViewRef, inView } = useInView({ threshold: VISIBILITY_THRESHOLD })
  const videoRef = useRef(null)
  const pendingPlayRef = useRef(null)

  useEffect(() => {
    const onVisibility = () => setDocumentVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const useVideo = item?.media_type === 'video' && !videoFailed && !reduceMotion
  const active = inView && documentVisible && useVideo

  const play = useCallback(async () => {
    const v = videoRef.current
    if (!v || !v.paused) return
    try { pendingPlayRef.current = v.play(); await pendingPlayRef.current }
    catch { /* stays on the poster/first frame — fine at this opacity */ }
    finally { pendingPlayRef.current = null }
  }, [])

  const pause = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    if (pendingPlayRef.current) { try { await pendingPlayRef.current } catch { /* handled in play() */ } }
    if (videoRef.current && !videoRef.current.paused) videoRef.current.pause()
  }, [])

  useEffect(() => { if (active) play(); else pause() }, [active, play, pause])
  useEffect(() => () => { const v = videoRef.current; if (v && !v.paused) v.pause() }, [])

  if (!item) return null
  const posterSrc = item.poster_image || undefined
  const showVideo = useVideo && item.video
  // Neither a playable video nor a poster (e.g. reduced-motion with only a
  // video configured) — nothing safe to render.
  if (!showVideo && !posterSrc) return null

  return (
    <div
      ref={inViewRef}
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, zIndex: 0,
        overflow: 'hidden', pointerEvents: 'none',
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
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: 0.16, filter: 'brightness(0.55) saturate(0.85)',
          }}
        />
      ) : (
        <img
          src={posterSrc}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: 0.14, filter: 'brightness(0.55) saturate(0.85)',
          }}
        />
      )}
      {/* Extra darkening so text/buttons above always stay legible regardless
          of how bright the source footage is. */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,0,5,0.35)' }} />
    </div>
  )
}
