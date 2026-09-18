import React, { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { useExperiencePillar, iconFor, imageFor, SECTION_PAD, CONTAINER, HEADER_GAP } from './shared'
import ExperienceEnquiryModal from './ExperienceEnquiryModal'

/**
 * §9 HOTELS & RESORTS — "stay somewhere exceptional".
 *
 * ITS OWN IDENTITY: an editorial list, not cards. Each row is a hairline rule,
 * an index in the margin and a column of prose — closer to a contents page
 * than to a product grid, which is what keeps it distinct from the Luxury
 * Travel panels above and the Dining rail below while using the same gold,
 * the same type and the same dark ground.
 *
 * NAMES NOBODY IT CANNOT. There is no hotel data on this platform yet, so the
 * seeded rows describe the KIND of stay that can be arranged. When a real
 * property is signed, an admin adds it in Back Office with its own name,
 * destination and photograph, and it slots into this same list.
 *
 * The picture is a letterbox strip inside the prose column rather than a
 * thumbnail beside it, so a row with no photograph is just a shorter row and
 * the list never develops a column of empty boxes. imageFor() also stops a row
 * that names a real property from borrowing a generic stock photograph — see
 * its own note.
 */
export default function StaysSection() {
  const { items, loading } = useExperiencePillar('stay')
  const reduceMotion = useReducedMotion()
  const [enquiring, setEnquiring] = useState(null)

  if (loading || items.length === 0) return null

  return (
    <section id="stays" style={{ padding: SECTION_PAD }}>
      <div style={{ ...CONTAINER }}>
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.55 }}
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end',
            justifyContent: 'space-between', gap: 20,
            marginBottom: HEADER_GAP,
            paddingBottom: 'clamp(20px, 4vw, 30px)',
            borderBottom: '1px solid rgba(212,175,55,0.22)',
          }}
        >
          <div style={{ maxWidth: 620 }}>
            <p
              className="font-body"
              style={{ fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--w365-text-muted)', marginBottom: 12 }}
            >
              Where You Stay
            </p>
            <h2
              className="font-display section-heading"
              style={{ fontSize: 'clamp(1.9rem, 6.2vw, 3.3rem)', fontWeight: 600, lineHeight: 1.06, marginBottom: 14 }}
            >
              Hotels &amp; <span className="gold-text">Resorts</span>
            </h2>
            <p
              className="font-body"
              style={{ color: 'var(--w365-text-muted)', fontSize: 'clamp(0.92rem, 2.4vw, 1.05rem)', lineHeight: 1.7 }}
            >
              Stay somewhere exceptional. Rooms, suites and resorts arranged
              through our network, close to the destinations we introduce
              members to.
            </p>
          </div>
        </motion.header>

        <div>
          {items.map((item, i) => (
            <StayRow
              key={item.id}
              item={item}
              index={i}
              last={i === items.length - 1}
              reduceMotion={reduceMotion}
              onEnquire={() => setEnquiring(item)}
            />
          ))}
        </div>
      </div>

      <ExperienceEnquiryModal
        experience={enquiring}
        isOpen={!!enquiring}
        onClose={() => setEnquiring(null)}
      />
    </section>
  )
}

function StayRow({ item, index, last, reduceMotion, onEnquire }) {
  const Icon = iconFor(item.icon_name)
  const accent = item.accent_color || '#D4AF37'
  const image = imageFor(item)
  const [hovered, setHovered] = useState(false)

  // The place line only appears when the row actually has one. A seeded,
  // network-wide row has neither, and inventing "Worldwide" would be filling a
  // gap with a claim.
  const place = [item.destination_name, item.city].filter(Boolean).join(' · ')

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay: reduceMotion ? 0 : index * 0.07 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="exp-stay-row"
      style={{
        padding: 'clamp(20px, 4vw, 30px) clamp(4px, 2vw, 14px)',
        borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.07)',
        transition: 'background 0.3s',
        background: hovered ? 'rgba(212,175,55,0.035)' : 'transparent',
      }}
    >
      {/* Hangs in the margin on desktop; sits above the title on mobile, where
          the CSS collapses the row to one column. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="font-heading"
          aria-hidden="true"
          style={{ fontSize: 'clamp(1.1rem, 3vw, 1.35rem)', fontWeight: 900, color: accent, opacity: 0.65, letterSpacing: '0.02em' }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <Icon size={17} style={{ color: accent, opacity: 0.75, flexShrink: 0 }} />
      </div>

      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 14px', marginBottom: 8 }}>
          <h3
            className="font-heading"
            style={{ fontSize: 'clamp(1.1rem, 3.4vw, 1.55rem)', fontWeight: 800, lineHeight: 1.2, color: 'var(--w365-text)' }}
          >
            {item.title}
          </h3>
          {item.subtitle && (
            <span
              className="font-body"
              style={{ fontSize: 12.5, color: accent, letterSpacing: '0.04em' }}
            >
              {item.subtitle}
            </span>
          )}
        </div>

        {place && (
          <p
            className="font-body"
            style={{ fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--w365-text-muted)', opacity: 0.85, marginBottom: 10 }}
          >
            {item.destination_flag ? `${item.destination_flag} ` : ''}{place}
          </p>
        )}

        {item.description && (
          <p
            className="font-body"
            style={{ color: 'var(--w365-text-muted)', fontSize: 'clamp(0.87rem, 2.1vw, 0.98rem)', lineHeight: 1.72, maxWidth: 640, marginBottom: 14 }}
          >
            {item.description}
          </p>
        )}

        {image && (
          <div
            style={{
              position: 'relative', borderRadius: 14, overflow: 'hidden',
              maxWidth: 640, aspectRatio: '21 / 9', marginBottom: 16,
              border: `1px solid ${accent}2e`,
            }}
          >
            <img
              src={image}
              alt={item.title}
              loading="lazy"
              style={{
                width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                transform: hovered && !reduceMotion ? 'scale(1.04)' : 'scale(1)',
                transition: 'transform 0.6s ease',
              }}
            />
            {/* Keeps the strip in the page's dark register rather than
                punching a bright rectangle through the section. */}
            <div
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 100%)' }}
            />
          </div>
        )}

        {/* Only ever a partner an admin actually entered. */}
        {item.partner && (
          <p className="font-body" style={{ fontSize: 12, color: 'var(--w365-text-muted)', marginBottom: 14 }}>
            Arranged with <span style={{ color: accent }}>{item.partner}</span>
          </p>
        )}

        <button
          onClick={onEnquire}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 12, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
            color: accent, fontFamily: 'inherit',
            borderBottom: `1px solid ${hovered ? accent : 'transparent'}`,
            transition: 'border-color 0.25s',
          }}
        >
          {item.cta_text || 'Enquire Now'}
          <ArrowUpRight size={14} style={{ transform: hovered ? 'translate(2px,-2px)' : 'none', transition: 'transform 0.25s' }} />
        </button>
      </div>
    </motion.div>
  )
}
