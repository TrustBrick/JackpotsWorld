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

export default function PageScrollButtons() {
  const [atTop, setAtTop] = useState(true)
  const pressTimer = useRef(null)
  const longPressFired = useRef(false)

  const updateState = useCallback(() => {
    const sections = getSections()
    const first = sections[0]
    const firstSectionBottom = first
      ? first.getBoundingClientRect().bottom + window.scrollY
      : FIRST_SECTION_FALLBACK_PX
    setAtTop(window.scrollY < firstSectionBottom - NAVBAR_OFFSET)
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
      if (atTop) scrollToBottom()
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
    if (atTop) scrollToNextSection()
    else scrollToPreviousSection()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed z-40 flex items-center justify-center"
      style={{
        // Stacked directly above the ChatBot launcher (bottom: clamp(14px,4vw,24px),
        // height: clamp(50px,12vw,60px), right: clamp(12px,3vw,24px), z-50) with a
        // clamped gap, so spacing stays correct and they never overlap at any size.
        bottom: 'calc(clamp(14px, 4vw, 24px) + clamp(50px, 12vw, 60px) + clamp(12px, 3vw, 16px))',
        right: 'clamp(12px, 3vw, 24px)',
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
        aria-label={atTop ? 'Scroll to next section (hold to jump to bottom)' : 'Scroll to previous section (hold to jump to top)'}
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
            key={atTop ? 'down' : 'up'}
            initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
            transition={{ duration: 0.25 }}
            style={{ display: 'flex' }}
          >
            {atTop ? <ChevronDown size={20} strokeWidth={2.5} /> : <ChevronUp size={20} strokeWidth={2.5} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </motion.div>
  )
}
