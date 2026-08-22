import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'

/**
 * HeroBackgroundVideo — the low-opacity cinematic watermark layer
 * behind a hero section (JACKPOTSWORLD spec Part 8). Purely atmospheric:
 * absolutely positioned behind every other layer, non-interactive, and
 * rendered at low opacity + darkened so it never competes with the text and
 * buttons stacked on top of it.
 *
 * `item` is the "background" slot row from GET /api/section-media/ (or
 * null/undefined) — the Back Office-managed override.
 *
 * `fallbackVideo` is a build-time asset shipped in the deploy bundle, used
 * when no row is configured *or* when the configured file fails to load.
 * That second case is not hypothetical: uploaded media lives in shared
 * storage that a given request may not find (a half-migrated key, a bucket
 * permission change), and before this existed such a failure left the hero
 * with no watermark at all. Each page passes its OWN fallback — Poker and
 * Teen Patti must never share a watermark asset (spec Part 12), which is
 * why this is a required prop per call site rather than a default baked in
 * here.
 *
 * Sources are tried in order (configured → fallback) and the list is
 * consumed at most once end-to-end: `srcIndex` only ever advances, so a
 * broken source can never put the element into a retry loop.
 *
 * `prefers-reduced-motion` visitors get the static poster (if any) instead
 * of an autoplaying loop; with neither a poster nor motion allowed, nothing
 * renders.
 *
 * `onNaturalSize` reports the source's intrinsic width/height ratio once the
 * browser knows it. A background has to fill its box, so it is the *box* that
 * decides how much of the frame survives; a caller that wants to shape its
 * band around the footage cannot do that without knowing the footage's shape.
 * Optional on purpose: TeenPattiHero renders this component into a band it
 * sizes itself and passes nothing, so the optional call is a no-op there.
 * Matches the onNaturalSize(ratio) convention PremiumPartnerHeroMedia already
 * uses, rather than inventing a second shape for the same idea.
 */

const VISIBILITY_THRESHOLD = 0.1

// Watermark compositing. These three values multiply out, so they are kept
// together rather than inlined at three separate call sites — the previous
// 0.16 / 0.14 / 0.35 combination left the footage at roughly 6% effective
// luminance (0.16 opacity x 0.55 brightness x the 0.65 the overlay lets
// through), i.e. loading and playing correctly but essentially invisible,
// which read as a broken video rather than a subtle one.
//
// Raised deliberately so the footage is perceptible while staying a
// background layer: it is still darkened and desaturated, still behind
// every other element (zIndex 0), and still pointer-events: none. Hero text
// sits on the app's near-black surface, so contrast stays far above WCAG AA
// at these values. Turn the watermark down again here, in one place.
const WATERMARK_OPACITY = 0.28
const POSTER_OPACITY = 0.24
const OVERLAY_ALPHA = 0.25

/** Renders nothing, but tells the caller there is no media to shape a band
 *  around. Separate component purely so the effect is legal: the decision is
 *  made after this component's own hooks have run, and a hook cannot be added
 *  behind that early return. */
function NothingToShow({ onNaturalSize }) {
  useEffect(() => { onNaturalSize?.(null) }, [onNaturalSize])
  return null
}

export default function HeroBackgroundVideo({ item, fallbackVideo, fallbackPoster, onNaturalSize }) {
  const reduceMotion = useReducedMotion()
  const [documentVisible, setDocumentVisible] = useState(
    () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden')
  )
  const { ref: inViewRef, inView } = useInView({ threshold: VISIBILITY_THRESHOLD })
  const videoRef = useRef(null)
  const pendingPlayRef = useRef(null)

  // Configured video first, bundled fallback second. An `item` that is an
  // image-only row contributes no video source, so it falls straight
  // through to the fallback rather than rendering an empty <video>.
  const sources = useMemo(() => {
    const list = []
    if (item?.media_type === 'video' && item?.video) list.push(item.video)
    if (fallbackVideo) list.push(fallbackVideo)
    return list
  }, [item?.media_type, item?.video, fallbackVideo])

  const sourcesKey = sources.join('|')
  const [srcIndex, setSrcIndex] = useState(0)
  // Reset only when the actual source list changes (e.g. Back Office upload
  // picked up by the hero's 60s re-poll), not on every render.
  useEffect(() => { setSrcIndex(0) }, [sourcesKey])

  const currentSrc = sources[srcIndex]
  const posterSrc = item?.poster_image || fallbackPoster || undefined

  useEffect(() => {
    const onVisibility = () => setDocumentVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const showVideo = Boolean(currentSrc) && !reduceMotion
  const active = inView && documentVisible && showVideo

  const play = useCallback(async () => {
    const v = videoRef.current
    if (!v || !v.paused) return
    // Set imperatively as well as via the attribute: autoplay policies key
    // off the *property*, and a muted video that reaches play() unmuted is
    // rejected outright — which is indistinguishable from a decode failure
    // at this opacity, i.e. a silently missing watermark.
    v.muted = true
    v.defaultMuted = true
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

  // Advances to the next source; when the list is exhausted this lands on
  // undefined and the component falls back to the poster (or renders
  // nothing), so onError can never fire in a loop.
  const handleError = useCallback(() => setSrcIndex(i => i + 1), [])

  // Neither a playable video nor a poster (e.g. reduced-motion with only a
  // video configured, or every source exhausted) — nothing safe to render.
  //
  // Report that upward as well as rendering nothing. A caller that shapes its
  // band around this footage must not hold a band open for footage that is
  // never going to appear: a reduced-motion visitor with no poster configured
  // would otherwise get a tall empty box where the watermark would have been.
  // Reporting null collapses the band back to its content height.
  if (!showVideo && !posterSrc) return <NothingToShow onNaturalSize={onNaturalSize} />

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
          // Keyed by source so switching to the fallback remounts the
          // element rather than leaving the failed media state attached.
          key={currentSrc}
          ref={videoRef}
          src={currentSrc}
          poster={posterSrc}
          muted
          loop
          playsInline
          preload="metadata"
          // preload="metadata" is what makes this fire without playback, so
          // the ratio is known even where autoplay is refused.
          onLoadedMetadata={e => {
            const el = e.currentTarget
            if (el.videoWidth > 0 && el.videoHeight > 0) {
              onNaturalSize?.(el.videoWidth / el.videoHeight)
            }
          }}
          onError={handleError}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: WATERMARK_OPACITY, filter: 'brightness(0.55) saturate(0.85)',
          }}
        />
      ) : (
        <img
          src={posterSrc}
          alt=""
          loading="lazy"
          decoding="async"
          // The reduced-motion path shows this instead of the video, and it
          // shapes the band the same way the video would.
          onLoad={e => {
            const el = e.currentTarget
            if (el.naturalWidth > 0 && el.naturalHeight > 0) {
              onNaturalSize?.(el.naturalWidth / el.naturalHeight)
            }
          }}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: POSTER_OPACITY, filter: 'brightness(0.55) saturate(0.85)',
          }}
        />
      )}
      {/* Extra darkening so text/buttons above always stay legible regardless
          of how bright the source footage is. */}
      <div style={{ position: 'absolute', inset: 0, background: `rgba(10,0,5,${OVERLAY_ALPHA})` }} />
    </div>
  )
}
