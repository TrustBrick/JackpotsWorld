import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import {
  Anchor, Ship, Bed, UtensilsCrossed, Wine, Coins, Drama, Sparkles, Waves,
  CheckCircle2, MessageCircle, Plane, Hotel, Car, Ticket, ConciergeBell,
  ShieldCheck, Crown, Gem, MapPin, Music, Star, Volume2, VolumeX,
} from 'lucide-react'
import { attemptPlay, useSoundPreference } from '../hooks/useAudioAutoplay'
import { buildWhatsAppLink } from '../services/enquiryContact'
// WHATSAPP-CAPTURE: see CountryPackages.jsx for the same interception.
import { useWhatsAppGate } from './whatsapp/WhatsAppGate'
import useEnquiryMessage from '../hooks/useEnquiryMessage'
// Enquiry routing is decided by the visitor's country, not by a stored
// number — see services/enquiryContact.js. Same hook CountryPackages wraps
// as useWhatsAppNumber(); called directly here rather than importing that
// private wrapper.
import useEnquiryNumber from '../hooks/useEnquiryNumber'

/**
 * One Cruise Offline Casino Package card, rendered entirely from Back Office
 * data (authapp.CruisePackage + its details and media).
 *
 * WAS HARDCODED. Every string, icon, detail row, checklist line and carousel
 * image in here used to be a literal inside CountryPackages.jsx, editable only
 * by a developer. The layout, colours and spacing are unchanged — this is the
 * same card reading from an endpoint instead of from source.
 *
 * ACCENT COLOUR IS DATA NOW. The old card hardcoded #22d3ee in roughly twenty
 * places. It comes from `accent_color` here, so a second package can be a
 * different colour without touching this file. `withAlpha` builds the
 * translucent variants the design uses rather than storing twenty more
 * columns.
 *
 * MEDIA FALLS BACK TO THE STATIC FILES. A package with no uploaded slides
 * shows the two photographs the old carousel shipped with. They live in the
 * frontend's /public/assets and are present in every environment, whereas an
 * upload lives in MEDIA_ROOT (an S3 bucket in production) — which is exactly
 * why the seeding migration does NOT write media rows. Same reasoning as
 * experiences/shared.js FALLBACK_IMAGES.
 */

/* Lucide names an admin can type into `icon_name`. An unknown name falls back
   to a neutral icon rather than crashing the section — the same contract
   experiences/shared.js iconFor() offers. */
const ICON_MAP = {
  Ship, Bed, UtensilsCrossed, Wine, Coins, Drama, Sparkles, Waves, Anchor,
  Plane, Hotel, Car, Ticket, ConciergeBell, ShieldCheck, Crown, Gem, MapPin,
  Music, Star,
}

function iconFor(name) {
  return ICON_MAP[name] || Gem
}

/** The two photographs the hardcoded carousel used, for a package with no
    uploaded media. See the note above for why these are not seeded rows. */
const FALLBACK_MEDIA = [
  { id: 'fallback-msc', media: '/assets/images/vip/msc-cruise.jpg', media_type: 'image', label: '' },
  { id: 'fallback-star', media: '/assets/images/vip/star-cruises.jpg', media_type: 'image', label: '' },
]

/** `#22d3ee` + 0.35 -> `rgba(34,211,238,0.35)`.
 *
 *  The design needs the accent at a dozen different opacities. Hex-with-alpha
 *  suffixes (`${c}35`) would be shorter but only work for 6-digit hex, and
 *  accent_color is free text an admin can type — a named colour or an rgb()
 *  would produce silently broken CSS. This parses what it understands and
 *  hands anything else back untouched, so a strange value degrades to a flat
 *  colour instead of an invisible border. */
function withAlpha(color, alpha) {
  const hex = String(color || '').trim()
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex || `rgba(34,211,238,${alpha})`
  let body = m[1]
  if (body.length === 3) body = body.split('').map(c => c + c).join('')
  const n = parseInt(body, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/* ── The media strip ──────────────────────────────────────────────────────
   Rebuilt around what admins actually upload. The first version assumed one
   shape — object-fit: cover in a short, wide box — and the real uploads broke
   every assumption in it at once:

     * all three videos are 478x850 PORTRAIT (ratio 0.56) against a box of
       roughly 2.05, so cover threw away about three quarters of every frame;
     * the rotation was a flat 3s interval, while the clips run 6.7s, 10.3s
       and 15.1s — none of them ever reached its end;
     * video was hardcoded `muted` with no control, so there was no way to
       hear anything;
     * cover UPSCALES to fill, and several uploads are small (478x318), so
       they were being stretched ~1.7x into a blur.

   The uploads span 0.56 to 1.76, so no single crop can serve them. Hence:

   FIT — `contain`, never `cover`. Nothing is cropped, whatever its shape. The
   width a portrait clip does not reach is filled with a blurred copy of the
   same still rather than black bars. A video slide gets a plain dark wash
   instead: deriving a frame would mean drawing the video to a canvas, and the
   media is served from S3 without CORS headers, so that canvas would be
   tainted and toDataURL would throw.

   CLARITY — a slide is never enlarged past MAX_UPSCALE of its own pixels. A
   small upload sits a little smaller against the backdrop instead of turning
   soft, which is self-correcting: upload a bigger file and it fills more.

   TIMING — a still holds for SLIDE_MS; a clip plays to its end and hands over
   on `ended`, with MAX_VIDEO_MS as a backstop so one long upload cannot
   strand the rotation.

   SOUND — muted autoplay (every browser requires it), plus a control. The
   choice is held in the shared preference store, so it survives the element
   being torn down and rebuilt on every rotation.

   Playback is gated on the strip being on screen AND the tab being visible,
   so nothing decodes or plays audio out of sight. */

const SLIDE_MS = 4200
const MAX_VIDEO_MS = 20000
const MAX_UPSCALE = 1.35

/* The strip's own shape. 16:9, so a landscape clip exported at the ordinary
   video ratio fills it EXACTLY — every pixel of the container covered, no
   pillarbox, and nothing cropped, because the two shapes are identical.
   Expressed as a ratio rather than a fixed height so it holds at every width. */
const STRIP_RATIO = 16 / 9

/* How much of a frame may be cropped for the sake of filling the container.
   Anything at or under this fills edge to edge; anything beyond it keeps its
   whole frame instead. 0.22 lets ordinary landscape photography (3:2, and the
   1.76 uploads) fill the strip, while a square or portrait upload — where
   filling would throw away a third to two thirds of the picture — is shown
   whole rather than butchered. */
const COVER_MAX_CROP = 0.22

/** What fraction of a frame `cover` would cut off in a box of `boxRatio`. */
function cropFraction(mediaRatio, boxRatio) {
  if (!mediaRatio || !boxRatio) return 0
  return 1 - Math.min(mediaRatio, boxRatio) / Math.max(mediaRatio, boxRatio)
}

/**
 * `fill` — hand the strip's shape to index.css (.cruise-strip) instead of
 * fixing it at 16:9 here.
 *
 * It matters because the two card layouts want different shapes and only CSS
 * can tell them apart. Stacked, the strip still holds 16:9 across the top of
 * the card. In the two-column layout (>= 1120px) it fills the row beside the
 * details, because a 16:9 strip in a half-width column is barely 380px tall —
 * which is where the portrait uploads (all three clips are 478x850) were being
 * shown at about a fifth of the card's area. Filling the row makes the box
 * roughly square and renders a portrait clip at nearly three times the area.
 */
function CruiseCarousel({ slides, accent, fill = false }) {
  const [idx, setIdx] = useState(0)
  const [natural, setNatural] = useState(null)
  const [soundOn, setSoundOn] = useSoundPreference('cruise-media', false)
  const [audible, setAudible] = useState(false)
  const [docVisible, setDocVisible] = useState(
    () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden')
  )
  const videoRef = useRef(null)
  const imgRef = useRef(null)
  const { ref: inViewRef, inView } = useInView({ threshold: 0.25 })
  // The strip's rendered width, which is what decides how far a file has to be
  // stretched to cover it. Measured rather than assumed: this card is a
  // percentage of a responsive column, so its width is not a number that can
  // be written down here.
  const [boxEl, setBoxEl] = useState(null)
  const [boxW, setBoxW] = useState(0)
  // Height too, now that the strip is not always 16:9. Everything below used
  // to derive the box's height from its width via STRIP_RATIO, which is only
  // true while the strip sets its own shape — in `fill` mode the row decides
  // the height, and judging a crop against a shape the box does not have gave
  // the wrong answer in both directions.
  const [boxH, setBoxH] = useState(0)
  /* One STABLE callback feeding both the observer and the measurement.
     Written inline it was a new function on every render, so React detached
     and reattached it each time — calling it with null, then the node, and
     each setBoxEl re-rendered, which produced the next detach. The loop left
     boxW flapping between 0 and its real value, and since coverScale treats a
     zero width as "unmeasurable" a slide that should fill the container was
     sometimes laid out as though it could not. useCallback pins the identity;
     react-intersection-observer's own ref is already stable. */
  const setStripRef = useCallback((el) => {
    inViewRef(el)
    setBoxEl(el)
  }, [inViewRef])
  useEffect(() => {
    if (!boxEl) return undefined
    const measure = () => {
      setBoxW(boxEl.clientWidth)
      setBoxH(boxEl.clientHeight)
    }
    measure()
    // A ResizeObserver rather than window.resize alone: in `fill` mode this
    // box's height is set by the content column beside it, which changes when
    // that column reflows — no window resize involved.
    const ro = new ResizeObserver(measure)
    ro.observe(boxEl)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [boxEl])

  const count = slides.length
  const safeIdx = count > 0 ? Math.min(idx, count - 1) : 0
  const current = slides[safeIdx]
  const isVideo = current?.media_type === 'video'
  const active = inView && docVisible

  const advance = useCallback(() => {
    setIdx(p => (count > 0 ? (p + 1) % count : 0))
  }, [count])

  useEffect(() => {
    const onVis = () => setDocVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // The measurement carries the id of the slide it came from, and is only
  // believed while that is still the slide on screen.
  //
  // This replaced an effect that reset it to null on every slide change, which
  // raced and lost: a CACHED image fires `load` before effects run, so the
  // reset landed AFTER the measurement and wiped it. The cap then had no
  // dimensions to work from and silently did nothing — which is how a 478x318
  // upload was still being stretched 1.64x, the very blur this was meant to
  // prevent. Deriving it makes the stale value unusable without a write.
  const nat = natural && natural.id === current?.id ? natural : null

  /* Measure media that had already finished loading before React could attach
     its handler.
     `onLoad` / `onLoadedMetadata` only fire for media the browser actually has
     to fetch. A file already in the CACHE is complete the moment the element
     exists, and its event has been and gone before React wires anything up —
     so the measurement never arrived, `nat` stayed null, and the fit decision
     silently fell back to "unmeasurable", which is contain. That is why a
     slide filled the container on its first showing and then stopped filling
     on every later one. This runs after each slide mounts and picks up what
     the events cannot. */
  useEffect(() => {
    if (!current) return undefined
    let cancelled = false
    let frames = 0
    let timer = null
    const grab = () => {
      if (cancelled) return
      const el = isVideo ? videoRef.current : imgRef.current
      // A missing ref is a "not yet", not a "never" — it is simply a frame
      // where the element has not been attached. Returning here instead of
      // asking again is what left every image unmeasured.
      const w = el ? (isVideo ? el.videoWidth : el.naturalWidth) : 0
      const h = el ? (isVideo ? el.videoHeight : el.naturalHeight) : 0
      if (w > 0 && h > 0) {
        setNatural({ id: current.id, w, h })
        return
      }
      // Bounded, so a file that never decodes cannot poll forever. Giving up
      // leaves `nat` null, which shows the slide whole — the safe fallback,
      // since it can letterbox but can never crop.
      if (++frames > 60) return
      // setTimeout, NOT requestAnimationFrame: rAF is not serviced while the
      // page is hidden, so in a background tab the poll stopped dead on its
      // first frame and every cached image stayed unmeasured. A timer still
      // runs there (throttled, which is fine for a measurement).
      timer = setTimeout(grab, 60)
    }
    grab()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [current?.id, isVideo])

  // An admin deleting a slide can leave the index past the end.
  useEffect(() => {
    if (count > 0 && idx >= count) setIdx(0)
  }, [count, idx])

  // Stills advance on a timer; clips advance when they end, with a backstop.
  useEffect(() => {
    if (!active || count < 2) return undefined
    const id = setTimeout(advance, isVideo ? MAX_VIDEO_MS : SLIDE_MS)
    return () => clearTimeout(id)
  }, [active, count, safeIdx, isVideo, advance])

  // Drive playback from one derived boolean, so the observer and the tab's
  // visibility can never disagree about what the element should be doing.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !isVideo) return
    if (active) {
      attemptPlay(v, { withSound: soundOn }).then(result => setAudible(result === 'audible'))
    } else {
      v.pause()
      setAudible(false)
    }
  }, [active, isVideo, soundOn, current?.id])

  if (!current) return null

  /* ── Fill, or show whole? ───────────────────────────────────────────────
     Fill the container whenever that can be done WITHOUT butchering the frame
     and WITHOUT blurring it. Both conditions have to hold:

       crop  — how much `cover` would cut off. A 16:9 clip in this 16:9 strip
               loses nothing, so it fills exactly, which is the whole point of
               matching STRIP_RATIO to the footage.
       scale — how far the file must be stretched to reach the container. A
               478x318 upload has to grow 1.7x to cover, which is precisely
               the softness that was complained about, so it is shown whole at
               its cap instead.

     Anything that fails either test keeps its entire frame, centred, with the
     leftover width carrying a blurred copy of the picture. Until the media has
     reported its size there is nothing to judge, so it starts contained — the
     safe choice, since that can letterbox but can never crop. */
  const mediaRatio = nat ? nat.w / nat.h : null
  // The box's REAL shape. It falls back to the declared 16:9 only before the
  // first measurement, which is also the only moment it cannot be wrong.
  const measuredH = boxH || (boxW ? boxW / STRIP_RATIO : 0)
  const boxRatio = boxW && measuredH ? boxW / measuredH : STRIP_RATIO
  // What cover would demand of the file, relative to its own pixels.
  const coverScale = nat && boxW
    ? Math.max(boxW / nat.w, measuredH / nat.h)
    : Infinity
  const fills = !!nat
    && cropFraction(mediaRatio, boxRatio) <= COVER_MAX_CROP
    && coverScale <= MAX_UPSCALE

  const mediaStyle = {
    width: '100%', height: '100%',
    objectFit: fills ? 'cover' : 'contain',
    display: 'block', background: 'transparent',
    // The cap only applies when the frame is shown whole. Under `cover` a max
    // size would stop the element reaching the container's edges, which is the
    // one thing this mode exists to guarantee.
    ...(fills
      ? {}
      : nat
        ? { maxWidth: Math.round(nat.w * MAX_UPSCALE), maxHeight: Math.round(nat.h * MAX_UPSCALE) }
        : {}),
  }

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    const v = videoRef.current
    if (v) attemptPlay(v, { withSound: next }).then(r => setAudible(r === 'audible'))
  }

  return (
    <div
      ref={setStripRef}
      className={fill ? 'cruise-strip' : undefined}
      style={{
        position: 'relative',
        // 16:9, matching ordinary landscape video, so a clip exported at that
        // ratio covers the container exactly — no bars, nothing cropped. An
        // aspect ratio rather than a fixed height so it holds at every width,
        // with a floor for very narrow phones.
        //
        // In `fill` mode .cruise-strip supplies both, per breakpoint. Nothing
        // is set inline there on purpose: an inline aspect-ratio or height
        // would beat the media query and pin one shape to both layouts.
        ...(fill ? {} : { aspectRatio: `${STRIP_RATIO}`, minHeight: 200 }),
        overflow: 'hidden',
        background: '#05080a',
      }}
    >
      {/* Backdrop. A still gets a blurred copy of itself — an <img> with a CSS
          filter, which reads no pixels and so needs no CORS. A clip gets a
          wash, for the canvas-tainting reason in the note above. */}
      {/* Only when the slide is being shown whole. A slide that covers the
          container hides the backdrop completely, so painting one would be a
          second decode of the same picture for nothing. */}
      {!fills && (isVideo ? (
        /* A second, blurred copy of the same clip, covering the container.
           This used to be a flat wash, which left the sides of the frame
           reading as dead space beside a portrait clip. A moving backdrop
           fills the container edge to edge instead, while the clip itself
           stays whole — the treatment a phone-shaped video gets on a desktop
           player.

           It is a real <video> and not a frame painted to a canvas because
           the media is served from S3 without CORS headers: drawing it would
           taint the canvas and toDataURL would throw. Mounted only while the
           strip is active, so it costs a second decode only when it is
           actually on screen, and muted so it never competes with the audio
           of the clip in front of it. */
        active ? (
          <video
            key={`bd-${current.id}`}
            src={current.media}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            tabIndex={-1}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%', objectFit: 'cover',
              filter: 'blur(34px) saturate(1.15) brightness(0.5)',
              transform: 'scale(1.2)',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div key={`bd-off-${current.id}`} style={{ position: 'absolute', inset: 0, background: '#05080a' }} />
        )
      ) : (
        <motion.img
          key={`bd-${current.id}`}
          src={current.media}
          alt=""
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'cover',
            filter: 'blur(34px) saturate(1.15) brightness(0.45)',
            transform: 'scale(1.2)',
          }}
        />
      ))}

      {/* The slide itself, whole and centred. */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* No AnimatePresence here, deliberately. It was `mode="wait"`, which
            holds the incoming slide until the outgoing one has finished its
            exit — and this strip changes slide from two places at once (the
            rotation timer and the dots/arrows). A change landing mid-exit left
            the subtree stuck on whichever slide it had last completed, so the
            picture stopped following the dots while everything outside the
            subtree kept updating. A keyed element that only fades IN cannot
            deadlock: React swaps it immediately and the incoming fade covers
            the change. */}
        {isVideo ? (
          <motion.video
            key={current.id}
            ref={videoRef}
            src={current.media}
            muted
            playsInline
            preload="metadata"
            loop={count < 2}
            onEnded={count > 1 ? advance : undefined}
            onLoadedMetadata={e => {
              const v = e.currentTarget
              if (v.videoWidth > 0) setNatural({ id: current.id, w: v.videoWidth, h: v.videoHeight })
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={mediaStyle}
          />
        ) : (
          <motion.img
            key={current.id}
            ref={imgRef}
            src={current.media}
            alt={current.label || ''}
            loading={safeIdx === 0 ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={e => {
              const i = e.currentTarget
              if (i.naturalWidth > 0) setNatural({ id: current.id, w: i.naturalWidth, h: i.naturalHeight })
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={mediaStyle}
          />
        )}
      </div>

      {/* Bottom scrim, so the caption and dots stay legible over any slide. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, transparent 42%)',
      }} />

      {/* Sound. Only shown for a clip — offering it over a photograph would be
          a control that does nothing. */}
      {isVideo && (
        <button
          onClick={toggleSound}
          title={audible ? 'Mute' : 'Unmute'}
          aria-label={audible ? 'Mute video' : 'Unmute video'}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 3,
            width: 34, height: 34, borderRadius: 999, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: audible ? `${accent}40` : 'rgba(0,0,0,0.6)',
            border: `1px solid ${accent}59`,
            color: '#fff', cursor: 'pointer', backdropFilter: 'blur(8px)',
            touchAction: 'manipulation',
          }}
        >
          {audible ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
      )}

      {/* Caption + dots */}
      <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        {current.label ? (
          <span style={{
            fontSize: 'clamp(0.7rem,2.5vw,0.82rem)', fontWeight: 600, color: '#fff',
            background: 'rgba(0,0,0,0.45)', padding: '3px 10px', borderRadius: 6,
          }}>
            {current.label}
          </span>
        ) : <span />}
        {count > 1 && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {slides.map((s, i) => (
              <button key={s.id} onClick={() => setIdx(i)} aria-label={`Show slide ${i + 1}`} aria-current={i === safeIdx} style={{
                padding: 0, border: 'none', cursor: 'pointer',
                borderRadius: i === safeIdx ? 4 : '50%',
                width: i === safeIdx ? 18 : 6, height: 6,
                background: i === safeIdx ? accent : 'rgba(255,255,255,0.35)',
                transition: 'all 0.25s', touchAction: 'manipulation',
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Prev / Next */}
      {count > 1 && [
        { label: '‹', fn: () => setIdx((safeIdx - 1 + count) % count), side: { left: 10 } },
        { label: '›', fn: () => setIdx((safeIdx + 1) % count), side: { right: 10 } },
      ].map(a => (
        <button key={a.label} onClick={a.fn} style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...a.side,
          width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
          fontSize: '1.2rem', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
          zIndex: 3,
        }}>
          {a.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The small rule-and-label that heads each block in the card body.
 *
 * Module scope, not inline: defined inside CruisePackageCard it would be a
 * brand-new component type on every render, so React would unmount and remount
 * both labels each time the carousel advanced.
 */
function SectionLabel({ children, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{
        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: withAlpha(accent, 0.85), whiteSpace: 'nowrap',
      }}>
        {children}
      </span>
      <span
        aria-hidden="true"
        style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${withAlpha(accent, 0.28)}, transparent)` }}
      />
    </div>
  )
}

export default function CruisePackageCard({ pkg, inView }) {
  const whatsappNumber = useEnquiryNumber()
  const enquiryMsg = useEnquiryMessage(pkg.enquiry_key || 'cruise_package')
  const openWhatsApp = useWhatsAppGate()

  const accent = pkg.accent_color || '#22d3ee'
  const TitleIcon = iconFor(pkg.icon_name)

  const slides = (pkg.media && pkg.media.length) ? pkg.media : FALLBACK_MEDIA
  const details = pkg.details || []
  const highlights = pkg.highlights || []
  const inclusions = pkg.inclusions || []

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay: 0.3 }}
      // Full container width. It used to be capped at 820px inside a 1320px
      // column, so the page's one flagship package sat as a narrow island with
      // every other block on the page running wider than it.
      style={{ marginTop: 'clamp(28px, 4vw, 44px)' }}
    >
      {/* Label above. Omitted entirely when an admin clears it, rather than
          leaving an empty pill floating over the card. */}
      {pkg.eyebrow_text && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 'clamp(0.6rem,2.2vw,0.7rem)',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: withAlpha(accent, 0.7), border: `1px solid ${withAlpha(accent, 0.25)}`,
            borderRadius: 50, padding: '4px 16px',
          }}>
            <Anchor size={11} color={withAlpha(accent, 0.7)} />
            {pkg.eyebrow_text}
          </span>
        </div>
      )}

      <div
        className="cruise-card"
        style={{
          borderRadius: 22,
          border: `1px solid ${withAlpha(accent, 0.35)}`,
          // A vertical wash instead of one flat tint, so the card has a top
          // edge that catches light and a base that settles into the page.
          background: `linear-gradient(170deg, ${withAlpha(accent, 0.07)} 0%, ${withAlpha(accent, 0.02)} 42%, rgba(0,0,0,0.18) 100%)`,
          overflow: 'hidden',
          boxShadow: `0 28px 70px -30px rgba(0,0,0,0.85), 0 0 70px ${withAlpha(accent, 0.09)}`,
          position: 'relative',
        }}
      >
        {/* A one-pixel highlight along the top edge — the detail that reads as
            a rendered surface rather than a rectangle with a border. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1, zIndex: 3,
            background: `linear-gradient(90deg, transparent, ${withAlpha(accent, 0.75)}, transparent)`,
          }}
        />

        {/* Auto-scrolling media strip. Its own column on desktop, where it
            fills the row rather than holding 16:9. */}
        <div className="cruise-card__media">
          <CruiseCarousel slides={slides} accent={accent} fill />
        </div>

        {/* Content */}
        <div className="cruise-card__body" style={{ padding: 'clamp(22px,4vw,38px) clamp(20px,4vw,40px)' }}>

          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 10 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 15, flexShrink: 0,
                background: withAlpha(accent, 0.1),
                border: `1px solid ${withAlpha(accent, 0.3)}`,
                boxShadow: `inset 0 1px 0 ${withAlpha(accent, 0.25)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <TitleIcon size={28} color={accent} strokeWidth={1.5} />
              </div>
              <div style={{ minWidth: 0 }}>
                {/* Larger than it was: in its own column this is the card's
                    headline, not a caption under a picture. */}
                <div style={{
                  fontSize: 'clamp(1.3rem,3.2vw,2.05rem)', fontWeight: 900,
                  color: accent, lineHeight: 1.08,
                }}>
                  {pkg.title}
                </div>
                {pkg.subtitle && (
                  <div style={{
                    fontSize: 'clamp(0.7rem,1.6vw,0.82rem)',
                    color: 'rgba(var(--w365-text-rgb),0.62)', marginTop: 5, fontStyle: 'italic',
                  }}>
                    {pkg.subtitle}
                  </div>
                )}
              </div>
            </div>

            {/* Route pills */}
            {highlights.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {highlights.map(r => (
                  <span key={r} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 'clamp(0.64rem,1.5vw,0.74rem)', padding: '4px 12px', borderRadius: 20,
                    background: withAlpha(accent, 0.08), border: `1px solid ${withAlpha(accent, 0.2)}`,
                    color: withAlpha(accent, 0.85),
                  }}>
                    <Waves size={11} color={withAlpha(accent, 0.85)} />
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Details grid */}
          {details.length > 0 && (
            <>
            <SectionLabel accent={accent}>What the package is</SectionLabel>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,215px),1fr))',
              gap: 11, marginBottom: 24,
            }}>
              {details.map(row => {
                const RowIcon = iconFor(row.icon_name)
                return (
                  <div key={row.id} style={{
                    display: 'flex', alignItems: 'center', gap: 11,
                    padding: '11px 13px', borderRadius: 12,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015))',
                    border: `1px solid ${withAlpha(accent, 0.14)}`,
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                      background: withAlpha(accent, 0.09),
                      border: `1px solid ${withAlpha(accent, 0.18)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <RowIcon size={18} color={accent} strokeWidth={1.5} />
                    </div>
                    <div>
                      <div style={{
                        fontSize: '0.6rem', color: 'rgba(var(--w365-text-rgb),0.48)',
                        textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 3,
                      }}>
                        {row.label}
                      </div>
                      <div style={{
                        fontSize: 'clamp(0.74rem,1.6vw,0.84rem)',
                        color: 'rgba(var(--w365-text-rgb),0.86)', fontWeight: 600, lineHeight: 1.3,
                      }}>
                        {row.value}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            </>
          )}

          {/* Inclusions checklist. On its own recessed panel rather than
              floating loose under the details: it is a different kind of
              information — what you get, not what it is — and the page gives
              the reader no other cue that the list has started. */}
          {inclusions.length > 0 && (
            <>
            <SectionLabel accent={accent}>What&rsquo;s included</SectionLabel>
            <div style={{
              padding: 'clamp(13px,1.6vw,17px) clamp(14px,1.8vw,19px)',
              borderRadius: 14, marginBottom: 24,
              background: 'rgba(0,0,0,0.22)',
              border: `1px solid ${withAlpha(accent, 0.12)}`,
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,185px),1fr))',
                gap: '10px 14px',
              }}>
                {inclusions.map((item, j) => (
                  <div key={j} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    fontSize: 'clamp(0.7rem,1.5vw,0.79rem)', lineHeight: 1.45,
                    color: 'rgba(var(--w365-text-rgb),0.84)',
                  }}>
                    <CheckCircle2 size={14} color={accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            </>
          )}

          {/* CTA. marginTop:auto pins it to the bottom of the content column,
              so on desktop it finishes level with the media beside it however
              many detail rows an admin has entered. */}
          {pkg.cta_text && (
            <div style={{ maxWidth: 420, margin: '0 auto', marginTop: 'auto', width: '100%' }}>
              <a
                href={buildWhatsAppLink(whatsappNumber, enquiryMsg)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => { e.preventDefault(); openWhatsApp({ source: pkg.enquiry_key || 'cruise_package', message: enquiryMsg }) }}
                style={{ display: 'block', textDecoration: 'none' }}
              >
                <motion.button
                  whileHover={{ scale: 1.04, boxShadow: '0 0 30px rgba(37,211,102,0.5)' }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '14px 22px',
                    borderRadius: 50,
                    background: 'linear-gradient(135deg,#25D366,#128C7E)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 'clamp(0.75rem,3vw,0.85rem)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  <TitleIcon size={16} color="white" />
                  <MessageCircle size={16} color="white" />
                  {pkg.cta_text}
                </motion.button>
              </a>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
