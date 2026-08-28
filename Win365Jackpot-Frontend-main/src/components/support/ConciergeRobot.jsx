// src/components/support/ConciergeRobot.jsx
//
// The floating concierge mascot, split out of ChatBot so the closed launcher
// can render it without pulling the chat implementation in with it.
//
// WHY IT LIVES HERE
// ─────────────────────────────────────────────────────────────────────────────
// ChatBotLauncher (eager, on every page via Navbar) and ChatBotPanel (lazy,
// loaded on first open) both draw this character — the launcher for its resting
// state, the panel for the same resting state once it has taken over rendering.
// Keeping one copy in a module both can import is what lets the panel be code
// split without the mascot flickering or shipping twice.
//
// Pure presentation: no state, no effects, no data. `reduceMotion` stills the
// idle animation and is the only input.

import { motion } from "framer-motion"

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
export const AVATAR_H = "clamp(68px, 11vw, 90px)"


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
export default function ConciergeRobot({ reduceMotion }) {
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
