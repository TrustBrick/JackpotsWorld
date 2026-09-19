import React, { useState, useEffect, useCallback, useRef, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLauncherHeight } from './support/launcherMetrics'
import { ChevronUp, ChevronDown } from 'lucide-react'

const BTN = 'clamp(44px, 8.4vw, 52px)'
// Ray plus gem. The viewBox is 12 wide by 34 tall, of which the gem is the
// bottom 12 - so a 28px ornament puts a 9.9px gem under a ~18px ray, which is
// the reference's proportion against a 50px ring.
const ORNAMENT = 'clamp(24px, 5vw, 30px)'
const ORNAMENT_GAP = 'clamp(2px, 0.5vw, 3px)'

// Matches the launcher's own corner inset so the two read as one column.
const INSET_BOTTOM = 'clamp(20px, 4vw, 26px)'
const INSET_SIDE = 'clamp(20px, 3vw, 26px)'
// Breathing room between this control and the launcher below it.
const STACK_GAP = 'clamp(10px, 2.5vw, 16px)'
const NAVBAR_OFFSET = 80 // fixed navbar height — matches the offset the CTA anchors already use
const LONG_PRESS_MS = 500
const FIRST_SECTION_FALLBACK_PX = 80 // used only before the DOM has any sections to measure

/**
 * The ornament above and below the ring: a faceted gem on a thin ray.
 *
 * MEASURED OFF THE REFERENCE, not estimated. Cropping the supplied image and
 * scanning it gave, against a ring diameter D: gem 0.18D wide by 0.20D tall,
 * gem-to-ring gap 0.06D, ring band 0.08D, and a hairline ray running roughly
 * another 0.2D outward from the gem before it fades. On this control that is a
 * 9x10px gem, a 3px gap and a ~10px ray.
 *
 * Two earlier passes missed because they read the ornament as a four-pointed
 * STAR and sized it off the whole shape - so the arms became the body, and a
 * 16px star sat where a 9px gem belonged. The star look comes from the gem
 * plus its ray, not from the gem.
 *
 * The four triangles are what make it read as cut rather than drawn: upper
 * left catches the light, lower right falls away, and the girdle between them
 * is the only hard line in the shape.
 */
function Ornament({ flip = false }) {
  // Two of these render at once and SVG gradient ids must be document-unique.
  const uid = useId()
  const rayId = `jw-ray-${uid}`
  return (
    <svg
      viewBox="0 0 12 34"
      aria-hidden="true"
      focusable="false"
      style={{
        height: ORNAMENT, width: `calc(${ORNAMENT} * 0.353)`, display: 'block', flexShrink: 0,
        transform: flip ? 'scaleY(-1)' : undefined,
        filter: 'drop-shadow(0 0 4px rgba(245,224,122,0.75)) drop-shadow(0 0 10px rgba(212,175,55,0.45))',
      }}
    >
      <defs>
        <linearGradient id={rayId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4AF37" stopOpacity="0" />
          <stop offset="70%" stopColor="#E8C65A" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#F7E48D" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <rect x="5.6" y="0" width="0.8" height="22" fill={`url(#${rayId})`} />
      <path d="M6 22 L6 28 L1 28 Z" fill="#FFF2C4" />
      <path d="M6 22 L11 28 L6 28 Z" fill="#E8C65A" />
      <path d="M1 28 L6 28 L6 34 Z" fill="#D2AC34" />
      <path d="M6 28 L11 28 L6 34 Z" fill="#A6841F" />
    </svg>
  )
}

// Every direct child of <main> is one landing-page section (Hero, Packages,
// Events, Destinations, Promotions, Footer, ...), so this stays correct
// automatically as sections are added, removed or reordered.
function getSections() {
  const main = document.querySelector('main')
  if (!main) return []
  return Array.from(main.children).filter(el => el.tagName !== 'STYLE' && el.tagName !== 'SCRIPT')
}

function scrollToY(y) {
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
}

const BOTTOM_THRESHOLD_PX = 4 // rounding slack for "am I at the very bottom" checks

export default function PageScrollButtons() {
  // Down arrow for the whole page (top through the last section); only flips
  // to up once the user has actually reached the bottom of the page.
  const [atBottom, setAtBottom] = useState(false)
  // The control is hidden while the first section (the hero, which is a
  // full-screen partner video) still owns the viewport. It sat over the
  // footage otherwise, which is the one place on the page where a floating
  // gold circle competes with the content rather than helping. Every other
  // section keeps it.
  const [overHero, setOverHero] = useState(true)
  // The launcher's measured height, so this control sits clear of it at
  // whatever size it actually is. See the positioning note below.
  const launcherHeight = useLauncherHeight()
  const pressTimer = useRef(null)
  const longPressFired = useRef(false)

  const updateState = useCallback(() => {
    const scrolledToBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - BOTTOM_THRESHOLD_PX
    setAtBottom(scrolledToBottom)

    // Measured, not a scroll-position guess: the hero's height depends on the
    // video's own shape and the window, so a hardcoded pixel threshold would be
    // wrong on most screens. Hidden while the hero still covers more than half
    // of what the visitor can see.
    const [hero] = getSections()
    if (!hero) { setOverHero(false); return }
    const rect = hero.getBoundingClientRect()
    const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
    setOverHero(visible > window.innerHeight * 0.5)
  }, [])

  useEffect(() => {
    updateState()
    window.addEventListener('scroll', updateState, { passive: true })
    window.addEventListener('resize', updateState)
    return () => {
      window.removeEventListener('scroll', updateState)
      window.removeEventListener('resize', updateState)
      if (pressTimer.current) clearTimeout(pressTimer.current)
    }
  }, [updateState])

  const scrollToSection = (el) => {
    const targetY = el.getBoundingClientRect().top + window.scrollY - NAVBAR_OFFSET
    scrollToY(targetY)
  }

  const scrollToNextSection = () => {
    const sections = getSections()
    const next = sections.find(el => el.getBoundingClientRect().top > NAVBAR_OFFSET + 4)
    if (next) scrollToSection(next)
    else scrollToY(document.documentElement.scrollHeight - window.innerHeight)
  }

  const scrollToPreviousSection = () => {
    const sections = getSections()
    const passed = sections.filter(el => el.getBoundingClientRect().top < NAVBAR_OFFSET - 4)
    const prev = passed[passed.length - 1]
    if (prev) scrollToSection(prev)
    else scrollToY(0)
  }

  const scrollToBottom = () => scrollToY(document.documentElement.scrollHeight - window.innerHeight)
  const scrollToTop = () => scrollToY(0)

  const startPress = () => {
    longPressFired.current = false
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true
      if (!atBottom) scrollToBottom()
      else scrollToTop()
    }, LONG_PRESS_MS)
  }

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const handleClick = () => {
    // A long press already performed its action on release — swallow the
    // click that naturally follows so it doesn't also fire a short-click step.
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    if (!atBottom) scrollToNextSection()
    else scrollToPreviousSection()
  }

  if (overHero) return null

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed z-40 flex flex-col items-center justify-center pointer-events-none"
      style={{
        // Bottom RIGHT, stacked clear of the Live Support launcher.
        //
        // The offset is the launcher's *measured* height, not a written-out
        // copy of its CSS. That copy is what broke this twice: it quoted the
        // launcher's open-state height (the small close button) rather than
        // the concierge mascot that is there when closed, and it ignored the
        // greeting bubble stacked above the mascot in the same fixed
        // container. The control ended up inside the launcher and, on z-40
        // against the launcher's z-50, painted over by it.
        //
        // A constant cannot express this even in principle -- the bubble wraps
        // to a different number of lines at different widths, so the stack is
        // a different height on different screens. support/launcherMetrics.js
        // has the launcher publish what it actually measures, via a
        // ResizeObserver, and this reads that. It therefore stays correct when
        // the mascot is resized, when the bubble re-wraps, and when the panel
        // opens and collapses the launcher to its small close button.
        bottom: `calc(${INSET_BOTTOM} + ${launcherHeight}px + ${STACK_GAP})`,
        right: INSET_SIDE,
        gap: ORNAMENT_GAP,
      }}
    >
      {/* Decoration, and pointer-events:none on the column keeps it that way -
          only the ring below takes the pointer back, so the stars never eat a
          click meant for the page behind them. */}
      <Ornament />
      {/* A gold RING on the page's own dark, not a gold disc. The earlier
          version was a 16%-opacity wash behind a hairline border, which read
          as a browser default; a solid btn-gold face was the other extreme and
          sat on the content like a token. The ring is the brand's quieter
          register - the same treatment the destination chips and the pillar
          card badges use - and the section behind it still shows through. */}
      <motion.button
        onClick={handleClick}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        aria-label={!atBottom ? 'Scroll to next section (hold to jump to bottom)' : 'Scroll to previous section (hold to jump to top)'}
        className="flex items-center justify-center rounded-full pointer-events-auto"
        style={{
          width: BTN, height: BTN,
          // Two background layers: the first paints the face inside the
          // padding box, the second paints the metal under the border box,
          // and a transparent border lets it through.
          background: [
            // A glossy dark stone, lit from the upper left, rather than a flat
            // wash - the reference's face is not one colour.
            'radial-gradient(circle at 36% 28%, #1E150C 0%, #0A0503 58%, #050101 100%) padding-box',
            // The band is turned metal, so it runs bright, mid, dark, bright
            // around the circumference instead of holding one gold. The dark
            // stop is what reads as the far side of a torus; without it the
            // ring is a flat outline however bright you make it.
            'linear-gradient(140deg, #FCEFB8 0%, #E8C65A 20%, #C9A227 44%, #8A6E1B 58%, #D4AF37 80%, #F7E48D 100%) border-box',
          ].join(', '),
          // 4px on a 50px ring: the reference's band is 0.08 of its diameter,
          // and at the 2.2px of the previous pass it read as a drawn circle
          // rather than a turned one.
          border: '4px solid transparent',
          color: '#F7E9A8',
          // A SECOND, thinner arc inside the band, separated from it by a
          // dark gap - the detail that makes the reference read as two
          // concentric rings catching light rather than one drawn circle.
          // Inset shadows paint outside-in and later ones sit under earlier
          // ones, so the 1.5px dark covers the inner half of the 2.5px gold
          // and what survives is a 1px gold line inboard of a dark gap.
          boxShadow: [
            'inset 0 0 0 1.5px rgba(6,3,0,0.95)',
            'inset 0 0 0 2.5px rgba(232,198,90,0.8)',
            '0 0 20px rgba(212,175,55,0.42)',
            '0 0 46px rgba(212,175,55,0.18)',
            '0 0 80px rgba(196,140,40,0.16)',
          ].join(', '),
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          cursor: 'pointer',
          transition: 'box-shadow 0.25s',
          touchAction: 'manipulation',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          overflow: 'hidden',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={!atBottom ? 'down' : 'up'}
            initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
            transition={{ duration: 0.25 }}
            style={{ display: 'flex' }}
          >
            {!atBottom ? <ChevronDown size={24} strokeWidth={2.75} /> : <ChevronUp size={24} strokeWidth={2.75} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <Ornament flip />
    </motion.div>
  )
}
