import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ScrollLink from './shared/ScrollLink'
import { Link as RouterLink } from 'react-router-dom'
import { Globe, Mail } from 'lucide-react'
import BrandLockup from './shared/BrandLockup'
import { SECTION_PAD_Y, GUTTER, CONTAINER } from '../utils/layout'
import useEnquiryNumber from '../hooks/useEnquiryNumber'
import useEnquiryMessage from '../hooks/useEnquiryMessage'
import { buildWhatsAppLink } from '../services/enquiryContact'
import { enquiryContext, recordWhatsAppClick } from '../services/whatsappEnquiryService'

const PRIMARY_DESTINATIONS = ['Vietnam', 'Macau', 'India (Goa)', 'Sri Lanka', 'Philippines']
const EXTRA_DESTINATIONS   = ['Las Vegas', 'Malaysia', 'Singapore', 'Armenia', 'Georgia']
const ALL_DESTINATIONS     = [...PRIMARY_DESTINATIONS, ...EXTRA_DESTINATIONS]

// The message is no longer a literal either: useEnquiryMessage() reads it from
// the Back Office, falling back to the same wording this constant held. The
// number is resolved per visitor by useEnquiryNumber(), as before.

// The two contact lines under the brand paragraph. Both are real links: the
// domain opens the site, the address opens a mail client — they used to be
// plain <div>s, so a visitor who could make them out still could not use them.
const CONTACT_LINKS = [
  { label: 'www.jackpotsworld.vip', href: 'https://www.jackpotsworld.vip', Icon: Globe, external: true },
  { label: 'support@jackpotsworld.vip', href: 'mailto:support@jackpotsworld.vip', Icon: Mail },
]

const SOCIAL_LINKS = [
  {
    name: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61594656950813',
    color: '#1877F2', bg: 'rgba(24,119,242,0.08)', border: 'rgba(24,119,242,0.2)',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="#1877F2">
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.412c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.971H15.83c-1.49 0-1.955.931-1.955 1.886v2.265h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
      </svg>
    ),
  },
  {
    name: 'Instagram', href: 'https://www.instagram.com/jackpotsworld.vip/',
    color: '#E1306C', bg: 'rgba(225,48,108,0.08)', border: 'rgba(225,48,108,0.2)',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#E1306C" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="1.1" fill="#E1306C" stroke="none" />
      </svg>
    ),
  },
  {
    name: 'Telegram', href: 'https://t.me/jackpotsworld_2026',
    color: '#2AABEE', bg: 'rgba(42,171,238,0.08)', border: 'rgba(42,171,238,0.2)',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="#2AABEE">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/channel/UCgSKujxp4LKmKLnBuLSCT9Q/posts?pvf=CAE%253D',
    color: '#FF0000', bg: 'rgba(255,0,0,0.08)', border: 'rgba(255,0,0,0.2)',
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="#FF0000">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
]

const SHOW_SOCIAL_LINKS = true

export default function Footer() {
  const [open, setOpen] = useState(false)
  const enquiryNumber = useEnquiryNumber()
  const enquiryMessage = useEnquiryMessage('footer_general')

  return (
    // Same gutter and container as every section above it, so the brand
    // lockup starts on the page's own left edge rather than 60px inside it.
    // The vertical padding is the shared section rhythm at the top and a
    // tighter figure at the bottom — nothing follows it.
    <footer id="contact" style={{
      borderTop: '1px solid rgba(212,175,55,0.15)',
      padding: `${SECTION_PAD_Y} ${GUTTER} 18px`,
      background: 'rgba(var(--w365-bg-rgb),0.85)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',

    }}>
      <div style={{ ...CONTAINER }}>

        {/* ── Main grid ── */}
        {/* Columns live in index.css (.w365-footer-grid): the brand column is
            wider than the two link columns, and the whole thing stacks below
            620px. */}
        <div className="w365-footer-grid" style={{ marginBottom: 26 }}>

          {/* Brand */}
          <div>
            {/* Emblem BESIDE the wordmark, not stacked above it. The wordmark
                is itself two stacked lines ("Jackpots" over "World"), so the
                old flex-col put the mark on a third line and the lockup ran
                three rows deep for no reason. Side by side it reads as one
                signature and is 41px tall instead of 81. */}
            <BrandLockup style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 12.5, color: 'var(--w365-text-muted)', lineHeight: 1.65, marginBottom: 14, maxWidth: 420 }}>
              Asia's premier Offline casinos promotion platform. Connecting players to world-class gaming experiences across the globe.
            </p>

            {/* The site and the support address were rgba(212,175,55,0.4) —
                gold at 40% over a near-black background, which measures well
                under the 4.5:1 contrast floor and is what made them all but
                invisible. They are also the two things in this column a
                visitor might actually want to USE, so they are now links: full
                gold, an icon each, and brightening on hover. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
              {CONTACT_LINKS.map(c => (
                <a
                  key={c.label}
                  href={c.href}
                  target={c.external ? '_blank' : undefined}
                  rel={c.external ? 'noopener noreferrer' : undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    fontSize: 12.5, color: '#D4AF37', textDecoration: 'none',
                    width: 'fit-content', transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#F5E07A' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#D4AF37' }}
                >
                  <c.Icon size={13} style={{ flexShrink: 0, opacity: 0.85 }} />
                  {c.label}
                </a>
              ))}
            </div>

            {/* Social icons */}
            {SHOW_SOCIAL_LINKS && (
              <div style={{ display: 'flex', gap: 9 }}>
                {SOCIAL_LINKS.map(s => (
                  <a
                    key={s.name}
                    href={s.href}
                    target="_blank" rel="noopener noreferrer"
                    aria-label={s.name}
                    style={{
                      width: 31, height: 31, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: s.bg,
                      border: `1px solid ${s.border}`,
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Destinations */}
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>
              Destinations
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
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
                  style={{ listStyle: 'none', padding: 0, margin: '7px 0 0', display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden' }}
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
                marginTop: 10, background: 'none', border: 'none',
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

          {/* Company */}
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>
              Company
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>

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
                  href={buildWhatsAppLink(enquiryNumber, enquiryMessage)}
                  target="_blank" rel="noopener noreferrer"
                  // WHATSAPP-LEADS: records the press; deliberately does not
                  // preventDefault, so the link behaves exactly as before.
                  onClick={() => recordWhatsAppClick(enquiryContext({
                    source: 'footer_general',
                    message: enquiryMessage,
                    destinationNumber: enquiryNumber,
                  }))}
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
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 16 }}/>

        {/* ── Disclaimer ── */}
        <div style={{
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '11px 18px',
          marginBottom: 16,
          background: 'rgba(255,255,255,0.02)',
        }}>
          <p style={{ fontSize: 11.5, color: 'var(--w365-text-muted)', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
            <span style={{ color: 'rgba(212,175,55,0.55)', fontWeight: 600 }}>⚠ Responsible Gaming: </span>
            Gambling involves risk. Please play responsibly. Jackpotsworld promotes responsible gaming and only serves adults aged 21+.
            If you or someone you know has a gambling problem, please seek help. jackpotsworld.vip is a promotional platform only.
          </p>
        </div>

        {/* ── Copyright ── */}
        <div style={{
          display: 'flex', flexWrap: 'wrap',
          justifyContent: 'space-between', alignItems: 'center',
          gap: 12, fontSize: 11.5, color: 'var(--w365-text-muted)',
        }}>
          <span>© 2026 jackpotsworld.vip — All Rights Reserved</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🇻🇳 🇲🇴 🇮🇳 🇱🇰 🇵🇭 🇺🇸 🇲🇾 🇸🇬 🇦🇲 🇬🇪</span>
            <span style={{ display: 'none' }}>— Asia's Premier Casino Platform</span>
          </div>
        </div>

      </div>
    </footer>
  )
}