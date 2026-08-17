import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Radio, CalendarRange, Crown } from 'lucide-react'
import HighlightedText from '../shared/HighlightedText'
import VipBenefitStrip from '../shared/VipBenefitStrip'
import CinematicMediaCard from '../shared/CinematicMediaCard'
import HeroBackgroundVideo from '../shared/HeroBackgroundVideo'
import { fetchSectionMedia } from '../../services/landingService'

/**
 * TeenPattiHero — the Part 18 hero. Built from the site's existing utility
 * classes (.dice-pattern / .gold-text / .btn-gold / .section-divider) plus a
 * CSS-drawn card motif, so the section gets its own identity without shipping
 * any new image asset or licensed artwork.
 */

// Three fanned cards, drawn in CSS. A/K/Q of the classic Teen Patti trail.
const CARDS = [
  { rank: 'A', suit: '♠', rotate: -16, x: -78, delay: 0.0, color: '#EDEDED' },
  { rank: 'K', suit: '♥', rotate: 0, x: 0, delay: 0.12, color: '#E24B5A' },
  { rank: 'Q', suit: '♦', rotate: 16, x: 78, delay: 0.24, color: '#E24B5A' },
]

// Faint background suit glyphs — pure atmosphere, no new assets. Delays are
// set explicitly (not left to .floating-card's :nth-child rules, which key
// off sibling position among ALL of the section's children, not just these
// four) so the glyphs bob out of phase with each other instead of in sync.
const BG_SUITS = [
  { glyph: '♠', top: '12%', left: '6%', size: 64, dur: 7, delay: 0 },
  { glyph: '♦', top: '18%', right: '8%', size: 52, dur: 8.5, delay: -2.5 },
  { glyph: '♥', bottom: '10%', left: '10%', size: 48, dur: 6.5, delay: -4 },
  { glyph: '♣', bottom: '14%', right: '7%', size: 58, dur: 9, delay: -1.5 },
]

function CardFan({ reduceMotion }) {
  return (
    <div className="relative h-[210px] w-full flex items-center justify-center select-none" aria-hidden="true">
      {/* Grounding shadow — gives the fan a sense of resting on a surface
          rather than floating in a void. */}
      <div
        className="absolute"
        style={{
          bottom: 6, width: 220, height: 34, borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, transparent 72%)',
        }}
      />

      {CARDS.map((card, i) => (
        <motion.div
          key={card.rank}
          initial={{ opacity: 0, y: 30, rotate: 0, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, rotate: card.rotate, scale: 1 }}
          transition={{ duration: 0.7, delay: card.delay, ease: [0.22, 1, 0.36, 1] }}
          className="absolute rounded-xl"
          // Positioned with `left`, never `transform` — framer-motion owns the
          // transform property for the entry animation and would clobber it.
          style={{
            width: 104, height: 150,
            left: `calc(50% - 52px + ${card.x}px)`,
            zIndex: i === 1 ? 3 : 2,
          }}
        >
          {/* Inner wrapper owns the continuous idle float, kept separate from
              the outer element's one-time entrance transform so the two
              animations never fight over the same property. */}
          <motion.div
            className="relative w-full h-full rounded-xl flex flex-col items-center justify-between py-3 overflow-hidden"
            animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
            transition={reduceMotion ? undefined : {
              duration: 3.4 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: 0.9 + card.delay,
            }}
            style={{
              background: 'linear-gradient(160deg, #FDFBF3 0%, #EDE6D3 55%, #E8E2D2 100%)',
              border: '1px solid rgba(212,175,55,0.6)',
              boxShadow: `0 18px 38px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.08), 0 0 26px rgba(212,175,55,${i === 1 ? 0.28 : 0.16})`,
            }}
          >
            {/* Glossy diagonal sheen — the lacquered-card look. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 45%, transparent 60%)',
                mixBlendMode: 'overlay',
              }}
            />

            <div className="flex items-center gap-1 self-start pl-2.5 leading-none z-10">
              <span className="text-base font-black" style={{ color: card.color }}>{card.rank}</span>
              <span className="text-[10px]" style={{ color: card.color }}>{card.suit}</span>
            </div>
            <span className="text-4xl leading-none z-10" style={{ color: card.color, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.15))' }}>
              {card.suit}
            </span>
            <div
              className="flex items-center gap-1 self-end pr-2.5 leading-none z-10"
              style={{ transform: 'rotate(180deg)' }}
            >
              <span className="text-base font-black" style={{ color: card.color }}>{card.rank}</span>
              <span className="text-[10px]" style={{ color: card.color }}>{card.suit}</span>
            </div>
          </motion.div>
        </motion.div>
      ))}
    </div>
  )
}

export default function TeenPattiHero({ liveCount = 0, upcomingCount = 0, onViewLive, onViewUpcoming }) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()

  // Cinematic hero media (Part 6-8) — entirely Back Office controlled via
  // Manage Poker/Teen Patti → Hero Media. Absent slots simply render
  // nothing; there is no hardcoded fallback video/image.
  const [media, setMedia] = useState([])
  useEffect(() => {
    let cancelled = false
    fetchSectionMedia({ section: 'teen_patti' })
      .then(res => { if (!cancelled) setMedia(Array.isArray(res) ? res : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const bySlot = (slot) => media.find(m => m.slot === slot)

  return (
    <section className="relative pt-32 pb-20 px-4 dice-pattern overflow-hidden">
      <HeroBackgroundVideo item={bySlot('background')} />

      {/* Framing hairlines — turns the whole hero into a premium display
          panel rather than an open page section. */}
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)' }} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.35), transparent)' }} aria-hidden="true" />

      {/* Layered gold bloom — a tighter hot core behind the cards plus a
          wider, softer wash across the whole section for depth. */}
      <div
        className="absolute left-1/2 top-20 -translate-x-1/2 pointer-events-none"
        style={{
          width: 720, height: 420, maxWidth: '100%',
          background: 'radial-gradient(ellipse at center, rgba(212,175,55,0.18) 0%, transparent 65%)',
          filter: 'blur(4px)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute left-1/2 top-32 -translate-x-1/2 pointer-events-none"
        style={{
          width: 380, height: 260, maxWidth: '100%',
          background: 'radial-gradient(ellipse at center, rgba(245,208,96,0.22) 0%, transparent 60%)',
          filter: 'blur(2px)',
        }}
        aria-hidden="true"
      />
      {/* Edge vignette — pulls focus back to center. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(10,0,5,0.55) 100%)' }}
        aria-hidden="true"
      />

      {/* Faint floating suit glyphs — atmosphere only. */}
      {!reduceMotion && BG_SUITS.map((s, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className="absolute select-none pointer-events-none floating-card"
          style={{
            top: s.top, bottom: s.bottom, left: s.left, right: s.right,
            fontSize: s.size, color: 'rgba(212,175,55,0.10)',
            animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`,
          }}
        >
          {s.glyph}
        </motion.span>
      ))}

      {/* Cinematic side cards flank the content on large screens (order-1 and
          order-3 either side of the order-2 content) and stack full-width
          beneath it on mobile (order-2 / order-3, matching the Part 12
          hierarchy: content, then VIP strip, then featured visual) — one
          grid, no duplicated DOM nodes per breakpoint, so a video is never
          fetched or decoded twice. */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_240px] gap-6 lg:gap-8 items-stretch max-w-[1400px] mx-auto">
        <CinematicMediaCard
          item={bySlot('side_left')} align="left"
          className="order-2 lg:order-1 h-48 sm:h-64 lg:h-auto lg:min-h-[380px]"
        />

        <div className="order-1 lg:order-2 max-w-3xl mx-auto text-center w-full">
        <CardFan reduceMotion={reduceMotion} />

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex items-center justify-center gap-3 mt-6 mb-3"
        >
          <span className="h-px w-8 md:w-14" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.6))' }} />
          <Crown size={13} className="text-gold shrink-0" />
          <p className="font-body text-xs md:text-sm tracking-[0.35em] uppercase text-gold/80 whitespace-nowrap">
            {t('teenPatti.eyebrow')}
          </p>
          <Crown size={13} className="text-gold shrink-0" />
          <span className="h-px w-8 md:w-14" style={{ background: 'linear-gradient(90deg, rgba(212,175,55,0.6), transparent)' }} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.38 }}
          className="gold-text font-black text-5xl md:text-7xl tracking-wide mb-4"
          style={{ fontFamily: "'Manrope', sans-serif", filter: 'drop-shadow(0 0 30px rgba(212,175,55,0.35))' }}
        >
          {t('teenPatti.title')}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.46 }}
          className="font-body text-sm md:text-lg leading-relaxed max-w-2xl mx-auto text-white/90"
        >
          <HighlightedText as="p" text={t('teenPatti.subtitle')} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.54 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-9"
        >
          <motion.button
            whileHover={{ scale: 1.035, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={onViewLive}
            className="btn-gold w-full sm:w-auto flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-xs font-bold tracking-widest uppercase"
          >
            <Radio size={14} /> {t('teenPatti.viewLiveEvents')}
            {liveCount > 0 && (
              <span
                className="ml-0.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px]"
                style={{ background: 'rgba(10,0,5,0.24)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {liveCount}
              </span>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.035, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={onViewUpcoming}
            className="btn-outline-gold w-full sm:w-auto flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-xs font-bold tracking-widest uppercase"
          >
            <CalendarRange size={14} /> {t('teenPatti.exploreUpcoming')}
            {upcomingCount > 0 && (
              <span
                className="ml-0.5 px-2 py-0.5 rounded-full text-[10px]"
                style={{ background: 'rgba(212,175,55,0.16)' }}
              >
                {upcomingCount}
              </span>
            )}
          </motion.button>
        </motion.div>

        <div className="flex justify-center mt-9">
          <VipBenefitStrip />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="flex items-center justify-center gap-3 mt-12"
        >
          <span className="section-divider w-16 md:w-28" />
          <span className="w-1.5 h-1.5 rotate-45 bg-gold/60" />
          <span className="section-divider w-16 md:w-28" />
        </motion.div>
        </div>

        <CinematicMediaCard
          item={bySlot('side_right')} align="right"
          className="order-3 h-48 sm:h-64 lg:h-auto lg:min-h-[380px]"
        />
      </div>
    </section>
  )
}
