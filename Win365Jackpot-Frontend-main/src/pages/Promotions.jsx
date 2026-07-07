import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Gift as GiftIcon, CheckCircle2, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import PromotionCard from '../components/promotions/PromotionCard'
import { fetchPromotions } from '../services/promotionService'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { flagFromCountryCode } from '../utils/countryFlags'

const EMPTY_PARAMS = {}

export default function Promotions() {
  const [selected, setSelected] = useState(null)
  const { data, loading, error, reload } = useAutoFetch(fetchPromotions, EMPTY_PARAMS, { intervalMs: 60_000 })

  const countries = data?.countries || []

  const handleClaim = (promo) => setSelected(promo)

  return (
    <div className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />

      <PageHeader
        eyebrow="Partner Casino Offers"
        title="Promotions"
        subtitle="Hand-picked bonuses, cashback, and perks from our partner casinos — refreshed regularly."
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
            <p className="font-body mb-4">Couldn't load promotions right now. Please try again.</p>
            <button onClick={reload} className="btn-outline-gold rounded-full px-5 py-2 text-sm font-bold flex items-center gap-2">
              <RefreshCw size={14} /> Retry
            </button>
          </motion.div>
        ) : countries.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-white/40">
            <Sparkles size={40} className="mb-4 text-gold/50" />
            <p className="font-body">No promotions available right now. Check back soon.</p>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-12">
            {countries.map(({ country, promotions }) => (
              <div key={country}>
                <div className="flex items-center gap-3 mb-5">
                  <span className="flag text-2xl leading-none">{flagFromCountryCode(promotions[0]?.country_code)}</span>
                  <h2 className="gold-text font-black text-xl md:text-2xl tracking-wide">{country}</h2>
                  <span className="text-white/30 text-xs font-body">{promotions.length} offer{promotions.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="flex gap-5 overflow-x-auto pb-3 sa-scrollbar" style={{ scrollSnapType: 'x proximity' }}>
                  {promotions.map(promo => (
                    <div key={promo.id} className="shrink-0 w-[300px] md:w-[340px]" style={{ scrollSnapAlign: 'start' }}>
                      <PromotionCard promotion={promo} onClaim={handleClaim} onViewDetails={setSelected} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Details modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            style={{ background: 'rgba(10,0,5,0.85)' }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="casino-card max-w-md w-full p-6 relative"
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute top-4 right-4 text-white/50 hover:text-gold transition-colors"
              >
                <X size={18} />
              </button>

              <p className="text-gold/70 text-xs tracking-widest uppercase font-body mb-1">
                {selected.casino_name}
              </p>
              <h3 className="gold-text font-black text-2xl mb-3">{selected.title}</h3>
              {selected.description && <p className="text-white/60 text-sm font-body mb-4">{selected.description}</p>}

              {selected.bonus_details && (
                <div className="flex items-center gap-2 text-sm font-body text-white/70 mb-2">
                  <GiftIcon size={14} className="text-gold" /> {selected.bonus_details}
                </div>
              )}

              {selected.benefits?.length > 0 && (
                <ul className="flex flex-col gap-1.5 mb-5">
                  {selected.benefits.map((b, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm font-body text-white/55">
                      <CheckCircle2 size={14} className="text-gold" /> {b}
                    </li>
                  ))}
                </ul>
              )}

              <button
                onClick={() => setSelected(null)}
                className="btn-gold w-full rounded-full py-2.5 text-sm font-bold tracking-widest uppercase"
              >
                {selected.cta_label || 'Claim Bonus'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
