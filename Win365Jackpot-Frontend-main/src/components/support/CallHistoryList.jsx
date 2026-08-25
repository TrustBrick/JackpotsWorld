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

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Download, Loader2, PhoneOff, PhoneIncoming, PhoneMissed, Play } from "lucide-react"
import { formatCallDuration } from "../../services/voiceCallService"
import { PUBLIC_CALL_THEME } from "./callTheme"

// Mirrors the container set the backend stores (RECORDING_CONTENT_TYPES in
// authapp/models/call_models.py), used only to name a downloaded file.
const RECORDING_EXTENSIONS = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
}

const fmtBytes = (n) => {
  if (!n) return ""
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

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
  // Off by default. The recording endpoint is an admin route, so offering
  // playback anywhere else would render a control that can only ever 403 —
  // the customer's own history says a call happened, not what was said in it.
  canPlayRecordings = false,
}) {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  // { id, url } for the one recording currently loaded. Only one at a time:
  // each is an object URL pinning a whole call's audio in memory.
  const [audio, setAudio] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [audioError, setAudioError] = useState("")
  const audioRef = useRef(null)
  useEffect(() => { audioRef.current = audio }, [audio])

  // Object URLs outlive the component unless revoked, so a panel left open
  // across a shift would otherwise hold every recording an agent clicked.
  useEffect(() => () => {
    if (audioRef.current?.url) URL.revokeObjectURL(audioRef.current.url)
  }, [])

  // Fetched with the session's own credentials rather than linked to: the
  // API hands out a path to an authorised endpoint, not a storage URL, so a
  // plain <audio src> would send an unauthenticated request and 404. Same
  // reasoning (and same shape) as services/attachments.js.
  const loadRecording = useCallback(async (call) => {
    if (!call?.recording_url) return
    setAudioError("")
    setBusyId(call.id)
    try {
      const res = await fetcher(`${apiBase}${call.recording_url}`)
      if (!res?.ok) throw new Error("unavailable")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      // Extension from what the server actually sent, not a guess: Safari
      // records MP4/AAC, and a Safari recording saved as .webm is a file the
      // agent's own machine refuses to open.
      const ext = RECORDING_EXTENSIONS[(blob.type || "").split(";")[0]] || "webm"
      setAudio(prev => {
        if (prev?.url) URL.revokeObjectURL(prev.url)
        return { id: call.id, url, name: `call-${call.id}.${ext}` }
      })
    } catch {
      setAudioError("That recording could not be loaded.")
    } finally {
      setBusyId(null)
    }
  }, [fetcher, apiBase])

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
                  {canPlayRecordings && c.has_recording && c.recording_bytes > 0 && (
                    <> · Recording {fmtBytes(c.recording_bytes)}</>
                  )}
                </div>

                {/* The player replaces the button in place rather than opening
                    a dialog, so an agent can scan the list and listen without
                    losing their position in it. */}
                {canPlayRecordings && c.has_recording && audio?.id === c.id && (
                  <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 8 }}>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio
                      src={audio.url}
                      controls
                      autoPlay
                      preload="auto"
                      style={{ width: "100%", maxWidth: 320, height: 32 }}
                    />
                    <a
                      href={audio.url}
                      download={audio.name}
                      title="Download recording"
                      aria-label="Download recording"
                      style={{ color: theme.sub, display: "flex", flexShrink: 0 }}
                    >
                      <Download size={13} />
                    </a>
                  </div>
                )}
              </div>

              {canPlayRecordings && c.has_recording && audio?.id !== c.id && (
                <button
                  type="button"
                  onClick={() => loadRecording(c)}
                  disabled={busyId === c.id}
                  title="Play recording"
                  aria-label="Play recording"
                  style={{
                    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 9px", borderRadius: 7,
                    border: `1px solid ${theme.border}`, background: "transparent",
                    color: theme.sub, fontSize: 10.5, fontWeight: 600,
                    cursor: busyId === c.id ? "wait" : "pointer",
                  }}
                >
                  {busyId === c.id
                    ? <Loader2 size={12} style={{ animation: "jwSpin 0.9s linear infinite" }} />
                    : <Play size={12} />}
                  Play
                </button>
              )}
            </div>
          )
        })}
        {audioError && (
          <div style={{ fontSize: 10.5, color: theme.red }}>{audioError}</div>
        )}
        <style>{`@keyframes jwSpin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}
