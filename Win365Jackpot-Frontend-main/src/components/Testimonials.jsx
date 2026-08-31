import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Star } from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchTestimonials } from '../services/landingService'
import { flagFromCountryCode } from '../utils/countryFlags'
import { fixMojibakeCurrency } from '../utils/mediaFallback'

// ─── Avatar component ─────────────────────────────────────────────────────────
function Avatar({ src, name, color, size = 'lg' }) {
  const [loaded, setLoaded] = useState(false)
  const [err,    setErr]    = useState(false)
  const dim  = size === 'lg' ? 'w-20 h-20' : 'w-9 h-9'
  const text = size === 'lg' ? 'text-xl'   : 'text-[10px]'
  const initials = name.split(' ').map(n => n[0]).join('').slice(0,2)
  return (
    <div
      className={`${dim} rounded-full overflow-hidden border-2 flex items-center justify-center flex-shrink-0 relative`}
      style={{ borderColor: `${color}88`, background: `${color}22` }}
    >
      {!err && (
        <img
          src={src} alt={name}
          onLoad={() => setLoaded(true)}
          onError={() => setErr(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {(!loaded || err) && (
        <span className={` font-bold font-black ${text} z-10`} style={{ color }}>
          {initials}
        </span>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Testimonials() {
  const [current, setCurrent]     = useState(0)
  const { ref, inView }           = useInView({ threshold: 0.1, triggerOnce: true })

  const { data: testimonialsData } = useAutoFetch(fetchTestimonials, {}, { intervalMs: 60_000 })
  const mapped = (Array.isArray(testimonialsData) ? testimonialsData : []).map(t => ({
    name: t.name, city: t.city, flag: flagFromCountryCode(t.country_code) || t.flag,
    rating: t.rating, won: fixMojibakeCurrency(t.won || t.amount_won), dest: t.dest || t.destination,
    color: t.color || t.accent_color, avatar: t.avatar, text: t.text,
  }))
  // Every record must have its own name/location/winnings/casino-country
  // together — a record missing any of these belongs to no one and is
  // dropped rather than rendered with a gap.
  //
  // Nothing stands in for a missing record: these are real people's names and
  // real amounts, so there is no fallback list and no generated filler. An
  // empty response renders no section at all.
  const testimonials = mapped.filter(t => t.name && t.city && t.won && t.dest)

  useEffect(() => {
    if (testimonials.length === 0) return
    const timer = setInterval(() => setCurrent(p => (p + 1) % testimonials.length), 5000)
    return () => clearInterval(timer)
  }, [testimonials.length])

  if (testimonials.length === 0) return null

  const t = testimonials[current % testimonials.length]

  return (
    <section className="relative py-24 px-4 overflow-hidden" ref={ref}>

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(212,175,55,0.06),transparent_65%)]" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity:0, y:30 }}
          animate={inView ? { opacity:1, y:0 } : {}}
          transition={{ duration:0.7 }}
          className="text-center mb-16"
        >
          <div className="inline-block border border-gold/30 rounded-full px-5 py-1.5 text-xs font-body font-light tracking-widest uppercase text-gold/70 mb-4">
            🏆 Winner Stories
          </div>
          <h2 className=" font-bold text-4xl md:text-5xl font-black gold-text mb-4">
            REAL WINNERS, REAL STOREIS
          </h2>
          <p className="font-body font-light text-lg text-theme-muted">Thousands have won. You could be next.</p>
        </motion.div>

        {/* ── Main testimonial card ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity:0, x:60 }}
            animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x:-60 }}
            transition={{ duration:0.4 }}
            className="casino-card p-8 md:p-12 text-center mb-8 neon-border relative overflow-hidden"
          >
            <div className="absolute top-6 left-8 text-8xl font-serif text-gold/10 leading-none select-none">"</div>

            <div className="flex justify-center mb-4">
              <Avatar src={t.avatar} name={t.name} color={t.color} size="lg" />
            </div>

            <div className="flex justify-center gap-1 mb-4">
              {[...Array(Math.max(0, Math.min(5, Math.floor(Number(t.rating) || 0))))].map((_,i) => (
                <motion.span key={i} initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:i*0.1 }} className="text-gold" style={{ display:'flex' }}>
                  <Star size={20} fill="currentColor" color="currentColor" />
                </motion.span>
              ))}
            </div>

            <p className="font-body font-light text-lg md:text-xl text-[rgba(var(--w365-text-rgb),0.8)] leading-relaxed mb-6 max-w-2xl mx-auto italic">
              "{t.text}"
            </p>

            <div
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full mb-4 font-body font-light font-bold text-sm"
              style={{ background:`${t.color}22`, border:`1px solid ${t.color}55`, color:t.color }}
            >
              🏆 Won {t.won} in {t.dest}
            </div>

            <div>
              <div className=" font-bold font-bold text-theme text-base">{t.name}</div>
              <div className="font-body font-light text-sm text-[rgba(var(--w365-text-rgb),0.5)]">{t.flag} {t.city}</div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ── Dots ── */}
        <div className="flex justify-center gap-2 mb-16">
          {testimonials.map((_,i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`rounded-full transition-all duration-300 ${current===i ? 'w-8 h-2.5 bg-gold' : 'w-2.5 h-2.5 bg-white/20 hover:bg-gold/50'}`}
            />
          ))}
        </div>
      </div>

    </section>
  )
}