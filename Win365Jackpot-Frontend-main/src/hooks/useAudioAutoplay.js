import { useCallback, useEffect, useState } from 'react'

/**
 * Shared autoplay-with-sound policy for the landing page's audio-bearing
 * videos (the Premium Partner hero band and the Casino Destinations
 * carousel). Purely decorative/background videos — the hero backdrop, the
 * VIP "Video Highlights" tiles, the Poker/Teen Patti cinematic cards — stay
 * hardcoded `muted` and deliberately do NOT use any of this: they sit behind
 * text with `pointerEvents: none` and were never meant to make noise.
 *
 * Why this module exists
 * ─────────────────────────────────────────────────────────────────────────
 * Browsers block audible autoplay until the document has received a real
 * activation gesture, and each one decides differently:
 *   • Chromium also allows it unprompted when its Media Engagement Index for
 *     the site is high enough — which is why the same build plays with sound
 *     on one machine and silently on another, and why it can differ between
 *     two loads on the same machine.
 *   • `navigator.userActivation` is Chromium-only. Safari (desktop and iOS)
 *     and Firefox do not implement it, so reading it there yields nothing —
 *     a component that only consults it can never notice that the visitor
 *     has since interacted, and stays muted forever.
 *   • iOS additionally needs `playsInline`, and refuses even muted autoplay
 *     in Low Power Mode.
 *
 * So "has the visitor activated the page?" is tracked here, once, from real
 * events, seeded by `navigator.userActivation` where it exists — and every
 * audible video subscribes to the same answer instead of sampling its own.
 *
 * What this module does NOT do: it never retries in a loop, never polls,
 * never reloads, and never tries to defeat the autoplay policy. A blocked
 * audible play falls back to muted playback exactly once, and the call site
 * shows an unmute control; one further audible attempt is made when — and
 * only when — activation actually arrives.
 */

// Events the HTML spec counts as activation triggers. Scroll and wheel are
// deliberately absent: they do not activate a document, so treating them as
// activation would mean attempting audible playback that is still blocked.
const ACTIVATION_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']

let activated = false
const subscribers = new Set()

function readNativeActivation() {
  // Chromium-only. Absent elsewhere, where it means "unknown", never "no".
  return typeof navigator !== 'undefined' && navigator.userActivation
    ? !!navigator.userActivation.hasBeenActive
    : false
}

function onActivation() {
  if (activated) return
  activated = true
  ACTIVATION_EVENTS.forEach(e =>
    document.removeEventListener(e, onActivation, { capture: true }),
  )
  subscribers.forEach(notify => notify())
  subscribers.clear()
}

// Attached at import time rather than from an effect, so a gesture that
// happens before (or between) the video components mount is still recorded.
// Capture phase so a handler that stops propagation cannot hide it.
if (typeof document !== 'undefined') {
  activated = readNativeActivation()
  if (!activated) {
    ACTIVATION_EVENTS.forEach(e =>
      document.addEventListener(e, onActivation, { passive: true, capture: true }),
    )
  }
}

/** Imperative read — true once the page has been genuinely activated. */
export function hasUserActivation() {
  if (!activated && readNativeActivation()) activated = true
  return activated
}

/**
 * Reactive form of the above: re-renders the caller the moment activation
 * lands, so a video that fell back to muted can take its one audible retry
 * then — instead of never noticing, which is what a one-shot read inside a
 * `useEffect` does on every browser that lacks `navigator.userActivation`.
 */
export function useUserActivation() {
  const [value, setValue] = useState(hasUserActivation)

  useEffect(() => {
    if (value) return undefined
    // Activation can land between render and effect (e.g. the click that
    // opened this view), so re-read before subscribing.
    if (hasUserActivation()) {
      setValue(true)
      return undefined
    }
    const notify = () => setValue(true)
    subscribers.add(notify)
    return () => subscribers.delete(notify)
  }, [value])

  return value
}

/**
 * Attempt playback, honouring `withSound` when the browser allows it.
 *
 * Resolves to what actually happened:
 *   'audible' — playing with sound
 *   'muted'   — playing, but the audible attempt was refused (or none was
 *               asked for), so the caller should offer an unmute control
 *   'failed'  — the element would not play at all (e.g. iOS Low Power Mode);
 *               the poster / first frame stays on screen
 *
 * At most one audible attempt and one muted fallback per call. `pause()`
 * landing while a play() promise is still pending rejects it with "The
 * play() request was interrupted…", which fast scrolling produces routinely
 * — that rejection is handled the same way as a policy refusal, which is why
 * callers must serialise pause against the promise this returns.
 */
export async function attemptPlay(video, { withSound = false } = {}) {
  if (!video) return 'failed'

  if (withSound) {
    video.muted = false
    try {
      await video.play()
      return 'audible'
    } catch {
      // Refused, or torn down mid-play. Don't keep asking.
      if (!video.isConnected) return 'failed'
    }
  }

  video.muted = true
  try {
    await video.play()
    return 'muted'
  } catch {
    return 'failed'
  }
}

// Sound preferences live outside React so they survive the remounts these
// carousels do on every slide change. Without this, a visitor who muted a
// video would find the next slide unmuted again — the "re-render resets the
// audio state" failure, arriving via remount rather than re-render.
const preferences = new Map()

/**
 * A visitor's sound preference for one named surface, persisted for the life
 * of the page. Namespaced by `key` so the hero band and the destinations
 * carousel keep independent preferences, the way they always have.
 */
export function useSoundPreference(key, initial = true) {
  const [value, setValue] = useState(() =>
    preferences.has(key) ? preferences.get(key) : initial,
  )

  const set = useCallback((next) => {
    setValue(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next
      preferences.set(key, resolved)
      return resolved
    })
  }, [key])

  return [value, set]
}
