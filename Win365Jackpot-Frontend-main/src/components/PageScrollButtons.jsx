import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown } from 'lucide-react'

const BTN = 'clamp(38px, 8vw, 46px)'
const NAVBAR_OFFSET = 80 // fixed navbar height — matches the offset the CTA anchors already use
const LONG_PRESS_MS = 500
const FIRST_SECTION_FALLBACK_PX = 80 // used only before the DOM has any sections to measure

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
  const pressTimer = useRef(null)
  const longPressFired = useRef(false)

  const updateState = useCallback(() => {
    const scrolledToBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - BOTTOM_THRESHOLD_PX
    setAtBottom(scrolledToBottom)
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

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed z-40 flex items-center justify-center"
      style={{
        // Bottom LEFT, opposite the support launcher.
        //
        // This used to stack above the launcher on the right, deriving its
        // offset from that launcher's measurements written out by hand:
        //   bottom clamp(14px,4vw,24px) + height clamp(50px,12vw,60px) + a gap
        // Two things were wrong with it. The height it quoted is the launcher's
        // *open* state — the small close button — while the closed state is the
        // concierge mascot, which has always been taller. And the launcher is
        // not just the mascot: the greeting bubble sits above it in the same
        // fixed stack, so the whole thing measures ~166px tall on a desktop.
        // This control landed inside that, and since the launcher carries z-50
        // against this z-40, it was painted over rather than merely crowded.
        //
        // Raising it far enough to clear the bubble would strand it ~200px up
        // the screen, detached from the corner it belongs to. The other corner
        // is empty, so it moves there instead — which also ends the coupling
        // for good. Nothing here needs to know the launcher's dimensions any
        // more, so the two cannot drift apart again the next time either one
        // is resized.
        bottom: 'clamp(20px, 4vw, 26px)',
        left: 'clamp(20px, 3vw, 26px)',
      }}
    >
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
        className="flex items-center justify-center rounded-full"
        style={{
          width: BTN, height: BTN,
          background: 'linear-gradient(135deg, rgba(212,175,55,0.16), rgba(212,175,55,0.06))',
          border: '1.5px solid rgba(212,175,55,0.5)',
          color: '#D4AF37',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(212,175,55,0.25)',
          transition: 'background 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s',
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
            {!atBottom ? <ChevronDown size={20} strokeWidth={2.5} /> : <ChevronUp size={20} strokeWidth={2.5} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </motion.div>
  )
}
