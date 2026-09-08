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
// Server pushes that carry a full call payload, and are therefore all applied
// the same way: the row's state wins over whatever this client believed.
// `call_state` is the generic one; the rest come from the hold/forward layer
// (see services/call_control_service._push_control_state). Events with their
// own branch below — call_incoming, the transfer offer/completed/failed
// notifications, call_renegotiate, call_signal — return before reaching this.
const STATE_EVENTS = new Set([
  "call_state",
  "call_hold",
  "call_resume",
  "call_transfer_pending",
  "call_transferred",
])

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
  const [onHold, setOnHold] = useState(false)
  const [transferring, setTransferring] = useState(false)
  // A colleague's forward waiting for this agent to accept or decline.
  const [incomingTransfer, setIncomingTransfer] = useState(null)
  // Calls ringing this browser that have not been dealt with yet.
  //
  // A ring is a single broadcast. Previously anything arriving while a card
  // was already up - or while this agent was mid-call - was dropped on the
  // floor and never offered again, so two players calling at once meant the
  // second rang out unseen while an agent sat idle moments later. Holding them
  // means the desk works through them: whoever is free takes the head, the
  // rest wait their turn, and the server's atomic claim still decides who
  // actually gets each one.
  const [incomingQueue, setIncomingQueue] = useState([])

  const engineRef = useRef(null)
  // Hold state, and the desk configuration behind it. Both come from the
  // server: `onHold` from the call_state push (so the two endpoints can
  // never disagree, and a reloaded tab is corrected), and the audio/limit
  // from GET call-control-config.
  const holdConfigRef = useRef({ hold_enabled: true, hold_audio_url: "", hold_message: "" })
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
        if (cancelled) return
        setConfig(json)
        // Mirrored into a ref as well as state: the call_state handler reads
        // it from inside a useCallback that must not re-create itself every
        // time the config lands, and a stale closure there would mean the
        // customer gets the fallback tone instead of the configured audio.
        holdConfigRef.current = {
          hold_enabled: json.hold_enabled !== false,
          hold_audio_url: json.hold_audio_url || "",
          hold_message: json.hold_message || "",
          max_hold_seconds: json.max_hold_seconds || 0,
        }
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
    // The engine's stop() already silences the hold audio; this clears the UI
    // state so the next call does not open showing a stale "On hold" badge.
    setOnHold(false)
    setTransferring(false)
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
        // The engine needs this element to silence what the user HEARS while
        // on hold. It only ever toggles `muted`; the stream stays attached
        // here, so resuming is instant rather than a re-attach.
        engineRef.current?.attachRemoteSink?.(audioRef.current)
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

  // ── Queue promotion ───────────────────────────────────────────────────────
  // Shows the next waiting call the moment this browser is free. This is what
  // turns "the ring was dropped" into "the desk works through them": three
  // players calling at once put three cards in three agents' queues, each
  // agent takes the head, and the server's atomic claim ensures no two land on
  // the same call.
  useEffect(() => {
    if (phase !== PHASE.IDLE && phase !== PHASE.ENDED) return
    if (!incomingQueue.length) return
    const next = incomingQueue[0]
    setCall(next)
    callRef.current = next
    applyPhase(PHASE.INCOMING)
  }, [phase, incomingQueue, applyPhase])

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
      // FAILED, not IDLE. The modal renders nothing at IDLE, so setting an
      // error and dropping straight back to it showed the player *nothing* -
      // the tap simply appeared to do nothing. Routing through FAILED is what
      // actually surfaces the reason ("Customer Support is currently
      // unavailable", an unstaffed desk's 503) before the modal dismisses
      // itself. Same treatment the unavailable/no-ticket branches above get.
      setError(data?.error || "Could not start the call. Please try again.")
      finish(null, PHASE.FAILED)
      return
    }
    setCall(data)
    callRef.current = data

    // Subscribe *before* negotiating, so the answer cannot arrive before this
    // socket has joined the call's group.
    //
    // The return value is load-bearing, not decoration: send() reports false
    // whenever the WebSocket is not OPEN. On a network where the socket never
    // comes up - mobile data behind a proxy that blocks the upgrade, say -
    // this frame goes nowhere, this browser never joins the call's group, and
    // the agent's offer is relayed to a room it is not in. The call then sits
    // on "Connecting..." for the full negotiation timeout before dying, with
    // nothing on screen to say why. Ignoring this was how a signaling problem
    // came to look like a broken microphone.
    const subscribed = sendSignal?.("call.subscribe", { call_id: data.id })
    if (!subscribed) {
      setError(
        "We couldn't set up the call on this connection. Chat still works - send a message here and an agent will reply.",
      )
      reportFailed(data.id, "network_failure")
      finish(data, PHASE.FAILED)
      return
    }

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

  /**
   * Agent side: call a player back, typically one who missed a call.
   *
   * Deliberately the same shape as startCall - the agent is the *initiator*
   * here, so it takes the caller path through the engine (stand up the mic and
   * wait for the offer) exactly as a customer does when they dial out. The
   * engine's "caller" and "receiver" have always meant initiator and acceptor
   * rather than customer and agent, which is why a callback needs no changes
   * down there at all.
   */
  const startCallback = useCallback(async (ticketIdToCall) => {
    if (!supported) {
      setError("Your browser doesn't support voice calls.")
      return
    }
    if (!ticketIdToCall) return
    setError("")
    applyPhase(PHASE.CALLING)

    const { ok, data } = await post(`/api/admin-panel/live-chat/${ticketIdToCall}/callback/`)
    if (!ok) {
      setError(data?.error || "Could not call this player back. Please try again.")
      finish(null, PHASE.FAILED)
      return
    }
    setCall(data)
    callRef.current = data

    const subscribed = sendSignal?.("call.subscribe", { call_id: data.id })
    if (!subscribed) {
      setError("The support connection dropped. Please reload the panel and try again.")
      reportFailed(data.id, "network_failure")
      finish(data, PHASE.FAILED)
      return
    }

    const engine = buildEngine()
    engineRef.current = engine
    try {
      await engine.startAsCaller(data.id)
    } catch (err) {
      const reason = describeMediaError(err).includes("Microphone access is required")
        ? "permission_denied"
        : "connection_failed"
      reportFailed(data.id, reason)
      finish(data, PHASE.FAILED)
    }
  }, [supported, post, sendSignal, buildEngine, finish, reportFailed, applyPhase])

  const acceptCall = useCallback(async (incomingCall) => {
    // Out of the queue either way: if the accept succeeds it is this
    // agent's call, and if it fails another agent already claimed it.
    setIncomingQueue(prev => prev.filter(c => c.id !== incomingCall?.id))
    if (!supported) {
      setError("Your browser doesn't support voice calls.")
      return
    }
    setError("")
    applyPhase(PHASE.CONNECTING)

    // A player answering a callback goes to the customer route; an agent
    // claiming a ringing call goes to the admin one, which resolves the race
    // between several agents. Same button, different question.
    const acceptPath = role === "agent"
      ? `/api/admin-panel/live-chat/calls/${incomingCall.id}/accept/`
      : `/api/live-chat/calls/${incomingCall.id}/accept/`
    const { ok, data } = await post(acceptPath)
    if (!ok) {
      setError(data?.error || "This call is no longer available.")
      finish(null, PHASE.IDLE)
      return
    }
    setCall(data)
    callRef.current = data
    // Same reasoning as startCall: without this frame landing, this browser is
    // not in the call's group, and the offer it is about to send would be the
    // only thing it ever contributes to a conversation it cannot hear.
    const subscribed = sendSignal?.("call.subscribe", { call_id: data.id })
    if (!subscribed) {
      setError("The support connection dropped. Please reload the panel and try again.")
      reportFailed(data.id, "network_failure")
      finish(data, PHASE.FAILED)
      return
    }

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
    // Declining removes it here even though it stays ringing for everyone
    // else - this agent has said no, and re-promoting it to them would be a
    // loop rather than a queue.
    setIncomingQueue(prev => prev.filter(c => c.id !== target.id))
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

  // ── Hold ──────────────────────────────────────────────────────────────────
  // The agent asks the SERVER to hold; the server decides, records the period
  // and pushes the new state to both endpoints. Neither browser flips its own
  // audio on the click — they both act on the push. That is what stops the two
  // sides disagreeing when one request fails, and what lets a customer whose
  // tab reloaded mid-hold be told they are still on hold.
  const holdCall = useCallback(async () => {
    const current = callRef.current
    if (!current) return { ok: false }
    const { ok, data } = await post(`${adminPrefix}/live-chat/calls/${current.id}/hold/`)
    if (!ok) setError(data?.error || "Could not put the call on hold.")
    return { ok, data }
  }, [post, adminPrefix])

  const resumeCall = useCallback(async () => {
    const current = callRef.current
    if (!current) return { ok: false }
    const { ok, data } = await post(`${adminPrefix}/live-chat/calls/${current.id}/resume/`)
    if (!ok) setError(data?.error || "Could not take the call off hold.")
    return { ok, data }
  }, [post, adminPrefix])

  /** Decline or cancel a forwarded call. Accepting is separate below, because
   *  it has to do considerably more than post a verb. */
  const respondToTransfer = useCallback(async (transferId, action) => {
    if (!transferId) return { ok: false }
    const { ok, data } = await post(`${adminPrefix}/live-chat/transfers/${transferId}/${action}/`)
    // Cleared either way. Declining something the server says is no longer
    // pending still means the agent is done with it, and leaving a card up
    // that can never be acted on is worse than the failed request.
    setIncomingTransfer(null)
    if (!ok) setError(data?.error || "Could not respond to the transfer.")
    return { ok, data }
  }, [post, adminPrefix])

  /**
   * Take over a forwarded call.
   *
   * Accepting the transfer is only half of it. The server reassigns
   * CallSession.receiver — which is what admits this browser to the call's
   * signaling group and drops the previous agent — but this browser then has
   * to actually JOIN that group, get a microphone and negotiate with the
   * customer, exactly as acceptCall does for an inbound ring. Posting the
   * accept and stopping there would move the call on paper and leave the
   * customer listening to hold audio for ever.
   *
   * The customer's side is told to renegotiate by the server (call_renegotiate),
   * so both ends rebuild against each other rather than one waiting on a
   * connection that no longer has a peer.
   */
  const acceptTransfer = useCallback(async (transfer) => {
    const transferId = transfer?.id
    if (!transferId) return { ok: false }
    if (!supported) {
      setError("Your browser doesn't support voice calls.")
      return { ok: false }
    }
    setError("")
    applyPhase(PHASE.CONNECTING)

    const { ok, data } = await post(`${adminPrefix}/live-chat/transfers/${transferId}/accept/`)
    if (!ok) {
      // The card DELIBERATELY stays up. Clearing it here put the panel back in
      // PHASE.IDLE, where nothing renders an error — so a refused accept (the
      // ring already lapsed, a colleague took it first) looked exactly like a
      // button that does nothing. The card is the only surface on screen at
      // this moment, so it is where the reason has to appear; Decline dismisses
      // it.
      setError(data?.error || "This transfer is no longer available.")
      finish(null, PHASE.IDLE)
      return { ok: false, data }
    }
    setIncomingTransfer(null)

    const callId = data?.call_id
    if (!callId) {
      finish(null, PHASE.IDLE)
      return { ok: false }
    }

    // Fetch the call itself: the transfer payload identifies it but does not
    // carry its state, and the surface needs the caller's details.
    const { data: callData } = await (async () => {
      const res = await fetcher(`${apiBase}${adminPrefix}/live-chat/calls/${callId}/transfers/`)
      if (!res?.ok) return { data: null }
      const json = await res.json().catch(() => null)
      return { data: json?.call || null }
    })()

    const activeCall = callData || { id: callId }
    setCall(activeCall)
    callRef.current = activeCall

    // Without this frame landing, this browser is not in the call's signaling
    // group and the offer it is about to send goes nowhere — the same
    // reasoning as acceptCall.
    const subscribed = sendSignal?.("call.subscribe", { call_id: callId })
    if (!subscribed) {
      setError("The support connection dropped. Please reload the panel and try again.")
      reportFailed(callId, "network_failure")
      finish(activeCall, PHASE.FAILED)
      return { ok: false }
    }

    const engine = buildEngine()
    engineRef.current = engine
    try {
      // As the OFFERER, not the receiver. The customer's peer connection was
      // built against the previous agent and has been torn down by the
      // renegotiate push, so there is no offer waiting to be answered — this
      // side has to make the new one.
      await engine.startAsCaller(callId)
    } catch (err) {
      const reason = describeMediaError(err).includes("Microphone access is required")
        ? "permission_denied"
        : "connection_failed"
      reportFailed(callId, reason)
      finish(activeCall, PHASE.FAILED)
      return { ok: false }
    }
    return { ok: true, data }
  }, [supported, post, adminPrefix, fetcher, apiBase, sendSignal, buildEngine, finish, reportFailed])

  /** Forward the call to a named agent or a department. The customer goes on
   *  hold for the ring; see call_control_service for the full state machine. */
  const transferCall = useCallback(async ({ toAgentId = null, toDepartmentId = null, reason = "", note = "" } = {}) => {
    const current = callRef.current
    if (!current) return { ok: false }
    const { ok, data } = await post(
      `${adminPrefix}/live-chat/calls/${current.id}/transfer/`,
      { to_agent_id: toAgentId, to_department_id: toDepartmentId, reason, note },
    )
    if (!ok) setError(data?.error || "Could not forward the call.")
    return { ok, data }
  }, [post, adminPrefix])

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
      // Both roles can be rung now: an agent by a player's inbound call, and a
      // player by a support callback. The direction on the payload says which,
      // and each side ignores the other's ring - a player must never see an
      // inbound call ringing the support desk, and an agent's incoming card is
      // for calls *to* the desk.
      const inbound = (data.call?.direction || "inbound") === "inbound"
      if (inbound ? role !== "agent" : role !== "customer") return
      // Queued rather than shown directly. The effect below promotes the head
      // whenever this browser is free, so a ring that lands mid-call is taken
      // up the moment the agent finishes instead of being lost. Duplicates are
      // ignored - the server re-offers waiting calls, deliberately.
      if (!data.call?.id) return
      setIncomingQueue(prev => (
        prev.some(c => c.id === data.call.id) ? prev : [...prev, data.call]
      ))
      return
    }

    // ── Incoming transfer ─────────────────────────────────────────────────
    // A colleague forwarded a call here, or to a department this agent is in.
    // Held as state rather than acted on: accepting is a deliberate choice,
    // and the same first-to-accept race the server resolves for inbound calls
    // resolves this one too.
    if (eventName === "call_transfer_offer") {
      if (role !== "agent" || !data.transfer?.id) return
      setIncomingTransfer(prev => {
        if (prev?.id === data.transfer.id) return prev
        // A new offer starts clean: the reason the LAST one could not be taken
        // must not sit on this card as if it were about this call.
        setError("")
        return data.transfer
      })
      return
    }

    // The transfer this agent started was taken — their leg is over, so the
    // call surface comes down here while it continues on the colleague's
    // screen. Ending it locally rather than through the end endpoint: the
    // call is still live, it just is not this agent's any more.
    if (eventName === "call_transfer_completed") {
      if (role !== "agent") return
      setIncomingTransfer(null)
      cleanup()
      setCall(null)
      callRef.current = null
      applyPhase(PHASE.IDLE)
      return
    }

    // Declined, cancelled or timed out. The card comes down wherever it was
    // showing; the forwarding agent keeps the call.
    if (eventName === "call_transfer_failed") {
      setIncomingTransfer(prev => (
        prev && prev.id === data.transfer?.id ? null : prev
      ))
      return
    }

    // ── Renegotiation after a transfer ────────────────────────────────────
    // The call now has a different agent on the other end. This browser's
    // peer connection was negotiated against the PREVIOUS one and is dead: it
    // has to be torn down and rebuilt, or the customer sits on a connection
    // whose peer has gone.
    //
    // Customer side only. The new agent is the one that offers (see
    // acceptTransfer), so this side rebuilds as the receiver and waits.
    if (eventName === "call_renegotiate") {
      if (role !== "customer") return
      const current = callRef.current
      const callId = data.call?.id || current?.id
      if (!callId) return
      try { engineRef.current?.stop() } catch { /* already stopped */ }
      engineRef.current = null
      if (data.call) { setCall(data.call); callRef.current = data.call }
      applyPhase(PHASE.CONNECTING)
      const engine = buildEngine()
      engineRef.current = engine
      try {
        await engine.startAsReceiver(callId)
      } catch (err) {
        reportFailed(callId, "connection_failed")
        finish(callRef.current, PHASE.FAILED)
      }
      return
    }

    // call_state and the CONTROL events are one branch on purpose: every one of
    // them carries the same call payload (`call_control_payload` is
    // `call_payload` plus the hold/transfer flags), and every one of them means
    // the same thing to a client — "this is the row's current state".
    //
    // They were not listed here, and the effect was that hold looked broken
    // while working perfectly: the server recorded the hold, wrote the
    // CallHoldEvent and pushed `call_hold` to both browsers, and both browsers
    // dropped it on the floor because the name did not match. The agent's
    // button never became "Resume", the customer was never muted and never
    // heard the hold audio. Nothing below this line had to change.
    if (STATE_EVENTS.has(eventName)) {
      const server = data.call
      if (!server) return
      const current = callRef.current
      if (current && server.id !== current.id) return

      // Somebody else took it, or it ended: it is no longer answerable here,
      // so it leaves the queue and the next one can come forward.
      if (server.status !== "ringing") {
        setIncomingQueue(prev => prev.filter(c => c.id !== server.id))
      }

      if (TERMINAL_SERVER_STATUSES.has(server.status)) {
        // The other side hung up, declined, or the ring lapsed.
        if (phaseRef.current !== PHASE.IDLE) finish(server, PHASE.ENDED)
        return
      }

      // HOLD. The server's flag is the authority, so this runs on every
      // call_state push rather than only on the hold/resume events — a client
      // that missed one (a dropped socket, a reload) is corrected by the next
      // state it receives, instead of being left silently out of step.
      if (typeof server.is_on_hold === "boolean") {
        setOnHold(server.is_on_hold)
        engineRef.current?.setHold?.(server.is_on_hold, {
          holdAudioUrl: holdConfigRef.current.hold_audio_url,
          // Only the CUSTOMER hears hold audio. An agent who put someone on
          // hold to go and check something needs a quiet line to do it on.
          playHoldAudio: role === "customer",
        })
      }
      if (typeof server.is_transferring === "boolean") {
        setTransferring(server.is_transferring)
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
  }, [role, finish, reportFailed, cleanup, applyPhase, buildEngine, setCall])

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
    // How many other calls are waiting behind the one on screen.
    waitingCount: Math.max(0, incomingQueue.length - (phase === PHASE.INCOMING ? 1 : 0)),
    phase,
    call,
    lastEnded,
    error,
    muted,
    speakerOn,
    speakerSupported: true,
    seconds,
    // Server-decided, not locally toggled — see the call_state handler.
    onHold,
    transferring,
    holdEnabled: !!holdConfigRef.current.hold_enabled,
    holdMessage: holdConfigRef.current.hold_message,
    isBusy: phase !== PHASE.IDLE && phase !== PHASE.ENDED && phase !== PHASE.FAILED,
    startCall,
    startCallback,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    holdCall,
    resumeCall,
    transferCall,
    incomingTransfer,
    acceptTransfer,
    respondToTransfer,
    dismissError: () => setError(""),
    onSocketEvent,
  }
}
