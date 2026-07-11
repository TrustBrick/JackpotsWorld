import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { CalendarX2, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import EventCard from '../components/events/EventCard'
import { fetchEvents } from '../services/eventService'
import { useAutoFetch } from '../hooks/useAutoFetch'

const PAGE_SIZE = 20
const STATUS_ORDER = { live: 0, upcoming: 1, completed: 2 }

export default function Events() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [page, setPage] = useState(1)

  const params = useMemo(() => ({ page }), [page])

  const { data, loading, error, reload } = useAutoFetch(fetchEvents, params, { intervalMs: 60_000 })

  const events = useMemo(() => {
    const list = data?.results || []
    return [...list].sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99))
  }, [data])
  const totalPages = Math.max(1, Math.ceil((data?.count || 0) / PAGE_SIZE))

  return (
    <div key={theme} className="min-h-screen bg-surface" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />

      <PageHeader
        eyebrow={t('events.eyebrow')}
        title={t('events.title')}
        subtitle={t('events.subtitle')}
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
            <p className="font-body mb-4">{t('events.loadError')}</p>
            <button onClick={reload} className="btn-outline-gold rounded-full px-5 py-2 text-sm font-bold flex items-center gap-2">
              <RefreshCw size={14} /> {t('common.retry')}
            </button>
          </motion.div>
        ) : events.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-white/40"
          >
            <CalendarX2 size={40} className="mb-4 text-gold/50" />
            <p className="font-body">{t('events.noEvents')}</p>
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
                  aria-label={t('events.olderEvents')}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-body text-white/50">{t('events.pageOf', { page, total: totalPages })}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn-outline-gold rounded-full p-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={t('events.newerEvents')}
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
