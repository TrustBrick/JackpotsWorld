import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useAllExperiences, iconFor, imageFor, SECTION_PAD, CONTAINER, HEADER_GAP } from './shared'
import ExperienceEnquiryModal from './ExperienceEnquiryModal'
import { scrollToSection } from '../../utils/scroll'

/**
 * "Beyond the Casino" — the overview band under the hero.
 *
 * Six signposts saying in one screen that this is more than a casino site, and
 * sending the visitor to the part of the page they came for. It replaces the
 * earlier seven-node journey rail: same job, far more of it, and it matches
 * the agreed design reference.
 *
 * OFFLINE CASINOS LEADS. The card order is Back Office `display_order`, and it
 * ships with casinos first — the brief is explicit that the casino identity
 * must not be reduced by the new pillars, so it opens the band rather than
 * being buried among them.
 *
 * FULLY BACK OFFICE DRIVEN. Titles, copy, icons, images, CTA labels and CTA
 * TARGETS are all rows in the `overview` category, so the band's contents and
 * where each card points can change without touching this file. The only
 * literals here are structural.
 *
 * CHIPS ARE DERIVED, AND THEY WORK. A card pointing at one of the pillar
 * sections shows up to two of that pillar's real cards as chips — so the
 * "Private Jet Travel / Cruise Journeys" chips under Luxury Travel are the
 * actual Luxury Travel rows, and they follow along when an admin adds or
 * renames one. Clicking a chip opens the enquiry for THAT service directly,
 * rather than making the visitor scroll to the section and find it again: the
 * chip already names the thing they want, so it should be the shortest path to
 * asking about it.
 */

// Which pillar each overview card's anchor corresponds to, for the chips. A
// link this map does not know simply shows no chips.
const SECTION_TO_PILLAR = {
  '#luxury-travel': 'luxury_travel',
  '#stays': 'stay',
  '#dining-entertainment': 'dining',
  '#vip-concierge': 'concierge',
}

export default function BeyondTheCasinoSection() {
  // One payload, five categories read out of it: the band's own cards plus the
  // four pillars its chips are derived from.
  const { grouped, loading } = useAllExperiences()
  const items = grouped.overview || []
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const [enquiring, setEnquiring] = useState(null)

  if (loading || items.length === 0) return null

  const go = href => {
    if (!href) return
    if (href.startsWith('#')) {
      // Shared helper, not scrollIntoView(): block:'start' puts the target's
      // top at the top of the VIEWPORT, which is behind the fixed navbar, so
      // each pillar's eyebrow and heading were hidden on arrival.
      scrollToSection(href.slice(1), { behavior: reduceMotion ? 'auto' : 'smooth' })
      return
    }
    if (/^https?:\/\//i.test(href)) {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    navigate(href)
  }

  return (
    <section
      id="beyond-the-casino"
      style={{
        padding: SECTION_PAD,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(18,3,14,0.7) 100%)',
        borderTop: '1px solid rgba(212,175,55,0.14)',
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
            style={{ fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--w365-text-muted)', marginBottom: 14 }}
          >
            More Than Just Casinos
          </p>
          <h2
            className="font-display"
            style={{ fontSize: 'clamp(2rem, 6.5vw, 3.4rem)', fontWeight: 600, lineHeight: 1.06, marginBottom: 16, color: 'var(--w365-text)' }}
          >
            Beyond the <span className="gold-text">Casino</span>
          </h2>
          <p
            className="font-body"
            style={{ color: 'var(--w365-text-muted)', fontSize: 'clamp(0.92rem, 2.4vw, 1.04rem)', lineHeight: 1.7 }}
          >
            Your destination. Your experience. Your way. One VIP host arranging
            the whole trip, from the casino floor to the flight home.
          </p>
        </motion.header>

        <div className="exp-beyond-grid">
          {items.map((item, i) => (
            <BeyondCard
              key={item.id}
              item={item}
              index={i}
              reduceMotion={reduceMotion}
              chips={(grouped[SECTION_TO_PILLAR[item.cta_link]] || []).slice(0, 2)}
              onGo={() => go(item.cta_link)}
              onChip={setEnquiring}
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

/**
 * One derived chip — a real button, not a decorated span.
 *
 * A <button> rather than a styled div so it is tabbable, announces itself as a
 * control and fires on Enter and Space without any extra ARIA. Module scope for
 * the usual reason: defined inside BeyondCard it would be a brand-new component
 * type on every hover state change.
 */
function ExperienceChip({ experience, accent, onOpen }) {
  const Icon = iconFor(experience.icon_name)
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      onClick={() => onOpen?.(experience)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Enquire about ${experience.title}`}
      className="font-body"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 999, fontSize: 10.5,
        cursor: 'pointer', fontFamily: 'inherit',
        color: hovered ? accent : 'var(--w365-text-muted)',
        background: hovered ? `${accent}1a` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hovered ? `${accent}77` : 'rgba(212,175,55,0.22)'}`,
        whiteSpace: 'nowrap',
        transition: 'background 0.2s, border-color 0.2s, color 0.2s',
      }}
    >
      <Icon size={11} style={{ color: accent }} /> {experience.title}
    </button>
  )
}

function BeyondCard({ item, index, reduceMotion, chips, onGo, onChip }) {
  const Icon = iconFor(item.icon_name)
  const accent = item.accent_color || '#D4AF37'
  const image = imageFor(item)
  const [hovered, setHovered] = useState(false)

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: reduceMotion ? 0 : Math.min(index, 6) * 0.07 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column',
        borderRadius: 16, overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(32,10,26,0.9) 0%, rgba(12,2,10,0.95) 100%)',
        border: `1px solid ${hovered ? `${accent}66` : 'rgba(212,175,55,0.22)'}`,
        boxShadow: hovered ? `0 18px 40px -18px ${accent}55` : '0 10px 30px -22px rgba(0,0,0,0.9)',
        transform: hovered && !reduceMotion ? 'translateY(-5px)' : 'none',
        transition: 'transform 0.32s ease, border-color 0.32s, box-shadow 0.32s',
      }}
    >
      {/* The picture, or a gold-washed panel carrying the icon large. A panel
          rather than nothing: in a six-across row a card with no media reads as
          broken, unlike the editorial list further down the page where a plain
          row is normal. */}
      <div style={{ position: 'relative', aspectRatio: '16 / 10', overflow: 'hidden', flexShrink: 0 }}>
        {image ? (
          <>
            <img
              src={image}
              alt=""
              aria-hidden="true"
              loading="lazy"
              style={{
                width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                transform: hovered && !reduceMotion ? 'scale(1.06)' : 'scale(1)',
                transition: 'transform 0.6s ease',
              }}
            />
            <div
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(10,0,8,0.85) 100%)' }}
            />
          </>
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `radial-gradient(90% 90% at 50% 20%, ${accent}22 0%, rgba(10,0,8,0.95) 70%)`,
            }}
          >
            <Icon size={46} style={{ color: accent, opacity: 0.45 }} />
          </div>
        )}
      </div>

      <div style={{ padding: 'clamp(16px, 2vw, 20px)', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* Sits just under the media edge, the way the reference does it.
            `position: relative` is load-bearing, not decoration: the negative
            marginTop lifts this circle up into the media box above, and that
            box is itself positioned. A static element paints below a
            positioned sibling regardless of DOM order, so without this the
            image covered the top third of every badge and each icon read as
            cropped. Being positioned puts the badge in the same paint layer,
            where coming later in the DOM wins. */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 1,
            width: 44, height: 44, borderRadius: '50%', marginBottom: 14, marginTop: -34,
            background: 'rgba(10,0,8,0.9)',
            border: `1px solid ${hovered ? accent : `${accent}66`}`,
            transition: 'border-color 0.3s',
            flexShrink: 0,
          }}
        >
          <Icon size={19} style={{ color: accent }} />
        </span>

        <h3
          className="font-display"
          style={{ fontSize: 'clamp(1.02rem, 2.3vw, 1.2rem)', fontWeight: 600, lineHeight: 1.25, marginBottom: 9, color: 'var(--w365-text)' }}
        >
          {item.title}
        </h3>

        {item.description && (
          <p
            className="font-body"
            style={{ color: 'var(--w365-text-muted)', fontSize: 13, lineHeight: 1.62, marginBottom: 14 }}
          >
            {item.description}
          </p>
        )}

        {chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {chips.map(c => (
              <ExperienceChip key={c.id} experience={c} accent={accent} onOpen={onChip} />
            ))}
          </div>
        )}

        {/* marginTop:auto pins the action to the bottom so the six cards line
            their links up regardless of how long each description runs. */}
        <button
          onClick={onGo}
          style={{
            marginTop: 'auto', alignSelf: 'flex-start',
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            letterSpacing: '0.04em', color: accent,
          }}
        >
          {item.cta_text || 'Explore'}
          <ArrowRight
            size={13}
            style={{ transform: hovered && !reduceMotion ? 'translateX(3px)' : 'none', transition: 'transform 0.25s' }}
          />
        </button>
      </div>
    </motion.article>
  )
}
