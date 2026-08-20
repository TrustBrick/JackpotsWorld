// src/components/support/CallStatus.jsx
//
// VOICE-CALL: the small inline indicator that sits in a chat header while a
// call is live, so the conversation itself still reads as the primary surface
// and the call is visibly attached to it rather than replacing it.

import React from "react"
import { Phone, PhoneOff } from "lucide-react"
import { formatCallDuration } from "../../services/voiceCallService"
import { PUBLIC_CALL_THEME } from "./callTheme"
import { PHASE } from "../../hooks/useVoiceCall"

const LABELS = {
  [PHASE.CALLING]:    "Calling agent…",
  [PHASE.INCOMING]:   "Incoming call",
  [PHASE.CONNECTING]: "Connecting…",
  [PHASE.ENDING]:     "Ending…",
}

export default function CallStatus({ phase, seconds, lastEnded, theme = PUBLIC_CALL_THEME }) {
  if (phase === PHASE.IDLE) return null

  // Post-call summary: "Voice call ended · 04:27".
  if (phase === PHASE.ENDED || phase === PHASE.FAILED) {
    if (!lastEnded) return null
    const failed = phase === PHASE.FAILED
    return (
      <span
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 11.5, color: theme.sub,
        }}
      >
        <PhoneOff size={13} />
        {failed ? "Voice call failed" : "Voice call ended"}
        {!failed && lastEnded.duration_seconds > 0 && (
          <> · {formatCallDuration(lastEnded.duration_seconds)}</>
        )}
      </span>
    )
  }

  const connected = phase === PHASE.CONNECTED
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 11.5, fontWeight: 600,
        color: connected ? theme.green : theme.gold,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7, height: 7, borderRadius: "50%",
          background: connected ? theme.green : theme.gold,
          animation: "jwCallPulse 1.6s ease-in-out infinite",
        }}
      />
      {connected ? formatCallDuration(seconds) : (LABELS[phase] || "On a call")}
      {!connected && <Phone size={12} />}
      <style>{`
        @keyframes jwCallPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes jwCallPulse { 0%,100% { opacity: 1 } }
        }
      `}</style>
    </span>
  )
}
