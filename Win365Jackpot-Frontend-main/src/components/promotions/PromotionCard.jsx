import React from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Gift, CheckCircle2, ArrowRight, Info, ImageOff } from 'lucide-react'

/**
 * PromotionCard — presentational only. Consumes the PromotionSerializer
 * shape from GET /api/promotions/ (see src/services/promotionService.js).
 * Reused inside every country's horizontally-scrolling strip.
 */
function PromotionCard({ promotion, onClaim, onViewDetails }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="casino-card flex flex-col overflow-hidden h-full"
    >
      {/* Casino image + logo */}
      <div className="relative h-36 overflow-hidden">
        {promotion.image ? (
          <img src={promotion.image} alt={promotion.casino_name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--w365-card), var(--w365-bg-mid))' }}>
            <ImageOff size={22} className="text-gold/30" />
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, transparent 30%, rgba(10,0,5,0.92) 100%)' }}
        />
        {(promotion.casino_logo || promotion.casino_name) && (
          <div className="absolute bottom-3 left-4 flex items-center gap-2">
            {promotion.casino_logo && (
              <img
                src={promotion.casino_logo}
                alt=""
                className="w-8 h-8 rounded-full object-cover border"
                style={{ borderColor: 'rgba(212,175,55,0.5)' }}
              />
            )}
            {promotion.casino_name && (
              <span className="text-white/80 text-xs font-body font-semibold">{promotion.casino_name}</span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <h3 className="font-black text-lg text-white/90 leading-snug">{promotion.title}</h3>

        {promotion.description && (
          <p className="text-white/55 text-sm font-body leading-relaxed line-clamp-3">
            {promotion.description}
          </p>
        )}

        {promotion.validity_text && (
          <div className="flex items-center gap-1.5 text-xs font-body text-white/50">
            <CalendarClock size={13} className="text-gold shrink-0" />
            {promotion.validity_text}
          </div>
        )}

        {promotion.bonus_details && (
          <div className="flex items-start gap-1.5 text-xs font-body text-white/50">
            <Gift size={13} className="text-gold shrink-0 mt-0.5" />
            <span>{promotion.bonus_details}</span>
          </div>
        )}

        {promotion.benefits?.length > 0 && (
          <ul className="flex flex-col gap-1 mt-1">
            {promotion.benefits.map((b, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs font-body text-white/45">
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
            {promotion.cta_label || 'Claim Bonus'}
            <ArrowRight size={13} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onViewDetails?.(promotion)}
            className="btn-outline-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
          >
            <Info size={13} />
            Details
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

export default React.memo(PromotionCard)
