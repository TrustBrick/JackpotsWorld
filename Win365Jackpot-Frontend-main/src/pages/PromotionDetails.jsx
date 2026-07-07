import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Gift as GiftIcon, CheckCircle2, CalendarClock, AlertTriangle, RefreshCw, ImageOff } from 'lucide-react'
import Navbar from '../components/Navbar'
import { fetchPromotionDetail } from '../services/promotionService'
import { flagFromCountryCode } from '../utils/countryFlags'

export default function PromotionDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [promo, setPromo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = () => {
    setLoading(true)
    setError(false)
    fetchPromotionDetail(id).then(setPromo).catch(() => setError(true)).finally(() => setLoading(false))
  }

  useEffect(load, [id])

  return (
    <div className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />

      <section className="max-w-3xl mx-auto px-4 pt-28 pb-24">
        <button
          onClick={() => navigate('/promotions')}
          className="flex items-center gap-1.5 text-sm font-body text-white/50 hover:text-gold transition-colors mb-6"
        >
          <ArrowLeft size={15} /> Back to Promotions
        </button>

        {loading ? (
          <div className="casino-card h-[420px] animate-pulse" style={{ opacity: 0.5 }} />
        ) : error || !promo ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-white/40">
            <AlertTriangle size={40} className="mb-4 text-red-400/60" />
            <p className="font-body mb-4">Couldn't load this promotion.</p>
            <button onClick={load} className="btn-outline-gold rounded-full px-5 py-2 text-sm font-bold flex items-center gap-2">
              <RefreshCw size={14} /> Retry
            </button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="casino-card overflow-hidden">
            <div className="relative h-56 md:h-64 overflow-hidden">
              {promo.image ? (
                <img src={promo.image} alt={promo.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--w365-card), var(--w365-bg-mid))' }}>
                  <ImageOff size={32} className="text-gold/30" />
                </div>
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(10,0,5,0.9) 100%)' }} />
              <div className="absolute bottom-4 left-5 flex items-center gap-2">
                <span className="flag text-xl leading-none">{flagFromCountryCode(promo.country_code)}</span>
                <span className="text-white/70 text-xs font-body">{promo.country}{promo.casino_name ? ` · ${promo.casino_name}` : ''}</span>
              </div>
            </div>

            <div className="p-6 md:p-8">
              <h1 className="font-black text-2xl md:text-3xl text-white/90 mb-4">{promo.title}</h1>

              {promo.description && <p className="text-white/60 text-sm font-body leading-relaxed mb-5">{promo.description}</p>}

              {promo.validity_text && (
                <div className="flex items-center gap-2 text-sm font-body text-white/60 mb-2">
                  <CalendarClock size={15} className="text-gold" /> {promo.validity_text}
                </div>
              )}
              {promo.bonus_details && (
                <div className="flex items-center gap-2 text-sm font-body text-white/70 mb-4">
                  <GiftIcon size={15} className="text-gold" /> {promo.bonus_details}
                </div>
              )}

              {promo.benefits?.length > 0 && (
                <ul className="flex flex-col gap-2 mb-6">
                  {promo.benefits.map((b, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm font-body text-white/55">
                      <CheckCircle2 size={14} className="text-gold" /> {b}
                    </li>
                  ))}
                </ul>
              )}

              <button className="btn-gold w-full rounded-full py-3 text-sm font-bold tracking-widest uppercase">
                {promo.cta_label || 'Claim Bonus'}
              </button>
            </div>
          </motion.div>
        )}
      </section>
    </div>
  )
}
