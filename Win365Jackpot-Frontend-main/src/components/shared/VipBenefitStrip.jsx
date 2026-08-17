import React from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Plane, Building2, Coins } from 'lucide-react'

/**
 * VipBenefitStrip — the "FLY FREE | STAY FREE | EARN HOURLY COMMISSION"
 * banner (JACKPOTSWORLD spec Part 5), shared by the Teen Patti and Poker
 * heroes.
 *
 * Copy lives in i18n (vipStrip.*) rather than a new Back Office model: this
 * is three fixed marketing labels, not a growing admin-curated collection —
 * there's no existing "small static text block" CMS in this codebase beyond
 * i18n strings themselves (which is exactly how the hero eyebrow/title/
 * subtitle already work), so adding a whole new CRUD system for this would
 * be new architecture for content that doesn't actually vary per admin.
 *
 * `vipStrip.disclaimer` is not decorative — Part 5 is explicit that these
 * benefits must never read as guaranteed-to-everyone, so it's real,
 * required copy, just styled quietly rather than shouted.
 */

const ITEMS = [
  { icon: Plane, key: 'flyFree' },
  { icon: Building2, key: 'stayFree' },
  { icon: Coins, key: 'earnCommission' },
]

export default function VipBenefitStrip({ className = '' }) {
  const { t } = useTranslation()

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.62 }}
      className={className}
      style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '18px 28px', borderRadius: 20,
        background: 'rgba(10,0,5,0.55)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(212,175,55,0.4)',
        boxShadow: '0 0 32px rgba(212,175,55,0.14), 0 10px 28px rgba(0,0,0,0.4)',
        maxWidth: '100%',
      }}
    >
      <div className="flex flex-wrap items-center justify-center" style={{ gap: '10px 0' }}>
        {ITEMS.map((item, i) => (
          <React.Fragment key={item.key}>
            {i > 0 && (
              <span
                aria-hidden="true"
                className="hidden sm:inline-block mx-4"
                style={{ width: 1, height: 18, background: 'linear-gradient(180deg, transparent, rgba(212,175,55,0.5), transparent)' }}
              />
            )}
            <span className="flex items-center gap-2 px-3 sm:px-0 font-body text-xs sm:text-sm font-bold tracking-wide text-white/90 whitespace-nowrap">
              <item.icon size={15} className="text-gold shrink-0" />
              {t(`vipStrip.${item.key}`)}
            </span>
          </React.Fragment>
        ))}
      </div>

      <p className="font-body text-[11px] sm:text-xs tracking-[0.2em] uppercase text-gold/70 text-center">
        {t('vipStrip.tagline')}
      </p>

      <p className="font-body text-[10px] text-white/35 text-center max-w-md leading-relaxed">
        {t('vipStrip.disclaimer')}
      </p>
    </motion.div>
  )
}
