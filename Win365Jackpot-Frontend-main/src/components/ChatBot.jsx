import React, { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { getToken } from "../services/authStorage"
import { connectLiveChatSocket } from "../services/liveChatSocket"
import { asMessageArray, highestRealId } from "../services/liveChatMessages"
// VOICE-CALL: layered on the live-agent mode below. Everything call-related is
// inert until `mode === "live"`, so the FAQ bot path is untouched.
import { useVoiceCall, PHASE } from "../hooks/useVoiceCall"
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
// Mascot height. The floor and the vw term are unchanged, so a phone still
// renders it at 68px exactly as before; only the desktop ceiling moves,
// 124px -> 90px. At 124 the character was competing with the hero copy
// instead of reading as a floating support button.
//
//   375px phone  -> 68px   (11vw = 41, floored)
//   768px tablet -> 84px   (11vw, between the bounds)
//   1440px+      -> 90px   (11vw = 158, capped)
//
// Height is what the design is specified in; the button derives its width
// from the 120x138 viewBox.
const AVATAR_H = "clamp(68px, 11vw, 90px)"

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
  // Blink: the eyes are solid lozenges, so closing them is a vertical squash
  // about the eye line. Two blinks at uneven offsets in one long cycle — a
  // single evenly-spaced blink reads as a metronome, which is the robotic tell
  // the design is trying to avoid.
  const blink = reduceMotion ? undefined : { scaleY: [1, 1, 0.1, 1, 1, 1, 0.1, 1, 1] }
  const blinkTx = { duration: 7.6, repeat: Infinity, times: [0, 0.33, 0.355, 0.38, 0.7, 0.73, 0.755, 0.78, 1], ease: "easeInOut" }

  // The greeting. Four beats of rotation about the shoulder packed into the
  // first ~1.2s of a 7s cycle and flat for the rest, so the character says
  // hello occasionally rather than flapping continuously. `delay` lets it
  // settle into frame before the first wave.
  const wave = reduceMotion ? undefined : { rotate: [0, -20, -3, -17, -2, 0, 0, 0] }
  const waveTx = {
    duration: 7, repeat: Infinity, delay: 1.2, ease: "easeInOut",
    times: [0, 0.03, 0.06, 0.09, 0.13, 0.17, 0.6, 1],
  }

  return (
    <svg viewBox="0 0 120 152" width="100%" height="100%" style={{ overflow: "visible", display: "block" }}>
      <defs>
        <radialGradient id="cb-halo" cx="50%" cy="34%" r="56%">
          <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
        </radialGradient>
        {/* The gold disc the character stands on. Brightest at the rim, which
            is what makes it read as a lit ring rather than a flat shadow. */}
        <radialGradient id="cb-ring" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF3C4" stopOpacity="0.05" />
          <stop offset="62%" stopColor="#F5E07A" stopOpacity="0.55" />
          <stop offset="86%" stopColor="#D4AF37" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cb-gold" x1="12%" y1="0%" x2="88%" y2="100%">
          <stop offset="0%" stopColor="#FBF0BE" />
          <stop offset="30%" stopColor="#E8C558" />
          <stop offset="62%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#8E6B18" />
        </linearGradient>
        {/* Pearl shell: lit from upper-left, falling to a warm ivory shadow. */}
        <radialGradient id="cb-shell" cx="34%" cy="22%" r="84%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor="#F8F4EC" />
          <stop offset="76%" stopColor="#E4DBCB" />
          <stop offset="100%" stopColor="#C3B8A2" />
        </radialGradient>
        {/* The coat. Burgundy is the half of the palette that makes this a
            JackpotsWorld concierge rather than a generic assistant. */}
        <radialGradient id="cb-coat" cx="36%" cy="16%" r="88%">
          <stop offset="0%" stopColor="#A8324E" />
          <stop offset="42%" stopColor="#7C2038" />
          <stop offset="100%" stopColor="#460D1D" />
        </radialGradient>
        {/* Visor glass stays dark: it is the contrast the eyes glow against. */}
        <radialGradient id="cb-visor" cx="34%" cy="24%" r="84%">
          <stop offset="0%" stopColor="#232a3d" />
          <stop offset="48%" stopColor="#0d1220" />
          <stop offset="100%" stopColor="#04060d" />
        </radialGradient>
        <radialGradient id="cb-eyeglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7FDBFF" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7FDBFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cb-sheen" x1="0%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <ellipse cx="60" cy="58" rx="58" ry="62" fill="url(#cb-halo)" />

      {/* ── The gold ring the concierge stands on ──────────────────────────
          Stays put while the body floats above it and dims as the body rises.
          This is the contact cue that sells "hovering" rather than "pasted
          onto the page", and it is the anchor the reference has too. */}
      <motion.g
        initial={{ scale: 1, opacity: 0.95 }}
        animate={reduceMotion ? undefined : { scale: [1, 0.9, 1], opacity: [0.95, 0.65, 0.95] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "60px 143px" }}
      >
        <ellipse cx="60" cy="143" rx="33" ry="8.5" fill="url(#cb-ring)" />
        <ellipse cx="60" cy="143" rx="24" ry="5.6" fill="none" stroke="#FFF3C4" strokeWidth="1.4" strokeOpacity="0.65" />
      </motion.g>

      {/* Everything above the ring floats as one unit. */}
      <motion.g
        animate={reduceMotion ? undefined : { y: [0, -3.4, 0] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* ── Legs ── short, in the coat's colour, with ivory shoes. Drawn
            before the torso so the hem overlaps them. */}
        <path d="M50 118 L48.5 132" stroke="#611427" strokeWidth="9" strokeLinecap="round" />
        <path d="M70 118 L71.5 132" stroke="#611427" strokeWidth="9" strokeLinecap="round" />
        <ellipse cx="47.6" cy="135" rx="7" ry="4.4" fill="#F3EDE1" />
        <ellipse cx="72.4" cy="135" rx="7" ry="4.4" fill="#F3EDE1" />
        <ellipse cx="47.6" cy="136.4" rx="7" ry="2.4" fill="#C9BEA8" opacity="0.55" />
        <ellipse cx="72.4" cy="136.4" rx="7" ry="2.4" fill="#C9BEA8" opacity="0.55" />

        {/* ── Right arm (viewer's left) — resting at the side ── */}
        <path d="M39 92 C33 99 31 107 31.5 113" fill="none" stroke="#6B182D" strokeWidth="8.5" strokeLinecap="round" />
        <path d="M32.4 109.5 C32 111 31.7 112.4 31.6 113.6" fill="none" stroke="url(#cb-gold)" strokeWidth="8.8" strokeLinecap="round" />
        {/* ivory mitten glove */}
        <g>
          <ellipse cx="31" cy="119.5" rx="6.4" ry="6.8" fill="#FBF8F1" />
          <path d="M26.4 117.8 C25 118.6 25 120.6 26.4 121.4" fill="none" stroke="#DCD3C2" strokeWidth="1.2" strokeLinecap="round" />
        </g>

        {/* ── Torso — the burgundy dinner jacket ── */}
        <motion.g
          animate={reduceMotion ? undefined : { scaleY: [1, 1.015, 1] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "60px 122px" }}
        >
          <path d="M60 82 C47 82 39 90 37.5 101 C36 113 45 122 60 122 C75 122 84 113 82.5 101 C81 90 73 82 60 82 Z"
            fill="url(#cb-coat)" />
          {/* rim light down the left shoulder */}
          <path d="M45 89 C40 94 38 99 37.8 104" fill="none" stroke="#fff" strokeWidth="1.4" strokeOpacity="0.18" strokeLinecap="round" />

          {/* Ivory shirt wedge the lapels open onto */}
          <path d="M53 84 L60 83 L67 84 L64 102 L56 102 Z" fill="#F8F4EA" />

          {/* Shawl lapels — burgundy panels piped in gold */}
          <path d="M53 84 C47.5 88 43.5 94 42 103 L49.5 100 C50.5 93 51.5 88 54.2 85 Z" fill="#611427" stroke="url(#cb-gold)" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M67 84 C72.5 88 76.5 94 78 103 L70.5 100 C69.5 93 68.5 88 65.8 85 Z" fill="#611427" stroke="url(#cb-gold)" strokeWidth="1.1" strokeLinejoin="round" />

          {/* Gold bow tie at the collar */}
          <path d="M60 89 L54.2 85.6 L54.2 92.4 Z" fill="url(#cb-gold)" />
          <path d="M60 89 L65.8 85.6 L65.8 92.4 Z" fill="url(#cb-gold)" />
          <circle cx="60" cy="89" r="1.8" fill="#FBF0BE" />

          {/* Gold button, and a pocket square */}
          <circle cx="60" cy="104" r="1.7" fill="url(#cb-gold)" />
          <path d="M71 106 L77.5 104.4 L76.6 108 L70.4 109 Z" fill="url(#cb-gold)" opacity="0.9" />
        </motion.g>

        {/* ── Left arm (viewer's right) — raised, and the arm that waves ──
            Rotating the whole group about the shoulder swings upper arm, cuff
            and glove together, the way a real arm moves. */}
        <motion.g
          animate={wave}
          transition={waveTx}
          style={{ transformOrigin: "81px 92px" }}
        >
          <path d="M81 92 C88 88 92 82 93 76" fill="none" stroke="#6B182D" strokeWidth="8.5" strokeLinecap="round" />
          {/* gold cuff */}
          <path d="M91.6 79.6 C92.3 78.2 92.7 77 93 75.8" fill="none" stroke="url(#cb-gold)" strokeWidth="8.8" strokeLinecap="round" />
          {/* ivory glove, fingers up — the waving hand */}
          <g>
            <ellipse cx="94.5" cy="69.5" rx="6.8" ry="7.4" fill="#FBF8F1" />
            <path d="M91.4 63.6 L91.4 60.4" stroke="#FBF8F1" strokeWidth="3" strokeLinecap="round" />
            <path d="M95 63 L95.4 59.6" stroke="#FBF8F1" strokeWidth="3" strokeLinecap="round" />
            <path d="M98.4 64 L99.4 61" stroke="#FBF8F1" strokeWidth="3" strokeLinecap="round" />
            <path d="M99.8 71.4 C101.4 70.4 101.6 68.4 100.2 67.4" fill="none" stroke="#DCD3C2" strokeWidth="1.3" strokeLinecap="round" />
          </g>
        </motion.g>

        {/* ── Head — a slow, small tilt so it reads as attentive ── */}
        <motion.g
          animate={reduceMotion ? undefined : { rotate: [0, 1.6, 0, -1.6, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "60px 76px" }}
        >
          {/* Antenna with a four-point sparkle, off the upper right. */}
          <path d="M83 25 L93 13" stroke="url(#cb-gold)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M94.5 5.5 L96.3 11 L101.8 12.8 L96.3 14.6 L94.5 20.1 L92.7 14.6 L87.2 12.8 L92.7 11 Z" fill="url(#cb-gold)" />
          <circle cx="94.5" cy="12.8" r="1.9" fill="#FFF8DC" />

          {/* Headphone ear cups — gold, prominent, on both sides. */}
          <ellipse cx="25.5" cy="50" rx="9.5" ry="11.5" fill="url(#cb-gold)" />
          <ellipse cx="26.8" cy="50" rx="5.2" ry="6.8" fill="#5E1526" opacity="0.55" />
          <ellipse cx="94.5" cy="50" rx="9.5" ry="11.5" fill="url(#cb-gold)" />
          <ellipse cx="93.2" cy="50" rx="5.2" ry="6.8" fill="#5E1526" opacity="0.55" />

          {/* Pearl head shell. */}
          <ellipse cx="60" cy="48" rx="33" ry="31" fill="url(#cb-shell)" />
          <ellipse cx="47" cy="28" rx="16" ry="8.5" fill="url(#cb-sheen)" transform="rotate(-24 47 28)" />
          <ellipse cx="43.5" cy="26" rx="5" ry="2.6" fill="#fff" opacity="0.6" transform="rotate(-24 43.5 26)" />

          {/* Gold crest on the forehead — the VIP mark, set into the shell. */}
          <path d="M60 15.5 L67 24 L60 31 L53 24 Z" fill="url(#cb-gold)" stroke="#8E6B18" strokeWidth="0.5" strokeLinejoin="round" />
          <path d="M60 19.5 L63.4 24 L60 27.6 L56.6 24 Z" fill="#FFF6D2" opacity="0.75" />

          {/* Visor glass. */}
          <ellipse cx="60" cy="50" rx="25" ry="21" fill="url(#cb-visor)" stroke="url(#cb-gold)" strokeWidth="2.6" />
          <path d="M44 38 C38.5 43 37 51 38.5 58 C42 48 49.5 41.5 59 39.5 C53.5 37.6 47.6 37.2 44 38 Z" fill="#fff" opacity="0.08" />

          {/* Eyes — bright cyan lozenges over a soft halo. */}
          <motion.g
            initial={{ scaleY: 1 }}
            animate={blink}
            transition={blinkTx}
            style={{ transformOrigin: "60px 50px" }}
          >
            <ellipse cx="51" cy="50" rx="10" ry="8.5" fill="url(#cb-eyeglow)" />
            <ellipse cx="69" cy="50" rx="10" ry="8.5" fill="url(#cb-eyeglow)" />
            <rect x="47.4" y="44.6" width="7.2" height="11" rx="3.6" fill="#8FE3FF" />
            <rect x="65.4" y="44.6" width="7.2" height="11" rx="3.6" fill="#8FE3FF" />
            <rect x="48.6" y="46" width="3" height="4.6" rx="1.5" fill="#EAFBFF" opacity="0.9" />
            <rect x="66.6" y="46" width="3" height="4.6" rx="1.5" fill="#EAFBFF" opacity="0.9" />
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

export default function ChatBot({ portal = "player" }) {
  const tokenKey = PORTAL_TOKEN_KEYS[portal] || PORTAL_TOKEN_KEYS.player
  const reduceMotion            = useReducedMotion()
  const [open, setOpen]         = useState(false)
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
    setCallRequested(true)
    await startLiveChat()
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
              {voiceCall.available
                && voiceCall.phase === PHASE.IDLE
                && (mode !== "live" || liveConnStatus === "open") && (
                <button
                  onClick={requestCall}
                  disabled={voiceCall.isBusy || callRequested}
                  aria-label="Call Support"
                  title={callRequested ? "Connecting you to an agent…" : "Call Support"}
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