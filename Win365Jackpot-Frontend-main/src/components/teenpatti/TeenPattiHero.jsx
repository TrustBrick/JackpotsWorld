import React from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Radio, CalendarRange } from 'lucide-react'

/**
 * TeenPattiHero — the Part 18 hero. Built from the site's existing utility
 * classes (.dice-pattern / .gold-text / .btn-gold / .section-divider) plus a
 * CSS-drawn card motif, so the section gets its own identity without shipping
 * any new image asset or licensed artwork.
 */

// Three fanned cards, drawn in CSS. A/K/Q of the classic Teen Patti trail.
const CARDS = [
  { rank: 'A', suit: '♠', rotate: -16, x: -74, delay: 0.0, color: '#EDEDED' },
  { rank: 'K', suit: '♥', rotate: 0, x: 0, delay: 0.12, color: '#E24B5A' },
  { rank: 'Q', suit: '♦', rotate: 16, x: 74, delay: 0.24, color: '#E24B5A' },
]

function CardFan() {
  return (
    <div className="relative h-[190px] w-full flex items-center justify-center select-none" aria-hidden="true">
      {CARDS.map((card, i) => (
        <motion.div
          key={card.rank}
          initial={{ opacity: 0, y: 30, rotate: 0 }}
          animate={{ opacity: 1, y: 0, rotate: card.rotate }}
          transition={{ duration: 0.7, delay: card.delay, ease: [0.22, 1, 0.36, 1] }}
          className="absolute rounded-xl flex flex-col items-center justify-between py-3"
          // Positioned with `left`, never `transform` — framer-motion owns the
          // transform property for the entry animation and would clobber it.
          style={{
            width: 96, height: 138,
            left: `calc(50% - 48px + ${card.x}px)`,
            zIndex: i === 1 ? 3 : 2,
            background: 'linear-gradient(160deg, #FAF7EE 0%, #E8E2D2 100%)',
            border: '1px solid rgba(212,175,55,0.55)',
            boxShadow: '0 14px 34px rgba(0,0,0,0.55), 0 0 22px rgba(212,175,55,0.16)',
          }}
        >
          <span className="text-base font-black self-start pl-2.5 leading-none" style={{ color: card.color }}>
            {card.rank}
          </span>
          <span className="text-3xl leading-none" style={{ color: card.color }}>{card.suit}</span>
          <span
            className="text-base font-black self-end pr-2.5 leading-none"
            style={{ color: card.color, transform: 'rotate(180deg)' }}
          >
            {card.rank}
          </span>
        </motion.div>
      ))}
    </div>
  )
}

export default function TeenPattiHero({ liveCount = 0, upcomingCount = 0, onViewLive, onViewUpcoming }) {
  const { t } = useTranslation()
  return (
    <section className="relative pt-32 pb-16 px-4 dice-pattern overflow-hidden">
      {/* Soft gold bloom behind the fan — decorative only. */}
      <div
        className="absolute left-1/2 top-24 -translate-x-1/2 pointer-events-none"
        style={{
          width: 620, height: 340, maxWidth: '100%',
          background: 'radial-gradient(ellipse at center, rgba(212,175,55,0.15) 0%, transparent 68%)',
          filter: 'blur(6px)',
        }}
        aria-hidden="true"
      />

      <div className="max-w-5xl mx-auto text-center relative z-10">
        <CardFan />

        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="font-body text-xs md:text-sm tracking-[0.35em] uppercase text-gold/70 mt-6 mb-3"
        >
          {t('teenPatti.eyebrow')}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.38 }}
          className="gold-text font-black text-4xl md:text-6xl tracking-wide mb-4"
          style={{ fontFamily: "'Manrope', sans-serif" }}
        >
          {t('teenPatti.title')}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.46 }}
          className="text-theme-muted font-body text-sm md:text-base max-w-2xl mx-auto"
        >
          {t('teenPatti.subtitle')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.54 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8"
        >
          <button
            onClick={onViewLive}
            className="btn-gold w-full sm:w-auto flex items-center justify-center gap-2 rounded-full px-7 py-3 text-xs font-bold tracking-widest uppercase"
          >
            <Radio size={14} /> {t('teenPatti.viewLiveEvents')}
            {liveCount > 0 && (
              <span
                className="ml-0.5 px-2 py-0.5 rounded-full text-[10px]"
                style={{ background: 'rgba(10,0,5,0.22)' }}
              >
                {liveCount}
              </span>
            )}
          </button>
          <button
            onClick={onViewUpcoming}
            className="btn-outline-gold w-full sm:w-auto flex items-center justify-center gap-2 rounded-full px-7 py-3 text-xs font-bold tracking-widest uppercase"
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
          </button>
        </motion.div>

        <div className="section-divider max-w-xs mx-auto mt-10" />
      </div>
    </section>
  )
}
