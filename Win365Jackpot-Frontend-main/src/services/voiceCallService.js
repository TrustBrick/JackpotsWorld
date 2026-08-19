// src/services/voiceCallService.js
//
// VOICE-CALL: all the low-level WebRTC in one place — RTCPeerConnection,
// local/remote media, offer/answer, ICE, connection state and teardown. React
// never touches an RTCPeerConnection directly; it consumes the state this
// emits (see src/hooks/useVoiceCall.js).
//
// ── Signaling transport ────────────────────────────────────────────────────
// Signaling rides the live-chat WebSocket that is already open, rather than
// opening a second one: the customer's session socket (/ws/live-chat/<id>/)
// and the agent's inbox socket (/ws/live-chat/admin/inbox/). This module is
// handed a `send` function by the caller and never owns a socket itself, which
// is what keeps connectLiveChatSocket's reconnect/poll logic the single
// authority on transport health.
//
// The server re-validates every frame against the CallSession before relaying
// it (authapp/consumers/live_chat_consumer.py), so nothing here is trusted to
// be well-behaved — this module's job is correctness of the media path, not
// authorization.
//
// ── Media ──────────────────────────────────────────────────────────────────
// Audio only. getUserMedia is called at the moment a call actually starts or
// is accepted, never on page load, so simply opening support never triggers a
// microphone prompt. Tracks are stopped in every exit path; see stop().

const PERMISSION_ERRORS = new Set(["NotAllowedError", "PermissionDeniedError", "SecurityError"])
const MISSING_DEVICE_ERRORS = new Set(["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"])
const BUSY_DEVICE_ERRORS = new Set(["NotReadableError", "TrackStartError", "AbortError"])

/** Whether this browser can do a call at all. Checked before showing the
 *  button, so an unsupported browser never gets a control that would throw. */
export function isWebRTCSupported() {
  return !!(
    typeof window !== "undefined" &&
    window.RTCPeerConnection &&
    navigator?.mediaDevices?.getUserMedia
  )
}

/**
 * Maps a getUserMedia rejection onto a message a person can act on.
 * Never surfaces the raw DOMException — the name/message are useful in a log,
 * not in a support dialog.
 */
export function describeMediaError(err) {
  const name = err?.name || ""
  if (PERMISSION_ERRORS.has(name)) {
    return "Microphone access is required to make a voice call. Please allow microphone access in your browser and try again."
  }
  if (MISSING_DEVICE_ERRORS.has(name)) {
    return "No microphone was found. Connect a microphone and try again."
  }
  if (BUSY_DEVICE_ERRORS.has(name)) {
    return "Your microphone is already in use by another app. Close it and try again."
  }
  if (!window.isSecureContext) {
    // Chrome/Safari only expose getUserMedia on https (localhost excepted),
    // and the resulting error is otherwise indistinguishable from a denial.
    return "Voice calls need a secure connection. Please reload the page over https and try again."
  }
  return "We couldn't start your microphone. Please check your device settings and try again."
}

/**
 * Creates a call engine.
 *
 * @param {object}   opts
 * @param {Array}    opts.iceServers   from /api/live-chat/calls/config/
 * @param {function} opts.send         (action, payload) => void — puts a frame
 *                                     on the already-open live-chat socket
 * @param {function} opts.onState      (state) => void — "connecting" |
 *                                     "connected" | "reconnecting" | "failed"
 * @param {function} opts.onRemoteStream (MediaStream) => void
 * @param {function} opts.onError      (friendlyMessage, rawError) => void
 */
export function createCallEngine({ iceServers = [], send, onState, onRemoteStream, onError }) {
  let pc = null
  let localStream = null
  let remoteStream = null
  let callId = null
  let closed = false
  // ICE candidates can arrive from the peer before setRemoteDescription has
  // run; addIceCandidate would throw on those. They are held here and flushed
  // once a remote description exists.
  let pendingCandidates = []
  let hasRemoteDescription = false

  const emitState = (s) => { if (!closed) onState?.(s) }

  function buildPeerConnection() {
    const conn = new RTCPeerConnection({ iceServers })

    conn.onicecandidate = (evt) => {
      if (evt.candidate && callId) {
        send?.("call.ice_candidate", { call_id: callId, data: evt.candidate.toJSON() })
      }
    }

    conn.ontrack = (evt) => {
      if (!remoteStream) {
        remoteStream = new MediaStream()
        onRemoteStream?.(remoteStream)
      }
      // Chrome gives evt.streams[0]; Firefox can give only the track.
      const incoming = evt.streams?.[0]
      if (incoming) {
        incoming.getAudioTracks().forEach(t => {
          if (!remoteStream.getTrackById(t.id)) remoteStream.addTrack(t)
        })
      } else if (evt.track) {
        if (!remoteStream.getTrackById(evt.track.id)) remoteStream.addTrack(evt.track)
      }
    }

    conn.onconnectionstatechange = () => {
      if (closed) return
      switch (conn.connectionState) {
        case "connected":
          emitState("connected")
          break
        case "disconnected":
          // Often transient — ICE may recover on its own, so this is a
          // "reconnecting" notice rather than a failure.
          emitState("reconnecting")
          break
        case "failed":
          emitState("failed")
          break
        default:
          break
      }
    }

    conn.oniceconnectionstatechange = () => {
      if (closed) return
      if (conn.iceConnectionState === "failed") emitState("failed")
    }

    return conn
  }

  async function acquireMicrophone() {
    // Requested here and nowhere else — the single point at which the browser
    // prompt can appear.
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      return localStream
    } catch (err) {
      onError?.(describeMediaError(err), err)
      throw err
    }
  }

  async function flushPendingCandidates() {
    if (!pc || !hasRemoteDescription) return
    const queued = pendingCandidates
    pendingCandidates = []
    for (const c of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch { /* stale candidate */ }
    }
  }

  return {
    get callId() { return callId },
    get localStream() { return localStream },

    /** Caller side: mic → peer connection → offer. */
    async startAsCaller(id) {
      callId = id
      closed = false
      emitState("connecting")
      const stream = await acquireMicrophone()
      pc = buildPeerConnection()
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      const offer = await pc.createOffer({ offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)
      send?.("call.offer", { call_id: id, data: { type: offer.type, sdp: offer.sdp } })
    },

    /** Agent side: mic only. The offer arrives over signaling and is handled
     *  by handleOffer below, so the answer is built from the real remote SDP
     *  rather than guessed at ahead of time. */
    async startAsReceiver(id) {
      callId = id
      closed = false
      emitState("connecting")
      await acquireMicrophone()
    },

    async handleOffer(description) {
      if (closed) return
      if (!pc) {
        pc = buildPeerConnection()
        if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream))
      }
      await pc.setRemoteDescription(new RTCSessionDescription(description))
      hasRemoteDescription = true
      await flushPendingCandidates()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      send?.("call.answer", { call_id: callId, data: { type: answer.type, sdp: answer.sdp } })
    },

    async handleAnswer(description) {
      if (closed || !pc) return
      // Guard against a duplicate/late answer, which would throw in
      // have-local-offer → stable.
      if (pc.signalingState !== "have-local-offer") return
      await pc.setRemoteDescription(new RTCSessionDescription(description))
      hasRemoteDescription = true
      await flushPendingCandidates()
    },

    async handleCandidate(candidate) {
      if (closed || !candidate) return
      if (!pc || !hasRemoteDescription) {
        pendingCandidates.push(candidate)
        return
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch { /* stale */ }
    },

    /** Local-only mute. The track stops producing audio; nothing is routed
     *  through the backend, and the peer connection stays up. */
    setMuted(muted) {
      if (!localStream) return false
      localStream.getAudioTracks().forEach(t => { t.enabled = !muted })
      if (callId) send?.(muted ? "call.mute" : "call.unmute", { call_id: callId })
      return muted
    },

    /**
     * Full teardown. Safe to call repeatedly and from any state — it is the
     * single exit path used by hangup, rejection, timeout, network failure,
     * navigation and tab close alike, so there is no route that leaves the
     * microphone live.
     */
    stop() {
      closed = true
      try {
        localStream?.getTracks().forEach(t => t.stop())
      } catch { /* already gone */ }
      try {
        remoteStream?.getTracks().forEach(t => t.stop())
      } catch { /* already gone */ }
      if (pc) {
        pc.onicecandidate = null
        pc.ontrack = null
        pc.onconnectionstatechange = null
        pc.oniceconnectionstatechange = null
        try { pc.close() } catch { /* already closed */ }
      }
      pc = null
      localStream = null
      remoteStream = null
      pendingCandidates = []
      hasRemoteDescription = false
      callId = null
    },
  }
}

/** mm:ss for the call timer. Hours are rare enough on a support call that
 *  h:mm:ss only appears once it is actually needed. */
export function formatCallDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  if (mm < 60) return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
  const hh = Math.floor(mm / 60)
  return `${hh}:${String(mm % 60).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
}
