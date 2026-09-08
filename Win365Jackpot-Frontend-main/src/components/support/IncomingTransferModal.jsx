// src/components/support/IncomingTransferModal.jsx
//
// The card a colleague's forwarded call lands on. Agent-only.
//
// Deliberately its own component rather than a mode of IncomingCallModal: an
// incoming call is a customer trying to reach the desk, and a transfer is a
// colleague handing over a conversation they have already had. The second one
// carries context the first does not — who is handing it over, and why — and
// that context is the whole reason an agent can pick up already knowing what
// the call is about.
//
// The customer is on hold while this card is up, so the countdown matters:
// when it lapses the server times the transfer out and the call returns to the
// forwarding agent. The bar is honest about that rather than being decoration.

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Building2, Forward, PhoneOff, User } from "lucide-react"
import { PUBLIC_CALL_THEME } from "./callTheme"

function secondsLeft(expiresAt) {
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.round(ms / 1000))
}

export default function IncomingTransferModal({
  transfer,
  onAccept,
  onDecline,
  // Everything that can go wrong with "Take call" used to fail INVISIBLY here:
  // the accept was refused, or the browser could not take calls at all, and
  // the card just sat there looking clickable. A card that can refuse has to
  // be able to say so.
  canAccept = true,
  busy = false,
  error = "",
  // Who this browser is signed in as for REST calls. The socket that delivered
  // this card authenticated once, at panel mount; `adminFetch` reads the token
  // out of localStorage on EVERY request. Two admin accounts used in one
  // browser share that one key, so the card can arrive for agent A while the
  // accept posts as agent B — which the server rightly refuses, and which used
  // to look like a dead button.
  signedInAdminId = null,
  signedInAs = "",
  theme = PUBLIC_CALL_THEME,
}) {
  const [remaining, setRemaining] = useState(() => secondsLeft(transfer?.ring_expires_at))

  useEffect(() => {
    if (!transfer) return undefined
    setRemaining(secondsLeft(transfer.ring_expires_at))
    const id = setInterval(() => setRemaining(secondsLeft(transfer.ring_expires_at)), 1000)
    return () => clearInterval(id)
  }, [transfer])

  if (!transfer) return null

  const fromName = transfer.from_agent_name || "A colleague"
  // A department forward has no named target and anyone in it may take it, so
  // only a named one can be addressed to somebody else.
  const addressedElsewhere = Boolean(
    transfer.to_agent_id && signedInAdminId && transfer.to_agent_id !== signedInAdminId,
  )
  const takeable = canAccept && !addressedElsewhere
  const target = transfer.to_department_name
    ? { icon: Building2, label: transfer.to_department_name }
    : { icon: User, label: "you" }
  const TargetIcon = target.icon

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Forwarded call"
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: theme.overlay, backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        style={{
          width: "100%", maxWidth: 340, textAlign: "center",
          background: theme.surface, border: `1px solid ${theme.gold}55`,
          borderRadius: 16, padding: 22,
          boxShadow: "0 24px 70px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{
          width: 52, height: 52, borderRadius: "50%", margin: "0 auto 12px",
          background: `${theme.gold}1E`, border: `1px solid ${theme.gold}66`,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "jwTransferPulse 1.6s ease-in-out infinite",
        }}>
          <Forward size={22} style={{ color: theme.gold }} />
        </div>

        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: theme.text }}>
          Call forwarded to {target.label}
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: theme.muted, lineHeight: 1.5 }}>
          <TargetIcon size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
          {fromName} is handing over a call
          {transfer.caller_name ? ` with ${transfer.caller_name}` : ""}.
        </p>

        {/* The context the forwarding agent typed. Internal, and the reason an
            agent can pick up already knowing what this is about. */}
        {transfer.reason && (
          <div style={{
            textAlign: "left", padding: "9px 11px", marginBottom: 14, borderRadius: 9,
            background: `${theme.gold}12`, border: `1px solid ${theme.gold}33`,
            color: theme.text, fontSize: 12, lineHeight: 1.5,
          }}>
            {transfer.reason}
          </div>
        )}

        {remaining !== null && (
          <p style={{ margin: "0 0 14px", fontSize: 11, color: theme.muted }} aria-live="polite">
            {remaining > 0
              ? `The customer is on hold — ${remaining}s to answer`
              : "Returning to the original agent…"}
          </p>
        )}

        {/* Why the button will not work, said before it is pressed rather than
            discovered by pressing it. getUserMedia and RTCPeerConnection exist
            only in a secure context, so a panel opened over plain http on a
            LAN address has no calling at all — the socket still delivers this
            card, which is exactly what makes the dead button so confusing. */}
        {addressedElsewhere && (
          <p style={{ margin: "0 0 12px", fontSize: 11.5, color: theme.red, lineHeight: 1.5 }}>
            This call was forwarded to {transfer.to_agent_name || "another agent"}, but this
            browser is signed in as {signedInAs || "a different admin"}. Sign in as that agent
            — or use a separate browser profile for each — and it can be taken.
          </p>
        )}

        {!canAccept && (
          <p style={{ margin: "0 0 12px", fontSize: 11.5, color: theme.red, lineHeight: 1.5 }}>
            This browser can’t take calls. Open the panel on https:// or
            localhost and try again — the call stays with {fromName} until then.
          </p>
        )}

        {error && (
          <p
            role="alert"
            style={{ margin: "0 0 12px", fontSize: 11.5, color: theme.red, lineHeight: 1.5 }}
          >
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "11px", borderRadius: 11,
              border: `1px solid ${theme.red}77`, background: `${theme.red}18`,
              color: theme.red, fontSize: 13, fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1,
            }}
          >
            <PhoneOff size={15} /> Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            // A second press while the first is still negotiating posts a
            // second accept, which the server answers 409 — and the error from
            // that would replace the perfectly fine call in progress.
            disabled={busy || !takeable}
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "11px", borderRadius: 11,
              border: `1px solid ${theme.gold}88`, background: `${theme.gold}22`,
              color: theme.gold, fontSize: 13, fontWeight: 700,
              cursor: busy || !takeable ? "not-allowed" : "pointer",
              opacity: busy || !takeable ? 0.5 : 1,
            }}
          >
            <Forward size={15} /> {busy ? "Connecting…" : "Take call"}
          </button>
        </div>

        <style>{`
          @keyframes jwTransferPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.06) } }
          @media (prefers-reduced-motion: reduce) {
            @keyframes jwTransferPulse { 0%,100% { transform: none } }
          }
        `}</style>
      </motion.div>
    </div>
  )
}
