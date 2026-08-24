// src/components/support/launcherMetrics.js
//
// How tall the Live Support launcher currently is, published by the launcher
// itself and read by anything that has to sit clear of it.
//
// WHY MEASURE RATHER THAN CALCULATE
// ─────────────────────────────────────────────────────────────────────────────
// PageScrollButtons used to stack itself above the launcher by writing that
// launcher's dimensions out by hand:
//
//     bottom: clamp(14px,4vw,24px) + clamp(50px,12vw,60px) + a gap
//
// That drifted, twice. The height it quoted was the launcher's *open* state
// (the small close button) rather than the concierge mascot that is actually
// there when closed, and it ignored the greeting bubble stacked above the
// mascot in the same fixed container — which is most of the ~166px the whole
// thing occupies on a desktop. The result was a scroll control sitting inside
// the launcher and painted over by it.
//
// The height cannot be written as a constant even in principle: the bubble
// wraps to a different number of lines depending on viewport width and font
// metrics, so the stack is 166px on one screen and something else on another.
// So the launcher measures itself and publishes the number, and consumers
// position against the real value at the real size.
//
// The subscribe/notify shape here is the same one useAudioAutoplay and
// useEnquiryMessage already use in this codebase, rather than a third pattern.

import { useEffect, useState } from 'react'

// Used until the launcher has reported. Roughly what the closed launcher
// measures on a desktop, so the first paint is already clear of it rather than
// starting underneath and jumping out.
const FALLBACK_HEIGHT = 170

let height = FALLBACK_HEIGHT
const subscribers = new Set()

/** Called by the launcher whenever its box changes. */
export function setLauncherHeight(next) {
  const rounded = Math.round(next || 0)
  // Ignore zero: an unmounted or display:none launcher would otherwise pull
  // everything stacked above it down on top of where it is about to reappear.
  if (rounded <= 0 || rounded === height) return
  height = rounded
  subscribers.forEach(notify => notify(height))
}

/** The launcher's height right now, without subscribing. */
export function getLauncherHeight() {
  return height
}

/** Re-renders the caller whenever the launcher's height changes. */
export function useLauncherHeight() {
  const [value, setValue] = useState(height)

  useEffect(() => {
    subscribers.add(setValue)
    // Sync immediately: the launcher may have measured itself before this
    // consumer mounted, in which case no notification is coming.
    setValue(height)
    return () => { subscribers.delete(setValue) }
  }, [])

  return value
}
