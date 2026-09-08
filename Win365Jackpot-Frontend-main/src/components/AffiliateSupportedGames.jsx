import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { ArrowRight, Layers, Club, Spade } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { apiGet } from '../services/apiClient'

/* ─────────────────────────────────────────────────────────────────────────
   AffiliateSupportedGames — the games an affiliate can refer players for.

   ── What this replaced, and why ───────────────────────────────────────────
   Originally a strip of "affiliates earning right now": names, cities, flags,
   referral counts and commission figures, all generated in the browser with
   Math.random() on every page load. Nobody in it existed and no figure was
   real. It also rendered `[...cards, ...cards, ...cards]`, so each invented
   person appeared THREE TIMES at once — the duplicate-card bug.

   That was replaced with real aggregate counts (active partners, players
   referred, countries reached). Those were genuine, but they were also the
   wrong thing to say here: a prospective affiliate does not need a headcount,
   they need to know WHAT they can refer people for. So the counts are gone
   too, and this now answers that question instead.

   ── Why it names the games rather than counting anything ──────────────────
   Poker, Teen Patti and Andhar Bahar are the three games a referral can be
   attributed to, and the list comes from the server's own vocabulary
   (authapp/constants/games.py) rather than a copy kept here — so adding a
   game to the platform adds it to this section with no frontend change.

   Nothing on this page claims an earning figure. Commission rates vary by
   game, country, destination and affiliate tier and are set per affiliate in
   the Back Office; publishing a headline percentage here would be inventing
   one. The rates an affiliate is actually on are in their own dashboard.
   ───────────────────────────────────────────────────────────────────────── */

const GOLD = '#D4AF37'

const GAME_ICONS = {
  poker: Spade,
  teen_patti: Club,
  andhar_bahar: Layers,
}

// What each game offers an affiliate's audience. Structural copy about the
// programme, not a claim about outcomes or earnings.
const GAME_BLURB = {
  poker:
    'Tournament schedules, buy-ins and seat availability at partner casinos — '
    + 'players who follow a circuit have a reason to come back.',
  teen_patti:
    'Seat-limited events with confirmed registrations, so an interested player '
    + 'knows they have a place before they travel.',
  andhar_bahar:
    'Fast, easy to follow, and the easiest of the three for a first-time '
    + 'visitor — players sign up to hear where tables are live.',
}

function fetchProgramStats(params = {}) {
  return apiGet('/api/affiliate/program-stats/', params)
}

export default function AffiliateSupportedGames() {
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true })
  const { data } = useAutoFetch(fetchProgramStats, {}, { intervalMs: 300_000 })

  const games = data?.supported_games || []
  if (!games.length) return null

  return (
    <section className="relative py-4" ref={ref}>
      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: reduceMotion ? 0 : 0.6 }}
        className="text-center mb-10"
      >
        <div className="inline-block border border-gold/30 rounded-full px-5 py-1.5 text-xs font-body font-light tracking-widest uppercase text-gold/70 mb-4">
          What You Can Refer
        </div>
        <h2 className="gold-text font-black text-2xl tracking-wide mb-3">
          Three Games, One Affiliate Account
        </h2>
        <p className="text-white/70 font-body text-sm max-w-2xl mx-auto leading-relaxed">
          Your link works across all three. Commission is attributed to whichever game your
          referred player actually plays, so you are never asked to pick one.
        </p>
      </motion.div>

      <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-5">
        {games.map((g, i) => {
          const Icon = GAME_ICONS[g.game] || Layers
          return (
            <motion.button
              key={g.game}
              type="button"
              onClick={() => g.route && navigate(g.route)}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : i * 0.06 }}
              className="casino-card p-6 flex flex-col items-start gap-3 text-left"
              style={{ cursor: g.route ? 'pointer' : 'default' }}
            >
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)' }}
              >
                <Icon size={18} style={{ color: GOLD }} />
              </div>
              <h3 className="font-body font-bold text-base text-white/90">{g.label}</h3>
              {GAME_BLURB[g.game] && (
                <p className="text-white/65 text-xs font-body leading-relaxed">
                  {GAME_BLURB[g.game]}
                </p>
              )}
              {g.route && (
                <span
                  className="mt-auto pt-2 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase"
                  style={{ color: GOLD }}
                >
                  View {g.label} <ArrowRight size={12} />
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      <p className="text-center text-white/45 text-[11px] font-body mt-6 px-4">
        Commission rates vary by game, country, destination and affiliate tier, and are
        confirmed with your account manager.
      </p>
    </section>
  )
}
