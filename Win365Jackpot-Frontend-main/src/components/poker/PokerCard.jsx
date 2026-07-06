import React from 'react'
import { motion } from 'framer-motion'
import { Building2, CalendarDays, MapPin, Coins, Trophy, Users, ArrowRight, Info } from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * PokerCard
 * Purely presentational — takes one `tournament` object (see
 * src/data/poker.js) and renders it. Compatible as-is with a live
 * `/api/poker-events` response as long as field names are preserved.
 */
export default function PokerCard({ tournament, onRegister, onViewDetails }) {
  const isLive = tournament.status === 'live'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="casino-card flex flex-col overflow-hidden h-full p-5 gap-3"
    >
      <div className="flex items-center justify-between">
        <span
          className="px-3 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase flex items-center gap-1.5"
          style={
            isLive
              ? { background: 'rgba(255,51,102,0.12)', border: '1px solid rgba(255,51,102,0.5)', color: '#ff5570' }
              : { background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.5)', color: '#D4AF37' }
          }
        >
          {isLive && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: '#ff3366', boxShadow: '0 0 6px #ff3366' }}
            />
          )}
          {isLive ? 'Live Now' : 'Upcoming'}
        </span>
        <span className="text-white/40 text-xs font-body flex items-center gap-1">
          <Users size={12} /> {tournament.seatsAvailable} seats left
        </span>
      </div>

      <h3
        className="font-black text-lg text-white/90 leading-snug"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        {tournament.title}
      </h3>

      <p className="text-white/55 text-xs font-body flex items-center gap-1.5">
        <Building2 size={13} className="text-gold shrink-0" />
        {tournament.casino}
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs font-body text-white/60 mt-1">
        <div className="flex items-center gap-1.5">
          <Coins size={13} className="text-gold shrink-0" /> Buy-in: {tournament.buyIn}
        </div>
        <div className="flex items-center gap-1.5">
          <Trophy size={13} className="text-gold shrink-0" /> {tournament.prizePool}
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarDays size={13} className="text-gold shrink-0" /> {formatDate(tournament.date)}
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin size={13} className="text-gold shrink-0" /> {tournament.venue.split('—')[0].trim()}
        </div>
      </div>

      <div className="section-divider my-1" />

      <div className="flex gap-2 mt-auto">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onRegister?.(tournament)}
          className="btn-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
        >
          Register
          <ArrowRight size={13} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onViewDetails?.(tournament)}
          className="btn-outline-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
        >
          <Info size={13} />
          Details
        </motion.button>
      </div>
    </motion.div>
  )
}
