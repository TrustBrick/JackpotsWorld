import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Play, MapPin, ArrowRight } from 'lucide-react'
import { useInView } from 'react-intersection-observer'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchFeaturedDestinationShowcases } from '../services/landingService'
import { useVideoAnalytics } from '../hooks/useVideoAnalytics'

/**
 * Promotional destination blocks on the landing page (CMS-managed).
 *
 * Not the destination gallery — that is the media inside the destination
 * cards in CountryPackages. This is one large promotional cut per row, with
 * its own headline and call to action. See the FeaturedDestinationShowcase
 * model docstring for why the two are separate features.
 *
 * Renders NOTHING when there are no active rows: no heading, no empty frame,
 * no placeholder. The API already filters to active rows in display_order,
 * so there is no client-side status logic to keep in step with the server.
 */

// The destinations live inside the packages section of this same page, and
// that anchor is the existing way to reach them (CountryPackages renders
// id="packages"). Deriving the target instead of storing a URL on the model
// means an admin can never point the CTA at an unsafe or dead link.
const DESTINATIONS_ANCHOR = 'packages'

/** True while the viewport is narrow enough to prefer the mobile cut. */
function useIsNarrow(query = '(max-width: 767px)') {
  const [narrow, setNarrow] = useState(
    () => (typeof window === 'undefined' ? false : window.matchMedia(query).matches)
  )
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mq = window.matchMedia(query)
    const onChange = e => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    setNarrow(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return narrow
}

function ShowcaseMedia({ item, narrow }) {
  const reduceMotion = useReducedMotion()
  // triggerOnce: false so a video that scrolls away stops — several of these
  // can exist on one page and none of them should keep decoding off-screen.
  const { ref, inView } = useInView({ threshold: 0.25 })
  const videoRef = useRef(null)
  const [failed, setFailed] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)

  const isVideo = item.media_type === 'video'
  // The mobile cut is optional; without one the same file is used
  // responsively (it is object-fit: cover either way).
  const src = (narrow && item.mobile_media) || item.media
  const poster = item.poster_image || undefined
  const alt = item.title
    ? `${item.title} — ${item.destination_name}`
    : `${item.destination_name} promotional image`

  const attemptPlay = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    v.muted = true          // autoplay policies key off the property, not just
    v.defaultMuted = true   // the attribute — an unmuted play() is rejected
    try {
      await v.play()
      setNeedsTap(false)
    } catch {
      // Blocked by policy (common on iOS low-power mode). The poster stays
      // visible and we offer an explicit control rather than retrying.
      setNeedsTap(true)
    }
  }, [])

  useEffect(() => {
    if (!isVideo || failed || reduceMotion) return
    const v = videoRef.current
    if (!v) return
    if (inView) attemptPlay()
    else if (!v.paused) v.pause()
  }, [inView, isVideo, failed, reduceMotion, attemptPlay])

  // ANALYTICS: engagement on this content video. Fires only on real playback
  // (see the hook); a poster/image fallback below records nothing.
  useVideoAnalytics(videoRef, {
    contentId: `showcase-${item.id}`,
    title: item.title || item.destination_name,
    contentKind: "showcase",
    enabled: isVideo && !failed,
  })

  // No media at all, or the file failed: fall back to the poster, and if
  // there is no poster either, render nothing rather than a broken frame.
  if (!src || failed) {
    if (!poster) return null
    return (
      <img
        ref={ref}
        src={poster}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
      />
    )
  }

  if (!isVideo) {
    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
    )
  }

  return (
    <div ref={ref} className="w-full h-full relative">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        // Never "auto": several showcases can be on the page and preloading
        // them all would compete with first paint. Metadata only, and only
        // once the block is near the viewport.
        preload={inView ? 'metadata' : 'none'}
        // No autoPlay attribute — playback is driven by attemptPlay() so a
        // rejected promise can be handled instead of failing silently.
        controls={needsTap || reduceMotion}
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
      {needsTap && !reduceMotion && (
        <button
          type="button"
          onClick={attemptPlay}
          aria-label={`Play the ${item.destination_name} video`}
          className="absolute inset-0 grid place-items-center bg-black/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
        >
          <span className="grid place-items-center rounded-full w-14 h-14 bg-black/70 border border-[#D4AF37]/60">
            <Play size={22} className="text-gold translate-x-[1px]" />
          </span>
        </button>
      )}
    </div>
  )
}

function ShowcaseBlock({ item, index, narrow }) {
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true })

  const goToDestinations = () => {
    const el = document.getElementById(DESTINATIONS_ANCHOR)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: Math.min(index, 3) * 0.08 }}
      className="casino-card overflow-hidden"
    >
      <div className="p-5 md:p-7 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <MapPin size={14} className="text-gold" aria-hidden="true" />
          <span
            className="font-body text-[11px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--w365-text-muted)' }}
          >
            {item.destination_name}
          </span>
        </div>

        <h3
          className="font-black uppercase tracking-wide text-xl md:text-3xl"
          style={{ color: 'var(--w365-heading)' }}
        >
          {item.title}
        </h3>

        {item.description && (
          <p
            className="font-body font-light mt-2 text-sm md:text-base max-w-2xl mx-auto"
            style={{ color: 'var(--w365-text-muted)' }}
          >
            {item.description}
          </p>
        )}
      </div>

      {/* aspect-video reserves the box before the media loads, so nothing
          below it shifts. Capped height keeps the section from dominating a
          tall phone screen. */}
      <div
        className="relative w-full aspect-video overflow-hidden bg-black/40"
        style={{ maxHeight: 'min(62vh, 520px)' }}
      >
        <ShowcaseMedia item={item} narrow={narrow} />
      </div>

      {item.cta_text && (
        <div className="p-5 md:p-6 flex justify-center">
          <button
            type="button"
            onClick={goToDestinations}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-body font-bold text-sm
                       border border-[#D4AF37]/60 text-gold transition-colors
                       hover:bg-[#D4AF37]/10 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2
                       focus-visible:ring-offset-transparent"
          >
            {item.cta_text}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </motion.article>
  )
}

export default function FeaturedDestinationShowcase() {
  const { data } = useAutoFetch(fetchFeaturedDestinationShowcases, {}, { intervalMs: 60_000 })
  const narrow = useIsNarrow()

  // The endpoint returns a plain array of active rows already ordered by
  // display_order. Nothing active -> render nothing at all (spec: never an
  // empty container).
  const showcases = Array.isArray(data) ? data : []
  if (showcases.length === 0) return null

  return (
    <section
      id="featured-destination-showcase"
      className="relative px-3 md:px-4"
      style={{ padding: 'clamp(40px,8vw,72px) clamp(12px,4vw,16px)' }}
    >
      <div className="max-w-5xl mx-auto flex flex-col gap-6 md:gap-8">
        {showcases.map((item, i) => (
          <ShowcaseBlock key={item.id} item={item} index={i} narrow={narrow} />
        ))}
      </div>
    </section>
  )
}
