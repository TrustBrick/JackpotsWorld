import React from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Gift, ArrowRight } from 'lucide-react'
import { useInView } from 'react-intersection-observer'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchPromotions } from '../services/promotionService'
import { flagFromCountryCode } from '../utils/countryFlags'

export default function PromotionsPreviewSection() {
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true })
  const navigate = useNavigate()
  const { data } = useAutoFetch(fetchPromotions, {}, { intervalMs: 60_000 })

  const flat = (data?.countries || []).flatMap(c => c.promotions || [])
  const promos = flat.slice(0, 3)

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="casino-card p-5 flex flex-col"
    >
      <div className="flex items-center gap-2 mb-4">
        <Gift size={16} className="text-gold" />
        <h3 className="font-black text-base uppercase tracking-wide" style={{ color: 'var(--w365-heading)' }}>
          Latest Promotions
        </h3>
      </div>

      <div className="flex flex-col gap-3 flex-1">
        {promos.length === 0 && (
          <p className="text-sm font-body" style={{ color: 'var(--w365-text-muted)' }}>
            New bonuses coming soon — check back shortly.
          </p>
        )}
        {promos.map(p => (
          <button
            key={p.id}
            onClick={() => navigate(`/promotions/${p.id}`)}
            className="flex items-center gap-3 text-left rounded-xl p-2 transition-colors"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--w365-surface-hi, rgba(255,255,255,0.05))' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span className="text-2xl flex-shrink-0">{flagFromCountryCode(p.country_code) || '🎁'}</span>
            <div className="min-w-0">
              <div className="text-sm font-bold truncate" style={{ color: 'var(--w365-text)' }}>{p.title}</div>
              <div className="text-xs font-body truncate" style={{ color: 'var(--w365-text-muted)' }}>
                {p.casino_name ? `${p.casino_name} · ` : ''}{p.country}
              </div>
            </div>
          </button>
        ))}
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => navigate('/promotions')}
        className="btn-gold mt-4 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
      >
        View All Promotions <ArrowRight size={13} />
      </motion.button>
    </motion.div>
  )
}
