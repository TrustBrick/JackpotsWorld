import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Gift as GiftIcon, CheckCircle2 } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import PromotionCard from '../components/promotions/PromotionCard'
import { fetchPromotions } from '../data/promotions'

/**
 * Promotions page
 *
 * Same swap-friendly pattern as Events.jsx:
 *   const data = await fetchPromotions()
 * Point `fetchPromotions()` at `GET /api/promotions` later — no other
 * changes required.
 */
export default function Promotions() {
  const [promotions, setPromotions] = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchPromotions()
      .then(data => { if (active) setPromotions(data) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const handleClaim = (promo) => {
    // Placeholder — wire up to auth/claim flow once backend is ready.
    console.log('Claim clicked for promotion:', promo.id)
  }

  return (
    <div className="min-h-screen" style={{ background: '#0A0005' }}>
      <Navbar />

      <PageHeader
        eyebrow="Partner Casino Offers"
        title="Promotions"
        subtitle="Hand-picked bonuses, cashback, and perks from our partner casinos — refreshed regularly."
      />

      <section className="max-w-7xl mx-auto px-4 pb-24">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="casino-card h-[420px] animate-pulse" style={{ opacity: 0.5 }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {promotions.map(promo => (
              <PromotionCard
                key={promo.id}
                promotion={promo}
                onClaim={handleClaim}
                onViewDetails={setSelected}
              />
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
                {selected.casinoName}
              </p>
              <h3
                className="gold-text font-black text-2xl mb-3"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {selected.title}
              </h3>
              <p className="text-white/60 text-sm font-body mb-4">{selected.description}</p>

              <div className="flex items-center gap-2 text-sm font-body text-white/70 mb-2">
                <GiftIcon size={14} className="text-gold" /> {selected.bonusDetails}
              </div>

              <ul className="flex flex-col gap-1.5 mb-5">
                {selected.benefits?.map((b, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm font-body text-white/55">
                    <CheckCircle2 size={14} className="text-gold" /> {b}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleClaim(selected)}
                className="btn-gold w-full rounded-full py-2.5 text-sm font-bold tracking-widest uppercase"
              >
                {selected.ctaLabel || 'Claim Bonus'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
