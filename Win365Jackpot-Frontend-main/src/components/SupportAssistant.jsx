import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Elements this floating companion must never overlap. Matched by selector
// rather than a shared React ref since they live in a different component
// (Hero.jsx) with no context wiring between the two — querying by the same
// stable className/aria-label Hero.jsx already exposes is simpler than
// threading refs across files for a one-way visibility check.
const AVOID_SELECTORS = ['.w365-partner-plaque', '.w365-hero-ctas']
const AVOID_MARGIN_PX = 8

// ─── Premium floating support assistant ────────────────────────────────────
// A stylized (non-photorealistic, non-human) black+gold concierge character
// that floats above the existing ChatBot launcher and opens the SAME chat
// widget on click — it does not duplicate or replace any chat functionality,
// it's a purely visual companion to the existing button.
//
// Stacked in the same fixed bottom-right column as ChatBot's launcher and
// PageScrollButtons, directly above both, using the identical calc()
// convention PageScrollButtons already established so the three never
// overlap at any viewport size:
//   ChatBot launcher:   bottom: clamp(14px,4vw,24px), height: clamp(50px,12vw,60px)
//   PageScrollButtons:  stacked directly above the launcher
//   SupportAssistant:   stacked directly above PageScrollButtons (below)
const STACK_BOTTOM = 'calc(clamp(14px, 4vw, 24px) + clamp(50px, 12vw, 60px) + clamp(12px, 3vw, 16px) + clamp(38px, 8vw, 46px) + clamp(10px, 2.5vw, 14px))'
const SIZE = 'clamp(28px, 9vw, 128px)'
const GREETING_MS = 6000

function openSupportChat() {
  // ChatBot.jsx already listens for this exact event (see its own comment:
  // "allow other parts of the app... to open this same widget without
  // needing a shared context provider") — reused as-is, nothing duplicated.
  window.dispatchEvent(new Event('open-chat'))
}

export default function SupportAssistant() {
  // Brief, auto-hiding greeting — same pattern WhatsAppButton.jsx already
  // uses for its own tooltip (5s), just themed to the gold/black assistant
  // instead of WhatsApp green, so it doesn't linger and become distracting.
  const [showGreeting, setShowGreeting] = useState(false)
  useEffect(() => {
    const inTimer = setTimeout(() => setShowGreeting(true), 1200)
    const outTimer = setTimeout(() => setShowGreeting(false), 1200 + GREETING_MS)
    return () => { clearTimeout(inTimer); clearTimeout(outTimer) }
  }, [])

  // No fixed pixel budget or CSS height breakpoint survives every
  // width/height combination — proved that the hard way (this collided with
  // the partner plaque, then the Packages button, then the plaque again, at
  // three different viewport sizes across several rounds of manual margin
  // tuning; width and height both affect the plaque's wrapped height, so no
  // single threshold covers every case). Real collision detection against
  // the actual rendered rects is the only fix that generalizes: measure this
  // button against the hero elements it must never cover, and hide it
  // (rather than let it overlap) whenever they'd intersect. The original
  // ChatBot headset button (unaffected, always rendered) remains the actual
  // support entry point regardless of what this companion does.
  const btnWrapRef = useRef(null)
  const [clear, setClear] = useState(false)

  useEffect(() => {
    const checkClearance = () => {
      const el = btnWrapRef.current
      if (!el) return
      const mine = el.getBoundingClientRect()
      const overlapsAny = AVOID_SELECTORS.some(sel => {
        const target = document.querySelector(sel)
        if (!target) return false
        const r = target.getBoundingClientRect()
        return !(
          mine.right < r.left - AVOID_MARGIN_PX ||
          mine.left > r.right + AVOID_MARGIN_PX ||
          mine.bottom < r.top - AVOID_MARGIN_PX ||
          mine.top > r.bottom + AVOID_MARGIN_PX
        )
      })
      setClear(!overlapsAny)
    }

    checkClearance()

    // Web-font swap / late image decode reflows hero content's height after
    // the first paint — a fixed settle timeout guessed wrong in testing (a
    // real reflow landed after the guessed delay and was missed), so this
    // observes the actual avoid-zone elements directly and re-checks on any
    // genuine size change instead of guessing when things have settled.
    const ro = new ResizeObserver(checkClearance)
    AVOID_SELECTORS.forEach(sel => {
      const target = document.querySelector(sel)
      if (target) ro.observe(target)
    })
    document.fonts?.ready?.then(checkClearance)

    window.addEventListener('resize', checkClearance)
    window.addEventListener('scroll', checkClearance, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', checkClearance)
      window.removeEventListener('scroll', checkClearance)
    }
  }, [])

  return (
    <div
      ref={btnWrapRef}
      className="w365-support-assistant fixed z-40 flex flex-col items-end gap-2"
      style={{ bottom: STACK_BOTTOM, right: 'clamp(12px, 3vw, 24px)', display: clear ? undefined : 'none' }}
    >
      <AnimatePresence>
        {showGreeting && (
          <motion.div
            initial={{ opacity: 0, x: 16, scale: 0.85 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 16, scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{ maxWidth: 'clamp(160px, 42vw, 210px)' }}
          >
            <div style={{
              padding: '10px 14px', borderRadius: 14, borderBottomRightRadius: 4,
              background: 'linear-gradient(135deg, #1a1206, #0c0800)',
              border: '1px solid rgba(212,175,55,0.4)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 'clamp(11px,2.8vw,12.5px)', fontWeight: 700, color: '#F5E07A', marginBottom: 2 }}>
                Hi VIP! 👋
              </div>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 'clamp(10px,2.5vw,11.5px)', color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>
                Need any help? I'm here for you!
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={openSupportChat}
        aria-label="Chat with our support assistant"
        title="Need help? Chat with us"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        transition={{ duration: 0.3, delay: 0.5 }}
        style={{
          width: SIZE, height: SIZE, padding: 0, border: 'none',
          background: 'transparent', cursor: 'pointer', touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent', flexShrink: 0,
        }}
      >
        {/* Continuous gentle float — up, down, repeat */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: '100%', height: '100%' }}
        >
          <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: 'visible' }}>
            <defs>
              <radialGradient id="sa-glow" cx="50%" cy="42%" r="58%">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="sa-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F5E07A" />
                <stop offset="50%" stopColor="#D4AF37" />
                <stop offset="100%" stopColor="#B8860B" />
              </linearGradient>
              <linearGradient id="sa-head" x1="15%" y1="10%" x2="85%" y2="95%">
                <stop offset="0%" stopColor="#3a2f14" />
                <stop offset="45%" stopColor="#17110a" />
                <stop offset="100%" stopColor="#080604" />
              </linearGradient>
              <linearGradient id="sa-body" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#201d18" />
                <stop offset="100%" stopColor="#050505" />
              </linearGradient>
            </defs>

            {/* ambient glow + gold ring/base — "premium virtual concierge" halo */}
            <circle cx="50" cy="48" r="48" fill="url(#sa-glow)" />
            <circle cx="50" cy="50" r="46.5" fill="none" stroke="url(#sa-ring)" strokeWidth="1.4" strokeOpacity="0.5" />

            {/* waving arm + hand — gentle side-to-side rotation around the shoulder */}
            <motion.g
              animate={{ rotate: [0, -20, -6, -20, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.8, ease: 'easeInOut' }}
              style={{ transformOrigin: '77px 70px' }}
            >
              <path d="M77 70 Q88 64 90 51" fill="none" stroke="url(#sa-body)" strokeWidth="7.5" strokeLinecap="round" />
              <circle cx="90" cy="48" r="6.4" fill="#f0e6d2" stroke="#D4AF37" strokeWidth="1.2" />
              <path d="M90 42.5 L90 37.5 M94 43.5 L97.3 39.5 M86 43.5 L82.7 39.5" stroke="#f0e6d2" strokeWidth="2.3" strokeLinecap="round" />
            </motion.g>

            {/* body / shoulders — tuxedo */}
            <path d="M18 100 Q18 66 50 64 Q82 66 82 100 Z" fill="url(#sa-body)" stroke="#D4AF37" strokeWidth="1.1" strokeOpacity="0.55" />
            {/* lapels */}
            <path d="M38 70 L47 94 M62 70 L53 94" stroke="#D4AF37" strokeWidth="1" strokeOpacity="0.45" fill="none" />
            {/* buttons */}
            <circle cx="50" cy="85" r="1.3" fill="#D4AF37" />
            <circle cx="50" cy="92" r="1.3" fill="#D4AF37" />
            {/* collar */}
            <path d="M33 69 Q50 79 67 69" fill="none" stroke="#D4AF37" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
            {/* bow-tie */}
            <path d="M44 66 L37 61.5 L37 70.5 Z" fill="#D4AF37" />
            <path d="M56 66 L63 61.5 L63 70.5 Z" fill="#D4AF37" />
            <circle cx="50" cy="66" r="2.3" fill="#F5E07A" />

            {/* head */}
            <circle cx="50" cy="41" r="27" fill="url(#sa-head)" stroke="#D4AF37" strokeWidth="1.2" strokeOpacity="0.65" />

            {/* headset band + ear cups */}
            <path d="M24 37 Q50 9 76 37" fill="none" stroke="#D4AF37" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="24" cy="39" r="4.8" fill="#D4AF37" />
            <circle cx="76" cy="39" r="4.8" fill="#D4AF37" />
            {/* mic boom */}
            <path d="M76 43 Q71 54 61 57" fill="none" stroke="#D4AF37" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="61" cy="57" r="2.1" fill="#F5E07A" />

            {/* small crown accent */}
            <path d="M41 17 L44.5 8.5 L50 15 L55.5 8.5 L59 17 Z" fill="#D4AF37" />
            <circle cx="50" cy="15" r="1.4" fill="#F5E07A" />

            {/* eyes — blink by squashing ry to near-zero and back */}
            <motion.ellipse
              cx="40.5" cy="41.5" rx="3.1" ry="3.6" fill="#F5E07A"
              initial={{ ry: 3.6 }}
              animate={{ ry: [3.6, 3.6, 0.3, 3.6, 3.6] }}
              transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.9, 0.94, 0.98, 1], ease: 'easeInOut' }}
            />
            <motion.ellipse
              cx="59.5" cy="41.5" rx="3.1" ry="3.6" fill="#F5E07A"
              initial={{ ry: 3.6 }}
              animate={{ ry: [3.6, 3.6, 0.3, 3.6, 3.6] }}
              transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.9, 0.94, 0.98, 1], ease: 'easeInOut' }}
            />

            {/* friendly smile */}
            <path d="M40 51.5 Q50 58 60 51.5" fill="none" stroke="#F5E07A" strokeWidth="2.1" strokeLinecap="round" />
          </svg>
        </motion.div>
      </motion.button>
    </div>
  )
}
