// src/components/support/VoiceCallButton.jsx
//
// VOICE-CALL: the customer's "Call Agent" control, shown beside the chat
// composer once a live session exists.
//
// It renders nothing at all when calling cannot work here — an unsupported
// browser, or a deployment whose signaling cannot cross processes (see
// voice_call_service.calling_available). Offering a button that would ring
// into nothing is worse than not offering one.

import React from "react"
import { Phone } from "lucide-react"
import { PUBLIC_CALL_THEME } from "./callTheme"

export default function VoiceCallButton({
  onClick,
  disabled = false,
  available = true,
  busy = false,
  theme = PUBLIC_CALL_THEME,
  compact = false,
  label = "Call Agent",
}) {
  if (!available) return null

  const isDisabled = disabled || busy
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      title={busy ? "A call is already in progress" : label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: compact ? "7px 12px" : "9px 16px",
        borderRadius: 999,
        border: `1px solid ${theme.gold}`,
        background: isDisabled ? "transparent" : `${theme.gold}1A`,
        color: theme.gold,
        fontSize: compact ? 12 : 13,
        fontWeight: 600,
        letterSpacing: "0.01em",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.45 : 1,
        transition: "background 160ms ease, opacity 160ms ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.background = `${theme.gold}2E` }}
      onMouseLeave={e => { if (!isDisabled) e.currentTarget.style.background = `${theme.gold}1A` }}
    >
      <Phone size={compact ? 14 : 15} strokeWidth={2.2} />
      {label}
    </button>
  )
}
