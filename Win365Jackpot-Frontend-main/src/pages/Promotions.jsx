import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import PageScrollButtons from '../components/PageScrollButtons'
import PromotionCard from '../components/promotions/PromotionCard'
import { fetchPromotions } from '../services/promotionService'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { flagFromCountryCode } from '../utils/countryFlags'

const EMPTY_PARAMS = {}

export default function Promotions() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useAutoFetch(fetchPromotions, EMPTY_PARAMS, { intervalMs: 60_000 })

  const countries = data?.countries || []

  // Claim Bonus / Learn More / Details all open the full promotion details
  // page (large banner, gallery, video, T&Cs) rather than a small in-page
  // modal, since that page already exists and matches the design.
  const goToDetails = (promo) => navigate(`/promotions/${promo.id}`)

  return (
    <div key={theme} className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />

      <main>
      <PageHeader
        eyebrow={t('promotions.eyebrow')}
        title={t('promotions.title')}
        subtitle={t('promotions.subtitle')}
      />

      <section className="max-w-7xl mx-auto px-4 pb-24">
        {loading ? (
          <div className="flex flex-col gap-8">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex gap-5 overflow-hidden">
                {Array.from({ length: 3 }).map((__, j) => (
                  <div key={j} className="casino-card h-[380px] w-[300px] shrink-0 animate-pulse" style={{ opacity: 0.5 }} />
                ))}
              </div>
            ))}
          </div>
        ) : error ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-white/40">
            <AlertTriangle size={40} className="mb-4 text-red-400/60" />
            <p className="font-body mb-4">{t('promotions.loadError')}</p>
            <button onClick={reload} className="btn-outline-gold rounded-full px-5 py-2 text-sm font-bold flex items-center gap-2">
              <RefreshCw size={14} /> {t('common.retry')}
            </button>
          </motion.div>
        ) : countries.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-white/40">
            <Sparkles size={40} className="mb-4 text-gold/50" />
            <p className="font-body">{t('promotions.noPromotions')}</p>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-12">
            {countries.map(({ country, promotions }) => (
              <div key={country}>
                <div className="flex items-center gap-3 mb-5">
                  <span className="flag text-2xl leading-none">{flagFromCountryCode(promotions[0]?.country_code)}</span>
                  <h2 className="gold-text font-black text-xl md:text-2xl tracking-wide">{country}</h2>
                  <span className="text-white/30 text-xs font-body">{t('promotions.offersCount', { count: promotions.length })}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {promotions.map((promo) => (
                    <PromotionCard key={promo.id} promotion={promo} onClaim={goToDetails} onViewDetails={goToDetails} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </main>

      <PageScrollButtons />
    </div>
  )
}
