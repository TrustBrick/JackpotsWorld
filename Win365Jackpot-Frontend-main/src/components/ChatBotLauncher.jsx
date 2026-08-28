// src/components/ChatBotLauncher.jsx
//
// The resting state of the support widget, and the only part of it that ships
// in the entry bundle.
//
// WHY THIS EXISTS
// ─────────────────────────────────────────────────────────────────────────────
// ChatBotPanel is ~1300 lines and pulls in the live-chat socket, the voice-call
// hook and the call modal behind it. Navbar renders the widget on every page,
// so all of that used to land in the entry chunk for every visitor — including
// the majority who never open the chat. Nothing in the panel runs until it is
// opened (the socket is only created inside startLiveChat, on a click), so
// there is nothing to keep eager except the thing you actually look at.
//
// This component is that thing: the greeting bubble and the concierge mascot.
// On click it hands over to ChatBot, which swaps in the real panel.
//
// The container styles, the measurement effect and the bubble markup are kept
// byte-identical to ChatBotPanel's own closed state. That is deliberate and
// worth preserving on edit — the two render in sequence during the chunk
// fetch, and any drift between them shows up as the launcher jumping at the
// moment the panel takes over.

import { useEffect, useRef } from "react"
import { motion, useReducedMotion } from "framer-motion"
import ConciergeRobot, { AVATAR_H } from "./support/ConciergeRobot"
import { setLauncherHeight } from "./support/launcherMetrics"

export default function ChatBotLauncher({ onOpen, onPrefetch }) {
  const reduceMotion = useReducedMotion()

  // Publish the real height so PageScrollButtons can stack above it. Same
  // reasoning as in ChatBotPanel: the greeting bubble wraps differently per
  // viewport and per font, so the number cannot be a constant. See
  // support/launcherMetrics.js.
  const launcherRef = useRef(null)
  useEffect(() => {
    const el = launcherRef.current
    if (!el) return undefined
    const publish = () => setLauncherHeight(el.getBoundingClientRect().height)
    publish()

    // Re-measure once the web font is in — the bubble's line count, and so this
    // stack's height, differs between the fallback face and Manrope.
    let cancelled = false
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => { if (!cancelled) publish() }).catch(() => {})
    }

    if (typeof ResizeObserver === "undefined") return () => { cancelled = true }
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => { cancelled = true; ro.disconnect() }
  }, [])

  return (
    <div
      ref={launcherRef}
      style={{
        position: "fixed",
        bottom: "clamp(20px, 4vw, 26px)",
        right: "clamp(20px, 3vw, 26px)",
        zIndex: 50,
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12,
      }}
    >
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
          <span aria-hidden style={{
            position: "absolute", width: 10, height: 10,
            background: "rgba(6,4,2,0.96)",
            borderRight: "1px solid rgba(212,175,55,0.5)",
            borderBottom: "1px solid rgba(212,175,55,0.5)",
            bottom: -5.5, right: 22, transform: "rotate(45deg)",
          }} />
        </motion.div>

        <motion.button
          onClick={onOpen}
          // Start fetching the panel as soon as the pointer arrives, so the
          // click that follows usually lands on an already-loaded chunk.
          onPointerEnter={onPrefetch}
          onFocus={onPrefetch}
          aria-label="Chat with our support assistant"
          title="Need help? Chat with us"
          initial={{ opacity: 0, scale: 0.75 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.06, filter: "drop-shadow(0 0 26px rgba(212,175,55,0.55))" }}
          whileTap={{ scale: 0.94 }}
          transition={{ duration: 0.35, delay: 0.5 }}
          style={{
            position: "relative",
            height: AVATAR_H,
            width: `calc(${AVATAR_H} / 1.27)`,
            padding: 0, border: "none", flexShrink: 0,
            background: "transparent", cursor: "pointer", touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.55))",
          }}
        >
          <ConciergeRobot reduceMotion={reduceMotion} />
        </motion.button>
      </div>
    </div>
  )
}
