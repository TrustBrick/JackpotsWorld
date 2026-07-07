import React from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  MapPin, Building2, CalendarDays, Clock, Tag, ArrowRight, ImageOff,
} from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(hms) {
  if (!hms) return ''
  const [h, m] = hms.split(':')
  const d = new Date()
  d.setHours(Number(h), Number(m))
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const STATUS_COLORS = {
  upcoming: '#60a5fa',
  live: '#34d399',
  completed: 'rgba(255,255,255,0.4)',
}

/**
 * EventCard — presentational only. Consumes the CasinoEventSerializer shape
 * from GET /api/events/ (see src/services/eventService.js).
 */
function EventCard({ event }) {
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="casino-card flex flex-col overflow-hidden h-full"
    >
      {/* Banner */}
      <div className="relative h-44 md:h-48 overflow-hidden">
        {event.image ? (
          <img
            src={event.image}
            alt={event.name}
            className="w-full h-full object-cover"
            loading="lazy"
            width={400}
            height={192}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--w365-card), var(--w365-bg-mid))' }}
          >
            <ImageOff size={26} className="text-gold/30" />
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(10,0,5,0.9) 100%)' }}
        />
        {event.category && (
          <span
            className="absolute top-3 left-3 px-3 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase"
            style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.5)', color: '#D4AF37' }}
          >
            <Tag size={10} className="inline mr-1 -mt-0.5" />
            {event.category}
          </span>
        )}
        {event.status && (
          <span
            className="absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase"
            style={{
              background: `${STATUS_COLORS[event.status] || '#888'}18`,
              border: `1px solid ${STATUS_COLORS[event.status] || '#888'}55`,
              color: STATUS_COLORS[event.status] || '#888',
            }}
          >
            {event.status}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <h3 className="font-black text-lg text-white/90 leading-snug">{event.name}</h3>

        {event.short_description && (
          <p className="text-white/55 text-sm font-body leading-relaxed line-clamp-3">
            {event.short_description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs font-body text-white/60 mt-1">
          <div className="flex items-center gap-1.5">
            <MapPin size={13} className="text-gold shrink-0" />
            {event.city ? `${event.city}, ` : ''}{event.country}
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays size={13} className="text-gold shrink-0" />
            {formatDate(event.event_date)}
          </div>
          {event.event_time && (
            <div className="flex items-center gap-1.5">
              <Clock size={13} className="text-gold shrink-0" />
              {formatTime(event.event_time)}
            </div>
          )}
          {event.venue && (
            <div className="col-span-2 flex items-center gap-1.5">
              <Building2 size={13} className="text-gold shrink-0" />
              {event.venue}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-auto">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(`/events/${event.id}`)}
            className="btn-outline-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
          >
            Register
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(`/events/${event.id}`)}
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

export default React.memo(EventCard)
