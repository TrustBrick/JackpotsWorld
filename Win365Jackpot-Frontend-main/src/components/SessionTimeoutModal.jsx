// src/components/SessionTimeoutModal.jsx
// Inactivity warning shown one minute before the session is cut. Styling is
// lifted from the existing panels (BannedScreen / AdminLoginScreen): Manrope,
// gold accent, framer-motion entrance, the same radii and border tokens — no
// new design language.
//
// It renders above every panel from a single mount point in App.jsx, so it
// can't use AdminThemeContext (that provider lives inside the admin routes).
// The admin palette is read from the same localStorage key the provider
// persists to, which keeps the modal in step with the admin light theme.

import React, { useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, LogOut, ShieldCheck } from 'lucide-react'
import { roleForPath } from '../config/session'

const DARK = {
  panel:  '#0F0F16',
  border: 'rgba(255,255,255,0.08)',
  text:   '#FFFFFF',
  sub:    'rgba(255,255,255,0.45)',
  ghostBg:     'rgba(255,255,255,0.04)',
  ghostBorder: 'rgba(255,255,255,0.12)',
  ghostText:   'rgba(255,255,255,0.75)',
  scrim:  'rgba(4,4,8,0.62)',
  gold:   '#D4AF37',
  onGold: '#07080F',
}

const LIGHT = {
  panel:  '#FFFFFF',
  border: 'rgba(0,0,0,0.10)',
  text:   '#161512',
  sub:    'rgba(22,21,18,0.55)',
  ghostBg:     'rgba(0,0,0,0.035)',
  ghostBorder: 'rgba(0,0,0,0.14)',
  ghostText:   'rgba(22,21,18,0.7)',
  scrim:  'rgba(30,28,22,0.35)',
  gold:   '#B8860B',
  onGold: '#FFFFFF',
}

// Only the Back Office has a light mode; the public site and user dashboard
// are permanently dark (see App.jsx, which clears any stale 'w365-theme').
// Recomputed each time the modal opens, not once on mount: this component
// stays mounted for the whole session, so a palette memoised on [] would be
// frozen to whatever route the app happened to load on — a user who opened
// the site at / and later navigated to a light-themed /admin-panel would get
// a dark modal over a light panel.
function usePalette(open) {
  return useMemo(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '/'
    const role = roleForPath(path)
    if (role !== 'admin' && role !== 'superadmin') return DARK
    try {
      const cached = JSON.parse(localStorage.getItem('admin_user') || 'null')
      const pref = cached?.theme_preference || localStorage.getItem('w365-admin-theme')
      return pref === 'light' ? LIGHT : DARK
    } catch {
      return DARK
    }
  }, [open])
}

export default function SessionTimeoutModal({ open, secondsLeft, onStay, onLogout }) {
  const P = usePalette(open)
  const stayRef = useRef(null)

  // Focus the safe action so keyboard users can extend with Enter, and so the
  // dialog owns focus rather than whatever was behind it.
  useEffect(() => {
    if (open) stayRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onStay?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onStay])

  const mmss = Math.max(0, secondsLeft ?? 0)
  const label = mmss >= 60
    ? '1 minute'
    : `${mmss} second${mmss === 1 ? '' : 's'}`

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="session-timeout-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2147483000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
            background: P.scrim,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            fontFamily: "'Manrope', sans-serif",
          }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-timeout-title"
            aria-describedby="session-timeout-desc"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{
              width: '100%', maxWidth: 420,
              padding: '32px 30px 26px',
              borderRadius: 20,
              background: P.panel,
              border: `1px solid ${P.border}`,
              boxShadow: `0 24px 70px rgba(0,0,0,0.45), 0 0 60px ${P.gold}12`,
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            <div style={{
              width: 58, height: 58, borderRadius: 16, margin: '0 auto 18px',
              background: `${P.gold}14`, border: `1px solid ${P.gold}38`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Clock size={24} style={{ color: P.gold }} />
            </div>

            <div
              id="session-timeout-title"
              style={{
                fontSize: 19, fontWeight: 900, color: P.text,
                letterSpacing: '-0.01em', marginBottom: 10,
              }}
            >
              Session Expiring
            </div>

            <div
              id="session-timeout-desc"
              style={{ fontSize: 13, color: P.sub, lineHeight: 1.75, marginBottom: 20 }}
            >
              You have been inactive for a while. Your session will expire in{' '}
              <span style={{ color: P.gold, fontWeight: 800 }}>{label}</span>{' '}
              for security reasons.
            </div>

            <div style={{
              padding: '9px 14px', borderRadius: 10, marginBottom: 22,
              background: `${P.gold}0D`, border: `1px solid ${P.gold}22`,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: P.gold,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {String(Math.floor(mmss / 60)).padStart(2, '0')}
              :
              {String(mmss % 60).padStart(2, '0')} remaining
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                ref={stayRef}
                onClick={onStay}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                  background: `linear-gradient(135deg, ${P.gold}, ${P.gold}CC)`,
                  color: P.onGold, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  fontFamily: 'inherit',
                }}
              >
                <ShieldCheck size={14} /> Stay Logged In
              </button>
              <button
                onClick={onLogout}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10,
                  background: P.ghostBg, border: `1px solid ${P.ghostBorder}`,
                  color: P.ghostText, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  fontFamily: 'inherit',
                }}
              >
                <LogOut size={14} /> Logout Now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
