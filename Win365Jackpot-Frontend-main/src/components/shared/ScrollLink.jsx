import React from 'react'
import { scrollToSection } from '../../utils/scroll'

// ─── In-page link to a section ──────────────────────────────────────────────
// Drop-in replacement for react-scroll's <Link>, so the CTAs across the page
// land exactly where the navbar's own items land.
//
// WHY NOT react-scroll. It derives a target's position by walking the
// offsetParent chain, and an element with a transform becomes a containing
// block that truncates that chain — several sections here sit inside
// framer-motion wrappers, so the computed position came out short and the page
// landed past the section. Every call site also had to remember to pass
// offset={-80} for the fixed navbar, a literal that was already wrong: the bar
// measures 65px unscrolled and less once it shrinks.
//
// utils/scroll.js solves both — it measures with getBoundingClientRect(), asks
// the navbar for its real height, and keeps correcting for a moment afterwards
// while images finish loading and sections above the target grow.
//
// The react-scroll props (smooth/duration/offset/spy/...) are accepted and
// ignored rather than rejected, so existing call sites did not have to change
// and none of them leak through to the DOM as unknown attributes.
export default function ScrollLink({
  to,
  children,
  style,
  className,
  onClick,
  // react-scroll's API, accepted for compatibility and deliberately unused.
  smooth, duration, offset, delay, spy, hashSpy, activeClass, containerId, isDynamic, ignoreCancelEvents,
  ...domProps
}) {
  const go = () => { if (to) scrollToSection(to) }

  return (
    <span
      role="link"
      tabIndex={0}
      className={className}
      style={{ cursor: 'pointer', display: 'inline-flex', ...style }}
      onClick={e => { onClick?.(e); go() }}
      onKeyDown={e => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        go()
      }}
      {...domProps}
    >
      {children}
    </span>
  )
}
