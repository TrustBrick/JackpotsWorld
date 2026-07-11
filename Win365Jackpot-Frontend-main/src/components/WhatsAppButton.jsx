import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const WA_NUMBER = '+917795281999'
const WA_MESSAGE = encodeURIComponent("Hi! I'm interested in a casino package from jackpotsworld.com 🎰 Please help me!")

const TG_USERNAME = 'yourwinningdestination888'
const TG_MESSAGE = encodeURIComponent("Hi! I'm interested in a casino package from jackpotsworld.com 🎰 Please help me!")

const BTN  = 'clamp(48px, 12vw, 64px)'
const ICON = 'clamp(28px, 7vw, 36px)'

export default function WhatsAppButton() {
  const [hoveredWA, setHoveredWA] = useState(false)
  const [hoveredTG, setHoveredTG] = useState(false)
  const [showTooltip, setShowTooltip] = useState(true)

  React.useEffect(() => {
    const t = setTimeout(() => setShowTooltip(false), 5000)
    return () => clearTimeout(t)
  }, [])

  const handleTelegramClick = (e) => {
    e.preventDefault()
    // Try native app first via username
    window.location.href = `tg://resolve?domain=${TG_USERNAME}&text=${TG_MESSAGE}`
    // Fallback to web after 1s
    setTimeout(() => {
      window.open(`https://t.me/${TG_USERNAME}?text=${TG_MESSAGE}`, '_blank')
    }, 1000)
  }

  return (
    <div
      className="fixed z-50 flex flex-col items-end gap-3"
      style={{
        bottom: 'clamp(14px, 4vw, 24px)',
        right:  'clamp(12px, 3vw, 24px)',
      }}
    >

      {/* ── WA Tooltip ── */}
      <AnimatePresence>
        {(hoveredWA || showTooltip) && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative"
          >
            <div
              className="px-4 py-3 rounded-2xl rounded-br-none shadow-2xl"
              style={{
                maxWidth: 'clamp(160px, 45vw, 200px)',
                background: 'linear-gradient(135deg, #075E54, #128C7E)',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              <div className="font-body font-light font-bold text-white mb-0.5" style={{ fontSize: 'clamp(11px, 3vw, 14px)' }}>
                Chat with us! 🎰
              </div>
              <div className="font-body font-light text-white/70" style={{ fontSize: 'clamp(9px, 2.5vw, 12px)' }}>
                Book your casino package in minutes
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="font-body font-light text-green-300" style={{ fontSize: 'clamp(9px, 2.5vw, 12px)' }}>
                  Online now
                </span>
              </div>
            </div>
            <div
              className="absolute bottom-0 right-0 w-0 h-0"
              style={{
                borderLeft: '10px solid transparent',
                borderTop: '10px solid #128C7E',
                transform: 'translateY(100%)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── WhatsApp Button ── */}
      <motion.a
        href={`https://wa.me/${WA_NUMBER.replace(/\D/g, '')}?text=${WA_MESSAGE}`}
        target="_blank"
        rel="noopener noreferrer"
        onHoverStart={() => setHoveredWA(true)}
        onHoverEnd={() => setHoveredWA(false)}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.95 }}
        className="relative flex items-center justify-center cursor-pointer"
        style={{ width: BTN, height: BTN, touchAction: 'manipulation' }}
        aria-label="Chat on WhatsApp"
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'rgba(37,211,102,0.3)' }}
          animate={{ scale: [1, 1.5, 1.5], opacity: [0.8, 0, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'rgba(37,211,102,0.2)' }}
          animate={{ scale: [1, 1.8, 1.8], opacity: [0.6, 0, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
        />
        <div
          className="rounded-full flex items-center justify-center shadow-2xl relative overflow-hidden"
          style={{
            width: BTN, height: BTN,
            background: 'linear-gradient(135deg, #25D366, #128C7E)',
            boxShadow: '0 4px 25px rgba(37,211,102,0.5), 0 0 0 2px rgba(255,255,255,0.1)',
          }}
        >
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)' }}
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <svg viewBox="0 0 24 24" style={{ width: ICON, height: ICON }} className="relative z-10" fill="white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </div>
      </motion.a>

      {/* ── Telegram Tooltip ── */}
      <AnimatePresence>
        {hoveredTG && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative"
          >
            <div
              className="px-4 py-3 rounded-2xl rounded-br-none shadow-2xl"
              style={{
                maxWidth: 'clamp(160px, 45vw, 200px)',
                background: 'linear-gradient(135deg, #1c6fa3, #2AABEE)',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              <div className="font-body font-light font-bold text-white mb-0.5" style={{ fontSize: 'clamp(11px, 3vw, 14px)' }}>
                Message on Telegram! ✈️
              </div>
              <div className="font-body font-light text-white/70" style={{ fontSize: 'clamp(9px, 2.5vw, 12px)' }}>
                Quick replies, instant support
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" />
                <span className="font-body font-light text-blue-200" style={{ fontSize: 'clamp(9px, 2.5vw, 12px)' }}>
                  Online now
                </span>
              </div>
            </div>
            <div
              className="absolute bottom-0 right-0 w-0 h-0"
              style={{
                borderLeft: '10px solid transparent',
                borderTop: '10px solid #2AABEE',
                transform: 'translateY(100%)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Telegram Button ── */}
      <motion.a
        href={`https://t.me/${TG_USERNAME}?text=${TG_MESSAGE}`}
        onClick={handleTelegramClick}
        target="_blank"
        rel="noopener noreferrer"
        onHoverStart={() => setHoveredTG(true)}
        onHoverEnd={() => setHoveredTG(false)}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.95 }}
        className="relative flex items-center justify-center cursor-pointer"
        style={{ width: BTN, height: BTN, touchAction: 'manipulation' }}
        aria-label="Chat on Telegram"
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'rgba(42,171,238,0.3)' }}
          animate={{ scale: [1, 1.5, 1.5], opacity: [0.8, 0, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
        />
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'rgba(42,171,238,0.2)' }}
          animate={{ scale: [1, 1.8, 1.8], opacity: [0.6, 0, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.8 }}
        />
        <div
          className="rounded-full flex items-center justify-center shadow-2xl relative overflow-hidden"
          style={{
            width: BTN, height: BTN,
            background: 'linear-gradient(135deg, #2AABEE, #1c6fa3)',
            boxShadow: '0 4px 25px rgba(42,171,238,0.5), 0 0 0 2px rgba(255,255,255,0.1)',
          }}
        >
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)' }}
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <svg viewBox="0 0 24 24" style={{ width: ICON, height: ICON }} className="relative z-10" fill="white">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
        </div>
      </motion.a>
    </div>
  )
}