import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarX2, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import EventCard from '../components/events/EventCard'
import { fetchEvents } from '../services/eventService'
import { useAutoFetch } from '../hooks/useAutoFetch'

const PAGE_SIZE = 20

export default function Events() {
  const [page, setPage] = useState(1)

  const params = useMemo(() => ({ page }), [page])

  const { data, loading, error, reload } = useAutoFetch(fetchEvents, params, { intervalMs: 60_000 })

  const events = data?.results || []
  const totalPages = Math.max(1, Math.ceil((data?.count || 0) / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-surface" style={{ background: 'var(--w365-bg)' }}>
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
              <div key={i} className="casino-card h-[420px] animate-pulse" style={{ opacity: 0.5 }} />
            ))}
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-white/40"
          >
            <AlertTriangle size={40} className="mb-4 text-red-400/60" />
            <p className="font-body mb-4">Couldn't load events right now. Please try again.</p>
            <button onClick={reload} className="btn-outline-gold rounded-full px-5 py-2 text-sm font-bold flex items-center gap-2">
              <RefreshCw size={14} /> Retry
            </button>
          </motion.div>
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
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-10">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-outline-gold rounded-full p-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Older events"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-body text-white/50">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn-outline-gold rounded-full p-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Newer events"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
