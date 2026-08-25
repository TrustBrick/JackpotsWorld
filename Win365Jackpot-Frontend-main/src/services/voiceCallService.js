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

// ── Recording ───────────────────────────────────────────────────────────────
// Containers in preference order. Opus in WebM is what Chrome, Edge and
// Firefox produce and is by far the smallest for speech; MP4/AAC is the
// fallback Safari records. The backend accepts exactly this set (see
// RECORDING_CONTENT_TYPES) and derives the stored extension from it, so
// nothing here can smuggle an arbitrary file type into storage.
const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
]

// Flush a chunk every few seconds rather than holding the whole call in one
// buffer, so a browser that dies mid-call has already banked most of it.
const RECORDING_TIMESLICE_MS = 5000

function pickRecordingMime() {
  if (typeof MediaRecorder === "undefined") return null
  if (typeof MediaRecorder.isTypeSupported !== "function") return ""
  for (const mime of RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return "" // let the browser pick its own default
}

/** Whether this browser can record a call at all. */
export function isRecordingSupported() {
  return typeof MediaRecorder !== "undefined" && typeof AudioContext !== "undefined"
}

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
 * @param {boolean}  opts.record       capture both sides of the audio
 * @param {function} opts.onRecording  (blob, mimeType, callId) => void — fires
 *                                     once, after the recorder has flushed.
 *                                     callId is passed explicitly because by
 *                                     the time this fires the engine has been
 *                                     torn down and no longer holds one.
 */
export function createCallEngine({
  iceServers = [], send, onState, onRemoteStream, onError,
  record = false, onRecording,
}) {
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
  // Resolves once the microphone is live and the peer connection is standing
  // with the local track attached. handleOffer waits on it: the call starts
  // ringing agents *before* this browser's permission prompt is answered, so
  // an agent who accepts quickly can land an offer while the prompt is still
  // open. Answering it then would build a connection with no local track —
  // a recvonly answer, and an agent listening to silence.
  let mediaReady = null

  // Recording state. Kept separate from the peer-connection state above
  // because it deliberately outlives it: stop() ends the call immediately,
  // but the recorder's final chunk arrives asynchronously afterwards and
  // still has to be delivered.
  let recorder = null
  let recordedChunks = []
  let recordingMime = ""
  let recordingCtx = null
  let recordingSink = null

  // ── ICE diagnosis ─────────────────────────────────────────────────────────
  // Which *kinds* of candidate each side managed to gather is the whole
  // difference between "STUN is misconfigured" and "this pair of networks
  // needs a relay", and after a call has failed it is the only way to tell
  // them apart. Without it every cross-network failure looks identical in
  // history and the next question is always a guess.
  //
  //   host  — a LAN address. Two peers on the same network need nothing else,
  //           which is exactly why same-office calls work when nothing else does.
  //   srflx — the peer's public address, learned from STUN. No srflx on either
  //           side means STUN never answered, and no call can leave the LAN.
  //   relay — a TURN relay. The only candidate that still works when both
  //           sides are behind symmetric or carrier-grade NAT.
  const iceSeen = { local: new Set(), remote: new Set() }

  const candidateType = (candidate) => {
    if (!candidate) return null
    if (candidate.type) return candidate.type
    const m = /(?:^| )typ (\w+)/.exec(candidate.candidate || "")
    return m ? m[1] : null
  }

  const hasTurnConfigured = () => (iceServers || []).some(server =>
    [].concat(server?.urls || []).some(u => String(u).toLowerCase().startsWith("turn")),
  )

  /** Compact, non-sensitive summary for the call record. No addresses — only
   *  which categories were available, which is what the diagnosis turns on. */
  const iceSummary = () => {
    const fmt = (set) => [...set].sort().join("+") || "none"
    return `ice:l=${fmt(iceSeen.local)},r=${fmt(iceSeen.remote)},turn=${hasTurnConfigured() ? 1 : 0}`
  }

  const emitState = (s) => { if (!closed) onState?.(s, s === "failed" ? iceSummary() : undefined) }

  /**
   * Mixes both sides of the conversation into one track and records it.
   *
   * There is no media server in this call — it is peer-to-peer — so a
   * participant's browser is the only place both halves of the audio exist
   * together. The agent's is the one that records: it is the business's own
   * record of the call, it is on a stable connection, and it does not spend a
   * customer's mobile data uploading afterwards.
   */
  function startRecording() {
    if (!record || recorder || !localStream || !remoteStream) return
    if (!isRecordingSupported()) return
    try {
      const mime = pickRecordingMime()
      if (mime === null) return

      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      recordingCtx = ctx
      const mixed = ctx.createMediaStreamDestination()
      ctx.createMediaStreamSource(localStream).connect(mixed)
      ctx.createMediaStreamSource(remoteStream).connect(mixed)

      // Chrome reads *silence* from a Web Audio source built on a remote
      // peer-connection stream unless that stream is also attached to a
      // playing media element. The hook attaches it to the audible sink
      // already, but relying on that would make recording break silently the
      // day someone changes how playback works — so the recorder keeps its
      // own muted element alive purely to satisfy the quirk. Muted, so this
      // never doubles the audio the agent hears.
      const sink = document.createElement("audio")
      sink.muted = true
      sink.autoplay = true
      sink.setAttribute("playsinline", "")
      sink.style.display = "none"
      sink.srcObject = remoteStream
      document.body.appendChild(sink)
      sink.play?.().catch(() => {})
      recordingSink = sink

      recordedChunks = []
      const recordingCallId = callId
      recorder = new MediaRecorder(mixed.stream, mime ? { mimeType: mime } : undefined)
      recordingMime = recorder.mimeType || mime || "audio/webm"

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size) recordedChunks.push(evt.data)
      }
      recorder.onstop = () => {
        const chunks = recordedChunks
        recordedChunks = []
        const type = (recordingMime || "audio/webm").split(";")[0]
        teardownRecording()
        // Deliberately not gated on `closed` — by the time a recorder stops,
        // the call is over by definition. Gating here would discard every
        // recording the feature exists to keep.
        if (chunks.length) {
          const blob = new Blob(chunks, { type })
          if (blob.size > 0) onRecording?.(blob, type, recordingCallId)
        }
      }
      recorder.start(RECORDING_TIMESLICE_MS)
    } catch {
      // Recording is a bonus on top of the call, never a precondition for it.
      // A browser that refuses must still carry the conversation.
      teardownRecording()
    }
  }

  function teardownRecording() {
    try { recordingSink?.pause(); if (recordingSink) recordingSink.srcObject = null } catch { /* gone */ }
    try { recordingSink?.remove() } catch { /* gone */ }
    recordingSink = null
    try { recordingCtx?.close() } catch { /* already closed */ }
    recordingCtx = null
    recorder = null
  }

  function stopRecording() {
    if (!recorder) return
    // The final chunk is delivered through onstop, which handles teardown —
    // do not tear down here or the blob is lost.
    try {
      if (recorder.state !== "inactive") recorder.stop()
      else teardownRecording()
    } catch {
      teardownRecording()
    }
  }

  function buildPeerConnection() {
    const conn = new RTCPeerConnection({ iceServers })

    conn.onicecandidate = (evt) => {
      if (evt.candidate && callId) {
        const type = candidateType(evt.candidate)
        if (type) iceSeen.local.add(type)
        send?.("call.ice_candidate", { call_id: callId, data: evt.candidate.toJSON() })
      }
    }

    conn.ontrack = (evt) => {
      // Chrome gives evt.streams[0]; Firefox can give only the track. Either
      // way the sink is handed a stream that *already carries* the track:
      // assigning an empty MediaStream to an <audio> element and adding the
      // track to it afterwards is not reliably picked up, and the failure
      // looks exactly like a dead call — connection established, nothing
      // audible. So the stream is assembled first and emitted second.
      const incoming = evt.streams?.[0]
      if (incoming) {
        remoteStream = incoming
      } else {
        if (!remoteStream) remoteStream = new MediaStream()
        if (evt.track && !remoteStream.getTrackById(evt.track.id)) {
          remoteStream.addTrack(evt.track)
        }
      }
      if (remoteStream.getAudioTracks().length) onRemoteStream?.(remoteStream)
    }

    conn.onconnectionstatechange = () => {
      if (closed) return
      switch (conn.connectionState) {
        case "connected":
          emitState("connected")
          // Starts here rather than at accept: before this point there is no
          // remote track to mix, so a recorder started earlier would capture
          // one side of a conversation that had not begun.
          startRecording()
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

  /** Mic + peer connection + local track, as one awaitable step. Both roles
   *  need exactly this before any SDP can be honestly exchanged. */
  function openLocalMedia() {
    mediaReady = (async () => {
      const stream = await acquireMicrophone()
      if (closed) {
        // Torn down while the permission prompt was open: stop() ran before
        // there was anything to stop, so release the mic here instead of
        // leaving the recording indicator lit on a call that is over.
        stream.getTracks().forEach(t => t.stop())
        localStream = null
        return
      }
      pc = buildPeerConnection()
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
    })()
    return mediaReady
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
    /** Non-sensitive ICE summary for diagnosing a failed call. */
    get iceDiagnosis() { return iceSummary() },

    /**
     * Caller side: mic → peer connection → *wait*. The offer comes from the
     * agent; this side answers it in handleOffer below.
     *
     * ── Why the agent offers and not the caller ─────────────────────────────
     * Signaling is relayed through a per-call group, and the server only lets
     * a browser join that group once it is a confirmed endpoint of the call.
     * An agent is not an endpoint until they press Accept — `receiver` is NULL
     * for the whole time the call is merely ringing (see
     * voice_call_service.load_call_for_endpoint). So during ringing the group
     * has exactly one member: this caller. An offer sent then is relayed to a
     * group the agent has not joined yet, the consumer drops the sender's own
     * echo, and the SDP is simply gone. The agent accepts, joins, and waits
     * for an offer that already came and went — no answer, no ICE, no media,
     * on a call that looks connected on both screens.
     *
     * Whoever joins the group *last* has to be the one to offer, and that is
     * always the agent: they subscribe as part of accepting, while this side
     * has been subscribed since the call was created seconds earlier.
     */
    async startAsCaller(id) {
      callId = id
      closed = false
      emitState("connecting")
      // The microphone is opened here rather than on the agent's offer so the
      // permission prompt appears when the person pressed Call, and so the
      // connection is standing ready with its local track attached before any
      // SDP arrives.
      await openLocalMedia()
    },

    /**
     * Agent side: mic → peer connection → offer.
     *
     * Ordering carries weight twice here. The `call.subscribe` frame went out
     * on this same socket before this ran and the consumer handles frames in
     * order, so this browser is in the call group before the offer leaves and
     * cannot miss the answer. And the offer is built only after the mic is
     * live, so it is genuinely sendrecv — an offer created while the
     * permission prompt was still open would negotiate a one-way call and
     * leave the customer listening to silence.
     */
    async startAsReceiver(id) {
      callId = id
      closed = false
      emitState("connecting")
      await openLocalMedia()
      if (closed) return
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      send?.("call.offer", { call_id: id, data: { type: offer.type, sdp: offer.sdp } })
    },

    async handleOffer(description) {
      if (closed) return
      // Wait for our own microphone before answering — see `mediaReady`. A
      // rejection here is a denied or broken mic, which startAsCaller has
      // already surfaced and ended the call on; there is nothing to answer
      // with, so stay quiet rather than negotiating a half-call.
      if (mediaReady) {
        try { await mediaReady } catch { return }
      }
      if (closed) return
      if (!pc) {
        pc = buildPeerConnection()
        if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream))
      }
      // One negotiation per call — this app never renegotiates. A duplicate or
      // late offer would re-enter setRemoteDescription on a connection that is
      // already carrying audio and tear a working call down.
      if (hasRemoteDescription) return
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
      const type = candidateType(candidate)
      if (type) iceSeen.remote.add(type)
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
      // First, before the tracks feeding it are stopped. The recorder flushes
      // asynchronously and delivers its blob through onstop, which is why this
      // is safe to do here and why teardown below does not wait for it.
      stopRecording()
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
      mediaReady = null
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
