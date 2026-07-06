import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarX2 } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import EventCard from '../components/events/EventCard'
import { fetchEvents } from '../data/events'

/**
 * Events page
 *
 * Data flow is intentionally isolated to this one `useEffect`:
 *   const data = await fetchEvents()
 * `fetchEvents()` currently resolves local dummy data (src/data/events.js).
 * Point it at `GET /api/events` later and this component, EventCard, and
 * the rest of the UI require no changes.
 */
export default function Events() {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchEvents()
      .then(data => { if (active) setEvents(data) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const handleRegister = (event) => {
    // Placeholder — wire up to auth/registration flow once backend is ready.
    console.log('Register clicked for event:', event.id)
  }

  return (
    <div className="min-h-screen" style={{ background: '#0A0005' }}>
      <Navbar />

      <PageHeader
        eyebrow="Jackpots World Presents"
        title="Casino Events"
        subtitle="Exclusive tournaments, galas, and high-stakes weekends hosted by our partner casinos around the world."
      />

      <section className="max-w-7xl mx-auto px-4 pb-24">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="casino-card h-[420px] animate-pulse"
                style={{ opacity: 0.5 }}
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-white/40"
          >
            <CalendarX2 size={40} className="mb-4 text-gold/50" />
            <p className="font-body">No events available right now. Check back soon.</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map(event => (
              <EventCard key={event.id} event={event} onRegister={handleRegister} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
