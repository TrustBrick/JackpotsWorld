// src/components/support/CallTranscriptLine.jsx
//
// VOICE-CALL: one call, rendered as a line in the conversation itself.
//
// A call and the chat around it are the same conversation, but until now they
// lived in two places: the transcript, and a separate history list the player
// never saw at all. So a player scrolling back had no record that they had
// spoken to anyone - the gap where a ten-minute call happened looked like
// nothing had.
//
// Deliberately a centred system line rather than a bubble: it is not something
// either side said, and styling it as a message would make the transcript lie
// about who spoke.

import React from "react"
import { PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing } from "lucide-react"
import { formatCallDuration } from "../../services/voiceCallService"

const fmtTime = (iso) => {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  } catch { return "" }
}

/**
 * What to call it, from the player's point of view.
 *
 * `direction` matters: "Missed call" reads very differently depending on who
 * was ringing whom, and a player told they missed a call they themselves
 * placed would rightly be confused.
 */
export function describeCall(call) {
  const outbound = call.direction === "outbound"
  const connected = call.status === "ended" || call.status === "connected"
  const duration = call.duration_seconds || 0

  if (connected) {
    return {
      Icon: outbound ? PhoneIncoming : PhoneOutgoing,
      label: duration > 0
        ? `Call ended · ${formatCallDuration(duration)}`
        : "Call ended",
      tone: "normal",
    }
  }
  if (call.status === "missed") {
    // The support desk being closed is a different thing from nobody picking
    // up, and the player is owed the difference.
    if (call.end_reason === "no_agents") {
      return { Icon: PhoneMissed, label: "Support was unavailable", tone: "muted" }
    }
    return {
      Icon: PhoneMissed,
      label: outbound ? "Missed call from Customer Support" : "No answer",
      tone: "muted",
    }
  }
  if (call.status === "rejected") {
    return { Icon: PhoneOff, label: "Call declined", tone: "muted" }
  }
  if (call.status === "cancelled") {
    return { Icon: PhoneOff, label: "Call cancelled", tone: "muted" }
  }
  if (call.status === "failed") {
    return { Icon: PhoneOff, label: "Call could not connect", tone: "muted" }
  }
  // ringing / accepted — a call still in flight. The live call surface is
  // already on screen showing it, so the transcript stays quiet.
  return null
}

export default function CallTranscriptLine({ call, color = "rgba(255,255,255,0.45)" }) {
  const described = describeCall(call)
  if (!described) return null
  const { Icon, label } = described

  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 7, padding: "6px 4px", fontSize: 11, color,
      }}
    >
      <Icon size={12} style={{ flexShrink: 0, opacity: 0.85 }} aria-hidden="true" />
      <span>{label}</span>
      <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
        {fmtTime(call.started_at)}
      </span>
    </div>
  )
}

/**
 * Interleaves calls into a message list by time.
 *
 * Sorted on `started_at` against each message's own timestamp so a call sits
 * where it actually happened in the conversation rather than being appended in
 * a lump at the end. Messages without a timestamp (optimistic local echoes)
 * keep their existing position at the tail.
 */
export function mergeCallsIntoMessages(messages, calls, getTime) {
  if (!calls?.length) return messages
  const shown = calls.filter(c => describeCall(c) !== null)
  if (!shown.length) return messages

  const entries = shown.map(c => ({ __call: c, __at: c.started_at }))
  const merged = [...messages.map(m => ({ ...m, __at: getTime(m) })), ...entries]

  return merged.sort((a, b) => {
    // No timestamp sorts last, preserving the optimistic-echo-at-the-bottom
    // behaviour the composer relies on.
    if (!a.__at) return 1
    if (!b.__at) return -1
    return new Date(a.__at) - new Date(b.__at)
  })
}
