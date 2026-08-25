// src/components/support/IncomingCallModal.jsx
//
// VOICE-CALL: the agent's incoming-call card. Identifies the caller well
// enough to answer knowledgeably: display name, registered email, UID (or the
// AFF- reference for an affiliate) and ticket number — the same identity the
// live-chat inbox shows the same staff audience one screen away. The email
// earns its place because a display name is optional on these accounts: with
// only a name to go on, an account that has none rendered as "Customer" and
// left the agent answering a stranger.
//
// Nothing beyond identity belongs here — no balances, no phone number. The
// panel is one click away for the rest.

import React from "react"
import { motion } from "framer-motion"
import { Phone, PhoneOff, User } from "lucide-react"
import { PUBLIC_CALL_THEME } from "./callTheme"
// The ring itself now lives with the customer's ringback tone, so the two
// halves of the call's audio identity are designed against each other rather
// than in separate files. Same notes, same cadence as before.
import { useRingtone } from "../../hooks/useCallTones"

export default function IncomingCallModal({
  call,
  onAccept,
  onReject,
  busy = false,
  theme = PUBLIC_CALL_THEME,
}) {
  useRingtone(!!call)
  if (!call) return null

  const isAffiliate = call.participant_type === "affiliate"
  const email = (call.caller_email || "").trim()
  // Falls back through identity, most human first. The email is a far better
  // last resort than "Customer": it is who the agent is actually about to
  // talk to.
  const displayName = call.caller_name || email || "Customer"
  // Suppressed when the headline is already the email — the account has no
  // name set, and printing it twice reads like a rendering bug.
  const showEmail = !!email && email !== displayName
  const reference = call.caller_affiliate_id || call.caller_uid

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Incoming support call"
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: theme.overlay,
        // The dashboard behind a ringing call is noise; blurring it stops the
        // card having to fight numbers and tables for legibility.
        backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{
          width: "100%", maxWidth: 340,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 18,
          padding: "26px 22px 22px",
          textAlign: "center",
          boxShadow: "0 24px 60px -20px rgba(0,0,0,0.65)",
        }}
      >
        {/* Pulsing avatar — the one animation here, and it stops the moment
            the call is answered or declined. */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div
            style={{
              width: 64, height: 64, borderRadius: "50%",
              background: `${theme.gold}1F`,
              border: `1px solid ${theme.gold}66`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: theme.gold,
              animation: "jwRingPulse 1.8s ease-in-out infinite",
            }}
          >
            <User size={28} strokeWidth={1.8} />
          </div>
        </div>

        <p style={{
          margin: "0 0 3px", fontSize: 11, letterSpacing: "0.13em",
          textTransform: "uppercase", color: theme.gold, fontWeight: 600,
        }}>
          Incoming support call
        </p>

        <h3 style={{
          margin: "0 0 4px", fontSize: 19, fontWeight: 700,
          color: theme.text, wordBreak: "break-word",
        }}>
          {displayName}
        </h3>

        <p style={{
          margin: "0 0 3px", fontSize: 12.5, color: theme.sub,
          fontVariantNumeric: "tabular-nums",
        }}>
          {reference || "—"}
        </p>
        {showEmail && (
          <p style={{
            margin: "0 0 4px", fontSize: 12.5, color: theme.text,
            wordBreak: "break-all", opacity: 0.88,
          }}>
            {email}
          </p>
        )}
        <p style={{ margin: "0 0 18px", fontSize: 12, color: theme.muted }}>
          Ticket #{call.ticket_id}
          {isAffiliate && (
            <span style={{
              marginLeft: 8, padding: "2px 7px", borderRadius: 4,
              background: `${theme.gold}22`, color: theme.gold,
              fontSize: 9.5, letterSpacing: "0.08em", fontWeight: 700,
            }}>
              AFFILIATE
            </span>
          )}
        </p>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "11px 12px", borderRadius: 11,
              border: `1px solid ${theme.red}66`,
              background: `${theme.red}18`, color: theme.red,
              fontSize: 13.5, fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.55 : 1,
            }}
          >
            <PhoneOff size={16} /> Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "11px 12px", borderRadius: 11,
              border: `1px solid ${theme.green}88`,
              background: `${theme.green}22`, color: theme.green,
              fontSize: 13.5, fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.55 : 1,
            }}
          >
            <Phone size={16} /> Accept
          </button>
        </div>

        <style>{`
          @keyframes jwRingPulse {
            0%,100% { box-shadow: 0 0 0 0 ${theme.gold}44 }
            60%     { box-shadow: 0 0 0 13px ${theme.gold}00 }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes jwRingPulse { 0%,100% { box-shadow: none } }
          }
        `}</style>
      </motion.div>
    </div>
  )
}
