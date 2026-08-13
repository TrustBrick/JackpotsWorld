import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

// ─── Premium animated casino concierge robot ───────────────────────────────
// A stylized (non-human, non-photorealistic) black + gold robot character that
// greets visitors in the hero's lower-right and opens the SAME chat widget on
// click — it does not duplicate or replace any chat functionality, it's a
// purely visual companion to the existing ChatBot launcher, which stays put in
// its fixed corner and remains the always-available support entry point.
//
// Rendered *inside* the hero section (position:absolute) rather than as a
// fixed floating badge, so it belongs to the hero composition and scrolls away
// with it. The hero's own `overflow:hidden` guarantees it can never cause
// horizontal page overflow.

// Elements this character must never cover. Matched by selector rather than a
// shared React ref since they live in Hero.jsx with no context wiring between
// the two — querying the same stable classNames Hero.jsx already exposes is
// simpler than threading refs across files for a one-way layout measurement.
const BLOCKER_SELECTORS = ['.w365-partner-plaque', '.w365-hero-ctas', '.w365-location-ticker']

// The plaque is the widest thing in the hero, so the free column to the right
// of the widest blocker is the only place the robot can live without overlap.
const GUTTER_PX = 18
const MIN_W = 96    // below this the character stops being legible in the side
                    // column — narrower than this and we stack it instead
const MAX_W = 186
const ART_RATIO = 140 / 120  // svg viewBox height / width

// Phone widths leave no free column beside a near-full-width plaque, so the
// character moves *below* the hero content instead of disappearing. Centred
// rather than right-aligned on purpose: the ChatBot launcher is fixed to the
// bottom-right corner, and centring is what keeps the two from stacking on
// top of each other on a small screen.
const STACKED_W = 112
const STACKED_MIN_W = 76
const STACKED_BUBBLE_W = 132
const STACKED_GAP = 10
const STACKED_LAUNCHER_CLEARANCE = 20

function openSupportChat() {
  // ChatBot.jsx already listens for this exact event (see its own comment:
  // "allow other parts of the app... to open this same widget without
  // needing a shared context provider") — reused as-is, nothing duplicated.
  window.dispatchEvent(new Event('open-chat'))
}

// Measures the real rendered hero against its real rendered blockers instead of
// guessing at breakpoints. No fixed pixel budget or CSS height breakpoint
// survives every width/height combination — that was proved the hard way here
// (this collided with the partner plaque, then the Packages button, then the
// plaque again, at three different viewport sizes). Width *and* height both
// affect the plaque's wrapped height, so no single threshold covers every case;
// measuring the actual rects is the only approach that generalizes.
function usePlacement() {
  const [placement, setPlacement] = useState(null)

  useEffect(() => {
    const measure = () => {
      const hero = document.getElementById('hero')
      if (!hero) return setPlacement(null)

      const heroRect = hero.getBoundingClientRect()
      const blockers = BLOCKER_SELECTORS
        .map(sel => document.querySelector(sel))
        .filter(Boolean)
        .map(el => el.getBoundingClientRect())

      // Nothing measured yet (first paint / data still loading) — wait rather
      // than place the robot against an incomplete layout.
      if (blockers.length === 0) return setPlacement(null)

      const widestRight = Math.max(...blockers.map(r => r.right))
      const available = heroRect.right - widestRight - GUTTER_PX * 2

      if (available >= MIN_W) {
        const width = Math.min(MAX_W, Math.floor(available))
        const height = width * ART_RATIO

        // Vertically centre the character on the plaque's band, which is what
        // puts it beside the plaque in the hero's lower-right rather than
        // floating loose in the corner.
        const plaque = document.querySelector('.w365-partner-plaque')?.getBoundingClientRect()
        const band = plaque || blockers[0]
        const top = (band.top - heroRect.top) + band.height / 2 - height / 2

        return setPlacement({ mode: 'side', width, height, top })
      }

      // No free column (phones): drop below the lowest blocker instead. Only
      // if the leftover hero height genuinely fits the art — otherwise stand
      // down and let the fixed ChatBot launcher carry it, as before.
      const lowestBottom = Math.max(...blockers.map(r => r.bottom)) - heroRect.top
      const roomBelow = heroRect.height - lowestBottom - GUTTER_PX * 2
      const width = Math.min(STACKED_W, Math.floor(roomBelow / ART_RATIO))
      if (width < STACKED_MIN_W) return setPlacement(null)

      setPlacement({
        mode: 'stacked',
        width,
        height: width * ART_RATIO,
        top: lowestBottom + GUTTER_PX,
      })
    }

    // A viewport change re-lays-out the plaque *and* the CTAs, and the first
    // notification can land before both have settled at their new size —
    // caught on a phone→tablet resize, where the character kept the phone
    // placement and sat on top of the plaque. Re-reading on the second frame
    // measures the finished layout instead of a half-applied one.
    let raf1 = 0, raf2 = 0
    const scheduleMeasure = () => {
      cancelAnimationFrame(raf1); cancelAnimationFrame(raf2)
      raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(measure) })
    }

    measure()

    // Web-font swap / late image decode reflows hero content after first
    // paint — a fixed settle timeout guessed wrong in testing (a real reflow
    // landed after the guessed delay and was missed), so observe the actual
    // elements and re-measure on any genuine size change instead of guessing.
    const ro = new ResizeObserver(scheduleMeasure)
    const hero = document.getElementById('hero')
    if (hero) ro.observe(hero)
    BLOCKER_SELECTORS.forEach(sel => {
      const el = document.querySelector(sel)
      if (el) ro.observe(el)
    })
    document.fonts?.ready?.then(scheduleMeasure)
    window.addEventListener('resize', scheduleMeasure)
    window.addEventListener('orientationchange', scheduleMeasure)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf1); cancelAnimationFrame(raf2)
      window.removeEventListener('resize', scheduleMeasure)
      window.removeEventListener('orientationchange', scheduleMeasure)
    }
  }, [])

  return placement
}

// ─── The character ─────────────────────────────────────────────────────────
// Dark metallic body with gold trim, brushed-silver face plate and hands,
// black tuxedo vest, gold bow tie and a small gold crown. Deliberately built
// from hard panels, antenna and ear pods so it reads as a robot mascot and
// never as a person or a headset glyph.
function ConciergeRobot() {
  return (
    <svg viewBox="0 0 120 140" width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <radialGradient id="rb-halo" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rb-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F7E9A8" />
          <stop offset="48%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#A9801F" />
        </linearGradient>
        <linearGradient id="rb-silver" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#d9dde3" />
          <stop offset="100%" stopColor="#8a9199" />
        </linearGradient>
        <linearGradient id="rb-head" x1="22%" y1="4%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#4a4238" />
          <stop offset="42%" stopColor="#221e18" />
          <stop offset="100%" stopColor="#0a0908" />
        </linearGradient>
        <linearGradient id="rb-body" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#2b2721" />
          <stop offset="55%" stopColor="#121110" />
          <stop offset="100%" stopColor="#050505" />
        </linearGradient>
        <linearGradient id="rb-visor" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#15121c" />
          <stop offset="100%" stopColor="#050409" />
        </linearGradient>
        <linearGradient id="rb-limb" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#332e26" />
          <stop offset="100%" stopColor="#100e0c" />
        </linearGradient>
      </defs>

      {/* ambient concierge halo */}
      <circle cx="60" cy="72" r="66" fill="url(#rb-halo)" />

      {/* ── antenna — slow pulse on the tip light ── */}
      <path d="M37 33 L28 16" stroke="url(#rb-gold)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      {/* framer-motion animates these as style values, so the starting number
          has to come from `initial` — it does not read it back off the SVG
          presentation attribute (renders as `undefined` on the first frame). */}
      <motion.circle
        cx="27" cy="14" r="3.6" fill="#F7E9A8"
        initial={{ r: 3.2, opacity: 0.45 }}
        animate={{ opacity: [0.45, 1, 0.45], r: [3.2, 4.1, 3.2] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* ── left arm — subtle idle drift ── */}
      <motion.g
        animate={{ rotate: [0, 4, 0, -3, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '32px 101px' }}
      >
        <path d="M32 101 Q20 112 17 125" stroke="url(#rb-limb)" strokeWidth="9" strokeLinecap="round" fill="none" />
        <circle cx="16" cy="128" r="7.4" fill="url(#rb-silver)" stroke="url(#rb-gold)" strokeWidth="1.3" />
      </motion.g>

      {/* ── right arm — friendly wave, then rests ── */}
      <motion.g
        animate={{ rotate: [0, -19, -5, -19, 0, 0, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, repeatDelay: 2.6, ease: 'easeInOut' }}
        style={{ transformOrigin: '88px 101px' }}
      >
        <path d="M88 101 Q101 93 104 77" stroke="url(#rb-limb)" strokeWidth="9" strokeLinecap="round" fill="none" />
        <circle cx="105" cy="73" r="7.6" fill="url(#rb-silver)" stroke="url(#rb-gold)" strokeWidth="1.3" />
        {/* mitt fingers + thumb — reads as an open waving hand, not a ball */}
        <path d="M102 67.5 L101.5 62.5 M105.5 67 L105.5 61.8 M109 67.5 L109.8 62.8 M111.5 71 L115.5 69"
          stroke="url(#rb-silver)" strokeWidth="2.6" strokeLinecap="round" />
      </motion.g>

      {/* ── torso: black tuxedo vest ── */}
      <path d="M22 140 Q22 94 60 88 Q98 94 98 140 Z"
        fill="url(#rb-body)" stroke="url(#rb-gold)" strokeWidth="1.2" strokeOpacity="0.55" />
      {/* lapels */}
      <path d="M47 94 L56 124 M73 94 L64 124"
        stroke="url(#rb-gold)" strokeWidth="1.1" strokeOpacity="0.5" fill="none" />
      {/* collar */}
      <path d="M43 93 Q60 103 77 93" fill="none" stroke="url(#rb-gold)" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
      {/* chest plate seam + gold studs */}
      <circle cx="60" cy="112" r="1.7" fill="url(#rb-gold)" />
      <circle cx="60" cy="122" r="1.7" fill="url(#rb-gold)" />

      {/* ── gold bow tie ── */}
      <path d="M53.5 89 L45 83.5 L45 94.5 Z" fill="url(#rb-gold)" />
      <path d="M66.5 89 L75 83.5 L75 94.5 Z" fill="url(#rb-gold)" />
      <circle cx="60" cy="89" r="2.9" fill="#F7E9A8" />

      {/* ── neck ── */}
      <rect x="52" y="78" width="16" height="9" rx="3" fill="url(#rb-limb)" stroke="url(#rb-gold)" strokeWidth="1" strokeOpacity="0.6" />

      {/* ── ear pods ── */}
      <rect x="21" y="46" width="9.5" height="19" rx="4.7" fill="url(#rb-gold)" />
      <rect x="89.5" y="46" width="9.5" height="19" rx="4.7" fill="url(#rb-gold)" />

      {/* ── head shell ── */}
      <rect x="30" y="28" width="60" height="53" rx="19"
        fill="url(#rb-head)" stroke="url(#rb-gold)" strokeWidth="1.5" strokeOpacity="0.75" />
      {/* brushed highlight along the top of the shell */}
      <path d="M40 34 Q60 29 80 34" fill="none" stroke="#fff" strokeWidth="1.4" strokeOpacity="0.16" strokeLinecap="round" />

      {/* ── small gold crown ── */}
      <path d="M45 29 L48.8 16.5 L54.4 24.5 L60 13.5 L65.6 24.5 L71.2 16.5 L75 29 Z" fill="url(#rb-gold)" />
      <circle cx="60" cy="18.5" r="1.7" fill="#F7E9A8" />

      {/* ── face plate ── */}
      <rect x="37" y="39" width="46" height="32" rx="14"
        fill="url(#rb-visor)" stroke="url(#rb-gold)" strokeWidth="1.1" strokeOpacity="0.6" />

      {/* ── eyes — blink (ry squash) inside a group that drifts side to side
             so the character reads as looking around, not staring ── */}
      <motion.g
        animate={{ x: [0, 2.4, 0, -2.4, 0, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* soft glow pools behind each eye */}
        <ellipse cx="50" cy="53" rx="7.5" ry="8" fill="#D4AF37" opacity="0.22" />
        <ellipse cx="70" cy="53" rx="7.5" ry="8" fill="#D4AF37" opacity="0.22" />
        {/* `initial` is required for the same reason as the antenna above —
            without it the blink silently never runs and the eyes just stare. */}
        <motion.ellipse
          cx="50" cy="53" rx="4.6" ry="5.4" fill="#F7E9A8"
          initial={{ ry: 5.4 }}
          animate={{ ry: [5.4, 5.4, 0.4, 5.4, 5.4] }}
          transition={{ duration: 4.6, repeat: Infinity, times: [0, 0.9, 0.94, 0.98, 1], ease: 'easeInOut' }}
        />
        <motion.ellipse
          cx="70" cy="53" rx="4.6" ry="5.4" fill="#F7E9A8"
          initial={{ ry: 5.4 }}
          animate={{ ry: [5.4, 5.4, 0.4, 5.4, 5.4] }}
          transition={{ duration: 4.6, repeat: Infinity, times: [0, 0.9, 0.94, 0.98, 1], ease: 'easeInOut' }}
        />
        {/* catch lights */}
        <circle cx="51.6" cy="51" r="1.3" fill="#fffdf2" opacity="0.9" />
        <circle cx="71.6" cy="51" r="1.3" fill="#fffdf2" opacity="0.9" />
      </motion.g>

      {/* friendly smile */}
      <path d="M52 62.5 Q60 68.5 68 62.5" fill="none" stroke="#F7E9A8" strokeWidth="2" strokeLinecap="round" opacity="0.95" />
    </svg>
  )
}

export default function SupportAssistant() {
  const placement = usePlacement()
  const wrapRef = useRef(null)

  if (!placement) return null

  // On phones the bubble sits *beside* the character instead of above it —
  // stacking them vertically there needs ~200px of hero below the CTAs, which
  // a 375×812 screen doesn't have, and the art ended up spilling out of the
  // hero. Side by side both fit inside the same leftover band.
  const stacked = placement.mode === 'stacked'

  return (
    <div
      ref={wrapRef}
      className="w365-support-assistant"
      style={{
        position: 'absolute',
        // Side mode hugs the right gutter; stacked mode centres (see STACKED_W).
        // The extra left bias is clearance for the ChatBot launcher, which is
        // fixed to the bottom-right corner and is not in the hero's layout —
        // dead-centre put the character's shoulder 1px from it.
        ...(stacked
          ? { left: '50%', transform: `translateX(calc(-50% - ${STACKED_LAUNCHER_CLEARANCE}px))` }
          : { right: GUTTER_PX }),
        top: placement.top,
        width: stacked ? placement.width + STACKED_GAP + STACKED_BUBBLE_W : placement.width,
        zIndex: 12,
        display: 'flex',
        flexDirection: stacked ? 'row' : 'column',
        alignItems: 'center',
        gap: stacked ? STACKED_GAP : 8,
      }}
    >
      {/* ── VIP concierge speech bubble ── */}
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          width: stacked ? STACKED_BUBBLE_W : '100%',
          flexShrink: 0,
          padding: '9px 12px',
          borderRadius: 14,
          background: 'linear-gradient(160deg, rgba(26,18,6,0.92), rgba(8,5,2,0.92))',
          border: '1px solid rgba(212,175,55,0.45)',
          boxShadow: '0 0 22px rgba(212,175,55,0.22), 0 8px 24px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          textAlign: 'center',
        }}
      >
        <div style={{
          fontFamily: "'Manrope', sans-serif", fontSize: 'clamp(10px,0.85vw,12.5px)',
          fontWeight: 800, color: '#F5E07A', letterSpacing: '0.02em',
        }}>
          Hi VIP! 👋
        </div>
        <div style={{
          fontFamily: "'Manrope', sans-serif", fontSize: 'clamp(9px,0.75vw,11px)',
          color: 'rgba(255,255,255,0.75)', lineHeight: 1.45, marginTop: 2,
        }}>
          Need any help?<br />I'm here for you!
        </div>
        {/* tail — points down at the character when stacked above it, and
            across at it when the two sit side by side */}
        <span aria-hidden style={{
          position: 'absolute', width: 9, height: 9,
          background: 'rgba(8,5,2,0.92)',
          borderRight: '1px solid rgba(212,175,55,0.45)',
          borderBottom: '1px solid rgba(212,175,55,0.45)',
          ...(stacked
            ? { right: -5, top: '50%', transform: 'translateY(-50%) rotate(-45deg)' }
            : { bottom: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)' }),
        }} />
      </motion.div>

      <motion.button
        type="button"
        onClick={openSupportChat}
        aria-label="Chat with our support assistant"
        title="Need help? Chat with us"
        initial={{ opacity: 0, scale: 0.75 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.35, delay: 0.7 }}
        style={{
          width: stacked ? placement.width : '100%',
          height: placement.height, padding: 0, border: 'none', flexShrink: 0,
          background: 'transparent', cursor: 'pointer', touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* gentle float + a barely-there sway so it feels alive without bouncing */}
        <motion.div
          animate={{ y: [0, -7, 0], rotate: [0, 1.2, 0, -1.2, 0] }}
          transition={{
            y: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: 7.5, repeat: Infinity, ease: 'easeInOut' },
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <ConciergeRobot />
        </motion.div>
      </motion.button>
    </div>
  )
}
