import React, { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { getToken } from "../services/authStorage"
import { openAttachment } from "../services/attachments"
import { connectLiveChatSocket } from "../services/liveChatSocket"
import { asMessageArray, highestRealId } from "../services/liveChatMessages"
// VOICE-CALL: layered on the live-agent mode below. Everything call-related is
// inert until `mode === "live"`, so the FAQ bot path is untouched.
import { useVoiceCall, PHASE } from "../hooks/useVoiceCall"
import ActiveCallModal from "./support/ActiveCallModal"
import CallStatus from "./support/CallStatus"
import { setLauncherHeight } from "./support/launcherMetrics"
import ConciergeRobot, { AVATAR_H } from "./support/ConciergeRobot"

const API = import.meta.env.VITE_API_URL || ""
const INACTIVITY_MS = 3 * 60 * 1000 // 3 minutes
const HISTORY_KEY = "chatbot_messages"

// Which stored session this widget speaks for. The affiliate panel is a
// genuinely separate login with its own token namespace (see
// affiliate/helpers.js) — reading the player's "access" key while mounted
// there is what stopped affiliate live chats from ever reaching an agent:
// with no player session the token was simply null and the widget answered
// "please sign in", and with a stale player session still in localStorage it
// opened a chat as *that player* instead, so the agent saw the message under
// the wrong identity. The portal also tells the server which of the user's
// two conversations to attach to (it re-verifies the claim; see
// live_chat_service.resolve_participant_type).
const PORTAL_TOKEN_KEYS = { player: "access", affiliate: "affiliate_token" }
// Only a client-side default — the server sends poll_interval_ms from
// /api/live-chat/start/ and that value wins.
const LIVE_POLL_MS = 2000

// How long a queued call waits for the socket before giving up and saying so.
// Generous enough for a slow mobile handshake, short enough that nobody is left
// staring at a button that already swallowed their tap.
const CALL_QUEUE_TIMEOUT_MS = 12000

const WELCOME = { role: "bot", text: "Welcome to Jackpots World Customer Support! 🎰\nI'm here to help with your account, deposits, withdrawals, KYC, gameplay and more. Ask me anything — and if I can't resolve it, I'll get our team on it." }

// Mirrors authapp/utils/file_validation.validate_uploaded_document. This copy
// exists to fail fast with a readable message instead of making the customer
// wait for a round trip to be told no -- the server is still the authority and
// re-checks the file's actual bytes, since anything enforced only here is not
// enforced at all.
const DOC_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp"]
const DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp"
const DOC_MAX_BYTES = 10 * 1024 * 1024

function describeDocError(file) {
  if (!file) return ""
  const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : ""
  if (!DOC_EXTENSIONS.includes(ext)) {
    return `Unsupported file type. Allowed: ${DOC_EXTENSIONS.join(", ")}.`
  }
  if (file.size > DOC_MAX_BYTES) {
    return `File too large. Max size is ${DOC_MAX_BYTES / (1024 * 1024)}MB.`
  }
  return ""
}

// Merges a "real" (server-assigned-id) live-chat message into the list
// without duplicating it. Needed because a message we just sent can reach
// us two ways — the REST response, and the WebSocket echo of our own
// send — and either can arrive first:
//  - already present (by id): no-op, it was reconciled already.
//  - our own optimistic placeholder is still there (matched by tempId, or
//    by sender+text if tempId isn't known, e.g. from the WS side): replace it.
//  - otherwise (a genuinely new message, e.g. the admin's reply): append.
function reconcileLiveMessage(prev, real, tempId) {
  if (prev.some(m => m.id === real.id)) return prev
  const pendingIdx = tempId
    ? prev.findIndex(m => m.id === tempId)
    : prev.findIndex(m => typeof m.id === "string" && m.id.startsWith("pending-") && m.sender_type === real.sender_type && m.message === real.message)
  if (pendingIdx !== -1) {
    const next = [...prev]
    next[pendingIdx] = real
    return next
  }
  return [...prev, real]
}

// Folds a batch from a poll into the list, one at a time through the same
// reconciler. Merging (rather than the old wholesale replace) is what keeps
// still-pending and failed-to-send bubbles from vanishing under the poll,
// and keeps server order authoritative for everything already saved.
function mergeLiveMessages(prev, incoming) {
  if (!incoming.length) return prev
  return incoming.reduce((acc, m) => reconcileLiveMessage(acc, m), prev)
}


// SVG headset icon
// The concierge robot mascot, reduced to a solid mark that stays legible at
// launcher size (crown, antenna, ear pods, bow tie). Drawn in currentColor
// against the gold disc it always sits on, with the eyes and smile knocked
// back out in pale gold.
function RobotIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* antenna */}
      <path d="M6.6 6.4 L4.8 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="4.5" cy="2.9" r="1.35" fill="currentColor" />
      {/* crown */}
      <path d="M8.4 5.6 L9.5 2.5 L11 4.6 L12.6 1.7 L14.2 4.6 L15.7 2.5 L16.8 5.6 Z" fill="currentColor" />
      {/* ear pods */}
      <rect x="2.9" y="9.6" width="2.5" height="5" rx="1.25" fill="currentColor" />
      <rect x="18.6" y="9.6" width="2.5" height="5" rx="1.25" fill="currentColor" />
      {/* head */}
      <rect x="5.2" y="5.6" width="13.6" height="11.4" rx="4.4" fill="currentColor" />
      {/* shoulders / bow tie */}
      <path d="M4.2 22.5 Q4.2 18.6 12 17.7 Q19.8 18.6 19.8 22.5 Z" fill="currentColor" />
      <path d="M10.9 18.6 L8.6 17.1 L8.6 20.1 Z M13.1 18.6 L15.4 17.1 L15.4 20.1 Z" fill="#F7E9A8" />
      {/* face */}
      <ellipse cx="9.4" cy="10.7" rx="1.55" ry="1.85" fill="#F7E9A8" />
      <ellipse cx="14.6" cy="10.7" rx="1.55" ry="1.85" fill="#F7E9A8" />
      <path d="M9.8 13.9 Q12 15.5 14.2 13.9" stroke="#F7E9A8" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  )
}

// SVG send icon
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>
  )
}

// Paperclip for the attach control, and a document glyph for sent
// attachments. Hand-written SVGs like every other icon in this file.
function ClipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
    </svg>
  )
}

function DocIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}

// SVG close icon
// Inline rather than imported from lucide: every other icon in this file is a
// small hand-written SVG (see CloseIcon below), and the header needs one that
// matches CloseIcon's 14px stroke weight exactly so the two sit level.
function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

// Typing dots
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "10px 14px", alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.8, delay: i * 0.18, repeat: Infinity }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: "#D4AF37", display: "block" }}
        />
      ))}
    </div>
  )
}

// Per-portal, so a player transcript and an affiliate transcript don't read
// back into each other's widget on a browser that has been used for both.
function historyKey(portal) {
  return portal === "player" ? HISTORY_KEY : `${HISTORY_KEY}_${portal}`
}

function loadStoredMessages(portal) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(historyKey(portal)) || "null")
    return Array.isArray(saved) && saved.length ? saved : [WELCOME]
  } catch {
    return [WELCOME]
  }
}

// `initialOpen` exists because this component is code split behind
// ChatBotLauncher: by the time this module has downloaded, the visitor has
// already clicked the concierge (or something dispatched "open-chat"), so the
// panel has to come up open. Mounting closed would swallow that click and
// leave them looking at the launcher they just pressed.
export default function ChatBotPanel({ portal = "player", initialOpen = false }) {
  const tokenKey = PORTAL_TOKEN_KEYS[portal] || PORTAL_TOKEN_KEYS.player
  const reduceMotion            = useReducedMotion()
  const [open, setOpen]         = useState(initialOpen)

  // VOICE-CALL / LAYOUT: publish this launcher's real height so anything that
  // has to sit clear of it can position against the measured box rather than
  // a hardcoded guess. See support/launcherMetrics.js for why a constant does
  // not work here -- the greeting bubble wraps differently per viewport, so
  // the stack is a different height on different screens.
  const launcherRef = useRef(null)
  useEffect(() => {
    const el = launcherRef.current
    if (!el) return undefined
    const publish = () => setLauncherHeight(el.getBoundingClientRect().height)
    publish()

    // Re-measure once the web font is in. The greeting bubble is width-capped
    // and wraps, so its line count -- and therefore this whole stack's height
    // -- differs between the fallback face and Manrope. Measured here: 227px
    // on the fallback, 166px once the real font lands. Without this the first
    // reading is the one that sticks on any browser that does not deliver a
    // resize notification for a reflow it considers cosmetic.
    let cancelled = false
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => { if (!cancelled) publish() }).catch(() => {})
    }

    if (typeof ResizeObserver === "undefined") return () => { cancelled = true }
    // Observing the element covers every way its size can change -- viewport
    // resize, the bubble re-wrapping, the panel opening and closing -- with
    // one subscription instead of a listener per cause.
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => { cancelled = true; ro.disconnect() }
  // `open` is the dependency because the two states render different elements
  // -- the concierge when closed, a small close button when open -- so the ref
  // points at a new node and has to be re-observed. Without it this rebuilt
  // the observer on every render instead.
  }, [open])
  // Laptop and up. Tracked rather than read once so rotating a tablet, or
  // dragging a window between displays, re-picks the right height instead of
  // keeping whatever was true at mount.
  const [isWideScreen, setIsWideScreen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  )
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const onChange = e => setIsWideScreen(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  const [messages, setMessages] = useState(() => loadStoredMessages(portal))
  const [input, setInput]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [unread, setUnread]     = useState(0)
  const bottomRef               = useRef(null)
  const inactivityRef           = useRef(null)
  const inputRef                = useRef(null)
  const sessionIdRef            = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))

  // ── Live agent mode (LIVE-CHAT) ──────────────────────────────────────────
  // Same floating widget, same chrome — only the message source/send
  // handler change. 'bot' talks to the stateless FAQ bot above; 'live'
  // talks to a real admin over authapp's live-chat REST + WebSocket API.
  const [mode, setMode]                 = useState("bot") // 'bot' | 'live'
  const [liveTicketId, setLiveTicketId] = useState(null)
  const [liveMessages, setLiveMessages] = useState([])
  const [liveConnecting, setLiveConnecting] = useState(false)
  const [liveConnStatus, setLiveConnStatus]   = useState("closed") // connecting|open|reconnecting|polling|closed
  const liveSocketRef  = useRef(null)
  const liveTicketRef  = useRef(null) // mirrors liveTicketId for use inside closures/intervals
  const liveMessagesRef = useRef([])  // mirrors liveMessages so the poll closure can read the latest id
  const openRef        = useRef(open) // mirrors `open` for the long-lived WS onEvent closure below
  useEffect(() => { openRef.current = open }, [open])

  // ── Voice call (VOICE-CALL) ──────────────────────────────────────────────
  // Signaling rides the live-chat socket opened in startLiveChat below rather
  // than a second connection, so reconnect/backoff stays owned by
  // connectLiveChatSocket. The ref indirection is because the socket is
  // created after this hook runs and is replaced on every reconnect.
  const callFetcher = useCallback((url, opts = {}) => {
    const token = getToken(tokenKey)
    if (!token) return Promise.resolve(undefined)
    return fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    })
  }, [tokenKey])

  const sendCallSignal = useCallback(
    (action, payload) => liveSocketRef.current?.send?.(action, payload) ?? false,
    [],
  )

  const voiceCall = useVoiceCall({
    role: "customer",
    apiBase: API,
    fetcher: callFetcher,
    sendSignal: sendCallSignal,
    ticketId: liveTicketId,
    enabled: mode === "live" && !!liveTicketId,
  })
  // Read inside the long-lived socket closure, which captures its own scope.
  const voiceCallRef = useRef(voiceCall)
  useEffect(() => { voiceCallRef.current = voiceCall }, [voiceCall])
  useEffect(() => { liveMessagesRef.current = liveMessages }, [liveMessages])

  // Incremental fetch handed to the transport. It asks only for messages
  // newer than the newest one already held (?after_id=), so it stays cheap
  // enough to run every couple of seconds and can't truncate history the way
  // re-fetching page 1 of a paginated list did.
  const pollLiveMessages = useCallback(async (ticketId, token) => {
    const afterId = highestRealId(liveMessagesRef.current)
    const qs = afterId ? `?after_id=${afterId}` : ""
    const res = await fetch(`${API}/api/live-chat/${ticketId}/messages/${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const fresh = asMessageArray(await res.json())
    if (!fresh.length) return
    setLiveMessages(prev => mergeLiveMessages(prev, fresh))
    if (!openRef.current && fresh.some(m => m.sender_type === "admin")) {
      setUnread(u => u + fresh.filter(m => m.sender_type === "admin").length)
    }
  }, [])

  const teardownLiveConnection = useCallback(() => {
    liveSocketRef.current?.close()
    liveSocketRef.current = null
  }, [])

  useEffect(() => () => teardownLiveConnection(), [teardownLiveConnection])

  // VOICE-CALL: a call placed from bot mode cannot dial immediately -- there is
  // no live ticket yet and no open socket for the SDP offer. This flag records
  // "the customer asked to call" across that handshake; the effect below places
  // the call the moment the session is genuinely ready.
  //
  // Not a timer and not a poll: it is one boolean, consumed once, driven by the
  // same state changes that already re-render this component. If the session
  // never becomes ready, nothing dials -- which is the correct outcome, and the
  // button returns to its normal state rather than spinning forever.
  const [callRequested, setCallRequested] = useState(false)

  // The document staged for the next send, and the reason the last attempt was
  // refused. Held here rather than inside the composer so a failed send can put
  // the file back and offer a retry without the customer re-picking it.
  const [attachFile, setAttachFile] = useState(null)
  const [attachError, setAttachError] = useState("")
  const [attachBusy, setAttachBusy] = useState(false)
  const fileInputRef = useRef(null)

  /* VOICE-CALL: "Call Support" from anywhere in the widget.
     ────────────────────────────────────────────────────────────────────────
     Calling used to appear only after the customer had already clicked
     "Talk to a Live Agent", so on opening the widget there was no call action
     at all and the feature looked missing. It is offered up front now, and the
     steps it used to require happen for the customer instead of being their
     job:

       already live  -> dial straight away
       signed out    -> the existing sign-in prompt, and nothing is queued
       otherwise     -> open the live session, then dial when it is ready

     The signed-out branch checks the token directly rather than waiting to see
     whether startLiveChat succeeded: `mode` read after an await is the value
     from before it, and queuing a call that can never be placed would leave
     the button stuck. */
  // Calling needs a genuinely open socket; chat does not. Kept as one named
  // condition so the button's disabled state and the dial gate below cannot
  // drift apart.
  const callBlockedByTransport = mode === "live" && liveConnStatus !== "open"

  const requestCall = useCallback(async () => {
    if (mode === "live" && liveConnStatus === "open") {
      voiceCall.startCall()
      return
    }
    if (!getToken(tokenKey)) {
      // Appends the sign-in prompt and stays in bot mode. Deliberately no queue.
      await startLiveChat()
      return
    }
    // Queued rather than refused even when the socket is not open yet: on a
    // slow mobile handshake it very often comes up a second or two later and
    // the call simply connects. If it does not, the bounded queue above says
    // so. Refusing outright here would fail the recoverable case too.
    setCallRequested(true)
    if (mode !== "live") await startLiveChat()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, liveConnStatus, voiceCall, tokenKey])

  // Places the queued call once the session is actually usable. Every
  // condition here is the same one the live-mode button already required, so a
  // queued call can never dial into a socket that is not open.
  useEffect(() => {
    if (!callRequested) return
    if (mode === "live" && liveConnStatus === "open"
        && voiceCall.available && voiceCall.phase === PHASE.IDLE) {
      setCallRequested(false)
      voiceCall.startCall()
    }
  }, [callRequested, mode, liveConnStatus, voiceCall])

  // A queued call that never dials used to sit there silently forever. The
  // dial condition below requires an *open* WebSocket, because signaling has
  // nowhere to go while the transport is polling - but polling is a perfectly
  // good state for chat, so the header goes green and the player is told
  // everything is fine while their call quietly never happens. On a mobile
  // network that falls back to polling, that was the whole experience: tap the
  // button, watch it disappear, no ring, no error.
  //
  // So the queue is bounded. If the socket has not come up by now it is not
  // going to in a useful timeframe, and saying so is far better than a control
  // that ate the tap.
  useEffect(() => {
    if (!callRequested) return undefined
    const timer = setTimeout(() => {
      setCallRequested(false)
      setMessages(prev => [...prev, {
        role: "bot",
        text: "I couldn't start a voice call on this connection. Chat is working normally, so send a message here and an agent will reply - or try calling again on Wi-Fi.",
      }])
    }, CALL_QUEUE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [callRequested])

  // Closing the widget abandons a queued call rather than having it ring the
  // next time the panel opens.
  useEffect(() => { if (!open) setCallRequested(false) }, [open])

  const startLiveChat = async () => {
    const token = getToken(tokenKey)
    if (!token) {
      setMessages(prev => [...prev, {
        role: "bot",
        text: "Please sign in to your account to start a live chat with our support team.",
        signInPrompt: true,
      }])
      return
    }

    setLiveConnecting(true)
    try {
      const res = await fetch(`${API}/api/live-chat/start/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ portal }),
      })
      if (!res.ok) throw new Error("start failed")
      const data = await res.json()
      const ticketId = data.session.id
      setLiveTicketId(ticketId)
      liveTicketRef.current = ticketId
      const initial = data.messages || []
      setLiveMessages(initial)
      liveMessagesRef.current = initial
      setMode("live")

      // Guard against a second "Talk to a Live Agent" click leaving an
      // orphaned socket + poll loop running alongside the new one.
      teardownLiveConnection()
      liveSocketRef.current = connectLiveChatSocket(`/ws/live-chat/${ticketId}/`, token, {
        // The server tells us whether this deployment can push at all, so we
        // don't sit through failing handshakes on the WSGI-only host.
        realtime: data.realtime !== false,
        pollIntervalMs: data.poll_interval_ms || LIVE_POLL_MS,
        poll: () => pollLiveMessages(ticketId, token),
        onEvent: (event, payload) => {
          if (event === "new_message" && payload?.ticket_id === liveTicketRef.current) {
            setLiveMessages(prev => reconcileLiveMessage(prev, payload))
            if (!openRef.current && payload.sender_type === "admin") setUnread(u => u + 1)
            return
          }
          // VOICE-CALL: call frames share this socket. Anything the hook
          // doesn't recognise falls through untouched, so chat is unaffected.
          voiceCallRef.current?.onSocketEvent?.(event, payload)
        },
        onStatusChange: setLiveConnStatus,
      })
    } catch {
      setMessages(prev => [...prev, { role: "bot", text: "Couldn't connect you to an agent right now. Please try again in a moment." }])
    } finally {
      setLiveConnecting(false)
    }
  }

  const backToBot = () => {
    teardownLiveConnection()
    setLiveConnStatus("closed")
    setMode("bot")
  }

  const sendLiveMessage = async (text, file = null) => {
    const token = getToken(tokenKey)
    if (!token || !liveTicketId) return
    const tempId = `pending-${Date.now()}`
    // Stable across both attempts below, so the retry is recognised as the
    // same message server-side rather than posting a second copy when the
    // first request actually landed and only its response was lost.
    const clientMessageId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${sessionIdRef.current}-${Date.now()}`
    setLiveMessages(prev => [...prev, {
      id: tempId, sender_type: "user", message: text, status: "pending",
      // Shown immediately so the customer sees what they attached while it
      // uploads, rather than an empty bubble.
      attachment_name: file ? file.name : "",
      created_at: new Date().toISOString(),
    }])

    // Multipart only when there is a file: a text-only send keeps the exact
    // JSON request it always made, so nothing about the existing path changes.
    const attempt = () => {
      if (!file) {
        return fetch(`${API}/api/live-chat/${liveTicketId}/messages/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: text, client_message_id: clientMessageId }),
        })
      }
      const form = new FormData()
      form.append("message", text)
      form.append("client_message_id", clientMessageId)
      form.append("attachment", file)
      // No Content-Type header on purpose -- the browser must set it itself so
      // it can include the multipart boundary.
      return fetch(`${API}/api/live-chat/${liveTicketId}/messages/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
    }

    try {
      setAttachBusy(!!file)
      let res = await attempt()
      // A 400 is the server refusing this specific file; retrying sends the
      // same bytes and gets the same answer, so only retry transient failures.
      if (!res.ok && res.status !== 429 && res.status !== 400) res = await attempt()
      if (!res.ok) {
        let reason = ""
        try {
          const body = await res.json()
          reason = body?.error || (Array.isArray(body) ? body[0] : "") ||
                   body?.attachment?.[0] || ""
        } catch { /* non-JSON error body */ }
        throw new Error(reason || "send failed")
      }
      const saved = await res.json()
      // The WS push for this same message can arrive before this response
      // does — reconcile rather than blindly replace-by-tempId, so we don't
      // end up with both the WS-added copy and this one.
      setLiveMessages(prev => reconcileLiveMessage(prev, saved, tempId))
      // Sending is the moment an agent is most likely to reply, so pull
      // once immediately instead of waiting out the poll interval.
      liveSocketRef.current?.refresh()
    } catch (err) {
      setLiveMessages(prev => prev.map(m => (m.id === tempId ? { ...m, status: "failed" } : m)))
      if (file) {
        // Put it back so "retry" means pressing send again, not hunting for
        // the file a second time.
        setAttachFile(file)
        setAttachError(err?.message || "Upload failed. Please try again.")
      }
    } finally {
      setAttachBusy(false)
    }
  }

  // auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, liveMessages, loading])

  // persist within the browser session (survives refresh, clears on browser close)
  useEffect(() => {
    try { sessionStorage.setItem(historyKey(portal), JSON.stringify(messages)) } catch {}
  }, [messages, portal])

  // clear unread when opened
  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  // focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300)
  }, [open])

  // allow other parts of the app (e.g. the Dashboard's Live Support tab) to
  // open this same widget without needing a shared context provider
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener("open-chat", handler)
    return () => window.removeEventListener("open-chat", handler)
  }, [])

  const resetInactivity = useCallback(() => {
    clearTimeout(inactivityRef.current)
    inactivityRef.current = setTimeout(() => {
      setMessages([WELCOME])
      setUnread(0)
      try { sessionStorage.removeItem(historyKey(portal)) } catch {}
    }, INACTIVITY_MS)
  }, [portal])

  // start inactivity timer when chat opens
  useEffect(() => {
    if (open) resetInactivity()
    else clearTimeout(inactivityRef.current)
    return () => clearTimeout(inactivityRef.current)
  }, [open, resetInactivity])

  const sendMessage = async () => {
    // An attachment on its own is a complete message, so an empty box is only
    // "nothing to send" when there is no file staged either.
    const file = mode === "live" ? attachFile : null
    if ((!input.trim() && !file) || loading || attachBusy) return
    const text = input.trim()
    setInput("")
    resetInactivity()

    if (mode === "live") {
      setAttachFile(null)
      setAttachError("")
      sendLiveMessage(text, file)
      return
    }

    const userMsg = { role: "user", text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      // build conversation history for the backend (exclude welcome)
      const history = [...messages, userMsg]
        .filter(m => m.text !== WELCOME.text)
        .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }))

      // Attach the access token when the visitor is signed in so support
      // can look up their own wallet/transaction/KYC data — never sent for
      // anonymous, pre-login visitors.
      const token = getToken(tokenKey)

      const res = await fetch(`${API}/api/chat/message/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, session_id: sessionIdRef.current, history }),
      })

      const data = await res.json()
      const reply = data?.reply || "I couldn't find the answer. Please contact our support team."

      setMessages(prev => [...prev, { role: "bot", text: reply }])
      if (!open) setUnread(prev => prev + 1)
    } catch {
      setMessages(prev => [...prev, { role: "bot", text: "Connection issue. Reach us on WhatsApp or Telegram for instant support!" }])
    } finally {
      setLoading(false)
      resetInactivity()
    }
  }

  const retryLiveMessage = (msg) => {
    setLiveMessages(prev => prev.filter(m => m.id !== msg.id))
    sendLiveMessage(msg.message)
  }

  // Normalizes both message shapes (bot: {role,text}; live: {sender_type,message,status})
  // into one render-friendly shape so the JSX below doesn't need two paths.
  const displayMessages = mode === "live"
    ? liveMessages.map(m => ({
        role: m.sender_type === "admin" ? "bot" : "user",
        text: m.message,
        status: m.status,
        id: m.id,
        attachmentUrl: m.attachment_url || null,
        attachmentName: m.attachment_name || "",
      }))
    : messages

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  // Mirrors sendMessage's own guard so the button's look never disagrees with
  // what pressing it does.
  const canSend = !loading && !attachBusy &&
    (!!input.trim() || (mode === "live" && !!attachFile))

  return (
    <>
    {/* VOICE-CALL: rendered outside the launcher's fixed/stacked container so
        the call surface is centred on the viewport rather than anchored to the
        corner widget, and stays correct on a phone. */}
    <ActiveCallModal
      phase={voiceCall.phase}
      call={voiceCall.call}
      lastEnded={voiceCall.lastEnded}
      seconds={voiceCall.seconds}
      muted={voiceCall.muted}
      speakerOn={voiceCall.speakerOn}
      speakerSupported={voiceCall.speakerSupported}
      error={voiceCall.error}
      recordingEnabled={voiceCall.recordingEnabled}
      onToggleMute={voiceCall.toggleMute}
      onToggleSpeaker={voiceCall.toggleSpeaker}
      onEnd={voiceCall.endCall}
      onDismiss={voiceCall.endCall}
    />
    <div
      ref={launcherRef}
      style={{
        position: "fixed",
        // Inset from the corner. Floors raised to 20px so the launcher clears
        // the corner by the same comfortable margin on a phone as on a
        // desktop -- at the old 14px/12px it sat close enough to the edge to
        // crowd a thumb reaching for it, and close enough to be clipped by the
        // rounded corners some phones apply to the viewport.
        bottom: "clamp(20px, 4vw, 26px)",
        right: "clamp(20px, 3vw, 26px)",
        zIndex: 50,
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12,
      }}
    >

      {/* ── Chat Window ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.93 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: "clamp(280px,88vw,340px)",
              borderRadius: 18,
              overflow: "hidden",
              background: "linear-gradient(180deg, #120018 0%, #08000f 100%)",
              border: "1px solid rgba(212,175,55,0.25)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,175,55,0.08)",
              display: "flex",
              flexDirection: "column",
              // Laptops get the extra vertical space; phones keep exactly what
              // they had. 460px was the cap on every screen, which on a laptop
              // left the transcript about four messages tall while most of the
              // window sat empty.
              //
              // Gated on viewport WIDTH, not on vh arithmetic. A pure
              // max(460px, min(78vh, ...)) reads well but is wrong here: a tall
              // phone has plenty of vh, so it would have grown the mobile panel
              // too -- measured at 695px on a 375x812 device against the 460px
              // it shipped with. Below the breakpoint the expression is exactly
              // the original, so mobile is unchanged rather than merely similar.
              height: isWideScreen ? "min(78vh, 720px)" : "min(460px, 70vh)",
            }}
          >
            {/* Header */}
            <div style={{
              background: "linear-gradient(135deg, #1a0f00, #2a1800)",
              borderBottom: "1px solid rgba(212,175,55,0.2)",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "linear-gradient(135deg, #D4AF37, #F5E07A)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <RobotIcon size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>
                  {mode === "live" ? "Live Support Agent" : "Customer Support"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", display: "inline-block",
                    // "polling" is a fully working state — messages arrive
                    // within the poll interval — so it reads as connected
                    // rather than as an error the player needs to act on.
                    background: mode === "live"
                      ? (liveConnStatus === "open" || liveConnStatus === "polling" ? "#4ade80" : "#facc15")
                      : "#4ade80",
                  }} />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>
                    {mode === "live"
                      ? (liveConnStatus === "open" || liveConnStatus === "polling"
                        ? "Connected to an agent"
                        : "Connecting…")
                      : "Jackpots World Support"}
                  </span>
                </div>
              </div>
              {/* VOICE-CALL: live call indicator, kept in the header so the
                  transcript below stays the primary surface. */}
              {mode === "live" && voiceCall.phase !== PHASE.IDLE && (
                <div style={{ flexShrink: 0, marginRight: 6 }}>
                  <CallStatus
                    phase={voiceCall.phase}
                    seconds={voiceCall.seconds}
                    lastEnded={voiceCall.lastEnded}
                  />
                </div>
              )}
              {mode === "live" && voiceCall.phase === PHASE.IDLE && (
                <button
                  onClick={backToBot}
                  style={{
                    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, padding: "5px 9px", fontSize: 10, fontWeight: 700,
                    cursor: "pointer", color: "rgba(255,255,255,0.65)", flexShrink: 0, marginRight: 4,
                  }}
                >
                  ← FAQ bot
                </button>
              )}
              {/* VOICE-CALL: calling, reachable from the moment the widget
                  opens rather than two clicks in. Same round 28px shape as
                  Close so the pair reads as one control group, gold instead of
                  white because this one does something and Close dismisses.

                  Hidden entirely -- not disabled -- when the deployment cannot
                  carry a call (voice_call_service.calling_available) or when a
                  call is already up, matching how VoiceCallButton behaves
                  elsewhere. An affordance that would ring into nothing is
                  worse than no affordance.

                  requestCall handles the rest: dial now if the session is
                  already live, prompt sign-in if signed out, otherwise open the
                  session first and dial when it is genuinely ready. */}
              {voiceCall.available && voiceCall.phase === PHASE.IDLE && (
                <button
                  onClick={requestCall}
                  disabled={voiceCall.isBusy || callRequested}
                  aria-label="Call Support"
                  title={
                    callRequested
                      ? "Connecting you to an agent…"
                      : callBlockedByTransport
                        ? "Reconnecting - calling may not be available yet. Chat still works."
                        : "Call Support"
                  }
                  style={{
                    background: "rgba(212,175,55,0.14)", border: "1px solid rgba(212,175,55,0.4)",
                    borderRadius: "50%", width: 28, height: 28,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: (voiceCall.isBusy || callRequested) ? "default" : "pointer",
                    color: "#D4AF37", flexShrink: 0, marginRight: 6,
                    opacity: (voiceCall.isBusy || callRequested) ? 0.5 : 1,
                  }}
                >
                  <PhoneIcon />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "50%", width: 28, height: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "rgba(255,255,255,0.6)", flexShrink: 0,
                }}
              >
                <CloseIcon />
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(212,175,55,0.15) transparent",
            }}>
              {displayMessages.map((m, i) => (
                <div key={m.id ?? i} style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: m.role === "user" ? "flex-end" : "flex-start",
                }}>
                  <div style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", width: "100%" }}>
                    {m.role === "bot" && (
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                        background: "linear-gradient(135deg, #D4AF37, #F5E07A)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        marginRight: 7, marginTop: 2, alignSelf: "flex-start",
                      }}>
                        <RobotIcon size={15} />
                      </div>
                    )}
                    <div style={{
                      padding: "9px 13px",
                      borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      maxWidth: "76%",
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      opacity: m.status === "pending" ? 0.6 : 1,
                      background: m.role === "user"
                        ? "linear-gradient(135deg, #D4AF37, #c9a227)"
                        : "rgba(255,255,255,0.07)",
                      border: m.status === "failed"
                        ? "1px solid #f87171"
                        : m.role === "user" ? "none" : "1px solid rgba(212,175,55,0.12)",
                      color: m.role === "user" ? "#0a0005" : "rgba(255,255,255,0.85)",
                      fontWeight: m.role === "user" ? 600 : 400,
                    }}>
                      {m.text}
                      {(m.attachmentUrl || m.attachmentName) && (
                        // While the upload is in flight there is no URL yet, so
                        // the same chip renders un-clickable with the local
                        // filename -- the customer sees what they attached
                        // straight away instead of an empty bubble.
                        <a
                          href={m.attachmentUrl || undefined}
                          onClick={e => {
                            // The endpoint needs the bearer token, which a
                            // plain navigation would not carry.
                            e.preventDefault()
                            if (!m.attachmentUrl) return
                            openAttachment(m.attachmentUrl, m.attachmentName, getToken(tokenKey))
                              .catch(err => setAttachError(err.message))
                          }}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            marginTop: m.text ? 7 : 0,
                            padding: "6px 9px", borderRadius: 8,
                            border: m.role === "user"
                              ? "1px solid rgba(0,0,0,0.18)"
                              : "1px solid rgba(212,175,55,0.25)",
                            background: m.role === "user"
                              ? "rgba(0,0,0,0.10)" : "rgba(212,175,55,0.10)",
                            color: m.role === "user" ? "#0a0005" : "#D4AF37",
                            fontSize: 11.5, fontWeight: 600,
                            textDecoration: "none",
                            cursor: m.attachmentUrl ? "pointer" : "default",
                            opacity: m.attachmentUrl ? 1 : 0.7,
                            maxWidth: "100%",
                          }}
                        >
                          <span style={{ flexShrink: 0, display: "flex" }}><DocIcon /></span>
                          <span style={{
                            overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {m.attachmentName || "Attachment"}
                          </span>
                        </a>
                      )}
                    </div>
                  </div>
                  {m.signInPrompt && (
                    <button
                      onClick={() => { window.location.href = portal === "affiliate" ? "/affiliate-login" : "/sign-in" }}
                      style={{
                        marginTop: 6, marginLeft: 31, padding: "5px 12px", borderRadius: 8,
                        background: "rgba(212,175,55,0.15)", border: "1px solid rgba(212,175,55,0.3)",
                        color: "#D4AF37", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Sign in
                    </button>
                  )}
                  {m.status === "failed" && (
                    <button
                      onClick={() => retryLiveMessage(m)}
                      style={{
                        marginTop: 4, marginRight: 2, background: "none", border: "none",
                        color: "#f87171", fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0,
                      }}
                    >
                      Failed to send — tap to retry
                    </button>
                  )}
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: "linear-gradient(135deg, #D4AF37, #F5E07A)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginRight: 7, flexShrink: 0,
                  }}>
                    <RobotIcon size={15} />
                  </div>
                  <div style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(212,175,55,0.12)",
                    borderRadius: "16px 16px 16px 4px",
                  }}>
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* The canned suggestion chips -- "My Wallet Balance", "Withdrawal
                Help", "KYC Status", "Contact Support" -- used to sit here.
                Removed on request: they put words in the customer's mouth and
                implied the widget could answer account-specific questions,
                which the support manual explicitly forbids anyone doing
                without checking the Admin Portal first.

                What stays is the button below, which is not a canned message:
                it is the entry point to a real agent. Removing that would take
                Live Support offline, which is the opposite of the intent. */}
            {mode === "bot" && (
              <div style={{
                padding: "6px 12px",
                display: "flex", gap: 6, flexWrap: "wrap",
                borderTop: "1px solid rgba(212,175,55,0.08)",
                flexShrink: 0,
              }}>
                <button
                  key="live-agent"
                  onClick={startLiveChat}
                  disabled={liveConnecting}
                  style={{
                    padding: "4px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                    background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.35)",
                    color: "#60A5FA", cursor: liveConnecting ? "default" : "pointer", letterSpacing: "0.04em",
                    opacity: liveConnecting ? 0.6 : 1,
                  }}
                >
                  {liveConnecting ? "Connecting…" : "Talk to a Live Agent"}
                </button>
              </div>
            )}

            {/* The "Prefer to talk? [Call Agent]" row used to sit here, and the
                header's call icon replaced it. Two identical call buttons about
                three hundred pixels apart in one 340px panel is noise, and the
                header is the better home for it: visible in both modes, visible
                the moment the widget opens, and it costs the transcript no
                vertical space -- which matters most on the phone layout, where
                the panel is still capped at 460px.

                VoiceCallButton itself is untouched and still used by
                ServiceRequestConversation. */}

            {/* Input */}
            <div style={{
              padding: "10px 12px",
              borderTop: "1px solid rgba(212,175,55,0.12)",
              background: "rgba(0,0,0,0.3)",
              flexShrink: 0,
            }}>
              {/* Staged document, shown above the input so the customer can
                  confirm or drop it before sending, and so a rejection is read
                  next to the file it refers to. Live chat only -- the FAQ bot
                  has no conversation to attach anything to. */}
              {mode === "live" && (attachFile || attachError) && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 7,
                  marginBottom: 8, padding: "6px 9px", borderRadius: 8,
                  background: attachError ? "rgba(248,113,113,0.10)" : "rgba(212,175,55,0.10)",
                  border: attachError
                    ? "1px solid rgba(248,113,113,0.45)"
                    : "1px solid rgba(212,175,55,0.25)",
                  fontSize: 11.5,
                }}>
                  <span style={{
                    flexShrink: 0, display: "flex",
                    color: attachError ? "#f87171" : "#D4AF37",
                  }}>
                    <DocIcon />
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    color: attachError ? "#f87171" : "rgba(255,255,255,0.85)",
                    fontWeight: 600,
                  }}>
                    {attachBusy
                      ? `Uploading ${attachFile?.name || "document"}...`
                      : attachError || attachFile?.name}
                  </span>
                  {!attachBusy && (
                    <button
                      onClick={() => { setAttachFile(null); setAttachError("") }}
                      aria-label="Remove attachment"
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "rgba(255,255,255,0.55)", fontSize: 15,
                        lineHeight: 1, padding: 0, flexShrink: 0,
                      }}
                    >
                      &times;
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {mode === "live" && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={DOC_ACCEPT}
                    style={{ display: "none" }}
                    onChange={e => {
                      const picked = e.target.files?.[0]
                      // Reset the input's value so picking the same file twice
                      // in a row still fires change (needed for retry).
                      e.target.value = ""
                      if (!picked) return
                      const problem = describeDocError(picked)
                      if (problem) {
                        setAttachFile(null)
                        setAttachError(problem)
                        return
                      }
                      setAttachError("")
                      setAttachFile(picked)
                      resetInactivity()
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || attachBusy}
                    title="Attach a document"
                    aria-label="Attach a document"
                    style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: "rgba(212,175,55,0.12)",
                      border: "1px solid rgba(212,175,55,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: (loading || attachBusy) ? "default" : "pointer",
                      color: "#D4AF37",
                      opacity: (loading || attachBusy) ? 0.45 : 1,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <ClipIcon />
                  </button>
                </>
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={
                  mode === "live"
                    ? (attachFile ? "Add a note (optional)..." : "Message our support agent...")
                    : "Ask me anything..."
                }
                disabled={loading}
                style={{
                  flex: 1, borderRadius: 10, border: "1px solid rgba(212,175,55,0.2)",
                  padding: "9px 12px", fontSize: 12.5,
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff", outline: "none",
                  opacity: loading ? 0.6 : 1,
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!canSend}
                style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: canSend
                    ? "linear-gradient(135deg, #D4AF37, #c9a227)"
                    : "rgba(212,175,55,0.15)",
                  border: "1px solid rgba(212,175,55,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: canSend ? "pointer" : "default",
                  color: canSend ? "#0a0005" : "rgba(212,175,55,0.4)",
                  transition: "all 0.2s ease",
                }}
              >
                <SendIcon />
              </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Launcher ──────────────────────────────────────────────────────
          Closed: the full animated concierge robot with its greeting bubble.
          Open: it collapses to a compact close button so the character never
          competes with the chat panel for space. */}
      {open ? (
        <motion.button
          onClick={() => setOpen(false)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          aria-label="Close support chat"
          style={{
            width: "clamp(50px,12vw,60px)",
            height: "clamp(50px,12vw,60px)",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #D4AF37, #F5E07A)",
            border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(212,175,55,0.4)",
            color: "#0a0005",
            flexShrink: 0,
          }}
        >
          <CloseIcon />
        </motion.button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {/* Greeting bubble — sits above the character, tail pointing down
              at it, so the two read as one concierge rather than two widgets. */}
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 1.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "relative",
              maxWidth: "clamp(124px,36vw,158px)",
              padding: "9px 12px",
              borderRadius: 16,
              background: "linear-gradient(160deg, rgba(20,15,5,0.96), rgba(6,4,2,0.96))",
              border: "1px solid rgba(212,175,55,0.5)",
              // The inset highlight is the gold catch along the top edge that
              // the reference bubble has.
              boxShadow: "0 0 22px rgba(212,175,55,0.18), 0 8px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(245,224,122,0.28)",
              backdropFilter: "blur(4px)",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "clamp(10px,2.4vw,12px)",
              fontWeight: 800, color: "#F5E07A", letterSpacing: "0.02em",
            }}>
              Hi VIP! 👋
            </div>
            <div style={{
              fontFamily: "'Manrope', sans-serif", fontSize: "clamp(8.5px,2.1vw,10.5px)",
              color: "rgba(255,255,255,0.75)", lineHeight: 1.45, marginTop: 2,
            }}>
              Need any help?<br />I'm here for you!
            </div>
            {/* tail — sits over the avatar below it on every breakpoint (the
                avatar is ~59px wide on a phone, ~78px on desktop) */}
            <span aria-hidden style={{
              position: "absolute", width: 10, height: 10,
              background: "rgba(6,4,2,0.96)",
              borderRight: "1px solid rgba(212,175,55,0.5)",
              borderBottom: "1px solid rgba(212,175,55,0.5)",
              bottom: -5.5, right: 22, transform: "rotate(45deg)",
            }} />
          </motion.div>

          <motion.button
            onClick={() => setOpen(true)}
            aria-label="Chat with our support assistant"
            title="Need help? Chat with us"
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.06, filter: "drop-shadow(0 0 26px rgba(212,175,55,0.55))" }}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: 0.35, delay: 0.5 }}
            style={{
              position: "relative",
              // Avatar-sized, never a full-body character. See AVATAR_H.
              height: AVATAR_H,
              width: `calc(${AVATAR_H} / 1.27)`,
              padding: 0, border: "none", flexShrink: 0,
              background: "transparent", cursor: "pointer", touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              // Float, breathe, blink and tilt all live inside the SVG so the
              // ground glow can stay put while the body rises above it.
              filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.55))",
            }}
          >
            <ConciergeRobot reduceMotion={reduceMotion} />

            {unread > 0 && (
              // Gold rather than the alert red it used to be: an unread reply
              // from a concierge is not an error state, and red was the one
              // colour on the launcher that did not belong to the brand.
              //
              // The pulse is a slow, shallow scale — a ring drawing attention
              // to itself, not a flash. Two seconds a cycle and never below
              // full opacity, so it stays legible while it moves and cannot
              // read as flicker. Reduced-motion visitors get the badge static.
              <motion.div
                initial={{ scale: 0 }}
                animate={reduceMotion ? { scale: 1 } : { scale: [1, 1.14, 1] }}
                transition={reduceMotion ? { duration: 0.25 } : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  position: "absolute", top: 2, right: -2,
                  width: 18, height: 18, borderRadius: "50%",
                  background: "linear-gradient(135deg, #F5E07A, #D4AF37)",
                  border: "2px solid #08000f",
                  boxShadow: "0 0 12px rgba(212,175,55,0.75)",
                  fontSize: 10, fontWeight: 800, color: "#2a1c00",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {unread}
              </motion.div>
            )}
          </motion.button>
        </div>
      )}

    </div>
    </>
  )
}