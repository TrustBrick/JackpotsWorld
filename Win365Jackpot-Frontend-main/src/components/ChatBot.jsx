import React, { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { getToken } from "../services/authStorage"
import { connectLiveChatSocket } from "../services/liveChatSocket"
import { asMessageArray, highestRealId } from "../services/liveChatMessages"
// VOICE-CALL: layered on the live-agent mode below. Everything call-related is
// inert until `mode === "live"`, so the FAQ bot path is untouched.
import { useVoiceCall, PHASE } from "../hooks/useVoiceCall"
import VoiceCallButton from "./support/VoiceCallButton"
import ActiveCallModal from "./support/ActiveCallModal"
import CallStatus from "./support/CallStatus"

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

const WELCOME = { role: "bot", text: "Welcome to Jackpots World Customer Support! 🎰\nI'm here to help with your account, deposits, withdrawals, KYC, gameplay and more. Ask me anything — and if I can't resolve it, I'll get our team on it." }

// Rendered height of the floating concierge avatar. Deliberately small: it is
// an avatar in the corner, not a character on the page. The 11vw middle term
// is what scales it smoothly through tablet/laptop (~84px at 768, ~112px at
// 1024) rather than pinning everything below desktop to the floor; the bounds
// keep it inside 65–90px on phones and 90–130px on desktop, so it never
// covers page content at either end.
const AVATAR_H = "clamp(68px, 11vw, 124px)"

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

// ─── VIP concierge avatar ──────────────────────────────────────────────────
// A glossy black-and-gold concierge bot: domed helmet with a thick gold visor
// ring, gold ear discs, a single antenna, and a rounded pebble body in a black
// tuxedo with gold lapels, a necktie and a crown badge on the chest.
//
// Chibi proportions on purpose — the helmet is deliberately oversized against
// the body, which is what keeps the face readable once the whole character is
// only ~120px tall in the corner. Stylized throughout (hard shell, visor, no
// human features) so it can never read as a photographic or realistic person.
//
// Depth is done with layered gradients and specular highlights rather than a
// raster image, so it stays crisp at any size and recolours with the palette.
// The app's own gold family (#F7E9A8 / #D4AF37 / #A9801F) is used throughout.
//
// Idle life is restrained — float, breathe, a slight head tilt, and an
// occasional blink. `reduceMotion` stills all of it.
function ConciergeRobot({ reduceMotion }) {
  // The eyes are happy arcs, so a "blink" is a quick vertical squash of the
  // pair rather than a lid closing. Two blinks at uneven offsets in one long
  // cycle — a single evenly-spaced blink reads as a metronome, which is the
  // robotic tell the design is trying to avoid.
  const blink = reduceMotion ? undefined : { scaleY: [1, 1, 0.12, 1, 1, 1, 0.12, 1, 1] }
  const blinkTx = { duration: 7.6, repeat: Infinity, times: [0, 0.33, 0.355, 0.38, 0.7, 0.73, 0.755, 0.78, 1], ease: "easeInOut" }

  return (
    <svg viewBox="0 0 120 138" width="100%" height="100%" style={{ overflow: "visible", display: "block" }}>
      <defs>
        <radialGradient id="cb-halo" cx="50%" cy="38%" r="55%">
          <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cb-ground" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F5E07A" stopOpacity="0.75" />
          <stop offset="55%" stopColor="#D4AF37" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cb-gold" x1="12%" y1="0%" x2="88%" y2="100%">
          <stop offset="0%" stopColor="#FBF0BE" />
          <stop offset="30%" stopColor="#E8C558" />
          <stop offset="62%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#8E6B18" />
        </linearGradient>
        {/* Brighter, more vertical gold for the visor ring so it reads as a
            polished bezel catching light from above rather than flat trim. */}
        <linearGradient id="cb-gold-ring" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor="#FFF6D2" />
          <stop offset="26%" stopColor="#EBCB63" />
          <stop offset="58%" stopColor="#C99F2C" />
          <stop offset="100%" stopColor="#7E5D14" />
        </linearGradient>
        {/* Helmet: lit from upper-left, falling to near-black at the jaw. */}
        <radialGradient id="cb-helmet" cx="34%" cy="24%" r="82%">
          <stop offset="0%" stopColor="#55504a" />
          <stop offset="34%" stopColor="#221f1c" />
          <stop offset="72%" stopColor="#0d0c0b" />
          <stop offset="100%" stopColor="#040404" />
        </radialGradient>
        <radialGradient id="cb-torso" cx="38%" cy="18%" r="88%">
          <stop offset="0%" stopColor="#3a3630" />
          <stop offset="38%" stopColor="#171512" />
          <stop offset="100%" stopColor="#040404" />
        </radialGradient>
        {/* Visor glass — darkest at the centre so the specular streak pops. */}
        <radialGradient id="cb-visor" cx="32%" cy="22%" r="86%">
          <stop offset="0%" stopColor="#1d1a24" />
          <stop offset="45%" stopColor="#0a0910" />
          <stop offset="100%" stopColor="#030307" />
        </radialGradient>
        <linearGradient id="cb-sheen" x1="0%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ambient gold pool behind the character */}
      <ellipse cx="60" cy="58" rx="58" ry="60" fill="url(#cb-halo)" />

      {/* Ground glow — stays put while the body floats above it, and softens
          as the body rises. This contact shadow is what sells "hovering"
          rather than "drifting in space". */}
      <motion.ellipse
        cx="60" cy="133" rx="26" ry="3.6" fill="url(#cb-ground)"
        initial={{ scaleX: 1, opacity: 0.95 }}
        animate={reduceMotion ? undefined : { scaleX: [1, 0.84, 1], opacity: [0.95, 0.6, 0.95] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "60px 133px" }}
      />

      {/* Everything above the shadow floats as one unit. */}
      <motion.g
        animate={reduceMotion ? undefined : { y: [0, -3.6, 0] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* ── Body: rounded pebble in a black tuxedo ── */}
        <motion.g
          animate={reduceMotion ? undefined : { scaleY: [1, 1.016, 1] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "60px 126px" }}
        >
          <path d="M60 78 C44 78 33 89 31 103 C29 116 42 126 60 126 C78 126 91 116 89 103 C87 89 76 78 60 78 Z"
            fill="url(#cb-torso)" />
          {/* rim light down the left shoulder — separates body from background */}
          <path d="M40 88 C34 94 32 100 32 106" fill="none" stroke="#fff" strokeWidth="1.5" strokeOpacity="0.1" strokeLinecap="round" />

          {/* Shirt: the champagne wedge the lapels open onto. */}
          <path d="M52 80 L60 79 L68 80 L64 100 L56 100 Z" fill="url(#cb-gold)" opacity="0.92" />
          {/* Collar points folding over the shirt. */}
          <path d="M52 80 L60 87 L68 80" fill="none" stroke="#0b0a09" strokeWidth="1.5" strokeLinejoin="round" />

          {/* Necktie — black with a gold edge, as in the reference. */}
          <path d="M57 87 L63 87 L64.6 106 L60 110 L55.4 106 Z" fill="#08080a" stroke="url(#cb-gold)" strokeWidth="0.7" strokeOpacity="0.55" />
          <path d="M57.6 84.4 L62.4 84.4 L63 87.4 L57 87.4 Z" fill="#0d0c0e" stroke="url(#cb-gold)" strokeWidth="0.6" strokeOpacity="0.5" />

          {/* Lapels — gold-edged panels sweeping out from the collar. */}
          <path d="M52 80 C46 84 41 92 39.5 103 L48 100 C49 92 50.5 85 53.5 81.5 Z" fill="#0a0a09" stroke="url(#cb-gold)" strokeWidth="1.15" strokeLinejoin="round" />
          <path d="M68 80 C74 84 79 92 80.5 103 L72 100 C71 92 69.5 85 66.5 81.5 Z" fill="#0a0a09" stroke="url(#cb-gold)" strokeWidth="1.15" strokeLinejoin="round" />

          {/* Crown badge on the chest — the VIP mark, sized as a lapel pin. */}
          <g transform="translate(70.5 104) scale(0.42)">
            <path d="M0 12 L3.2 0.8 L8 7.4 L13 -1 L18 7.4 L22.8 0.8 L26 12 Z" fill="url(#cb-gold)" />
            <circle cx="13" cy="2.2" r="1.6" fill="#FBF0BE" />
          </g>
        </motion.g>

        {/* ── Head — a slow, small tilt so it reads as attentive ── */}
        <motion.g
          animate={reduceMotion ? undefined : { rotate: [0, 1.5, 0, -1.5, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "60px 80px" }}
        >
          {/* Antenna, off the upper right of the helmet. */}
          <path d="M88 30 L99 17" stroke="url(#cb-gold)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <circle cx="100.5" cy="15" r="5" fill="url(#cb-gold)" />
          <circle cx="99" cy="13.4" r="1.6" fill="#FFF6D2" opacity="0.85" />

          {/* Ear discs — gold cylinders either side of the helmet. */}
          <ellipse cx="27" cy="56" rx="7.5" ry="11" fill="url(#cb-gold)" />
          <ellipse cx="93" cy="56" rx="8.5" ry="12" fill="url(#cb-gold)" />
          <ellipse cx="94.5" cy="56" rx="4.6" ry="7" fill="#0c0b0a" opacity="0.82" />

          {/* Helmet dome. No outline — the gradient's own falloff is what
              gives it a glossy moulded edge; a stroke would flatten it. */}
          <ellipse cx="60" cy="52" rx="34" ry="32" fill="url(#cb-helmet)" />
          {/* broad specular across the top-left of the dome */}
          <ellipse cx="47" cy="32" rx="17" ry="9" fill="url(#cb-sheen)" transform="rotate(-24 47 32)" />
          {/* tight hot spot */}
          <ellipse cx="43.5" cy="30" rx="5.5" ry="2.8" fill="#fff" opacity="0.3" transform="rotate(-24 43.5 30)" />

          {/* Visor bezel + glass. */}
          <ellipse cx="59" cy="53" rx="26.5" ry="22.5"
            fill="url(#cb-visor)" stroke="url(#cb-gold-ring)" strokeWidth="4.2" />
          {/* sheen sweeping across the glass */}
          <path d="M42 40 C36 45 34.5 53 36 60 C40 50 48 43 58 41 C52 39 46 38.5 42 40 Z" fill="#fff" opacity="0.09" />
          <ellipse cx="47" cy="43" rx="8" ry="3.4" fill="#fff" opacity="0.1" transform="rotate(-26 47 43)" />

          {/* Eyes — happy gold arcs. Grouped so the blink squashes both at
              once about the eye line. framer-motion animates these as style
              transforms, so `initial` has to seed the starting value: it does
              not read back the element's own presentation attributes. */}
          <motion.g
            initial={{ scaleY: 1 }}
            animate={blink}
            transition={blinkTx}
            style={{ transformOrigin: "59px 55px" }}
          >
            <path d="M45 50 Q51.5 60 58 50" fill="none" stroke="#F7E9A8" strokeWidth="4.4" strokeLinecap="round" />
            <path d="M62 50 Q68.5 60 75 50" fill="none" stroke="#F7E9A8" strokeWidth="4.4" strokeLinecap="round" />
          </motion.g>
        </motion.g>
      </motion.g>
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

// SVG close icon
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

export default function ChatBot({ portal = "player" }) {
  const tokenKey = PORTAL_TOKEN_KEYS[portal] || PORTAL_TOKEN_KEYS.player
  const reduceMotion            = useReducedMotion()
  const [open, setOpen]         = useState(false)
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

  const sendLiveMessage = async (text) => {
    const token = getToken(tokenKey)
    if (!token || !liveTicketId) return
    const tempId = `pending-${Date.now()}`
    // Stable across both attempts below, so the retry is recognised as the
    // same message server-side rather than posting a second copy when the
    // first request actually landed and only its response was lost.
    const clientMessageId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${sessionIdRef.current}-${Date.now()}`
    setLiveMessages(prev => [...prev, { id: tempId, sender_type: "user", message: text, status: "pending", created_at: new Date().toISOString() }])

    const attempt = () => fetch(`${API}/api/live-chat/${liveTicketId}/messages/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: text, client_message_id: clientMessageId }),
    })

    try {
      let res = await attempt()
      if (!res.ok && res.status !== 429) res = await attempt() // one retry on failure
      if (!res.ok) throw new Error("send failed")
      const saved = await res.json()
      // The WS push for this same message can arrive before this response
      // does — reconcile rather than blindly replace-by-tempId, so we don't
      // end up with both the WS-added copy and this one.
      setLiveMessages(prev => reconcileLiveMessage(prev, saved, tempId))
      // Sending is the moment an agent is most likely to reply, so pull
      // once immediately instead of waiting out the poll interval.
      liveSocketRef.current?.refresh()
    } catch {
      setLiveMessages(prev => prev.map(m => (m.id === tempId ? { ...m, status: "failed" } : m)))
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
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput("")
    resetInactivity()

    if (mode === "live") {
      sendLiveMessage(text)
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
      }))
    : messages

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }

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
      onToggleMute={voiceCall.toggleMute}
      onToggleSpeaker={voiceCall.toggleSpeaker}
      onEnd={voiceCall.endCall}
      onDismiss={voiceCall.endCall}
    />
    <div
      style={{
        position: "fixed",
        bottom: "clamp(14px, 4vw, 24px)",
        right: "clamp(12px, 3vw, 24px)",
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
              height: "min(460px, 70vh)",
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

            {/* Quick chips */}
            {mode === "bot" && (
              <div style={{
                padding: "6px 12px",
                display: "flex", gap: 6, flexWrap: "wrap",
                borderTop: "1px solid rgba(212,175,55,0.08)",
                flexShrink: 0,
              }}>
                {["My Wallet Balance", "Withdrawal Help", "KYC Status", "Contact Support"].map(chip => (
                  <button
                    key={chip}
                    onClick={() => { setInput(chip); inputRef.current?.focus() }}
                    style={{
                      padding: "4px 10px", borderRadius: 999, fontSize: 10, fontWeight: 600,
                      background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)",
                      color: "rgba(212,175,55,0.8)", cursor: "pointer", letterSpacing: "0.04em",
                    }}
                  >
                    {chip}
                  </button>
                ))}
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

            {/* VOICE-CALL: the call action sits in its own row above the
                composer while a live session is open, so it reads as an
                action on this conversation rather than a chat shortcut.
                VoiceCallButton renders nothing when calling is unavailable
                here (unsupported browser, or a host that can't push). */}
            {mode === "live" && voiceCall.phase === PHASE.IDLE && (
              <div style={{
                padding: "8px 12px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                borderTop: "1px solid rgba(212,175,55,0.08)",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.04em" }}>
                  Prefer to talk?
                </span>
                {/* Two separate conditions, both required. `available` says
                    the *server* can carry signaling; liveConnStatus says this
                    browser's socket is actually open right now. With chat,
                    "polling" is a fully working state — for a call it is not,
                    because an SDP offer has nowhere to go, and the call would
                    ring until it timed out. */}
                <VoiceCallButton
                  available={voiceCall.available && liveConnStatus === "open"}
                  busy={voiceCall.isBusy}
                  onClick={voiceCall.startCall}
                  compact
                />
              </div>
            )}

            {/* Input */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 12px",
              borderTop: "1px solid rgba(212,175,55,0.12)",
              background: "rgba(0,0,0,0.3)",
              flexShrink: 0,
            }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={mode === "live" ? "Message our support agent..." : "Ask me anything..."}
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
                disabled={loading || !input.trim()}
                style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: input.trim() && !loading
                    ? "linear-gradient(135deg, #D4AF37, #c9a227)"
                    : "rgba(212,175,55,0.15)",
                  border: "1px solid rgba(212,175,55,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: input.trim() && !loading ? "pointer" : "default",
                  color: input.trim() && !loading ? "#0a0005" : "rgba(212,175,55,0.4)",
                  transition: "all 0.2s ease",
                }}
              >
                <SendIcon />
              </button>
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
                avatar is ~59px wide on a phone, ~108px on desktop) */}
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
              // Avatar-sized, never a full-body character: ~68px tall on a
              // 390px phone, ~124px on desktop. Height is what the design is
              // specified in, so width is derived from the 120x138 viewBox.
              height: AVATAR_H,
              width: `calc(${AVATAR_H} / 1.15)`,
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
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                style={{
                  position: "absolute", top: 2, right: -2,
                  width: 18, height: 18, borderRadius: "50%",
                  background: "#ff3366", border: "2px solid #08000f",
                  fontSize: 10, fontWeight: 800, color: "#fff",
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