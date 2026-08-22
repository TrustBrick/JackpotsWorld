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
 * ── Why this used to need two or three visits ───────────────────────────
 * Playback was driven only by an effect watching `active`, and the <video>
 * carries `key={currentSrc}` so a source change replaces the element rather
 * than mutating it. Those two facts combined into a race on every page that
 * has a Back Office row:
 *
 *   1. first render — `item` has not arrived, so the bundled fallback mounts
 *   2. the observer fires, `active` flips true, that element plays
 *   3. GET /api/section-media/ resolves, `currentSrc` becomes the configured
 *      file, React unmounts the playing element and mounts a fresh one
 *   4. `active` did not change, so the effect never re-runs — and nothing
 *      ever calls play() on the element that is actually on screen
 *
 * It ended paused at readyState 4: fully downloaded, decoded, ready, and
 * never started. With no poster configured there was nothing to see, so the
 * hero looked empty. Whether it worked came down to whether step 3 landed
 * before or after step 2, which is why navigating away and back — warming the
 * API response so the source settles before the observer fires — appeared to
 * "fix" it.
 *
 * Three changes close it, in order of how much they are relied on:
 *
 *   • `autoPlay` on the element. A muted, playsInline video starts itself,
 *     so playback no longer depends on any effect firing at the right moment.
 *     A remount self-heals because the new element autoplays too.
 *   • the play effect keys on `currentSrc` as well as `active`, so a source
 *     swap re-runs it against the element that replaced the old one.
 *   • an observer that has not reported yet no longer counts as "out of
 *     view". This is a page-level hero background, at the top of the page by
 *     construction; waiting for a callback that arrives after mount is what
 *     made the first paint blank. The observer still pauses playback once it
 *     genuinely reports the band scrolled away.
 *
 * `onCanPlay` re-asserts playback once, per source load, if the element is
 * still paused while active — which covers a play() the browser rejected
 * before it had data. It is an event, not a timer: it cannot spin.
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
  // `entry` is undefined until the observer has actually reported. That is a
  // different state from "reported, not visible", and conflating the two is
  // what delayed the first play by a whole navigation.
  const { ref: inViewRef, inView, entry } = useInView({ threshold: VISIBILITY_THRESHOLD })
  const observerHasReported = entry !== undefined
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
  // Before the observer speaks, assume visible: this band is the top of the
  // page. Once it speaks, believe it, so scrolling away still stops decoding.
  const withinViewport = observerHasReported ? inView : true
  const active = withinViewport && documentVisible && showVideo

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

  // `currentSrc` is in here because it is the <video>'s key: when it changes,
  // the element on screen is a new one that nothing has played yet.
  useEffect(() => { if (active) play(); else pause() }, [active, currentSrc, play, pause])
  useEffect(() => () => { const v = videoRef.current; if (v && !v.paused) v.pause() }, [])

  // Read by onCanPlay, which fires outside React's render cycle and would
  // otherwise close over whatever `active` was when the element mounted.
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])

  // The one place playback is re-asserted after the initial attempt. `canplay`
  // fires once per source load, so this runs at most once per source and
  // cannot become a poll. It covers the case where play() was called — or the
  // autoPlay attribute was honoured — before the element had data.
  const handleCanPlay = useCallback(() => {
    const v = videoRef.current
    if (v && v.paused && activeRef.current) play()
  }, [play])

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
          // The attribute, not just the play() call. This is what makes the
          // watermark independent of effect timing: a muted, playsInline
          // element starts itself as soon as it has data, including the fresh
          // element a source swap mounts. play() remains as the explicit path
          // for resuming after a pause, and for browsers that decline the
          // attribute.
          autoPlay
          muted
          loop
          playsInline
          // Enough to start without pulling the whole file up front. autoPlay
          // makes the browser fetch what it needs to begin regardless, so this
          // stays a hint about eagerness rather than a cap on it.
          preload="metadata"
          onCanPlay={handleCanPlay}
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
