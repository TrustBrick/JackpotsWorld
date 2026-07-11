import React from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ArrowRight, ImageOff } from 'lucide-react'
import { useInView } from 'react-intersection-observer'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchEvents } from '../services/eventService'
import { getFallbackImage } from '../utils/mediaFallback'

export default function EventsPreviewSection() {
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true })
  const navigate = useNavigate()
  const { data } = useAutoFetch(fetchEvents, {}, { intervalMs: 60_000 })
  const events = (data?.results || []).slice(0, 3)

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="casino-card p-5 flex flex-col"
    >
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={16} className="text-gold" />
        <h3 className="font-black text-base uppercase tracking-wide" style={{ color: 'var(--w365-heading)' }}>
          Upcoming Events
        </h3>
      </div>

      <div className="flex flex-col gap-3 flex-1">
        {events.length === 0 && (
          <p className="text-sm font-body" style={{ color: 'var(--w365-text-muted)' }}>
            New events dropping soon — check back shortly.
          </p>
        )}
        {events.map(ev => (
          <button
            key={ev.id}
            onClick={() => navigate(`/events/${ev.id}`)}
            className="flex items-center gap-3 text-left rounded-xl p-2 transition-colors"
            style={{ background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--w365-surface-hi, rgba(255,255,255,0.05))' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <EventThumb event={ev} />
            <div className="min-w-0">
              <div className="text-sm font-bold truncate" style={{ color: 'var(--w365-text)' }}>{ev.name}</div>
              <div className="text-xs font-body" style={{ color: 'var(--w365-text-muted)' }}>
                {ev.city ? `${ev.city}, ` : ''}{ev.country}
              </div>
            </div>
          </button>
        ))}
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => navigate('/events')}
        className="btn-outline-gold mt-4 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
      >
        View All Events <ArrowRight size={13} />
      </motion.button>
    </motion.div>
  )
}

function EventThumb({ event }) {
  const [failed, setFailed] = React.useState(false)
  const src = event.image || getFallbackImage({ id: event.id, country: event.country })
  return (
    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'var(--w365-bg-mid)' }}>
      {!failed ? (
        <img src={src} alt={event.name} className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff size={14} className="text-gold/30" />
        </div>
      )}
    </div>
  )
}
