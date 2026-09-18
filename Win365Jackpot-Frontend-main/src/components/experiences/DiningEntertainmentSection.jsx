import React, { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useExperiencePillar, iconFor, imageFor, SECTION_PAD, CONTAINER, HEADER_GAP } from './shared'
import ExperienceEnquiryModal from './ExperienceEnquiryModal'

/**
 * §11 DINING & ENTERTAINMENT.
 *
 * ITS OWN IDENTITY: a horizontal rail of tall, narrow cards. This pillar has
 * the most entries of the four — dining, lounges, live music, shows,
 * nightlife — and a rail reads as a menu of an evening's options, which is
 * what the section is. It is also the only horizontal movement on the page,
 * so it breaks the vertical rhythm exactly where the story moves from
 * arranging a trip to spending an evening.
 *
 * The rail is a real scroll container, not a carousel that hides content: it
 * works by touch drag, trackpad, the arrow buttons and the keyboard, and every
 * card is always in the DOM for search and screen readers.
 */
export default function DiningEntertainmentSection() {
  const { items, loading } = useExperiencePillar('dining')
  const reduceMotion = useReducedMotion()
  const [enquiring, setEnquiring] = useState(null)
  const railRef = useRef(null)

  if (loading || items.length === 0) return null

  const nudge = direction => {
    const rail = railRef.current
    if (!rail) return
    // One card-ish, so a click advances the rail by a readable amount rather
    // than a fixed pixel count that means different things at different sizes.
    const step = Math.max(240, Math.round(rail.clientWidth * 0.6))
    rail.scrollBy({ left: direction * step, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return (
    <section
      id="dining-entertainment"
      style={{
        padding: SECTION_PAD,
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(20,4,16,0.6) 50%, rgba(0,0,0,0) 100%)',
      }}
    >
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
          }}
        >
          <div style={{ maxWidth: 640 }}>
            <p
              className="font-body"
              style={{ fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--w365-text-muted)', marginBottom: 12 }}
            >
              After The Tables
            </p>
            <h2
              className="font-display section-heading"
              style={{ fontSize: 'clamp(1.9rem, 6.2vw, 3.3rem)', fontWeight: 600, lineHeight: 1.06, marginBottom: 14 }}
            >
              Dining &amp; <span className="gold-text">Entertainment</span>
            </h2>
            <p
              className="font-body"
              style={{ color: 'var(--w365-text-muted)', fontSize: 'clamp(0.92rem, 2.4vw, 1.05rem)', lineHeight: 1.7 }}
            >
              An evening is more than one room. Tables, lounges, live music and
              shows arranged around your destination.
            </p>
          </div>

          {/* Hidden from assistive tech: the rail itself is keyboard
              scrollable, so these are a pointer convenience, not the only way
              through the content. */}
          <div style={{ display: 'flex', gap: 8 }} aria-hidden="true">
            {[[-1, ChevronLeft, 'Scroll left'], [1, ChevronRight, 'Scroll right']].map(([dir, Icon, label]) => (
              <button
                key={label}
                onClick={() => nudge(dir)}
                tabIndex={-1}
                style={{
                  width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(212,175,55,0.3)',
                  color: '#D4AF37',
                }}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
        </motion.header>

        <div
          ref={railRef}
          className="exp-dining-rail"
          role="group"
          aria-label="Dining and entertainment options"
          tabIndex={0}
        >
          {items.map((item, i) => (
            <DiningCard
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

function DiningCard({ item, index, reduceMotion, onEnquire }) {
  const Icon = iconFor(item.icon_name)
  const image = imageFor(item)
  const accent = item.accent_color || '#D4AF37'
  const [hovered, setHovered] = useState(false)

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: reduceMotion ? 0 : Math.min(index, 5) * 0.06 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="casino-card"
      style={{
        display: 'flex', flexDirection: 'column',
        padding: 'clamp(18px, 3vw, 24px)',
        minHeight: 300,
        position: 'relative', overflow: 'hidden',
        transform: hovered && !reduceMotion ? 'translateY(-4px)' : 'none',
        transition: 'transform 0.3s ease, border-color 0.3s',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', insetInline: 0, top: 0, height: 3,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          opacity: hovered ? 1 : 0.4, transition: 'opacity 0.3s',
        }}
      />

      {image && (
        <div style={{ margin: '-4px -4px 16px', borderRadius: 12, overflow: 'hidden', aspectRatio: '4 / 3' }}>
          <img
            src={image}
            alt={item.title}
            loading="lazy"
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              transform: hovered && !reduceMotion ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.5s ease',
            }}
          />
        </div>
      )}

      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 40, height: 40, borderRadius: 12, marginBottom: 16,
          background: `${accent}18`, border: `1px solid ${accent}44`, flexShrink: 0,
        }}
      >
        <Icon size={18} style={{ color: accent }} />
      </span>

      <h3
        className="font-heading"
        style={{ fontSize: 'clamp(1rem, 2.6vw, 1.18rem)', fontWeight: 800, lineHeight: 1.25, marginBottom: 7, color: 'var(--w365-text)' }}
      >
        {item.title}
      </h3>

      {item.subtitle && (
        <p
          className="font-body"
          style={{ fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent, marginBottom: 11, opacity: 0.9 }}
        >
          {item.subtitle}
        </p>
      )}

      {item.description && (
        <p
          className="font-body"
          style={{ color: 'var(--w365-text-muted)', fontSize: 13.5, lineHeight: 1.65, marginBottom: 18 }}
        >
          {item.description}
        </p>
      )}

      {/* marginTop:auto pins the action to the bottom, so cards of different
          description lengths still line their buttons up across the rail. */}
      <button
        onClick={onEnquire}
        style={{
          marginTop: 'auto', alignSelf: 'flex-start',
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
          fontSize: 11.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
          fontFamily: 'inherit', color: accent,
          background: hovered ? `${accent}1f` : 'transparent',
          border: `1px solid ${accent}55`,
          transition: 'background 0.25s',
        }}
      >
        <Plus size={13} /> {item.cta_text || 'Enquire'}
      </button>
    </motion.article>
  )
}
