import React from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Radio, CalendarRange, Crown } from 'lucide-react'
import HighlightedText from '../shared/HighlightedText'
import VipBenefitStrip from '../shared/VipBenefitStrip'
import HeroBackgroundVideo from '../shared/HeroBackgroundVideo'
import SectionHeroMedia from '../shared/SectionHeroMedia'
import { fetchSectionMedia } from '../../services/landingService'
import { HERO_WATERMARKS } from '../../config/heroWatermarks'
import { useAutoFetch } from '../../hooks/useAutoFetch'

/**
 * TeenPattiHero — the Part 18 hero. Built from the site's existing utility
 * classes (.dice-pattern / .gold-text / .btn-gold / .section-divider) plus a
 * CSS-drawn card motif, so the section gets its own identity without shipping
 * any new image asset or licensed artwork.
 */

// Three fanned cards, drawn in CSS. A/K/Q of the classic Teen Patti trail.
// Face colours are the ink, not the theme: a real deck prints black and red,
// and tinting them gold is what made the old fan read as a cheap graphic
// rather than as cards. The gold lives in the edge, the foil and the light.
const CARDS = [
  { rank: 'A', suit: '♠', rotate: -15, x: -84, y: 6, delay: 0.0, color: '#14100B' },
  { rank: 'K', suit: '♥', rotate: 0, x: 0, y: -6, delay: 0.12, color: '#B3222E' },
  { rank: 'Q', suit: '♦', rotate: 15, x: 84, y: 6, delay: 0.24, color: '#B3222E' },
]

// 2.5 : 3.5 — the real poker-card ratio. Every other dimension below is
// derived from the width so the proportions hold at any size.
const CARD_W = 116
const CARD_H = Math.round(CARD_W * 3.5 / 2.5)

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

/** One corner index — rank over suit, the way a real card prints it. */
function CornerIndex({ card, flipped = false }) {
  return (
    <div
      className="absolute flex flex-col items-center leading-none z-20"
      style={{
        [flipped ? 'bottom' : 'top']: 9,
        [flipped ? 'right' : 'left']: 9,
        transform: flipped ? 'rotate(180deg)' : undefined,
        color: card.color,
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {card.rank}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1, marginTop: 1 }}>{card.suit}</span>
    </div>
  )
}

function CardFan({ reduceMotion }) {
  return (
    <div
      className="relative w-full flex items-center justify-center select-none"
      style={{ height: CARD_H + 66 }}
      aria-hidden="true"
    >
      {/* Contact shadow — the fan reads as resting on felt rather than
          floating, which is most of what separates a card from a rectangle. */}
      <div
        className="absolute"
        style={{
          bottom: 14, width: CARD_W * 2.5, height: 38, borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 45%, transparent 74%)',
          filter: 'blur(5px)',
        }}
      />

      {CARDS.map((card, i) => {
        const isCentre = i === 1
        return (
          <motion.div
            key={card.rank}
            initial={{ opacity: 0, y: 34, rotate: 0, scale: 0.9 }}
            animate={{ opacity: 1, y: card.y, rotate: card.rotate, scale: 1 }}
            transition={{ duration: 0.75, delay: card.delay, ease: [0.22, 1, 0.36, 1] }}
            className="absolute"
            // Positioned with `left`, never `transform` — framer-motion owns
            // the transform property for the entry animation and would
            // clobber it.
            style={{
              width: CARD_W, height: CARD_H,
              left: `calc(50% - ${CARD_W / 2}px + ${card.x}px)`,
              zIndex: isCentre ? 3 : 2,
              transformOrigin: '50% 92%',   // cards pivot about the hand, not their middle
            }}
          >
            {/* Inner wrapper owns the continuous idle float, kept separate
                from the outer element's one-time entrance transform so the
                two animations never fight over the same property. */}
            <motion.div
              className="relative w-full h-full"
              style={{ borderRadius: 11 }}
              animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
              transition={reduceMotion ? undefined : {
                duration: 3.6 + i * 0.45, repeat: Infinity, ease: 'easeInOut', delay: 0.95 + card.delay,
              }}
            >
              {/* Gold foil edge. A hair larger than the face and sitting
                  behind it, so the metal shows as a milled rim rather than as
                  a border drawn on top of the artwork. */}
              <div
                className="absolute"
                style={{
                  inset: -1.5, borderRadius: 12.5,
                  background: 'linear-gradient(150deg, #F6E7A8 0%, #C9A227 28%, #8C6D14 52%, #E8D48A 74%, #A8841C 100%)',
                  boxShadow: `0 22px 44px rgba(0,0,0,0.62), 0 6px 14px rgba(0,0,0,0.45), 0 0 30px rgba(212,175,55,${isCentre ? 0.26 : 0.14})`,
                }}
              />

              {/* The face. */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  borderRadius: 11,
                  background:
                    'radial-gradient(ellipse at 32% 18%, #FFFEFA 0%, #F7F3E7 42%, #EBE4D2 78%, #DED5BE 100%)',
                }}
              >
                {/* Engraved inner keyline, as printed decks carry. */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    inset: 6, borderRadius: 7,
                    border: '1px solid rgba(140,109,20,0.30)',
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.65)',
                  }}
                />

                {/* Guilloché tint — a whisper of pattern so the face is not a
                    flat fill. Low opacity on purpose: visible as texture,
                    never as decoration competing with the pip. */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    inset: 6, borderRadius: 7, opacity: 0.5,
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgba(140,109,20,0.05) 0 2px, transparent 2px 6px),' +
                      'repeating-linear-gradient(-45deg, rgba(140,109,20,0.05) 0 2px, transparent 2px 6px)',
                  }}
                />

                <CornerIndex card={card} />
                <CornerIndex card={card} flipped />

                {/* Centre pip. */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    style={{
                      fontSize: 54, lineHeight: 1, color: card.color,
                      filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.22))',
                    }}
                  >
                    {card.suit}
                  </span>
                </div>

                {/* Lacquer. A soft top-left bloom plus one raking highlight —
                    the way light actually falls on a coated card, rather than
                    a single diagonal band across the middle. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(ellipse at 26% 12%, rgba(255,255,255,0.85) 0%, transparent 52%),' +
                      'linear-gradient(118deg, transparent 34%, rgba(255,255,255,0.42) 47%, transparent 58%)',
                    mixBlendMode: 'soft-light',
                  }}
                />

                {/* Depth: the card curls very slightly away from the light at
                    its lower right, which is what stops it reading as a
                    sticker. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    borderRadius: 11,
                    boxShadow: 'inset -10px -14px 26px rgba(90,70,25,0.16), inset 6px 8px 18px rgba(255,255,255,0.55)',
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )
      })}
    </div>
  )
}

export default function TeenPattiHero({ liveCount = 0, upcomingCount = 0, onViewLive, onViewUpcoming }) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()

  // The background watermark's own row. The framed card further down reads the
  // same endpoint through SectionHeroMedia, so this section's media appears
  // twice: once as the low-opacity texture behind everything, once
  // full-strength in its own frame. That is deliberate — the watermark is
  // unchanged and the card is an addition. fetchSectionMedia is a cached()
  // service keyed on the query, so the two consumers share one request.
  //
  // useAutoFetch (not a one-shot effect): re-polls every 60s so a visitor
  // already sitting on this page picks up a Back Office media change without
  // navigating away and back — matches every other landing section.
  const { data } = useAutoFetch(fetchSectionMedia, { section: 'teen_patti' })
  const media = Array.isArray(data) ? data : []
  const bySlot = (slot) => media.find(m => m.slot === slot)

  return (
    <section className="relative pt-32 pb-20 px-4 dice-pattern overflow-hidden">
      <HeroBackgroundVideo
        item={bySlot('background')}
        fallbackVideo={HERO_WATERMARKS.teen_patti.video}
        fallbackPoster={HERO_WATERMARKS.teen_patti.poster}
      />

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

      {/* Two column widths inside one wrapper: the copy is held to a readable
          660-ish px, and the media band below it breaks out to the full
          1400px so the footage reads as the hero's major visual rather than
          as a card sitting inside a paragraph column. */}
      <div className="relative z-10 max-w-[1400px] mx-auto">
        <div className="max-w-3xl mx-auto text-center w-full">
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
            <HighlightedText text={t('teenPatti.eyebrow')} />
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
        </div>

        {/* Hero media card, in the same framed template as the landing page's
            Top Premium Partners band — same gold frame, same media-shaped box,
            same mute control, badge pill and slide dots, because it is the
            same component.

            An addition to the watermark behind this section, not a
            replacement for it: the backdrop is unchanged, and the same footage
            also gets a frame where it can be seen properly and heard. It sits
            below the CTAs rather than above them so the buttons stay near the
            fold on a laptop. Renders nothing when neither a Back Office row
            nor the bundled fallback resolves. */}
        {/* maxWidth as well as the 94vw target: 94vw is wider than this
            column's content box once the section's px-4 is taken off a phone
            viewport, and a too-wide block with auto margins does not centre —
            it overflows to the right, which put the band 10px off-centre at
            375px. The cap only ever binds below ~400px. */}
        <div className="mt-12 mx-auto" style={{ width: 'min(94vw, 1220px)', maxWidth: '100%' }}>
          <SectionHeroMedia
            section="teen_patti"
            fallbackVideo={HERO_WATERMARKS.teen_patti.video}
            fallbackPoster={HERO_WATERMARKS.teen_patti.poster}
            badgeLabel={t('teenPatti.title')}
            marginBottom={0}
          />
        </div>

        <div className="max-w-3xl mx-auto text-center w-full">
        <div className="flex justify-center mt-12">
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
      </div>
    </section>
  )
}
