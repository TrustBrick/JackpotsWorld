// src/components/support/ActiveCallModal.jsx
//
// VOICE-CALL: the in-call surface — ringing out, connecting, connected, and
// the brief "Call ended · 04:27" summary. Deliberately a compact panel rather
// than a full takeover: the conversation underneath stays visible, because the
// customer must be able to return to it the moment the call is over.
//
// Sizing is viewport-relative with a max-width, so it fits a phone without
// overflowing and never stretches awkwardly on a desktop.

import React from "react"
import { motion } from "framer-motion"
import { AlertCircle, Disc, Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from "lucide-react"
import { formatCallDuration } from "../../services/voiceCallService"
import { PUBLIC_CALL_THEME } from "./callTheme"
import { PHASE } from "../../hooks/useVoiceCall"

const HEADLINE = {
  [PHASE.CALLING]:    "Calling Support Agent…",
  [PHASE.INCOMING]:   "Incoming call",
  [PHASE.CONNECTING]: "Connecting…",
  [PHASE.CONNECTED]:  "Support Call",
  [PHASE.ENDING]:     "Ending call…",
  [PHASE.ENDED]:      "Call ended",
  [PHASE.FAILED]:     "Call failed",
}

function ControlButton({ icon: Icon, label, active, danger, onClick, theme, disabled }) {
  const tint = danger ? theme.red : active ? theme.gold : theme.sub
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : !!active}
      title={label}
      style={{
        display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 5,
        background: "transparent", border: "none",
        color: tint, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1, padding: 0, minWidth: 56,
      }}
    >
      <span style={{
        width: 44, height: 44, borderRadius: "50%",
        border: `1px solid ${danger ? `${theme.red}77` : active ? theme.gold : theme.border}`,
        background: danger ? `${theme.red}18` : active ? `${theme.gold}1E` : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={18} strokeWidth={2} />
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.02em" }}>{label}</span>
    </button>
  )
}

export default function ActiveCallModal({
  phase,
  call,
  lastEnded,
  seconds,
  muted,
  speakerOn = true,
  speakerSupported = true,
  recordingEnabled = false,
  error,
  onToggleMute,
  onToggleSpeaker,
  onEnd,
  onDismiss,
  theme = PUBLIC_CALL_THEME,
}) {
  if (phase === PHASE.IDLE || phase === PHASE.INCOMING) return null

  const connected = phase === PHASE.CONNECTED
  const finished = phase === PHASE.ENDED || phase === PHASE.FAILED
  const ringing = phase === PHASE.CALLING || phase === PHASE.CONNECTING
  const endedDuration = lastEnded?.duration_seconds || 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice call"
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: theme.overlay,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={finished ? onDismiss : undefined}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 320,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 18,
          padding: "24px 20px 20px",
          textAlign: "center",
          boxShadow: "0 24px 60px -20px rgba(0,0,0,0.65)",
        }}
      >
        <p style={{
          margin: "0 0 14px", display: "inline-flex", alignItems: "center", gap: 7,
          fontSize: 11, letterSpacing: "0.13em", textTransform: "uppercase",
          fontWeight: 600,
          color: phase === PHASE.FAILED ? theme.red : connected ? theme.green : theme.gold,
        }}>
          {connected && (
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: "50%", background: theme.red,
              animation: "jwLivePulse 1.6s ease-in-out infinite",
            }} />
          )}
          {HEADLINE[phase]}
        </p>

        {/* Timer — the one number that matters while a call is up. */}
        <div style={{
          fontSize: 34, fontWeight: 700, lineHeight: 1,
          color: theme.text, fontVariantNumeric: "tabular-nums",
          marginBottom: 6, letterSpacing: "-0.01em",
        }}>
          {connected
            ? formatCallDuration(seconds)
            : finished
              ? (endedDuration > 0 ? formatCallDuration(endedDuration) : "—")
              : (
                <span style={{ display: "inline-flex", gap: 5 }} aria-hidden="true">
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 8, height: 8, borderRadius: "50%", background: theme.gold,
                      animation: `jwDot 1.2s ease-in-out ${i * 0.16}s infinite`,
                    }} />
                  ))}
                </span>
              )}
        </div>

        <p style={{ margin: "0 0 18px", fontSize: 12.5, color: theme.sub, minHeight: 18 }}>
          {finished
            ? (endedDuration > 0 ? `Duration: ${formatCallDuration(endedDuration)}` : "No conversation took place")
            : ringing
              ? "Connecting…"
              : (call?.receiver_name || call?.caller_name || "Support")}
        </p>

        {/* Recording notice. Shown from the moment the call is placed rather
            than once it connects, so it is on screen before anyone has said
            anything — a notice that appears after the customer starts talking
            is not a notice. Driven by the server's flag, the same one that
            turns the agent's recorder on, so the two cannot disagree. */}
        {recordingEnabled && !finished && (
          <p style={{
            margin: "0 0 14px", display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11, color: theme.muted, lineHeight: 1.4,
          }}>
            <Disc size={12} style={{ flexShrink: 0, color: theme.red }} aria-hidden="true" />
            This call is recorded for quality and security.
          </p>
        )}

        {error && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8, textAlign: "left",
            padding: "9px 11px", marginBottom: 16, borderRadius: 9,
            background: `${theme.red}14`, border: `1px solid ${theme.red}44`,
            color: theme.red, fontSize: 12, lineHeight: 1.45,
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {!finished && (
          <div style={{
            display: "flex", justifyContent: "center", gap: 14, marginBottom: 18,
            flexWrap: "wrap",
          }}>
            <ControlButton
              icon={muted ? MicOff : Mic}
              label={muted ? "Muted" : "Mute"}
              active={muted}
              onClick={onToggleMute}
              theme={theme}
              disabled={!connected}
            />
            {speakerSupported && (
              <ControlButton
                icon={speakerOn ? Volume2 : VolumeX}
                label={speakerOn ? "Speaker" : "Silent"}
                active={!speakerOn}
                onClick={onToggleSpeaker}
                theme={theme}
                disabled={!connected}
              />
            )}
          </div>
        )}

        {finished ? (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              width: "100%", padding: "11px 12px", borderRadius: 11,
              border: `1px solid ${theme.border}`, background: "transparent",
              color: theme.text, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            }}
          >
            Back to chat
          </button>
        ) : (
          <button
            type="button"
            onClick={onEnd}
            style={{
              width: "100%", display: "inline-flex", alignItems: "center",
              justifyContent: "center", gap: 8,
              padding: "12px", borderRadius: 11,
              border: `1px solid ${theme.red}88`, background: `${theme.red}22`,
              color: theme.red, fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            {ringing ? <Phone size={16} /> : <PhoneOff size={16} />}
            {ringing ? "Cancel" : "End Call"}
          </button>
        )}

        <style>{`
          @keyframes jwLivePulse { 0%,100% { opacity: 1 } 50% { opacity: 0.2 } }
          @keyframes jwDot { 0%,100% { transform: translateY(0); opacity: 0.4 } 50% { transform: translateY(-5px); opacity: 1 } }
          @media (prefers-reduced-motion: reduce) {
            @keyframes jwLivePulse { 0%,100% { opacity: 1 } }
            @keyframes jwDot { 0%,100% { transform: none; opacity: 0.7 } }
          }
        `}</style>
      </motion.div>
    </div>
  )
}
