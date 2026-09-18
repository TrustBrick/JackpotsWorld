import React, { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useExperiencePillar, iconFor, imageFor, SECTION_PAD, CONTAINER, HEADER_GAP } from './shared'
import ExperienceEnquiryModal from './ExperienceEnquiryModal'

/**
 * §8 LUXURY TRAVEL — private jets and cruises.
 *
 * ITS OWN IDENTITY: alternating full-width panels with an oversized index
 * numeral, not a grid of equal cards. There are only ever a handful of ways to
 * travel, so each one gets a band of the page rather than a tile in a row —
 * which is also what keeps this section from looking like the Stays and Dining
 * sections below it.
 *
 * TYPOGRAPHIC FIRST. An `image` on the row is an enhancement that slots into
 * the empty half of the panel; with none, the panel is type, rule and gold
 * detailing and still reads as finished. That is deliberate: there is no
 * photography for most of these yet, and a placeholder box would look worse
 * than none.
 *
 * Renders nothing at all when the pillar is empty — an admin who deactivates
 * both cards gets no empty heading floating on the page.
 */
export default function LuxuryTravelSection() {
  const { items, loading } = useExperiencePillar('luxury_travel')
  const reduceMotion = useReducedMotion()
  const [enquiring, setEnquiring] = useState(null)

  if (loading || items.length === 0) return null

  return (
    <section
      id="luxury-travel"
      style={{
        padding: SECTION_PAD,
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(26,0,21,0.55) 45%, rgba(0,0,0,0) 100%)',
      }}
    >
      <div style={{ ...CONTAINER }}>
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.55 }}
          style={{ marginBottom: HEADER_GAP, maxWidth: 720 }}
        >
          <p
            className="font-body"
            style={{ fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--w365-text-muted)', marginBottom: 12 }}
          >
            Getting There
          </p>
          <h2
            className="font-display section-heading"
            style={{ fontSize: 'clamp(1.9rem, 6.2vw, 3.3rem)', fontWeight: 600, lineHeight: 1.06, marginBottom: 14 }}
          >
            Luxury <span className="gold-text">Travel</span>
          </h2>
          <p
            className="font-body"
            style={{ color: 'var(--w365-text-muted)', fontSize: 'clamp(0.92rem, 2.4vw, 1.05rem)', lineHeight: 1.7 }}
          >
            The journey is part of the destination. Aviation and sailing
            arranged around your plans through our network of travel partners.
          </p>
        </motion.header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(18px, 4vw, 30px)' }}>
          {items.map((item, i) => (
            <TravelPanel
              key={item.id}
              item={item}
              index={i}
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

function TravelPanel({ item, index, reduceMotion, onEnquire }) {
  const Icon = iconFor(item.icon_name)
  // Back Office upload first, then a generic stock illustration, then nothing.
  const image = imageFor(item)
  const accent = item.accent_color || '#D4AF37'
  // Alternating so the eye zig-zags down the section instead of scanning a
  // straight left edge. Flips to a single column under 900px, where an offset
  // layout has nowhere to offset to.
  const flipped = index % 2 === 1

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, delay: reduceMotion ? 0 : index * 0.08 }}
      className="casino-card exp-travel-panel"
      style={{
        display: 'grid',
        // With no image there is only one child, and letting the class's
        // auto-fit run would leave a collapsed second track that still costs a
        // column gap — the text would sit a gap-width short of the panel edge
        // for no reason. Most panels have no photography yet, so this is the
        // common case, not the edge case.
        gridTemplateColumns: image ? undefined : '1fr',
        gap: 'clamp(20px, 4vw, 44px)',
        alignItems: 'center',
        padding: 'clamp(22px, 5vw, 46px)',
        overflow: 'hidden',
        position: 'relative',
      }}
      data-flipped={flipped ? 'true' : 'false'}
    >
      {/* A wash of the row's accent, so two panels in a row are not identical
          rectangles even when neither has an image. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(120% 80% at ${flipped ? '85%' : '15%'} 0%, ${accent}14 0%, transparent 62%)`,
        }}
      />

      <div style={{ position: 'relative', order: flipped ? 2 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 46, height: 46, borderRadius: 14, flexShrink: 0,
              background: `${accent}1a`, border: `1px solid ${accent}55`,
            }}
          >
            <Icon size={21} style={{ color: accent }} />
          </span>
          <span
            className="font-heading"
            aria-hidden="true"
            style={{
              fontSize: 'clamp(2.4rem, 8vw, 4rem)', fontWeight: 900, lineHeight: 1,
              color: 'transparent', WebkitTextStroke: `1px ${accent}44`, opacity: 0.85,
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>

        {item.subtitle && (
          <p
            className="font-body"
            style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: accent, marginBottom: 10 }}
          >
            {item.subtitle}
          </p>
        )}

        <h3
          className="font-heading"
          style={{ fontSize: 'clamp(1.3rem, 4.2vw, 2rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: 12, color: 'var(--w365-text)' }}
        >
          {item.title}
        </h3>

        {item.description && (
          <p
            className="font-body"
            style={{ color: 'var(--w365-text-muted)', fontSize: 'clamp(0.88rem, 2.2vw, 1rem)', lineHeight: 1.72, marginBottom: 22, maxWidth: 560 }}
          >
            {item.description}
          </p>
        )}

        {/* ENQUIRE, not BOOK — none of this is bookable through the site. */}
        <button
          onClick={onEnquire}
          className="btn-outline-gold"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            padding: '11px 24px', borderRadius: 999,
            fontSize: 12, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
          }}
        >
          {item.cta_text || 'Enquire Now'} <ArrowRight size={14} />
        </button>
      </div>

      {/* The image half. Absent by design when there is no photography yet —
          the panel simply becomes single-column rather than showing a hole. */}
      {image && (
        <div style={{ position: 'relative', order: flipped ? 1 : 2 }}>
          <div
            style={{
              position: 'relative', borderRadius: 16, overflow: 'hidden',
              border: `1px solid ${accent}33`, aspectRatio: '16 / 11',
            }}
          >
            <img
              src={image}
              alt={item.title}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.5) 100%)' }}
            />
          </div>
        </div>
      )}
    </motion.article>
  )
}
