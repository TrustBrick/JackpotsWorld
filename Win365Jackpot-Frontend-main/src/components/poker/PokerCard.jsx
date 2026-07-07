import React from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Building2, CalendarDays, Clock, MapPin, Coins, Trophy, ArrowRight, ImageOff } from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatTime(hms) {
  if (!hms) return ''
  const [h, m] = hms.split(':')
  const d = new Date()
  d.setHours(Number(h), Number(m))
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtMoney(n) {
  const num = Number(n || 0)
  return `$${num.toLocaleString('en-US')}`
}

const STATUS_COLORS = {
  upcoming: '#D4AF37',
  live: '#ff3366',
  completed: 'rgba(255,255,255,0.4)',
}

/**
 * PokerCard — premium dark-graphite/gold/glass tournament card.
 * Consumes the PokerTournamentSerializer shape from GET /api/poker/.
 */
function PokerCard({ tournament }) {
  const navigate = useNavigate()
  const statusColor = STATUS_COLORS[tournament.status] || '#888'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="poker-card flex flex-col overflow-hidden h-full"
    >
      <div className="relative h-36 overflow-hidden rounded-t-[20px]">
        {tournament.image ? (
          <img src={tournament.image} alt={tournament.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(160deg, rgba(28,28,30,0.9), rgba(18,18,20,0.9))' }}>
            <ImageOff size={24} className="text-gold/30" />
          </div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(10,10,12,0.9) 100%)' }} />
        <span
          className="absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5"
          style={{ background: `${statusColor}18`, border: `1px solid ${statusColor}55`, color: statusColor }}
        >
          {tournament.status === 'live' && (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
          )}
          {tournament.status}
        </span>
      </div>

      <div className="flex flex-col flex-1 p-5 gap-3">
        <h3 className="font-black text-lg text-white/90 leading-snug">{tournament.name}</h3>

        {(tournament.casino_name || tournament.location) && (
          <p className="text-white/55 text-xs font-body flex items-center gap-1.5">
            <Building2 size={13} className="text-gold shrink-0" />
            {[tournament.casino_name, tournament.location].filter(Boolean).join(' · ')}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs font-body text-white/60 mt-1">
          <div className="flex items-center gap-1.5">
            <Coins size={13} className="text-gold shrink-0" /> Buy-in: {fmtMoney(tournament.buy_in)}
          </div>
          <div className="flex items-center gap-1.5">
            <Trophy size={13} className="text-gold shrink-0" /> {fmtMoney(tournament.prize_pool)}
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays size={13} className="text-gold shrink-0" /> {formatDate(tournament.event_date)}
          </div>
          {tournament.event_time && (
            <div className="flex items-center gap-1.5">
              <Clock size={13} className="text-gold shrink-0" /> {formatTime(tournament.event_time)}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-auto">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(`/poker/${tournament.id}`)}
            className="btn-outline-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
          >
            Register
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(`/poker/${tournament.id}`)}
            className="btn-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
          >
            Get Ticket
            <ArrowRight size={13} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

export default React.memo(PokerCard)
