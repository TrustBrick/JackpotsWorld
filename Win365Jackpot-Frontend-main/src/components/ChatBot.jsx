import React, { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { getToken } from "../services/authStorage"
import { connectLiveChatSocket } from "../services/liveChatSocket"
import { asMessageArray, highestRealId } from "../services/liveChatMessages"

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
// launcher size. Same character as SupportAssistant's full-body robot in the
// hero (crown, antenna, ear pods, bow tie) so the minimized button and the
// hero greeter read as one assistant rather than two different things.
// Drawn in currentColor against the gold disc it always sits on, with the
// eyes and smile knocked back out in pale gold.
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
          }
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
              {mode === "live" && (
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

      {/* ── Toggle Button ── */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
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
          position: "relative",
          flexShrink: 0,
        }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <CloseIcon />
            </motion.span>
          ) : (
            <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <RobotIcon size={30} />
            </motion.span>
          )}
        </AnimatePresence>
        {unread > 0 && !open && (
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            style={{
              position: "absolute", top: -4, right: -4,
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
  )
}