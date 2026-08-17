import React from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Radio, CalendarRange, Spade } from 'lucide-react'
import HighlightedText from '../shared/HighlightedText'
import VipBenefitStrip from '../shared/VipBenefitStrip'
import CinematicMediaCard from '../shared/CinematicMediaCard'
import HeroBackgroundVideo from '../shared/HeroBackgroundVideo'
import { fetchSectionMedia } from '../../services/landingService'
import { useAutoFetch } from '../../hooks/useAutoFetch'

/**
 * PokerHero — Poker's own premium hero, matching the visual investment of
 * TeenPattiHero (JACKPOTSWORLD spec Part 9) but with its own identity: a
 * chip stack instead of a card fan, its own copy, and its own Back
 * Office-managed cinematic media (section="poker" — see
 * SectionMedia/TeenPattiHero's docstring for why the two never share rows).
 *
 * Reuses the existing poker.eyebrow/title/subtitle i18n strings (already
 * translated across all 24 locales) rather than inventing new copy, and the
 * same VipBenefitStrip component/wording Teen Patti uses — the reference
 * spec's own Poker diagram repeats the identical "Fly Free / Stay Free /
 * Earn Hourly Commission" strip verbatim, so this isn't Teen-Patti content
 * leaking into Poker, it's genuinely shared platform-wide copy.
 */

// A small stack of CSS-drawn poker chips — Poker's own visual signature,
// distinct from Teen Patti's card fan. Reuses the site's existing .chip
// utility (index.css: dashed gold ring, already used elsewhere) rather than
// inventing new chip artwork.
const CHIPS = [
  { rotate: -10, x: -34, delay: 0.0, accent: '#D4AF37' },
  { rotate: 6, x: 0, delay: 0.1, accent: '#E24B5A' },
  { rotate: -4, x: 34, delay: 0.2, accent: '#EDEDED' },
]

function ChipStack({ reduceMotion }) {
  return (
    <div className="relative h-[150px] w-full flex items-center justify-center select-none" aria-hidden="true">
      <div
        className="absolute"
        style={{
          bottom: 10, width: 180, height: 28, borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, transparent 72%)',
        }}
      />
      {CHIPS.map((chip, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 24, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, rotate: chip.rotate, scale: 1 }}
          transition={{ duration: 0.6, delay: chip.delay, ease: [0.22, 1, 0.36, 1] }}
          className="absolute rounded-full flex items-center justify-center"
          style={{
            width: 92, height: 92,
            left: `calc(50% - 46px + ${chip.x}px)`,
            bottom: 14 + i * 10,
            zIndex: i,
            background: 'radial-gradient(circle at 35% 30%, #1c1c1e 0%, #0A0005 70%)',
            border: `4px dashed ${chip.accent}99`,
            boxShadow: `0 10px 24px rgba(0,0,0,0.55), 0 0 18px ${chip.accent}33`,
          }}
        >
          <div
            className="absolute inset-2 rounded-full"
            style={{ border: `1px solid ${chip.accent}55` }}
          />
          <Spade size={22} style={{ color: chip.accent, opacity: 0.85 }} />
          {!reduceMotion && (
            <motion.div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{ border: `1px solid ${chip.accent}22` }}
              animate={{ rotate: 360 }}
              transition={{ duration: 14 + i * 3, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </motion.div>
      ))}
    </div>
  )
}

export default function PokerHero({ liveCount = 0, upcomingCount = 0, onViewLive, onViewUpcoming }) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()

  // useAutoFetch (not a one-shot effect): re-polls every 60s so a visitor
  // already sitting on this page picks up a Back Office media change
  // without navigating away and back — the fetch itself is still served
  // from landingService's cache except on this interval's forced refetch,
  // so this doesn't add extra load beyond what every other landing section
  // already does.
  const { data } = useAutoFetch(fetchSectionMedia, { section: 'poker' })
  const media = Array.isArray(data) ? data : []
  const bySlot = (slot) => media.find(m => m.slot === slot)

  return (
    <section className="relative pt-32 pb-20 px-4 dice-pattern overflow-hidden">
      <HeroBackgroundVideo item={bySlot('background')} />

      <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)' }} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.35), transparent)' }} aria-hidden="true" />

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
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(10,0,5,0.55) 100%)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_240px] gap-6 lg:gap-8 items-stretch max-w-[1400px] mx-auto">
        <CinematicMediaCard
          item={bySlot('side_left')} align="left"
          className="order-2 lg:order-1 h-48 sm:h-64 lg:h-auto lg:min-h-[380px]"
        />

        <div className="order-1 lg:order-2 max-w-3xl mx-auto text-center w-full">
          <ChipStack reduceMotion={reduceMotion} />

          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="font-body text-xs md:text-sm tracking-[0.35em] uppercase text-gold/80 mt-6 mb-3"
          >
            {t('poker.eyebrow')}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.38 }}
            className="gold-text font-black text-5xl md:text-7xl tracking-wide mb-4"
            style={{ fontFamily: "'Manrope', sans-serif", filter: 'drop-shadow(0 0 30px rgba(212,175,55,0.35))' }}
          >
            {t('poker.title')}
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.46 }}
            className="font-body text-sm md:text-lg leading-relaxed max-w-2xl mx-auto text-white/90"
          >
            <HighlightedText as="p" text={t('poker.subtitle')} />
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
              <Radio size={14} /> {t('poker.viewLiveEvents')}
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
              <CalendarRange size={14} /> {t('poker.exploreUpcoming')}
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
