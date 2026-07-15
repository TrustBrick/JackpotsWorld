import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link as ScrollLink } from 'react-scroll'
import { Link as RouterLink } from 'react-router-dom'
import Logo from './shared/Logo'

const PRIMARY_DESTINATIONS = ['Vietnam', 'Macau', 'India (Goa)', 'Sri Lanka', 'Philippines']
const EXTRA_DESTINATIONS   = ['Las Vegas', 'Malaysia', 'Singapore', 'Armenia', 'Georgia']
const ALL_DESTINATIONS     = [...PRIMARY_DESTINATIONS, ...EXTRA_DESTINATIONS]

const GAMES    = ['Baccarat', 'Roulette', 'Poker', 'Blackjack', 'Slots', 'Sic Bo']
const WA_NUM   = '917795281999'
const WA_MSG   = encodeURIComponent("Hi! I'd like to get in touch with Jackpots World 🎰")

export default function Footer() {
  const [open, setOpen] = useState(false)

  return (
    <footer id="contact" style={{
      borderTop: '1px solid rgba(212,175,55,0.15)',
      padding: '64px 24px 32px',
      background: 'rgba(var(--w365-bg-rgb),0.85)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',

    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* ── Main grid ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '40px 32px',
          marginBottom: 48,
        }}>

          {/* Brand */}
          <div>
            <div style={{ marginBottom: 16 }}>
               <div className="flex flex-col leading-none">
                <img
    src='/images/jackpotsworld_watermark.png'
    className="w-10 h-10 object-contain"
  />
    <Logo size="md" />
  </div>

            </div>
            <p style={{ fontSize: 13, color: 'var(--w365-text-muted)', lineHeight: 1.7, marginBottom: 12 }}>
              Asia's premier casino promotion platform. Connecting players to world-class gaming experiences across the globe.
            </p>
            <div style={{ fontSize: 11, color: 'rgba(212,175,55,0.4)', marginBottom: 16 }}>www.jackpotsworld.casino</div>
            <div style={{ fontSize: 11, color: 'rgba(212,175,55,0.4)', marginBottom: 16 }}>support@jackpotsworld.casino</div>

            {/* Social icons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <a
                href={`https://wa.me/+917795281999`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(37,211,102,0.08)',
                  border: '1px solid rgba(37,211,102,0.2)',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
              <a
                href="https://t.me/919900756222"
                target="_blank" rel="noopener noreferrer"
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(42,171,238,0.08)',
                  border: '1px solid rgba(42,171,238,0.2)',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="#2AABEE">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Destinations */}
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
              Destinations
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PRIMARY_DESTINATIONS.map((d, i) => (
                <li key={i}>
                  <ScrollLink
                    to="packages" smooth duration={600} offset={-80}
                    style={{ fontSize: 13, color: 'var(--w365-text-muted)', cursor: 'pointer', transition: 'color 0.15s', textDecoration: 'none' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#D4AF37'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--w365-text-muted)'}
                  >
                    {d}
                  </ScrollLink>
                </li>
              ))}
            </ul>

            <AnimatePresence>
              {open && (
                <motion.ul
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}
                >
                  {EXTRA_DESTINATIONS.map((d, i) => (
                    <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                      <ScrollLink
                        to="packages" smooth duration={600} offset={-80}
                        style={{ fontSize: 13, color: 'var(--w365-text-muted)', cursor: 'pointer', transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#D4AF37'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--w365-text-muted)'}
                      >
                        {d}
                      </ScrollLink>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>

            <button
              onClick={() => setOpen(v => !v)}
              style={{
                marginTop: 12, background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 12,
                color: 'rgba(212,175,55,0.55)', padding: 0,
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#D4AF37'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(212,175,55,0.55)'}
            >
              {open ? 'Show less' : `View all ${ALL_DESTINATIONS.length} countries`}
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ fontSize: 9, lineHeight: 1 }}>▼</motion.span>
            </button>
          </div>

          {/* Games */}
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
              Games
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {GAMES.map((g, i) => (
                <li key={i}>
                  <ScrollLink
                    to="games" smooth duration={600} offset={-80}
                    style={{ fontSize: 13, color: 'var(--w365-text-muted)', cursor: 'pointer', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#D4AF37'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--w365-text-muted)'}
                  >
                    {g}
                  </ScrollLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
              Company
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

              <li>
                <ScrollLink
                  to="why" smooth duration={600} offset={-80}
                  style={{ fontSize: 13, color: 'var(--w365-text-muted)', cursor: 'pointer', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#D4AF37'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--w365-text-muted)'}
                >
                  About Us
                </ScrollLink>
              </li>

              <li>
                <a
                  href={`https://wa.me/${WA_NUM}?text=${WA_MSG}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 13, color: 'var(--w365-text-muted)', textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#D4AF37'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--w365-text-muted)'}
                >
                  Contact
                </a>
              </li>

              {/* ── Legal links ── */}
              <li style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <RouterLink
                  to="/privacy-policy"
                  style={{ fontSize: 13, color: 'var(--w365-text-muted)', textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#D4AF37'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--w365-text-muted)'}
                >
                  Privacy Policy
                </RouterLink>
              </li>

              <li>
                <RouterLink
                  to="/cookies-policy"
                  style={{ fontSize: 13, color: 'var(--w365-text-muted)', textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#D4AF37'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--w365-text-muted)'}
                >
                  Cookies Policy
                </RouterLink>
              </li>

            </ul>
          </div>

        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 24 }}/>

        {/* ── Disclaimer ── */}
        <div style={{
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '14px 20px',
          marginBottom: 24,
          background: 'rgba(255,255,255,0.02)',
        }}>
          <p style={{ fontSize: 12, color: 'var(--w365-text-muted)', textAlign: 'center', lineHeight: 1.7 }}>
            <span style={{ color: 'rgba(212,175,55,0.55)', fontWeight: 600 }}>⚠ Responsible Gaming: </span>
            Gambling involves risk. Please play responsibly. Jackpots World promotes responsible gaming and only serves adults aged 21+.
            If you or someone you know has a gambling problem, please seek help. jackpotsworld.com is a promotional platform only.
          </p>
        </div>

        {/* ── Copyright ── */}
        <div style={{
          display: 'flex', flexWrap: 'wrap',
          justifyContent: 'space-between', alignItems: 'center',
          gap: 12, fontSize: 12, color: 'var(--w365-text-muted)',
        }}>
          <span>© 2026 jackpotsworld.casino — All Rights Reserved</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🇻🇳 🇲🇴 🇮🇳 🇱🇰 🇵🇭 🇺🇸 🇲🇾 🇸🇬 🇦🇲 🇬🇪</span>
            <span style={{ display: 'none' }}>— Asia's Premier Casino Platform</span>
          </div>
        </div>

      </div>
    </footer>
  )
}