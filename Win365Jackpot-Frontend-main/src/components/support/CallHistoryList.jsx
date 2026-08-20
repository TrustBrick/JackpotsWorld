// src/components/support/CallHistoryList.jsx
//
// VOICE-CALL: call history for a support conversation.
//
// Permissions are entirely the server's: the customer endpoint only ever
// returns calls on the requester's own ticket, and the agent endpoint is
// scoped to calls that agent handled (plus anything still ringing, which they
// are entitled to answer), with superusers seeing everything exactly as they
// already do elsewhere in the panel. This component renders what it is given
// and filters nothing itself.

import React, { useCallback, useEffect, useState } from "react"
import { PhoneOff, PhoneIncoming, PhoneMissed } from "lucide-react"
import { formatCallDuration } from "../../services/voiceCallService"
import { PUBLIC_CALL_THEME } from "./callTheme"

const STATUS_LABEL = {
  ringing: "Ringing",
  accepted: "Connecting",
  connected: "Connected",
  ended: "Connected",
  rejected: "Declined",
  missed: "Missed",
  failed: "Failed",
  cancelled: "Cancelled",
}

const END_REASON_LABEL = {
  caller_ended: "Customer hung up",
  receiver_ended: "Agent hung up",
  rejected: "Declined by agent",
  timeout: "No answer",
  connection_failed: "Connection failed",
  permission_denied: "Microphone blocked",
  network_failure: "Network failure",
}

// Only three shapes matter at a glance: it connected, nobody answered, or it
// broke. Anything more granular is in the end-reason line underneath.
function statusTone(status, theme) {
  if (status === "ended" || status === "connected") return theme.green
  if (status === "failed") return theme.red
  return theme.sub
}

function StatusIcon({ status, size = 13 }) {
  if (status === "missed" || status === "cancelled") return <PhoneMissed size={size} />
  if (status === "rejected" || status === "failed") return <PhoneOff size={size} />
  return <PhoneIncoming size={size} />
}

const fmtWhen = (iso) => {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  } catch { return "" }
}

export default function CallHistoryList({
  fetcher,
  apiBase,
  endpoint,
  theme = PUBLIC_CALL_THEME,
  refreshKey = 0,
  emptyText = "No calls on this conversation yet",
  title = "Call history",
}) {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!endpoint) return
    try {
      const res = await fetcher(`${apiBase}${endpoint}`)
      if (!res?.ok) { setCalls([]); return }
      const json = await res.json()
      // Tolerates both the bare list and DRF's paginated envelope, since these
      // endpoints sit under the project-wide PageNumberPagination default.
      setCalls(Array.isArray(json) ? json : (json?.results || []))
    } catch {
      setCalls([])
    } finally {
      setLoading(false)
    }
  }, [fetcher, apiBase, endpoint])

  useEffect(() => { setLoading(true); load() }, [load, refreshKey])

  if (loading) return null
  if (!calls.length) {
    return (
      <div style={{ fontSize: 11, color: theme.muted, padding: "8px 2px" }}>
        {emptyText}
      </div>
    )
  }

  return (
    <div>
      <div style={{
        fontSize: 9.5, letterSpacing: "0.11em", textTransform: "uppercase",
        color: theme.muted, fontWeight: 700, marginBottom: 7,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {calls.map(c => {
          const tone = statusTone(c.status, theme)
          return (
            <div
              key={c.id}
              style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "7px 10px", borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: theme.surface2,
              }}
            >
              <span style={{ color: tone, display: "flex", flexShrink: 0 }}>
                <StatusIcon status={c.status} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11.5, fontWeight: 600, color: theme.text,
                  display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                }}>
                  <span style={{ color: tone }}>{STATUS_LABEL[c.status] || c.status}</span>
                  {c.duration_seconds > 0 && (
                    <span style={{ color: theme.sub, fontVariantNumeric: "tabular-nums" }}>
                      · {formatCallDuration(c.duration_seconds)}
                    </span>
                  )}
                  <span style={{ color: theme.muted, fontWeight: 500 }}>
                    · Ticket #{c.ticket_id}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: theme.muted, marginTop: 1 }}>
                  {fmtWhen(c.started_at)}
                  {c.caller_name && <> · {c.caller_name}</>}
                  {c.receiver_name && <> → {c.receiver_name}</>}
                  {c.end_reason && END_REASON_LABEL[c.end_reason] && (
                    <> · {END_REASON_LABEL[c.end_reason]}</>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
