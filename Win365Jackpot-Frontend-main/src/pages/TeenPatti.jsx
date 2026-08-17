import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, Spade, Radio, CalendarRange } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import Navbar from '../components/Navbar'
import PageScrollButtons from '../components/PageScrollButtons'
import AuthModal from '../components/AuthModal'
import TeenPattiHero from '../components/teenpatti/TeenPattiHero'
import TeenPattiAcquisitionCTA from '../components/teenpatti/TeenPattiAcquisitionCTA'
import TeenPattiCard from '../components/teenpatti/TeenPattiCard'
import TeenPattiFilters from '../components/teenpatti/TeenPattiFilters'
import RegistrationResultModal from '../components/teenpatti/RegistrationResultModal'
import {
  fetchTeenPattiEvents, fetchTeenPattiFilters, registerForTeenPattiEvent,
} from '../services/teenPattiService'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { getToken } from '../services/authStorage'

// "published" is an admin-set state that hasn't been date-promoted yet; to a
// visitor it belongs with Upcoming.
const UPCOMING_STATUSES = new Set(['upcoming', 'published'])

function SectionHeading({ icon: Icon, title, count, accent }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <Icon size={18} style={{ color: accent }} />
      <h2 className="font-black text-xl tracking-wide" style={{ color: accent }}>{title}</h2>
      <span
        className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
        style={{ background: `${accent}15`, border: `1px solid ${accent}44`, color: accent }}
      >
        {count}
      </span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${accent}44, transparent)` }} />
    </div>
  )
}

export default function TeenPatti() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [filters, setFilters] = useState({ status: '' })
  const [options, setOptions] = useState({ countries: [], cities: [], casinos: [], counts: {} })
  const [authOpen, setAuthOpen] = useState(false)
  const [registeringId, setRegisteringId] = useState(null)
  const [result, setResult] = useState(null)
  const isLoggedIn = !!getToken('access')

  const liveRef = useRef(null)
  const upcomingRef = useRef(null)

  // Passed straight through — the API understands every one of these,
  // including status="upcoming" (which it expands to published + upcoming).
  // The client still buckets the results so the "All" view keeps its
  // Live / Upcoming / Completed sections.
  const queryParams = useMemo(() => ({ ...filters }), [filters])

  const { data, loading, error, reload } = useAutoFetch(
    fetchTeenPattiEvents, queryParams, { intervalMs: 60_000 },
  )

  useEffect(() => {
    let cancelled = false
    fetchTeenPattiFilters()
      .then(res => { if (!cancelled) setOptions(res) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const events = useMemo(() => data?.results || [], [data])

  const { live, upcoming, completed } = useMemo(() => {
    const buckets = { live: [], upcoming: [], completed: [] }
    events.forEach(ev => {
      if (ev.status === 'live') buckets.live.push(ev)
      else if (UPCOMING_STATUSES.has(ev.status)) buckets.upcoming.push(ev)
      else if (ev.status === 'completed') buckets.completed.push(ev)
    })
    // Nearest first for anything still ahead of us.
    const byDate = (a, b) => String(a.start_date).localeCompare(String(b.start_date))
    buckets.live.sort(byDate)
    buckets.upcoming.sort(byDate)
    buckets.completed.sort((a, b) => byDate(b, a))
    return buckets
  }, [events])

  const visible = useMemo(() => {
    if (filters.status === 'live') return { live, upcoming: [], completed: [] }
    if (filters.status === 'upcoming') return { live: [], upcoming, completed: [] }
    if (filters.status === 'completed') return { live: [], upcoming: [], completed }
    return { live, upcoming, completed }
  }, [filters.status, live, upcoming, completed])

  const handleRegister = useCallback(async (event) => {
    if (!isLoggedIn) { setAuthOpen(true); return }
    setRegisteringId(event.id)
    const res = await registerForTeenPattiEvent(event.id)
    setRegisteringId(null)
    setResult(res)
    // Refresh either way: on success the seat count moved, and on failure the
    // local view may simply have been stale (e.g. it filled a second ago).
    reload()
  }, [isLoggedIn, reload])

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const totalVisible = visible.live.length + visible.upcoming.length + visible.completed.length

  return (
    <div key={theme} className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab="login"
        onAuthSuccess={() => { setAuthOpen(false); reload() }}
      />

      <RegistrationResultModal result={result} onClose={() => setResult(null)} />

      <main>
        <TeenPattiHero
          liveCount={options.counts?.live || 0}
          upcomingCount={options.counts?.upcoming || 0}
          onViewLive={() => { setFilters(f => ({ ...f, status: 'live' })); scrollTo(liveRef) }}
          onViewUpcoming={() => { setFilters(f => ({ ...f, status: 'upcoming' })); scrollTo(upcomingRef) }}
        />

        <section className="max-w-7xl mx-auto px-4 pb-24">
          <TeenPattiAcquisitionCTA
            isLoggedIn={isLoggedIn}
            liveCount={options.counts?.live || 0}
            upcomingCount={options.counts?.upcoming || 0}
            onPrimaryAction={() => setAuthOpen(true)}
            onScrollToTables={() => {
              const targetRef = (options.counts?.live || 0) > 0 ? liveRef : upcomingRef
              scrollTo(targetRef)
            }}
          />

          <TeenPattiFilters
            options={options}
            value={filters}
            onChange={setFilters}
            resultCount={loading ? null : totalVisible}
          />

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="poker-card h-[420px] animate-pulse" style={{ opacity: 0.5 }} />
              ))}
            </div>
          ) : error ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 text-white/40"
            >
              <AlertTriangle size={40} className="mb-4 text-red-400/60" />
              <p className="font-body mb-4">{t('teenPatti.loadError')}</p>
              <button
                onClick={reload}
                className="btn-outline-gold rounded-full px-5 py-2 text-sm font-bold flex items-center gap-2"
              >
                <RefreshCw size={14} /> Retry
              </button>
            </motion.div>
          ) : totalVisible === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 text-white/40"
            >
              <Spade size={40} className="mb-4 text-gold/50" />
              <p className="font-body">{t('teenPatti.noEvents')}</p>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-14">
              <div ref={liveRef}>
                {visible.live.length > 0 && (
                  <>
                    <SectionHeading icon={Radio} title={t('teenPatti.liveNow')} count={visible.live.length} accent="#ff3366" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {visible.live.map(ev => (
                        <TeenPattiCard
                          key={ev.id}
                          event={ev}
                          onRegister={handleRegister}
                          registering={registeringId === ev.id}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div ref={upcomingRef}>
                {visible.upcoming.length > 0 && (
                  <>
                    <SectionHeading
                      icon={CalendarRange}
                      title={t('teenPatti.upcomingEvents')}
                      count={visible.upcoming.length}
                      accent="#D4AF37"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {visible.upcoming.map(ev => (
                        <TeenPattiCard
                          key={ev.id}
                          event={ev}
                          onRegister={handleRegister}
                          registering={registeringId === ev.id}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {visible.completed.length > 0 && (
                <div>
                  <SectionHeading
                    icon={Spade}
                    title={t('filters.completed')}
                    count={visible.completed.length}
                    accent="rgba(255,255,255,0.45)"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visible.completed.map(ev => (
                      <TeenPattiCard key={ev.id} event={ev} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <PageScrollButtons />
    </div>
  )
}
