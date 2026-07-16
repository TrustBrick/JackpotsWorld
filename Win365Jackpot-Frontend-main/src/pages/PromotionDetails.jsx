import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Gift as GiftIcon, CheckCircle2, CalendarClock, AlertTriangle, RefreshCw, ImageOff, X, ScrollText } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageScrollButtons from '../components/PageScrollButtons'
import { fetchPromotionDetail } from '../services/promotionService'
import { flagFromCountryCode } from '../utils/countryFlags'
import { getCasinoFallbackImage } from '../utils/mediaFallback'

export default function PromotionDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [promo, setPromo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const load = () => {
    setLoading(true)
    setError(false)
    fetchPromotionDetail(id).then(setPromo).catch(() => setError(true)).finally(() => setLoading(false))
  }

  useEffect(load, [id])

  return (
    <div className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />

      <main>
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
            {/* Large banner */}
            <div className="relative h-56 md:h-64 overflow-hidden">
              {(promo.image || getCasinoFallbackImage(promo.casino_name, promo.country)) ? (
                <img src={promo.image || getCasinoFallbackImage(promo.casino_name, promo.country)} alt={promo.title} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--w365-card), var(--w365-bg-mid))' }}>
                  <ImageOff size={32} className="text-gold/30" />
                </div>
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(10,0,5,0.9) 100%)' }} />
              <div className="absolute bottom-4 left-5 flex items-center gap-2.5">
                {promo.casino_logo && (
                  <img
                    src={promo.casino_logo}
                    alt={promo.casino_name || ''}
                    className="w-10 h-10 rounded-full object-cover border"
                    style={{ borderColor: 'rgba(212,175,55,0.5)' }}
                  />
                )}
                <div className="flex flex-col leading-tight">
                  {promo.casino_name && (
                    <span className="text-white/90 text-sm font-body font-semibold">{promo.casino_name}</span>
                  )}
                  <span className="text-white/60 text-xs font-body flex items-center gap-1">
                    <span className="flag text-sm leading-none">{flagFromCountryCode(promo.country_code)}</span>
                    {promo.country}
                  </span>
                </div>
              </div>
            </div>

            {/* Gallery */}
            {promo.gallery?.length > 0 && (
              <div className="px-6 md:px-8 pt-6">
                <div className="text-xs font-body uppercase tracking-widest text-gold/70 mb-3">Gallery</div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {promo.gallery.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setLightbox(g.image)}
                      className="relative aspect-square rounded-lg overflow-hidden group"
                    >
                      <img
                        src={g.image}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Video */}
            {promo.video && (
              <div className="px-6 md:px-8 pt-6">
                <div className="text-xs font-body uppercase tracking-widest text-gold/70 mb-3">Video</div>
                <video
                  controls
                  preload="metadata"
                  poster={promo.image || undefined}
                  className="w-full rounded-lg"
                  style={{ maxHeight: 420, background: '#000' }}
                >
                  <source src={promo.video} />
                </video>
              </div>
            )}

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

              {promo.terms_conditions && (
                <div className="mb-6">
                  <div className="flex items-center gap-1.5 text-xs font-body uppercase tracking-widest text-gold/70 mb-2">
                    <ScrollText size={12} /> Terms &amp; Conditions
                  </div>
                  <p className="text-white/40 text-xs font-body leading-relaxed whitespace-pre-line">{promo.terms_conditions}</p>
                </div>
              )}

              <button className="btn-gold w-full rounded-full py-3 text-sm font-bold tracking-widest uppercase">
                {promo.cta_label || 'Claim Bonus'}
              </button>
            </div>
          </motion.div>
        )}
      </section>
      </main>

      <PageScrollButtons />

      {/* Gallery lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center px-4"
            style={{ background: 'rgba(10,0,5,0.92)' }}
            onClick={() => setLightbox(null)}
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-5 right-5 text-white/60 hover:text-gold transition-colors"
            >
              <X size={22} />
            </button>
            <motion.img
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              src={lightbox}
              alt=""
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
