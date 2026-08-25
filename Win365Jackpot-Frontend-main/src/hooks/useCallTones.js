// src/hooks/useCallTones.js
//
// VOICE-CALL: the two call tones, synthesised with Web Audio rather than
// shipped as binaries — the same approach LiveSupportTab already uses for its
// new-message chime, and it keeps an audio asset (with cache rules of its own)
// out of the bundle.
//
//   • Ringtone — the agent's incoming-call card. Insistent, a two-note rise
//     meant to be heard across a room. Unchanged from the version that lived
//     inside IncomingCallModal; the numbers below are that tone exactly.
//   • Ringback — the customer's "we're putting you through" tone. Deliberately
//     different in character: quieter, slower, and a sustained dual tone
//     rather than a rise, so nobody can mistake one for the other. 440 + 480Hz
//     is the standard ringback pair — the 40Hz beat between them is what makes
//     it read as "the phone is ringing at the other end" rather than as a
//     notification.
//
// Both are courtesies. Every failure path here is swallowed: a browser that
// refuses to make a sound must never take the call down with it.

import { useEffect } from "react"

// One burst = a set of notes placed relative to the start of the burst.
// `hold` is how long the note stays at full gain before it decays; 0 means it
// starts decaying immediately, which is what gives the ringtone its pluck.
const RINGTONE = {
  periodMs: 2400,
  steps: [
    { freq: 660, at: 0,    duration: 0.3, gain: 0.12, hold: 0 },
    { freq: 880, at: 0.18, duration: 0.3, gain: 0.12, hold: 0 },
  ],
}

const RINGBACK = {
  // 1.1s of tone, then ~2.3s of silence. Long enough to be unmistakably a
  // ring, quiet enough to sit under a support conversation.
  periodMs: 3400,
  steps: [
    { freq: 440, at: 0, duration: 1.1, gain: 0.05, hold: 0.85 },
    { freq: 480, at: 0, duration: 1.1, gain: 0.05, hold: 0.85 },
  ],
}

/**
 * Starts a repeating tone. Returns the stop function — call it exactly once;
 * it is safe to call after the context has already gone away.
 */
function startToneLoop({ steps, periodMs }) {
  let ctx = null
  let timer = null
  let cancelled = false

  const burst = () => {
    if (cancelled) return
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
      // A context built before the page has seen a user gesture starts
      // suspended. Both call entry points are a click, so this normally
      // resolves instantly — it is here for the case where it does not.
      ctx.resume?.().catch(() => {})
      const now = ctx.currentTime
      for (const { freq, at, duration, gain, hold } of steps) {
        const osc = ctx.createOscillator()
        const amp = ctx.createGain()
        osc.type = "sine"
        osc.frequency.value = freq
        amp.gain.setValueAtTime(gain, now + at)
        if (hold) amp.gain.setValueAtTime(gain, now + at + hold)
        // Exponential, never to zero — ramping to 0 is a no-op in Web Audio
        // and would leave the note ringing until stop() cuts it with a click.
        amp.gain.exponentialRampToValueAtTime(0.001, now + at + duration)
        osc.connect(amp).connect(ctx.destination)
        osc.start(now + at)
        osc.stop(now + at + duration)
      }
    } catch { /* audio is a courtesy, never a requirement */ }
  }

  burst()
  timer = setInterval(burst, periodMs)

  return () => {
    cancelled = true
    clearInterval(timer)
    timer = null
    try { ctx?.close() } catch { /* already closed */ }
    ctx = null
  }
}

function useToneLoop(active, tone) {
  useEffect(() => {
    if (!active) return undefined
    return startToneLoop(tone)
  }, [active, tone])
}

/** Agent side: rings while an incoming call is on screen. */
export function useRingtone(active) {
  useToneLoop(!!active, RINGTONE)
}

/** Customer side: rings while their own call is going out and connecting. */
export function useRingbackTone(active) {
  useToneLoop(!!active, RINGBACK)
}
