import React from 'react'
import { motion } from 'framer-motion'
import { Globe2 } from 'lucide-react'
import { useInView } from 'react-intersection-observer'

export default function GlobalReachCard() {
  const { ref, inView } = useInView({ threshold: 0.15, triggerOnce: true })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center text-center p-6"
      style={{
        borderRadius: 20,
        border: '1px solid rgba(212,175,55,0.35)',
        background: 'rgba(212,175,55,0.07)',
      }}
    >
      <div
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4"
        style={{
          border: '1px solid rgba(212,175,55,0.35)',
          background: 'rgba(212,175,55,0.1)',
          color: '#D4AF37',
        }}
      >
        <Globe2 size={14} />
        <span className="text-[11px] font-bold tracking-widest uppercase">Global Reach</span>
      </div>

      <h3 className="font-black text-xl md:text-2xl gold-text mb-2">
        Experience World-Class Casino Gaming Across
      </h3>

      <p
        className="font-body font-semibold text-sm md:text-base"
        style={{ color: '#D4AF37' }}
      >
        Vietnam · Macau · India · Sri Lanka · Philippines …
      </p>

      <p className="font-body font-light text-xs mt-3" style={{ color: 'var(--w365-text-muted)' }}>
        Curated offline casino experiences, wherever you play.
      </p>
    </motion.div>
  )
}
