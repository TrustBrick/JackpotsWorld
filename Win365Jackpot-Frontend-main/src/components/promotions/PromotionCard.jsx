import React from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { CalendarClock, Gift, CheckCircle2, ArrowRight, Info } from 'lucide-react'
import { flagFromCountryCode } from '../../utils/countryFlags'
import { getCasinoFallbackImage } from '../../utils/mediaFallback'
import PromotionBanner from './PromotionBanner'

/**
 * PromotionCard — presentational only. Consumes the PromotionSerializer
 * shape from GET /api/promotions/ (see src/services/promotionService.js).
 * Rendered inside a responsive grid, grouped per country.
 */
function PromotionCard({ promotion, onClaim, onViewDetails }) {
  const { t } = useTranslation()
  // No banner image uploaded for this promotion yet — show the real casino
  // property photo we already have (from the destinations gallery) instead
  // of a blank placeholder, when we recognize the casino name.
  const imgSrc = promotion.image || getCasinoFallbackImage(promotion.casino_name, promotion.country)

  const caption = (promotion.casino_logo || promotion.casino_name || promotion.country) ? (
    <div className="flex items-center gap-2">
      {promotion.casino_logo && (
        <img loading="lazy" decoding="async"
          src={promotion.casino_logo}
          alt=""
          className="w-8 h-8 rounded-full object-cover border"
          style={{ borderColor: 'rgba(212,175,55,0.5)' }}
        />
      )}
      <div className="flex flex-col leading-tight">
        {promotion.casino_name && (
          <span className="text-[rgba(var(--w365-text-rgb),0.80)] text-xs font-body font-semibold">{promotion.casino_name}</span>
        )}
        {promotion.country && (
          <span className="text-[rgba(var(--w365-text-rgb),0.50)] text-[10px] font-body flex items-center gap-1">
            {flagFromCountryCode(promotion.country_code) && <span className="leading-none">{flagFromCountryCode(promotion.country_code)}</span>}
            {promotion.country}
          </span>
        )}
      </div>
    </div>
  ) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="casino-card flex flex-col overflow-hidden h-full rounded-xl shadow-lg shadow-black/30 hover:scale-105 transition-transform duration-300"
    >
      {/* Casino image + logo */}
      <PromotionBanner
        src={imgSrc}
        alt={promotion.casino_name || promotion.title}
        stripClass="h-36"
        posterClass="aspect-[4/5]"
        caption={caption}
      />

      {/* Body */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <h3 className="font-black text-lg text-[rgba(var(--w365-text-rgb),0.90)] leading-snug">{promotion.title}</h3>

        {promotion.description && (
          <p className="text-[rgba(var(--w365-text-rgb),0.55)] text-sm font-body leading-relaxed line-clamp-3">
            {promotion.description}
          </p>
        )}

        {promotion.validity_text && (
          <div className="flex items-center gap-1.5 text-xs font-body text-[rgba(var(--w365-text-rgb),0.50)]">
            <CalendarClock size={13} className="text-gold shrink-0" />
            {promotion.validity_text}
          </div>
        )}

        {promotion.bonus_details && (
          <div className="flex items-start gap-1.5 text-xs font-body text-[rgba(var(--w365-text-rgb),0.50)]">
            <Gift size={13} className="text-gold shrink-0 mt-0.5" />
            <span>{promotion.bonus_details}</span>
          </div>
        )}

        {promotion.benefits?.length > 0 && (
          <ul className="flex flex-col gap-1 mt-1">
            {promotion.benefits.map((b, i) => (
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
            onClick={() => onClaim?.(promotion)}
            className="btn-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
          >
            {promotion.cta_label || t('promotions.claimBonus')}
            <ArrowRight size={13} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onViewDetails?.(promotion)}
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

export default React.memo(PromotionCard)
