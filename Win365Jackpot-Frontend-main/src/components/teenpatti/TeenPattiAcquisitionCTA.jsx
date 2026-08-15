import React from 'react'
import { motion } from 'framer-motion'
import { Crown, ArrowRight, Users, Sparkles } from 'lucide-react'
import { getUser } from '../../services/authStorage'

/**
 * TeenPattiAcquisitionCTA — the player-acquisition centerpiece of the Teen
 * Patti section (JACKPOTSWORLD spec Parts 4/5). Every Teen Patti visitor is
 * a lead: this section exists to convert that visit into a JackpotsWorld
 * account, using the existing auth flow — no new routing, no new signup
 * surface.
 *
 * Two variants, chosen by the caller passing `isLoggedIn`:
 *   - Guest: a hard conversion push toward registration/sign-in.
 *   - Signed-in: never re-asks a player to "register" for a platform they
 *     already have an account on. Instead it points them at what's
 *     actually actionable right now (live or upcoming tables), so the
 *     section stays useful rather than becoming noise for a returning user.
 *
 * Visual language reuses the existing premium primitives (.casino-card,
 * .btn-gold, .btn-outline-gold, .gold-text) rather than introducing a new
 * style — this is a new arrangement of the existing system, not a new look.
 */
export default function TeenPattiAcquisitionCTA({
  isLoggedIn, liveCount = 0, upcomingCount = 0, onPrimaryAction, onScrollToTables,
}) {
  const firstName = isLoggedIn ? (getUser('user')?.name || '').split(' ')[0] : ''
  const hasLiveTables = liveCount > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6 }}
      className="casino-card relative overflow-hidden px-6 py-8 md:px-12 md:py-12 mb-10"
      style={{ border: '1px solid rgba(212,175,55,0.35)' }}
    >
      {/* Radial gold glow, matching the premium-card treatment used across
          the hero and VIP sections — decorative only, no layout impact. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          top: '-40%', right: '-10%', width: '60%', height: '180%',
          background: 'radial-gradient(circle, rgba(212,175,55,0.14) 0%, transparent 65%)',
        }}
      />

      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-8">
        <div className="max-w-2xl text-center md:text-left">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full"
            style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)' }}>
            <Crown size={13} className="text-gold" />
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gold">
              {isLoggedIn ? 'Welcome to the Table' : 'Are You a Teen Patti Player?'}
            </span>
          </div>

          <h2 className="font-black text-2xl md:text-4xl leading-tight mb-3" style={{ fontFamily: "'Manrope', sans-serif" }}>
            {isLoggedIn ? (
              <>
                {firstName ? `${firstName}, ` : ''}<span className="gold-text">Your Table Is Waiting</span>
              </>
            ) : (
              <>Play. Connect. <span className="gold-text">Compete.</span></>
            )}
          </h2>

          <p className="text-white/55 font-body text-sm md:text-base leading-relaxed">
            {isLoggedIn ? (
              hasLiveTables
                ? `${liveCount} premium Teen Patti table${liveCount === 1 ? ' is' : 's are'} live right now. Reserve your seat before it fills.`
                : 'New premium Teen Patti events are added regularly — be first in line when the next table opens.'
            ) : (
              'Join a premium community of Teen Patti players competing at JackpotsWorld\'s partner casinos worldwide. Real tables, real stakes, real prestige — register now and claim your seat before it fills.'
            )}
          </p>

          {!isLoggedIn && (
            <div className="flex items-center justify-center md:justify-start gap-5 mt-5 text-[11px] font-body text-white/40">
              <span className="flex items-center gap-1.5"><Users size={13} className="text-gold" /> Exclusive Access</span>
              <span className="flex items-center gap-1.5"><Sparkles size={13} className="text-gold" /> VIP Community</span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 shrink-0">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={isLoggedIn ? onScrollToTables : onPrimaryAction}
            className="btn-gold flex items-center justify-center gap-2 rounded-full px-9 py-4 text-sm font-bold tracking-widest uppercase whitespace-nowrap"
          >
            {isLoggedIn ? (hasLiveTables ? 'View Live Tables' : 'See Upcoming Events') : 'Register Now'}
            <ArrowRight size={15} />
          </motion.button>
          {!isLoggedIn && (
            <span className="text-[10px] font-body text-white/35 tracking-wide">
              Already have an account? <button onClick={onPrimaryAction} className="text-gold underline underline-offset-2">Sign in</button>
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
