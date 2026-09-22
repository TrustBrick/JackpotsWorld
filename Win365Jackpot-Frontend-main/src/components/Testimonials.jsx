import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Star } from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchTestimonials } from '../services/landingService'
import { flagFromCountryCode } from '../utils/countryFlags'
import { fixMojibakeCurrency } from '../utils/mediaFallback'

/* ─────────────────────────────────────────────────────────────────────────
   Testimonials — member stories, entirely from Back Office → Testimonials.

   ── What was removed, and why ─────────────────────────────────────────────
   This component used to render two things that were not real.

   1. TWO INFINITE-SCROLL STRIPS OF "WINNERS". Sixty cards built by
      makeScrollCard(), every field generated with Math.random(): the name
      (a first name + a random initial), the city, the flag, the game, the
      destination, and a winnings figure between $500 and $28,000 — each one
      wearing a randomuser.me stock portrait of a real-looking face, under the
      heading "Winner Stories". Nobody in it existed and no figure in it was
      measured. The strips also rendered `[...cards, ...cards, ...cards]`, so
      each fabricated person appeared THREE TIMES on screen at once; React did
      not warn because the key appended the array index.

   2. SIX HARDCODED FALLBACK TESTIMONIALS. These were the exact rows migration
      0080 deleted from the database as fabricated social proof — "Rajesh K.
      won $10,200 in Macau" and so on. The cleanup removed the data and missed
      this constant, and the validation filter below (which required `won` and
      `dest`) then guaranteed the constant was what actually rendered: the two
      real rows in the database carry no winnings figure, so they were dropped
      and the fabrications took their place on every page load.

   Neither has an honest version. JackpotsWorld is a referral and concierge
   platform — it does not run games, take wagers or hold player funds (see
   BusinessModelFAQ), so it has no source of truth for what anybody won and
   cannot substantiate a winnings claim it publishes. That is the same
   reasoning behind migration 0080, and behind
   tests_landing_wording.test_no_testimonial_publishes_a_winnings_figure,
   which asserts no Testimonial row may carry `amount_won`.

   ── What a testimonial needs now ──────────────────────────────────────────
   A name and something the member actually said. Not a winnings figure: this
   business's members can honestly speak about the trip, the venue and the
   concierge service, which is what it actually provides. `amount_won` is
   still a field and still editable — if an admin ever has a real, consented,
   substantiated story with a figure attached, the badge renders. It is simply
   no longer REQUIRED, which is what was forcing invented ones into the gap.

   With no testimonials, the section renders NOTHING. An empty section is the
   correct look for a platform that has not collected any yet; filling it with
   invented people is what this change exists to stop.
   ───────────────────────────────────────────────────────────────────────── */

// ─── Avatar ───────────────────────────────────────────────────────────────────
// Falls back to the member's initials on a tinted disc when there is no
// uploaded photo, or when one fails to load. No stock portrait is ever
// substituted for a real person — a face is an identity claim, and this
// component has no right to make one on a member's behalf.
function Avatar({ src, name, color }) {
  const [loaded, setLoaded] = useState(false)
  const [err,    setErr]    = useState(false)
  const initials = (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)
  return (
    <div
      className="w-20 h-20 rounded-full overflow-hidden border-2 flex items-center justify-center flex-shrink-0 relative"
      style={{ borderColor: `${color}88`, background: `${color}22` }}
    >
      {src && !err && (
        <img loading="lazy" decoding="async"
          src={src} alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setErr(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {(!src || !loaded || err) && (
        <span className="font-bold font-black text-xl z-10" style={{ color }}>
          {initials}
        </span>
      )}
    </div>
  )
}

const DEFAULT_COLOR = '#D4AF37'

export default function Testimonials() {
  const [current, setCurrent] = useState(0)
  const { ref, inView }       = useInView({ threshold: 0.1, triggerOnce: true })

  const { data: testimonialsData } = useAutoFetch(fetchTestimonials, {}, { intervalMs: 60_000 })

  const mapped = (Array.isArray(testimonialsData) ? testimonialsData : []).map(t => ({
    id:     t.id,
    name:   t.name,
    city:   t.city,
    flag:   flagFromCountryCode(t.country_code) || t.flag,
    rating: t.rating,
    // Optional — rendered only when an admin has deliberately filled it in.
    won:    fixMojibakeCurrency(t.won || t.amount_won),
    dest:   t.dest || t.destination,
    color:  t.color || t.accent_color || DEFAULT_COLOR,
    avatar: t.avatar,
    text:   t.text,
  }))

  // A testimonial is a person and something they said. That is the whole
  // requirement — it deliberately no longer includes a winnings figure or a
  // destination, because requiring those is exactly what left a gap for
  // invented ones to fill. A row missing a name or text has nothing to show
  // and is dropped rather than rendered half-empty.
  const testimonials = mapped.filter(t => t.name && t.text)

  useEffect(() => {
    if (testimonials.length < 2) return undefined
    const timer = setInterval(
      () => setCurrent(p => (p + 1) % testimonials.length),
      5000,
    )
    return () => clearInterval(timer)
  }, [testimonials.length])

  // Nothing real to show: render nothing. See the note at the top of the file.
  if (!testimonials.length) return null

  const t = testimonials[current % testimonials.length] || testimonials[0]

  return (
    <section className="relative py-24 px-4 overflow-hidden" ref={ref}>

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(212,175,55,0.06),transparent_65%)]" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">

        {/* ── Header ──
            Was "Winner Stories" / "REAL WINNERS, REAL STOREIS" / "Thousands
            have won. You could be next." Every line asserted verified gambling
            outcomes this platform has no way to know, and the middle one also
            carried a typo. What members can genuinely speak to is the trip and
            the service, which is what this business actually provides. */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <div className="inline-block border border-gold/30 rounded-full px-5 py-1.5 text-xs font-body font-light tracking-widest uppercase text-gold/70 mb-4">
            ★ Member Stories
          </div>
          <h2 className="font-bold text-4xl md:text-5xl font-black gold-text mb-4">
            IN THEIR OWN WORDS
          </h2>
          <p className="font-body font-light text-lg text-theme-muted">
            Members on the destinations, the venues and the concierge service.
          </p>
        </motion.div>

        {/* ── Main testimonial card ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={t.id ?? current}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.4 }}
            className="casino-card p-8 md:p-12 text-center mb-8 neon-border relative overflow-hidden"
          >
            <div className="absolute top-6 left-8 text-8xl font-serif text-gold/10 leading-none select-none">"</div>

            <div className="flex justify-center mb-4">
              <Avatar src={t.avatar} name={t.name} color={t.color} />
            </div>

            {t.rating > 0 && (
              <div className="flex justify-center gap-1 mb-4">
                {[...Array(Math.min(5, t.rating))].map((_, i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="text-gold"
                    style={{ display: 'flex' }}
                  >
                    <Star size={20} fill="currentColor" color="currentColor" />
                  </motion.span>
                ))}
              </div>
            )}

            <p className="font-body font-light text-lg md:text-xl text-[rgba(var(--w365-text-rgb),0.8)] leading-relaxed mb-6 max-w-2xl mx-auto italic">
              "{t.text}"
            </p>

            {/* The destination badge. Where they went is a fact about the trip
                this business arranged, so it is safe to publish; the winnings
                half of the old badge is not, and is gone. */}
            {t.dest && (
              <div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full mb-4 font-body font-light font-bold text-sm"
                style={{ background: `${t.color}22`, border: `1px solid ${t.color}55`, color: t.color }}
              >
                ✈ {t.dest}
              </div>
            )}

            <div>
              <div className="font-bold text-theme text-base">{t.name}</div>
              {t.city && (
                <div className="font-body font-light text-sm text-[rgba(var(--w365-text-rgb),0.5)]">
                  {t.flag} {t.city}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ── Dots — only worth showing when there is more than one story ── */}
        {testimonials.length > 1 && (
          <div className="flex justify-center gap-2">
            {testimonials.map((item, i) => (
              <button
                key={item.id ?? i}
                onClick={() => setCurrent(i)}
                aria-label={`Show story ${i + 1} of ${testimonials.length}`}
                aria-current={current === i}
                className={`rounded-full transition-all duration-300 ${current === i ? 'w-8 h-2.5 bg-gold' : 'w-2.5 h-2.5 bg-white/20 hover:bg-gold/50'}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
