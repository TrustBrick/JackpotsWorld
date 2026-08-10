// src/utils/scroll.js
// Single source of truth for "scroll the page to a homepage section".
//
// Why this exists rather than react-scroll's <Link>: react-scroll derives a
// target's position by walking the offsetParent chain. Several sections here
// sit inside framer-motion wrappers, and an element with a transform becomes a
// containing block, which truncates that chain — so the computed position came
// out short and the page landed past the section instead of at its start.
// getBoundingClientRect() is resolved against the actual rendered layout, so it
// is correct regardless of transforms, and it is what every nav entry now uses.

// Used only if the navbar can't be measured (e.g. called before it mounts).
const NAV_OFFSET_FALLBACK = 80

/**
 * Height to keep clear at the top so a section's first line isn't hidden
 * underneath the fixed navbar. Measured live because the navbar shrinks
 * (py-3 -> py-2) once the page is scrolled.
 */
export function getNavOffset() {
  const nav = document.querySelector('nav')
  if (!nav) return NAV_OFFSET_FALLBACK

  // Measure the top bar row only, not the whole <nav>. On mobile the expanded
  // menu is rendered inside the same element, so nav.offsetHeight would
  // include it and leave a screen-tall gap above the section we scrolled to.
  const bar = nav.firstElementChild
  const barHeight = bar?.offsetHeight || 0
  const styles = window.getComputedStyle(nav)
  const padding =
    (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0)

  const height = barHeight ? barHeight + padding : nav.offsetHeight
  return height ? height + 12 : NAV_OFFSET_FALLBACK
}

/** Sections are marked up with plain id attributes; name= is a legacy fallback. */
export function getSectionElement(id) {
  if (!id) return null
  return document.getElementById(id) || document.getElementsByName(id)[0] || null
}

// How long to keep correcting after the smooth scroll, and how often.
const CORRECT_START_MS    = 700  // ~ the browser's smooth-scroll duration
const CORRECT_INTERVAL_MS = 120
const CORRECT_MAX_TICKS   = 12
const SETTLED_PX          = 2

// Only one correction loop may run at a time — clicking a second nav item
// must abandon the first, not fight it.
let activeCorrection = null

function cancelCorrection() {
  if (!activeCorrection) return
  activeCorrection.cancelled = true
  activeCorrection.cleanup()
  activeCorrection = null
}

/**
 * Scroll so the TOP of `id` sits just below the navbar.
 * Returns false if the section isn't in the DOM yet, so callers can retry.
 *
 * The homepage grows while the scroll is in flight: images finish loading and
 * in-view animations expand sections above the target, which moves the target
 * after the initial scrollTo was already computed — landing the page well past
 * the section. So we re-measure for a short window afterwards and correct
 * until the section top actually sits under the navbar. The loop gives up as
 * soon as the visitor scrolls themselves, so it can never fight a real user.
 */
export function scrollToSection(id, { behavior = 'smooth', correct = true } = {}) {
  const el = getSectionElement(id)
  if (!el) return false

  cancelCorrection()

  const desiredTop = () =>
    Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - getNavOffset())

  window.scrollTo({ top: desiredTop(), behavior })
  if (!correct) return true

  const state = { cancelled: false, cleanup: () => {} }
  activeCorrection = state

  const surrender = () => { state.cancelled = true }
  const userEvents = ['wheel', 'touchstart', 'keydown']
  userEvents.forEach(evt => window.addEventListener(evt, surrender, { passive: true }))
  state.cleanup = () =>
    userEvents.forEach(evt => window.removeEventListener(evt, surrender))

  let ticks = 0
  let settled = 0

  const tick = () => {
    if (state.cancelled) { state.cleanup(); return }

    // The section can be replaced by a re-render while we're correcting. A
    // detached node reports a zero rect, which would compute a bogus target
    // and yank the page somewhere it was never asked to go — stop instead.
    if (!el.isConnected) {
      state.cleanup()
      if (activeCorrection === state) activeCorrection = null
      return
    }

    ticks += 1
    const target = desiredTop()

    if (Math.abs(window.scrollY - target) <= SETTLED_PX) {
      settled += 1
    } else {
      settled = 0
      // 'auto' rather than 'smooth': this is a correction of a few hundred
      // pixels after the animation has finished, and a second smooth scroll
      // would overlap the first and oscillate.
      window.scrollTo({ top: target, behavior: 'auto' })
    }

    if (settled >= 2 || ticks >= CORRECT_MAX_TICKS) {
      state.cleanup()
      if (activeCorrection === state) activeCorrection = null
      return
    }
    setTimeout(tick, CORRECT_INTERVAL_MS)
  }

  setTimeout(tick, CORRECT_START_MS)
  return true
}

/**
 * Same, but keeps retrying while the section is still mounting — used after a
 * cross-page navigation, where the homepage hasn't rendered yet at click time.
 */
export function scrollToSectionWhenReady(id, { attempts = 30, intervalMs = 100 } = {}) {
  let tries = 0
  const attempt = () => {
    if (scrollToSection(id)) return
    if (tries < attempts) {
      tries += 1
      setTimeout(attempt, intervalMs)
    }
  }
  setTimeout(attempt, 60)
}
