import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarClock, Gift, CheckCircle2, ArrowRight, Info, ImageOff } from 'lucide-react'
import { flagFromCountryCode } from '../../utils/countryFlags'
import { getCasinoFallbackImage } from '../../utils/mediaFallback'

const AUTO_ADVANCE_MS = 2800

/**
 * CasinoPromotionCard — one card per casino on the Promotions page, with
 * every promotion for that casino playing as a slideshow inside it.
 *
 * The slider deliberately mirrors the destination slider in
 * CountryPackages (one slide at a time, slide-in from the right every
 * 2.8s, "n / N" counter, ‹ › arrows, caption bar with dots) so the two
 * read as the same component family.
 *
 * Banners are shown whole (object-contain) over a blurred copy of
 * themselves: casino flyers are ~9:16 posters with the price and terms
 * printed on them, and cropping them loses exactly that. The text block and
 * the Claim / Details buttons below follow the slide currently showing.
 *
 * Auto-advance pauses while the card is hovered, focused or touched and
 * while the tab is hidden, and never runs for reduced-motion visitors.
 */
function CasinoPromotionCard({ casino, promotions, onClaim, onViewDetails }) {
  const { t } = useTranslation()
  const [idx, setIdx] = useState(0)
  const pausedRef = useRef(false)
  const timerRef = useRef(null)
  const count = promotions.length
  const promo = promotions[Math.min(idx, count - 1)]

  const start = useCallback(() => {
    clearInterval(timerRef.current)
    if (count < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    timerRef.current = setInterval(() => {
      if (!pausedRef.current && !document.hidden) setIdx(p => (p + 1) % count)
    }, AUTO_ADVANCE_MS)
  }, [count])

  useEffect(() => {
    setIdx(i => (i < count ? i : 0))
    start()
    return () => clearInterval(timerRef.current)
  }, [start, count])

  // A manual jump restarts the timer so the chosen slide gets its full time.
  const jumpTo = (i) => {
    setIdx(((i % count) + count) % count)
    start()
  }

  const pause = () => { pausedRef.current = true }
  const resume = () => { pausedRef.current = false }

  const logo = promotions.find(p => p.casino_logo)?.casino_logo
  const country = promotions[0]?.country
  const flag = flagFromCountryCode(promotions[0]?.country_code)
  const imgSrc = promo.image || getCasinoFallbackImage(promo.casino_name, promo.country)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="casino-card flex flex-col overflow-hidden h-full rounded-xl shadow-lg shadow-black/30"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      onTouchStart={pause}
      onTouchEnd={resume}
    >
      {/* Casino header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(212,175,55,0.15)' }}>
        {logo && (
          <img loading="lazy" decoding="async"
            src={logo}
            alt=""
            className="w-10 h-10 rounded-full object-cover border shrink-0"
            style={{ borderColor: 'rgba(212,175,55,0.5)' }}
          />
        )}
        <div className="flex flex-col leading-tight min-w-0">
          <h3 className="font-black text-lg text-[rgba(var(--w365-text-rgb),0.92)] truncate">{casino}</h3>
          <span className="text-[rgba(var(--w365-text-rgb),0.50)] text-xs font-body flex items-center gap-1">
            {flag && <span className="leading-none">{flag}</span>}
            {country}
            <span className="mx-1">·</span>
            {t('promotions.offersCount', { count })}
          </span>
        </div>
      </div>

      {/* Banner slider */}
      <div className="relative aspect-[4/5] overflow-hidden bg-black">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={promo.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute inset-0"
          >
            {imgSrc ? (
              <>
                <img
                  src={imgSrc}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
                />
                <div className="absolute inset-0" style={{ background: 'rgba(10,0,5,0.35)' }} />
                <button
                  type="button"
                  onClick={() => onViewDetails?.(promo)}
                  className="relative block w-full h-full cursor-pointer"
                  aria-label={promo.title}
                >
                  <img
                    src={imgSrc}
                    alt={promo.title}
                    className="w-full h-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
                  />
                </button>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--w365-card), var(--w365-bg-mid))' }}>
                <ImageOff size={28} className="text-gold/30" />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {count > 1 && (
          <>
            <div className="absolute top-2.5 right-2.5 z-10 text-white text-[0.68rem] font-medium px-2.5 py-0.5 rounded-full backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.6)' }}>
              {idx + 1} / {count}
            </div>
            {[
              { label: '‹', aria: 'Previous promotion', fn: () => jumpTo(idx - 1), side: 'left-2' },
              { label: '›', aria: 'Next promotion', fn: () => jumpTo(idx + 1), side: 'right-2' },
            ].map(a => (
              <button
                key={a.label}
                type="button"
                onClick={a.fn}
                aria-label={a.aria}
                className={`absolute ${a.side} top-1/2 -translate-y-1/2 z-10 w-[38px] h-[38px] rounded-full flex items-center justify-center text-white text-xl backdrop-blur-sm border transition-colors bg-black/50 hover:bg-black/75`}
                style={{ borderColor: 'rgba(255,255,255,0.2)', touchAction: 'manipulation' }}
              >
                {a.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Caption + dots */}
      {count > 1 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ background: 'var(--w365-surface-hi)', borderTop: '1px solid rgba(212,175,55,0.15)' }}>
          <span className="font-body font-light text-xs truncate min-w-0" style={{ color: 'rgba(var(--w365-text-rgb),0.78)' }}>{promo.title}</span>
          <div className="flex gap-[5px] items-center shrink-0 flex-wrap justify-end">
            {promotions.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => jumpTo(i)}
                aria-label={`Go to promotion ${i + 1}`}
                aria-current={i === idx}
                className="p-0 border-none cursor-pointer h-1.5 transition-all duration-200"
                style={{
                  width: i === idx ? 18 : 6,
                  borderRadius: i === idx ? 4 : '50%',
                  background: i === idx ? 'var(--w365-gold, #D4AF37)' : 'rgba(var(--w365-text-rgb),0.2)',
                  touchAction: 'manipulation',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Current promotion */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <h4 className="font-black text-base text-[rgba(var(--w365-text-rgb),0.90)] leading-snug">{promo.title}</h4>

        {promo.validity_text && (
          <div className="flex items-center gap-1.5 text-xs font-body text-[rgba(var(--w365-text-rgb),0.50)]">
            <CalendarClock size={13} className="text-gold shrink-0" />
            {promo.validity_text}
          </div>
        )}

        {promo.bonus_details && (
          <div className="flex items-start gap-1.5 text-xs font-body text-[rgba(var(--w365-text-rgb),0.50)]">
            <Gift size={13} className="text-gold shrink-0 mt-0.5" />
            <span>{promo.bonus_details}</span>
          </div>
        )}

        {promo.benefits?.length > 0 && (
          <ul className="flex flex-col gap-1 mt-1">
            {promo.benefits.map((b, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs font-body text-[rgba(var(--w365-text-rgb),0.45)]">
                <CheckCircle2 size={12} className="text-gold shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        )}

        <div className="section-divider my-1" />

        <div className="flex gap-2 mt-auto">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onClaim?.(promo)}
            className="btn-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
          >
            {promo.cta_label || t('promotions.claimBonus')}
            <ArrowRight size={13} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onViewDetails?.(promo)}
            className="btn-outline-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
          >
            <Info size={13} />
            {t('promotions.details')}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

export default React.memo(CasinoPromotionCard)
