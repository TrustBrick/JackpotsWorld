// src/hooks/useVoiceCall.js
//
// VOICE-CALL: the React-facing state machine. Owns the call lifecycle and
// drives voiceCallService's engine; components below it render state and
// nothing else, so no component ever holds an RTCPeerConnection.
//
// ── Client state vs. server state ──────────────────────────────────────────
// The server is authoritative for *what the call is* (status, participants,
// duration, whether it timed out) and this hook is authoritative for *what
// this browser is doing* (has the mic, has a peer connection, is negotiating).
// Every persistent transition goes out over REST and comes back as a
// `call_state` push, so two tabs of the same account converge instead of
// disagreeing. The local phase below is only ever a presentation detail on top
// of that.
//
// ── Cleanup ────────────────────────────────────────────────────────────────
// There is exactly one teardown path — `cleanup()` — and every exit routes
// through it: hang up, decline, remote hangup, ring timeout, negotiation
// failure, unmount, navigation and tab close. That is deliberate: a second
// teardown path is how a microphone stays live after a call.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createCallEngine,
  describeMediaError,
  isWebRTCSupported,
} from "../services/voiceCallService"
import { useRingbackTone } from "./useCallTones"

// Local UI phases. Distinct from the server's CallSession.status, which is the
// record of what happened; these describe what this browser is showing.
export const PHASE = {
  IDLE: "idle",
  CALLING: "calling",       // customer: ringing out
  INCOMING: "incoming",     // agent: ringing in
  CONNECTING: "connecting", // accepted, negotiating media
  CONNECTED: "connected",
  ENDING: "ending",
  ENDED: "ended",
  FAILED: "failed",
}

const TERMINAL_SERVER_STATUSES = new Set([
  "ended", "rejected", "missed", "failed", "cancelled",
])

// How long a call may sit in CONNECTING before it is declared failed. Generous
// — offer/answer plus ICE on a slow mobile connection is a couple of seconds,
// so anything past this is a negotiation that is not going to complete rather
// than one that is taking its time.
const NEGOTIATION_TIMEOUT_MS = 25000

/**
 * @param {object}   opts
 * @param {"customer"|"agent"} opts.role
 * @param {string}   opts.apiBase
 * @param {function} opts.fetcher    (url, opts) => Promise<Response|undefined>
 *                   The caller supplies its own authenticated fetch, because
 *                   the player, affiliate and admin portals each hold their
 *                   token under a different key.
 * @param {function} opts.sendSignal (action, payload) => boolean — puts a
 *                   frame on the already-open live-chat socket.
 * @param {number}   opts.ticketId   customer only; the conversation to call on.
 * @param {boolean}  opts.enabled    false ⇒ do nothing at all (e.g. signed out)
 */
export function useVoiceCall({ role, apiBase, fetcher, sendSignal, ticketId, enabled = true }) {
  const [config, setConfig] = useState({
    available: false, ice_servers: [], ring_timeout_seconds: 30, recording_enabled: false,
  })
  const [phase, setPhase] = useState(PHASE.IDLE)
  const [call, setCall] = useState(null)
  const [error, setError] = useState("")
  const [muted, setMuted] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [seconds, setSeconds] = useState(0)
  const [lastEnded, setLastEnded] = useState(null)
  // Bumped when a recording finishes uploading, so a call-history list that
  // already rendered re-fetches and picks the audio up.
  const [recordingSavedAt, setRecordingSavedAt] = useState(0)

  const engineRef = useRef(null)
  const callRef = useRef(null)
  const phaseRef = useRef(PHASE.IDLE)
  const audioRef = useRef(null)
  const tickRef = useRef(null)
  const ringTimerRef = useRef(null)
  const dismissTimerRef = useRef(null)

  const supported = useMemo(() => isWebRTCSupported(), [])

  // ── Ringback ──────────────────────────────────────────────────────────────
  // The customer's half of the call's audio: a ring going out, matching the
  // ring coming in on the agent's card. Without it the caller presses Call and
  // gets silence for up to thirty seconds, which is indistinguishable from a
  // button that did nothing.
  //
  // Customer only. The agent has their own ringtone on the incoming card and
  // enters this hook's CONNECTING phase by pressing Accept, where a second
  // tone would just play over the call they are joining. It runs through
  // CONNECTING as well as CALLING so the tone stops on the *first audible
  // moment* — when media is actually flowing — rather than at pickup, leaving
  // a gap where the caller cannot tell whether anything happened.
  useRingbackTone(
    role === "customer" && (phase === PHASE.CALLING || phase === PHASE.CONNECTING)
  )

  useEffect(() => { callRef.current = call }, [call])
  useEffect(() => { phaseRef.current = phase }, [phase])

  // Phase must be written to the ref synchronously, not just through the
  // effect above. Inbound signaling is handled outside React's render cycle
  // and reads phaseRef to decide what to do; between a setPhase() call and
  // the effect that mirrors it, that ref still holds the *previous* phase.
  // A push landing in that window made an agent who had just pressed Accept
  // read their own phase as INCOMING and dismiss the call they were joining.
  // The effect stays as a backstop for phase changes made by React itself.
  const applyPhase = useCallback((next) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  // ── Remote audio sink ─────────────────────────────────────────────────────
  // Created once, outside React's tree: an <audio> element rendered by a
  // component would be torn down and recreated on the re-render that follows
  // every state change, cutting the audio each time.
  useEffect(() => {
    if (typeof document === "undefined") return
    const el = document.createElement("audio")
    el.autoplay = true
    el.setAttribute("playsinline", "")
    el.style.display = "none"
    document.body.appendChild(el)
    audioRef.current = el
    return () => {
      try { el.pause(); el.srcObject = null; el.remove() } catch { /* already gone */ }
      audioRef.current = null
    }
  }, [])

  // ── Config ────────────────────────────────────────────────────────────────
  // Gated on `supported` alone, deliberately not on `enabled`.
  //
  // This endpoint answers one question -- "can this deployment carry a call at
  // all" -- and needs no ticket to answer it. Gating it on `enabled` meant a
  // caller that has no live session yet could never learn the answer, so
  // `available` stayed false and the call button hid itself. That is what made
  // calling look absent from the chat widget until the customer had already
  // clicked through to an agent.
  //
  // `enabled` still gates everything that genuinely needs a session: ringing,
  // answering and the peer connection all key off it below. This is a
  // capability probe, and it is safe to ask early -- a signed-out visitor gets
  // a 401, which the catch below turns into available:false, hiding the button
  // exactly as it should.
  useEffect(() => {
    if (!supported) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetcher(`${apiBase}/api/live-chat/calls/config/`)
        if (!res?.ok || cancelled) return
        const json = await res.json()
        if (!cancelled) setConfig(json)
      } catch { /* leaves available:false — the button stays hidden */ }
    })()
    return () => { cancelled = true }
  }, [supported, apiBase, fetcher])

  // ── Teardown ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(tickRef.current); tickRef.current = null
    clearTimeout(ringTimerRef.current); ringTimerRef.current = null
    try { engineRef.current?.stop() } catch { /* already stopped */ }
    engineRef.current = null
    if (audioRef.current) audioRef.current.srcObject = null
    setMuted(false)
    setSpeakerOn(true)
    if (audioRef.current) audioRef.current.muted = false
    setSeconds(0)
  }, [])

  const finish = useCallback((serverCall, nextPhase = PHASE.ENDED) => {
    cleanup()
    if (serverCall) setLastEnded(serverCall)
    setCall(null)
    callRef.current = null
    applyPhase(nextPhase)
    // Auto-dismiss the "Call ended · 04:27" notice so the customer is returned
    // to the conversation rather than left staring at a dead modal. Tracked in
    // a ref so unmounting mid-summary cancels it instead of firing into a
    // component that is gone.
    clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(() => {
      if (phaseRef.current === PHASE.ENDED || phaseRef.current === PHASE.FAILED) {
        applyPhase(PHASE.IDLE)
      }
    }, 4000)
  }, [cleanup, applyPhase])

  // ── REST helpers ──────────────────────────────────────────────────────────
  const adminPrefix = role === "agent" ? "/api/admin-panel" : "/api"

  const post = useCallback(async (path, body) => {
    const res = await fetcher(`${apiBase}${path}`, {
      method: "POST",
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!res) return { ok: false, data: null }
    let data = null
    try { data = await res.json() } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, data }
  }, [apiBase, fetcher])

  const reportConnected = useCallback((id) => {
    post(`${adminPrefix}/live-chat/calls/${id}/connected/`).catch(() => {})
  }, [post, adminPrefix])

  // Reports the failure *and* closes the call out — fail_call is terminal in
  // its own right (status, end_reason, ended_at, active_key all set), so this
  // is not paired with an /end/ call. Order matters and is easy to get wrong:
  // end_call runs first-writer-wins and fail_call returns an already-terminal
  // call untouched, so ending first and then reporting the failure files the
  // call as an ordinary hangup and throws the category away. Call history is
  // how "calls fail on some networks" gets counted, so it has to record what
  // actually happened.
  const reportFailed = useCallback((id, reason, detail) => {
    // `detail` is the ICE summary (see voiceCallService.iceSummary) — which
    // candidate types each side managed to gather. It is what turns "the call
    // failed" in history into "neither side had a relay candidate", which is
    // the difference between a config problem and a missing TURN server.
    post(`${adminPrefix}/live-chat/calls/${id}/failed/`, { reason, detail })
      .catch(() => {})
  }, [post, adminPrefix])

  // ── Recording upload ──────────────────────────────────────────────────────
  // Fires once, after the call has already ended and the recorder has flushed.
  // Sent as multipart rather than through post() above, which JSON-encodes:
  // the browser has to set its own multipart boundary or the backend cannot
  // parse the body at all.
  //
  // A failure here is logged by the server and otherwise silent on purpose —
  // the call itself is over and successful, and there is no action a support
  // agent could take about a lost upload in the moment.
  const uploadRecording = useCallback(async (blob, mimeType, id) => {
    if (!blob || !id) return
    const ext = { "audio/mp4": "mp4", "audio/ogg": "ogg" }[mimeType] || "webm"
    try {
      const form = new FormData()
      form.append("file", blob, `call-${id}.${ext}`)
      const res = await fetcher(
        `${apiBase}/api/admin-panel/live-chat/calls/${id}/recording/`,
        { method: "POST", body: form },
      )
      // Bumping this is what makes a history list that rendered while the
      // upload was still in flight pick the recording up.
      if (res?.ok) setRecordingSavedAt(Date.now())
    } catch { /* the conversation still happened; the audio just didn't land */ }
  }, [fetcher, apiBase])

  // ── Engine wiring ─────────────────────────────────────────────────────────
  const buildEngine = useCallback(() => createCallEngine({
    iceServers: config.ice_servers || [],
    // Agent side only: one browser records, and it is the one that is not a
    // customer's phone on mobile data. The flag comes from the server so the
    // recorder and the customer's "recorded" notice can never disagree.
    record: role === "agent" && !!config.recording_enabled,
    onRecording: uploadRecording,
    send: (action, payload) => sendSignal?.(action, payload),
    onRemoteStream: (stream) => {
      if (audioRef.current) {
        audioRef.current.srcObject = stream
        // Autoplay can still be refused if the user has never interacted;
        // both call entry points are a click, so this is a belt-and-braces
        // retry rather than the normal path.
        audioRef.current.play?.().catch(() => {})
      }
    },
    onState: (s, detail) => {
      const current = callRef.current
      if (s === "connected") {
        applyPhase(PHASE.CONNECTED)
        if (current?.id) reportConnected(current.id)
      } else if (s === "reconnecting") {
        setError("Connection lost. Trying to reconnect...")
      } else if (s === "failed") {
        setError("The call could not be maintained. Please try again.")
        if (current?.id) reportFailed(current.id, "connection_failed", detail)
        finish(current, PHASE.FAILED)
      }
    },
    onError: (friendly) => setError(friendly),
  }), [
    config.ice_servers, config.recording_enabled, role, uploadRecording,
    sendSignal, reportConnected, reportFailed, finish,
  ])

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== PHASE.CONNECTED) return
    const startedAt = call?.connected_at ? new Date(call.connected_at).getTime() : Date.now()
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    tick()
    tickRef.current = setInterval(tick, 1000)
    return () => { clearInterval(tickRef.current); tickRef.current = null }
  }, [phase, call?.connected_at])

  // ── Ring expiry (display only; the backend decides for real) ──────────────
  useEffect(() => {
    if (phase !== PHASE.CALLING && phase !== PHASE.INCOMING) return
    // The deadline only applies while the call is still ringing. Once an agent
    // claims it the server leaves ring_expires_at on the record as history,
    // and firing on it anyway would hang up on a call that was answered a
    // second before the deadline.
    if (call?.status && call.status !== "ringing") return
    const expiresAt = call?.ring_expires_at ? new Date(call.ring_expires_at).getTime() : null
    if (!expiresAt) return
    const ms = Math.max(0, expiresAt - Date.now()) + 500
    ringTimerRef.current = setTimeout(() => {
      // The server has already moved this to `missed` by now; releasing the
      // mic locally keeps the UI honest even if the push is late.
      if (phaseRef.current === PHASE.CALLING || phaseRef.current === PHASE.INCOMING) {
        setError(role === "agent" ? "" : "No agent picked up. Please try again.")
        finish(callRef.current, PHASE.ENDED)
      }
    }, ms)
    return () => { clearTimeout(ringTimerRef.current); ringTimerRef.current = null }
    // call?.status is a dependency, not just a read: a call that gets answered
    // keeps the same ring_expires_at, so without it here the guard above would
    // never be re-evaluated and the armed timer would outlive the ring.
  }, [phase, call?.ring_expires_at, call?.status, finish, role])

  // ── Negotiation watchdog ──────────────────────────────────────────────────
  // CONNECTING is the one phase with no deadline of its own: the ring timeout
  // has stopped applying and the peer connection only reports `failed` once it
  // has candidates to fail on, so a negotiation that never starts — a lost
  // offer, a socket that dropped between accept and offer — leaves both
  // screens sitting on "Connecting…" indefinitely.
  //
  // This bounds it, and it records *why*: the call lands in history as
  // connection_failed rather than vanishing, which is the difference between
  // "calls sometimes don't work" and a row someone can count.
  useEffect(() => {
    if (phase !== PHASE.CONNECTING) return
    const timer = setTimeout(() => {
      if (phaseRef.current !== PHASE.CONNECTING) return
      const current = callRef.current
      setError("The call could not be connected. Please try again.")
      if (current?.id) {
        reportFailed(current.id, "connection_failed", engineRef.current?.iceDiagnosis)
      }
      finish(current, PHASE.FAILED)
    }, NEGOTIATION_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [phase, reportFailed, finish])

  // ── Actions ───────────────────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    if (!supported) {
      setError("Your browser doesn't support voice calls. Try the latest Chrome, Edge, Firefox or Safari.")
      return
    }
    // Previously a bare `return`. Both of these are reachable from a real tap
    // - a deployment that cannot carry calls, and a session whose ticket has
    // not landed yet - and both looked identical to the player: the button
    // consumed the tap and nothing happened, with nothing on screen to explain
    // it. Routing through FAILED means the modal actually renders the reason
    // and then dismisses itself, instead of the tap vanishing.
    if (!config.available || !ticketId) {
      setError(
        !config.available
          ? "Voice calling isn't available right now. Please send a message and an agent will reply."
          : "Your support session isn't ready yet. Please try again in a moment.",
      )
      finish(null, PHASE.FAILED)
      return
    }
    setError("")
    applyPhase(PHASE.CALLING)

    const { ok, data } = await post(`/api/live-chat/${ticketId}/calls/`)
    if (!ok) {
      setError(data?.error || "Could not start the call. Please try again.")
      applyPhase(PHASE.IDLE)
      return
    }
    setCall(data)
    callRef.current = data

    // Subscribe *before* negotiating, so the answer cannot arrive before this
    // socket has joined the call's group.
    sendSignal?.("call.subscribe", { call_id: data.id })

    const engine = buildEngine()
    engineRef.current = engine
    try {
      await engine.startAsCaller(data.id)
    } catch (err) {
      // getUserMedia already surfaced a friendly message via onError.
      const reason = describeMediaError(err).includes("Microphone access is required")
        ? "permission_denied"
        : "connection_failed"
      // Reporting the failure ends the call too — see reportFailed. Ending it
      // separately first would file a denied microphone as a normal hangup.
      reportFailed(data.id, reason)
      finish(data, PHASE.FAILED)
    }
  }, [supported, config.available, ticketId, post, sendSignal, buildEngine, finish, reportFailed])

  const acceptCall = useCallback(async (incomingCall) => {
    if (!supported) {
      setError("Your browser doesn't support voice calls.")
      return
    }
    setError("")
    applyPhase(PHASE.CONNECTING)

    const { ok, data } = await post(`/api/admin-panel/live-chat/calls/${incomingCall.id}/accept/`)
    if (!ok) {
      setError(data?.error || "This call is no longer available.")
      finish(null, PHASE.IDLE)
      return
    }
    setCall(data)
    callRef.current = data
    sendSignal?.("call.subscribe", { call_id: data.id })

    const engine = buildEngine()
    engineRef.current = engine
    try {
      await engine.startAsReceiver(data.id)
    } catch (err) {
      const reason = describeMediaError(err).includes("Microphone access is required")
        ? "permission_denied"
        : "connection_failed"
      reportFailed(data.id, reason)
      finish(data, PHASE.FAILED)
    }
  }, [supported, post, sendSignal, buildEngine, finish, reportFailed])

  const rejectCall = useCallback(async (incomingCall) => {
    const target = incomingCall || callRef.current
    if (!target) return
    await post(`/api/admin-panel/live-chat/calls/${target.id}/reject/`).catch(() => {})
    finish(null, PHASE.IDLE)
  }, [post, finish])

  const endCall = useCallback(async () => {
    const current = callRef.current
    if (!current) { finish(null, PHASE.IDLE); return }
    applyPhase(PHASE.ENDING)
    const { data } = await post(`${adminPrefix}/live-chat/calls/${current.id}/end/`)
    finish(data || current, PHASE.ENDED)
  }, [post, adminPrefix, finish])

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev
      // Local track only — audio stops at the microphone, nothing is routed
      // through the backend and the peer connection stays up.
      engineRef.current?.setMuted(next)
      return next
    })
  }, [])

  // Output control. The web platform has no API for choosing earpiece vs.
  // loudspeaker on a phone — setSinkId exists on desktop Chrome/Edge only and
  // enumerates output *devices*, not handset routing. So rather than ship a
  // control that silently does nothing on the platform where people most
  // expect it, this toggles the remote audio element itself: universally
  // supported, and honestly labelled "Speaker / Silent".
  const toggleSpeaker = useCallback(() => {
    setSpeakerOn(prev => {
      const next = !prev
      if (audioRef.current) audioRef.current.muted = !next
      return next
    })
  }, [])

  // ── Inbound signaling ─────────────────────────────────────────────────────
  // The parent component forwards its socket's onEvent here. Unknown events
  // fall straight through, so chat traffic on the same socket is untouched.
  const onSocketEvent = useCallback(async (eventName, data) => {
    if (!data) return

    if (eventName === "call_incoming") {
      // Agent side only. Ignored if this agent is already on a call, so an
      // incoming ring cannot interrupt one in progress.
      if (role !== "agent") return
      if (phaseRef.current !== PHASE.IDLE && phaseRef.current !== PHASE.ENDED) return
      setCall(data.call)
      callRef.current = data.call
      applyPhase(PHASE.INCOMING)
      return
    }

    if (eventName === "call_state") {
      const server = data.call
      if (!server) return
      const current = callRef.current
      if (current && server.id !== current.id) return

      if (TERMINAL_SERVER_STATUSES.has(server.status)) {
        // The other side hung up, declined, or the ring lapsed.
        if (phaseRef.current !== PHASE.IDLE) finish(server, PHASE.ENDED)
        return
      }
      // Still ringing on this screen, but no longer ringing on the server:
      // another agent claimed it. A call rings to every on-duty agent (the
      // livechat_admins group), so all the others must take their card down
      // — otherwise it sits there with the ringtone looping for the whole
      // duration of a call they are not on, and Accept just returns 409.
      // The agent who *did* accept is already past INCOMING by this point,
      // because acceptCall moves the phase before it awaits.
      if (phaseRef.current === PHASE.INCOMING && server.status !== "ringing") {
        cleanup()
        setCall(null)
        callRef.current = null
        applyPhase(PHASE.IDLE)
        return
      }
      // An agent picked up. Move the caller off "Calling…" and onto
      // "Connecting…", which is what is actually happening now: the agent is
      // about to offer and media is being negotiated. The agent is already
      // past this point — acceptCall sets CONNECTING before it awaits.
      if (role === "customer" && phaseRef.current === PHASE.CALLING && server.status === "accepted") {
        applyPhase(PHASE.CONNECTING)
      }
      if (current) setCall(server)
      return
    }

    if (eventName === "call_signal") {
      const engine = engineRef.current
      const current = callRef.current
      if (!engine || !current || data.call_id !== current.id) return
      try {
        if (data.signal === "offer") await engine.handleOffer(data.data)
        else if (data.signal === "answer") await engine.handleAnswer(data.data)
        else if (data.signal === "ice_candidate") await engine.handleCandidate(data.data)
        // mute/unmute are advisory only — the peer already stopped sending
        // audio locally, so there is nothing to do but note it if we ever
        // want to show a "muted" badge for the other party.
      } catch {
        setError("The call could not be maintained. Please try again.")
        reportFailed(current.id, "connection_failed", engineRef.current?.iceDiagnosis)
        finish(current, PHASE.FAILED)
      }
      return
    }

    if (eventName === "call_subscribe_denied") {
      const current = callRef.current
      if (current && data.call_id === current.id) {
        setError("The call could not be maintained. Please try again.")
        finish(current, PHASE.FAILED)
      }
    }
  }, [role, finish, reportFailed, cleanup, applyPhase])

  // ── Unmount / navigation / tab close ──────────────────────────────────────
  useEffect(() => {
    const handleUnload = () => {
      const current = callRef.current
      if (current) {
        // keepalive lets this outlive the document; the backend's ring timeout
        // and sweep command cover the case where even this does not land.
        try {
          fetcher(`${apiBase}${adminPrefix}/live-chat/calls/${current.id}/end/`, {
            method: "POST", keepalive: true,
          })
        } catch { /* nothing more we can do here */ }
      }
      cleanup()
    }
    window.addEventListener("pagehide", handleUnload)
    return () => {
      window.removeEventListener("pagehide", handleUnload)
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
      cleanup()
    }
  }, [cleanup, fetcher, apiBase, adminPrefix])

  return {
    supported,
    available: !!config.available && supported,
    iceServers: config.ice_servers,
    recordingEnabled: !!config.recording_enabled,
    recordingSavedAt,
    phase,
    call,
    lastEnded,
    error,
    muted,
    speakerOn,
    speakerSupported: true,
    seconds,
    isBusy: phase !== PHASE.IDLE && phase !== PHASE.ENDED && phase !== PHASE.FAILED,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    dismissError: () => setError(""),
    onSocketEvent,
  }
}
