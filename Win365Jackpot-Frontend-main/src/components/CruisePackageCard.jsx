import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Anchor, Ship, Bed, UtensilsCrossed, Wine, Coins, Drama, Sparkles, Waves,
  CheckCircle2, MessageCircle, Plane, Hotel, Car, Ticket, ConciergeBell,
  ShieldCheck, Crown, Gem, MapPin, Music, Star,
} from 'lucide-react'
import { buildWhatsAppLink } from '../services/enquiryContact'
import useEnquiryMessage from '../hooks/useEnquiryMessage'
// Enquiry routing is decided by the visitor's country, not by a stored
// number — see services/enquiryContact.js. Same hook CountryPackages wraps
// as useWhatsAppNumber(); called directly here rather than importing that
// private wrapper.
import useEnquiryNumber from '../hooks/useEnquiryNumber'

/**
 * One Cruise Offline Casino Package card, rendered entirely from Back Office
 * data (authapp.CruisePackage + its details and media).
 *
 * WAS HARDCODED. Every string, icon, detail row, checklist line and carousel
 * image in here used to be a literal inside CountryPackages.jsx, editable only
 * by a developer. The layout, colours and spacing are unchanged — this is the
 * same card reading from an endpoint instead of from source.
 *
 * ACCENT COLOUR IS DATA NOW. The old card hardcoded #22d3ee in roughly twenty
 * places. It comes from `accent_color` here, so a second package can be a
 * different colour without touching this file. `withAlpha` builds the
 * translucent variants the design uses rather than storing twenty more
 * columns.
 *
 * MEDIA FALLS BACK TO THE STATIC FILES. A package with no uploaded slides
 * shows the two photographs the old carousel shipped with. They live in the
 * frontend's /public/assets and are present in every environment, whereas an
 * upload lives in MEDIA_ROOT (an S3 bucket in production) — which is exactly
 * why the seeding migration does NOT write media rows. Same reasoning as
 * experiences/shared.js FALLBACK_IMAGES.
 */

/* Lucide names an admin can type into `icon_name`. An unknown name falls back
   to a neutral icon rather than crashing the section — the same contract
   experiences/shared.js iconFor() offers. */
const ICON_MAP = {
  Ship, Bed, UtensilsCrossed, Wine, Coins, Drama, Sparkles, Waves, Anchor,
  Plane, Hotel, Car, Ticket, ConciergeBell, ShieldCheck, Crown, Gem, MapPin,
  Music, Star,
}

function iconFor(name) {
  return ICON_MAP[name] || Gem
}

/** The two photographs the hardcoded carousel used, for a package with no
    uploaded media. See the note above for why these are not seeded rows. */
const FALLBACK_MEDIA = [
  { id: 'fallback-msc', media: '/assets/images/vip/msc-cruise.jpg', media_type: 'image', label: '' },
  { id: 'fallback-star', media: '/assets/images/vip/star-cruises.jpg', media_type: 'image', label: '' },
]

/** `#22d3ee` + 0.35 -> `rgba(34,211,238,0.35)`.
 *
 *  The design needs the accent at a dozen different opacities. Hex-with-alpha
 *  suffixes (`${c}35`) would be shorter but only work for 6-digit hex, and
 *  accent_color is free text an admin can type — a named colour or an rgb()
 *  would produce silently broken CSS. This parses what it understands and
 *  hands anything else back untouched, so a strange value degrades to a flat
 *  colour instead of an invisible border. */
function withAlpha(color, alpha) {
  const hex = String(color || '').trim()
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex || `rgba(34,211,238,${alpha})`
  let body = m[1]
  if (body.length === 3) body = body.split('').map(c => c + c).join('')
  const n = parseInt(body, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/* ── The media strip ──────────────────────────────────────────────────────
   Unchanged behaviour from the CruiseCarousel this replaces: a 3s rotation,
   dots, prev/next, and a caption when the slide has one. It takes its slides
   as a prop now instead of closing over a module-level array, and it plays a
   video slide rather than only rendering images, because the media table
   allows either. */
function CruiseCarousel({ slides, accent }) {
  const [idx, setIdx] = useState(0)
  const timerRef = useRef(null)

  const count = slides.length
  const current = slides[Math.min(idx, count - 1)]

  useEffect(() => {
    if (count < 2) return undefined
    timerRef.current = setInterval(() => setIdx(p => (p + 1) % count), 3000)
    return () => clearInterval(timerRef.current)
  }, [count])

  // An admin deleting a slide can leave the index past the end.
  useEffect(() => {
    if (count > 0 && idx >= count) setIdx(0)
  }, [count, idx])

  const jump = (i) => {
    setIdx(i)
    clearInterval(timerRef.current)
    if (count > 1) {
      timerRef.current = setInterval(() => setIdx(p => (p + 1) % count), 3000)
    }
  }

  if (!current) return null

  return (
    <div style={{ position: 'relative', height: 'clamp(220px,45vw,400px)', overflow: 'hidden' }}>
      <AnimatePresence mode="wait">
        {current.media_type === 'video' ? (
          <motion.video
            key={current.id}
            src={current.media}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <motion.img
            key={current.id}
            src={current.media}
            alt={current.label || ''}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
      </AnimatePresence>

      {/* Gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />

      {/* Caption + dots */}
      <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        {current.label ? (
          <span style={{
            fontSize: 'clamp(0.7rem,2.5vw,0.82rem)', fontWeight: 600, color: '#fff',
            background: 'rgba(0,0,0,0.45)', padding: '3px 10px', borderRadius: 6,
          }}>
            {current.label}
          </span>
        ) : <span />}
        {count > 1 && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {slides.map((s, i) => (
              <button key={s.id} onClick={() => jump(i)} aria-label={`Show slide ${i + 1}`} style={{
                padding: 0, border: 'none', cursor: 'pointer',
                borderRadius: i === idx ? 4 : '50%',
                width: i === idx ? 18 : 6, height: 6,
                background: i === idx ? accent : 'rgba(255,255,255,0.3)',
                transition: 'all 0.25s', touchAction: 'manipulation',
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Prev / Next */}
      {count > 1 && [
        { label: '‹', fn: () => jump((idx - 1 + count) % count), side: { left: 10 } },
        { label: '›', fn: () => jump((idx + 1) % count), side: { right: 10 } },
      ].map(a => (
        <button key={a.label} onClick={a.fn} style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...a.side,
          width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
          fontSize: '1.2rem', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
        }}>
          {a.label}
        </button>
      ))}
    </div>
  )
}

export default function CruisePackageCard({ pkg, inView }) {
  const whatsappNumber = useEnquiryNumber()
  const enquiryMsg = useEnquiryMessage(pkg.enquiry_key || 'cruise_package')

  const accent = pkg.accent_color || '#22d3ee'
  const TitleIcon = iconFor(pkg.icon_name)

  const slides = (pkg.media && pkg.media.length) ? pkg.media : FALLBACK_MEDIA
  const details = pkg.details || []
  const highlights = pkg.highlights || []
  const inclusions = pkg.inclusions || []

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay: 0.3 }}
      style={{ marginTop: 48, maxWidth: 820, marginLeft: 'auto', marginRight: 'auto' }}
    >
      {/* Label above. Omitted entirely when an admin clears it, rather than
          leaving an empty pill floating over the card. */}
      {pkg.eyebrow_text && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 'clamp(0.6rem,2.2vw,0.7rem)',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: withAlpha(accent, 0.7), border: `1px solid ${withAlpha(accent, 0.25)}`,
            borderRadius: 50, padding: '4px 16px',
          }}>
            <Anchor size={11} color={withAlpha(accent, 0.7)} />
            {pkg.eyebrow_text}
          </span>
        </div>
      )}

      <div style={{
        borderRadius: 20,
        border: `1px solid ${withAlpha(accent, 0.35)}`,
        background: withAlpha(accent, 0.03),
        overflow: 'hidden',
        boxShadow: `0 0 60px ${withAlpha(accent, 0.08)}`,
      }}>
        {/* Auto-scrolling media strip */}
        <CruiseCarousel slides={slides} accent={accent} />

        {/* Content */}
        <div style={{ padding: 'clamp(20px,5vw,36px) clamp(18px,5vw,40px)' }}>

          {/* Header row */}
          <div style={{
            display: 'flex', alignItems: 'flex-start',
            justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  background: withAlpha(accent, 0.08),
                  border: `1px solid ${withAlpha(accent, 0.25)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <TitleIcon size={26} color={accent} strokeWidth={1.5} />
                </div>
                <div>
                  <div style={{
                    fontSize: 'clamp(1.2rem,5vw,1.7rem)', fontWeight: 900,
                    color: accent, lineHeight: 1,
                  }}>
                    {pkg.title}
                  </div>
                  {pkg.subtitle && (
                    <div style={{
                      fontSize: 'clamp(0.65rem,2.2vw,0.75rem)',
                      color: 'rgba(var(--w365-text-rgb),0.60)', marginTop: 4, fontStyle: 'italic',
                    }}>
                      {pkg.subtitle}
                    </div>
                  )}
                </div>
              </div>

              {/* Route pills */}
              {highlights.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {highlights.map(r => (
                    <span key={r} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 'clamp(0.62rem,2vw,0.72rem)', padding: '3px 10px', borderRadius: 20,
                      background: withAlpha(accent, 0.08), border: `1px solid ${withAlpha(accent, 0.2)}`,
                      color: withAlpha(accent, 0.8),
                    }}>
                      <Waves size={10} color={withAlpha(accent, 0.8)} />
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${withAlpha(accent, 0.12)}`, marginBottom: 20 }} />

          {/* Details grid */}
          {details.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,220px),1fr))',
              gap: 14, marginBottom: 24,
            }}>
              {details.map(row => {
                const RowIcon = iconFor(row.icon_name)
                return (
                  <div key={row.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${withAlpha(accent, 0.08)}`,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: withAlpha(accent, 0.06),
                      border: `1px solid ${withAlpha(accent, 0.12)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <RowIcon size={18} color={accent} strokeWidth={1.5} />
                    </div>
                    <div>
                      <div style={{
                        fontSize: '0.62rem', color: 'rgba(var(--w365-text-rgb),0.50)',
                        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2,
                      }}>
                        {row.label}
                      </div>
                      <div style={{
                        fontSize: 'clamp(0.72rem,2.5vw,0.8rem)',
                        color: 'rgba(var(--w365-text-rgb),0.72)', fontWeight: 500,
                      }}>
                        {row.value}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Inclusions checklist */}
          {inclusions.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,180px),1fr))',
              gap: 8, marginBottom: 28,
            }}>
              {inclusions.map((item, j) => (
                <div key={j} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 'clamp(0.68rem,2.5vw,0.76rem)',
                  color: 'rgba(var(--w365-text-rgb),0.80)',
                }}>
                  <CheckCircle2 size={14} color={accent} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                  {item}
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          {pkg.cta_text && (
            <div style={{ maxWidth: 380, margin: '0 auto' }}>
              <a
                href={buildWhatsAppLink(whatsappNumber, enquiryMsg)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', textDecoration: 'none' }}
              >
                <motion.button
                  whileHover={{ scale: 1.04, boxShadow: '0 0 30px rgba(37,211,102,0.5)' }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '13px 20px',
                    borderRadius: 50,
                    background: 'linear-gradient(135deg,#25D366,#128C7E)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 'clamp(0.75rem,3vw,0.85rem)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  <TitleIcon size={16} color="white" />
                  <MessageCircle size={16} color="white" />
                  {pkg.cta_text}
                </motion.button>
              </a>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
