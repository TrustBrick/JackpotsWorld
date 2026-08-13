import React from 'react'
import { motion } from 'framer-motion'

// ─── Premium floating support assistant ────────────────────────────────────
// A stylized (non-photorealistic, non-human) black+gold concierge character
// that floats above the existing ChatBot launcher and opens the SAME chat
// widget on click — it does not duplicate or replace any chat functionality,
// it's a purely visual companion to the existing button.
//
// Stacked in the same fixed bottom-right column as ChatBot's launcher and
// PageScrollButtons, directly above both, using the identical calc()
// convention PageScrollButtons already established so the three never
// overlap at any viewport size:
//   ChatBot launcher:   bottom: clamp(14px,4vw,24px), height: clamp(50px,12vw,60px)
//   PageScrollButtons:  stacked directly above the launcher
//   SupportAssistant:   stacked directly above PageScrollButtons (below)
const STACK_BOTTOM = 'calc(clamp(14px, 4vw, 24px) + clamp(50px, 12vw, 60px) + clamp(12px, 3vw, 16px) + clamp(38px, 8vw, 46px) + clamp(10px, 2.5vw, 14px))'
const SIZE = 'clamp(46px, 11vw, 64px)'

function openSupportChat() {
  // ChatBot.jsx already listens for this exact event (see its own comment:
  // "allow other parts of the app... to open this same widget without
  // needing a shared context provider") — reused as-is, nothing duplicated.
  window.dispatchEvent(new Event('open-chat'))
}

export default function SupportAssistant() {
  return (
    <motion.button
      type="button"
      onClick={openSupportChat}
      aria-label="Chat with our support assistant"
      title="Need help? Chat with us"
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.93 }}
      transition={{ duration: 0.3, delay: 0.5 }}
      className="fixed z-40"
      style={{
        bottom: STACK_BOTTOM,
        right: 'clamp(12px, 3vw, 24px)',
        width: SIZE,
        height: SIZE,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Continuous gentle float — up, down, repeat */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: '100%', height: '100%' }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: 'visible' }}>
          <defs>
            <radialGradient id="sa-glow" cx="50%" cy="42%" r="58%">
              <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="sa-head" x1="15%" y1="10%" x2="85%" y2="95%">
              <stop offset="0%" stopColor="#3a2f14" />
              <stop offset="45%" stopColor="#17110a" />
              <stop offset="100%" stopColor="#080604" />
            </linearGradient>
            <linearGradient id="sa-body" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#201d18" />
              <stop offset="100%" stopColor="#050505" />
            </linearGradient>
          </defs>

          {/* ambient glow */}
          <circle cx="50" cy="45" r="48" fill="url(#sa-glow)" />

          {/* body / shoulders */}
          <path d="M18 100 Q18 66 50 64 Q82 66 82 100 Z" fill="url(#sa-body)" stroke="#D4AF37" strokeWidth="1.1" strokeOpacity="0.55" />
          <path d="M33 69 Q50 79 67 69" fill="none" stroke="#D4AF37" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />

          {/* head */}
          <circle cx="50" cy="41" r="27" fill="url(#sa-head)" stroke="#D4AF37" strokeWidth="1.2" strokeOpacity="0.65" />

          {/* headset band + ear cups */}
          <path d="M24 37 Q50 9 76 37" fill="none" stroke="#D4AF37" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="24" cy="39" r="4.8" fill="#D4AF37" />
          <circle cx="76" cy="39" r="4.8" fill="#D4AF37" />
          {/* mic boom */}
          <path d="M76 43 Q71 54 61 57" fill="none" stroke="#D4AF37" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="61" cy="57" r="2.1" fill="#F5E07A" />

          {/* small crown accent */}
          <path d="M41 17 L44.5 8.5 L50 15 L55.5 8.5 L59 17 Z" fill="#D4AF37" />
          <circle cx="50" cy="15" r="1.4" fill="#F5E07A" />

          {/* eyes — blink by squashing ry to near-zero and back */}
          <motion.ellipse
            cx="40.5" cy="41.5" rx="3.1" fill="#F5E07A"
            animate={{ ry: [3.6, 3.6, 0.3, 3.6, 3.6] }}
            transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.9, 0.94, 0.98, 1], ease: 'easeInOut' }}
          />
          <motion.ellipse
            cx="59.5" cy="41.5" rx="3.1" fill="#F5E07A"
            animate={{ ry: [3.6, 3.6, 0.3, 3.6, 3.6] }}
            transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.9, 0.94, 0.98, 1], ease: 'easeInOut' }}
          />

          {/* friendly smile */}
          <path d="M40 51.5 Q50 58 60 51.5" fill="none" stroke="#F5E07A" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      </motion.div>
    </motion.button>
  )
}
