import React, { useState, useEffect, useCallback, useRef, useId } from 'react'
import { motion } from 'framer-motion'
import { useLauncherHeight } from './support/launcherMetrics'

// The mark's rendered width. Everything else is proportional to it, because
// the whole thing is one viewBox.
const MARK_W = 'clamp(30px, 6vw, 36px)'
// Tap target. The mark is ~20px tall, well under what a finger reliably
// lands on, so the button carries an invisible box around it. Padding rather
// than size: growing the mark would defeat the brief.
const HIT_PAD = '11px 13px'

// Matches the launcher's own corner inset so the two read as one column.
const INSET_BOTTOM = 'clamp(20px, 4vw, 26px)'
const INSET_SIDE = 'clamp(20px, 3vw, 26px)'
// Breathing room between this control and the launcher below it.
const STACK_GAP = 'clamp(10px, 2.5vw, 16px)'
const NAVBAR_OFFSET = 80 // fixed navbar height — matches the offset the CTA anchors already use
const LONG_PRESS_MS = 500
const FIRST_SECTION_FALLBACK_PX = 80 // used only before the DOM has any sections to measure

/**
 * The whole control, drawn once.
 *
 * WHY THESE ARE FILLED PATHS AND NOT STROKES. A stroke has one weight along
 * its length, which is exactly what makes a framework icon look like a
 * framework icon. Every line here is a closed shape that swells in the middle
 * and sharpens to a point at its ends, which is how an engraver cuts a
 * hairline and a chevron - the weight carries the eye to the centre of the
 * mark instead of stopping dead at two round caps.
 *
 * The chevron is four points, not five: left tip, outer elbow, right tip,
 * inner elbow. The tips are single coordinates, so they taper to genuinely
 * nothing rather than to a half-pixel cap, and the elbow is 2.2 units thick
 * against tips of zero - thinner than it first looked right at 1x, because
 * against hairlines this fine anything heavier reads as a separate object.
 *
 * THE RULES ARE UNEQUAL ON PURPOSE. A long rule over a short one tapers the
 * mark in the direction the chevron points. Rotating the whole SVG by half a
 * turn therefore flips the taper and the chevron together, so one drawing
 * serves both states and they can never disagree.
 *
 * The lozenge on the long rule is the one ornament: a rule with a jewel at
 * its centre is a printer's device, and at this size it reads as intent
 * rather than decoration. It also lands the brand's diamond in the mark
 * without putting a container around anything.
 */
function Mark({ gradientId }) {
  const rule = `${gradientId}-rule`
  const chev = `${gradientId}-chev`
  return (
    <svg
      width={MARK_W} viewBox="0 0 44 26"
      aria-hidden="true" focusable="false"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        {/* Dim at the ends, bright at the centre - the geometry tapers, and
            the gradient makes the taper read as metal rather than as a shape
            that simply got thinner. */}
        <linearGradient id={rule} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8A6E1B" />
          <stop offset="50%" stopColor="#F7E9A8" />
          <stop offset="100%" stopColor="#8A6E1B" />
        </linearGradient>
        <linearGradient id={chev} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F9EEC0" />
          <stop offset="55%" stopColor="#E8C65A" />
          <stop offset="100%" stopColor="#B08F25" />
        </linearGradient>
      </defs>

      {/* Long rule, with its jewel */}
      <path d="M2 3 Q22 1.9 42 3 Q22 4.1 2 3 Z" fill={`url(#${rule})`} />
      <path d="M22 0.9 L23.4 3 L22 5.1 L20.6 3 Z" fill="#FFF6D8" />

      {/* Chevron */}
      <path d="M12.5 10.8 L22 18.2 L31.5 10.8 L22 16 Z" fill={`url(#${chev})`} />

      {/* Short rule */}
      <path d="M14 23 Q22 22.16 30 23 Q22 23.84 14 23 Z" fill={`url(#${rule})`} />
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
  // One gradient serves both chevron states; the id has to be
  // document-unique, so it comes from useId() rather than a literal.
  const chevronGradientId = `jw-chevron-${useId()}`
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
      className="fixed z-40 flex items-center justify-center"
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
      }}
    >
      {/* NO CONTAINER. Not a ring, not a disc, not a framed shape of any
          kind: a chevron between two gold hairlines that fade out at both
          ends, which is the same ornament the cruise card's section labels
          use further up the page.

          It is the quietest thing that can still be a control, and on a page
          this dark a floating frame of any shape reads as a widget bolted on
          afterwards. The rules do the work a border would: they give the
          chevron a width and a horizon without drawing a box around it.

          The hit area is padding, not size. The mark is about 26px tall,
          which is below what a finger reliably lands on, so the button
          carries an invisible margin around it - growing the mark instead
          would defeat the point of the brief. */}
      <motion.button
        onClick={handleClick}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.9 }}
        aria-label={!atBottom ? 'Scroll to next section (hold to jump to bottom)' : 'Scroll to previous section (hold to jump to top)'}
        className="flex flex-col items-center justify-center"
        style={{
          padding: HIT_PAD,
          background: 'none',
          border: 'none',
          color: '#F3D671',
          cursor: 'pointer',
          touchAction: 'manipulation',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.4)) drop-shadow(0 0 12px rgba(212,175,55,0.16))',
        }}
      >
        {/* The MARK turns over as one piece, and the turn is a plain CSS
            transform rather than an animated one.

            Both of those are corrections. An AnimatePresence with
            mode="wait" had the up state never arrive while the document is
            hidden: the exit never finishes, so the enter never runs and the
            mark is left pointing the wrong way with no way back. Replacing it
            with framer-motion's `animate` fixed the dead end but not the
            dependency - that writes the transform from a rAF loop, which is
            also suspended, so the rotation simply never applied. A plain
            style is committed by the style system whether or not frames are
            running; the transition only decides whether you SEE it turn.

            Rotating the whole drawing rather than just the chevron is what
            keeps the long rule leading: half a turn flips the taper and the
            arrow together, so they cannot end up disagreeing. */}
        <span
          style={{
            display: 'flex',
            transform: atBottom ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <Mark gradientId={chevronGradientId} />
        </span>
      </motion.button>
    </motion.div>
  )
}
