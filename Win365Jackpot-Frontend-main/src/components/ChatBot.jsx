import React, { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"

const INACTIVITY_MS = 3 * 60 * 1000 // 3 minutes

const SYSTEM_PROMPT = `You are a helpful live assistant for Jackpots World — Asia's #1 offline casino promotion platform. 
You help users with:
- Information about casino games (Baccarat, Slots, Roulette, Poker, Blackjack)
- VIP & Highroller packages and membership tiers
- Destination casinos (Vietnam, Macau, India, Sri Lanka, Philippines)
- Registration and account help
- Prizes and gifts (Rolex, BMW, Mercedes, Apple bundle)
- Promotions and bonuses
- WhatsApp/Telegram support: wa.me/jackpotsworld or t.me/jackpotsworld
Keep responses short (2-3 sentences max), friendly and professional. Use casino-related language naturally.`

const WELCOME = { role: "bot", text: "Welcome to Jackpots World! 🎰\nI'm your live assistant. Ask me about games, VIP packages, destinations, prizes or anything else!" }

// SVG headset icon
function HeadsetIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
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

export default function ChatBot() {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [unread, setUnread]     = useState(0)
  const bottomRef               = useRef(null)
  const inactivityRef           = useRef(null)
  const inputRef                = useRef(null)

  // auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  // clear unread when opened
  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  // focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300)
  }, [open])

  const resetInactivity = useCallback(() => {
    clearTimeout(inactivityRef.current)
    inactivityRef.current = setTimeout(() => {
      setMessages([WELCOME])
      setUnread(0)
    }, INACTIVITY_MS)
  }, [])

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

    const userMsg = { role: "user", text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      // build conversation history for API (exclude welcome)
      const history = [...messages, userMsg]
        .filter(m => m.text !== WELCOME.text)
        .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }))

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: history,
        }),
      })

      const data = await res.json()
      const reply = data?.content?.[0]?.text || "I'm having trouble connecting. Please try WhatsApp or Telegram for instant help."

      setMessages(prev => [...prev, { role: "bot", text: reply }])
      if (!open) setUnread(prev => prev + 1)
    } catch {
      setMessages(prev => [...prev, { role: "bot", text: "Connection issue. Reach us on WhatsApp or Telegram for instant support!" }])
    } finally {
      setLoading(false)
      resetInactivity()
    }
  }

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>

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
              height: 460,
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
                <HeadsetIcon size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>
                  Live Assistant
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>
                    Jackpots World Support
                  </span>
                </div>
              </div>
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
              {messages.map((m, i) => (
                <div key={i} style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                }}>
                  {m.role === "bot" && (
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                      background: "linear-gradient(135deg, #D4AF37, #F5E07A)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginRight: 7, marginTop: 2, alignSelf: "flex-start",
                    }}>
                      <HeadsetIcon size={12} />
                    </div>
                  )}
                  <div style={{
                    padding: "9px 13px",
                    borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    maxWidth: "76%",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    background: m.role === "user"
                      ? "linear-gradient(135deg, #D4AF37, #c9a227)"
                      : "rgba(255,255,255,0.07)",
                    border: m.role === "user"
                      ? "none"
                      : "1px solid rgba(212,175,55,0.12)",
                    color: m.role === "user" ? "#0a0005" : "rgba(255,255,255,0.85)",
                    fontWeight: m.role === "user" ? 600 : 400,
                  }}>
                    {m.text}
                  </div>
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
                    <HeadsetIcon size={12} />
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
            <div style={{
              padding: "6px 12px",
              display: "flex", gap: 6, flexWrap: "wrap",
              borderTop: "1px solid rgba(212,175,55,0.08)",
              flexShrink: 0,
            }}>
              {["VIP Packages", "Casino Games", "Destinations", "Prizes"].map(chip => (
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
            </div>

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
                placeholder="Ask me anything..."
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
              <HeadsetIcon size={26} />
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