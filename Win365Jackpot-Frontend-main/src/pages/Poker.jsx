import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { LogIn, UserPlus, AlertTriangle, RefreshCw, Spade, Radio, CalendarRange } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import PageScrollButtons from '../components/PageScrollButtons'
import PokerCard from '../components/poker/PokerCard'
import PokerFilters from '../components/poker/PokerFilters'
import AuthModal from '../components/AuthModal'
import { fetchPokerTournaments, fetchPokerFilters } from '../services/pokerService'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { getToken } from '../services/authStorage'

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

export default function Poker() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [authOpen, setAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState('login')
  const [filters, setFilters] = useState({ status: '' })
  const [options, setOptions] = useState({ countries: [], cities: [], series: [], game_types: [], counts: {} })
  const isLoggedIn = !!getToken('access')

  const { data, loading, error, reload } = useAutoFetch(fetchPokerTournaments, filters, { intervalMs: 60_000 })

  useEffect(() => {
    let cancelled = false
    fetchPokerFilters()
      .then(res => { if (!cancelled) setOptions(res) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const tournaments = useMemo(() => data?.results || [], [data])

  // Live first, then upcoming by nearest date (Part 11), then completed
  // most-recent-first.
  const { live, upcoming, completed } = useMemo(() => {
    const buckets = { live: [], upcoming: [], completed: [] }
    tournaments.forEach(item => {
      if (buckets[item.status]) buckets[item.status].push(item)
    })
    const byDate = (a, b) => String(a.event_date).localeCompare(String(b.event_date))
    buckets.live.sort(byDate)
    buckets.upcoming.sort(byDate)
    buckets.completed.sort((a, b) => byDate(b, a))
    return buckets
  }, [tournaments])

  const total = live.length + upcoming.length + completed.length
  const openAuth = (tab) => { setAuthTab(tab); setAuthOpen(true) }

  return (
    <div key={theme} className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab={authTab}
        onAuthSuccess={() => setAuthOpen(false)}
      />

      <main>
      <PageHeader
        eyebrow={t('poker.eyebrow')}
        title={t('poker.title')}
        subtitle={t('poker.subtitle')}
      />

      {!isLoggedIn && (
        <div className="max-w-3xl mx-auto px-4 -mt-6 mb-10">
          <div className="casino-card flex flex-col md:flex-row items-center justify-between gap-4 px-6 py-4">
            <p className="text-white/60 text-sm font-body text-center md:text-left">
              {t('poker.signInPrompt')}
            </p>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => openAuth('login')} className="btn-outline-gold flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase">
                <LogIn size={13} /> {t('common.signIn')}
              </button>
              <button onClick={() => openAuth('register')} className="btn-gold flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase">
                <UserPlus size={13} /> {t('common.signUp')}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="max-w-7xl mx-auto px-4 pb-24">
        <PokerFilters
          options={options}
          value={filters}
          onChange={setFilters}
          resultCount={loading ? null : total}
        />

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="poker-card h-[320px] animate-pulse" style={{ opacity: 0.5 }} />
            ))}
          </div>
        ) : error ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-white/40">
            <AlertTriangle size={40} className="mb-4 text-red-400/60" />
            <p className="font-body mb-4">{t('poker.loadError')}</p>
            <button onClick={reload} className="btn-outline-gold rounded-full px-5 py-2 text-sm font-bold flex items-center gap-2">
              <RefreshCw size={14} /> {t('common.retry')}
            </button>
          </motion.div>
        ) : total === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-white/40">
            <Spade size={40} className="mb-4 text-gold/50" />
            <p className="font-body">{t('poker.noTournaments')}</p>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-14">
            {live.length > 0 && (
              <div>
                <SectionHeading icon={Radio} title={t('common.statusLive')} count={live.length} accent="#ff3366" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {live.map(item => <PokerCard key={item.id} tournament={item} />)}
                </div>
              </div>
            )}

            {upcoming.length > 0 && (
              <div>
                <SectionHeading
                  icon={CalendarRange}
                  title={t('common.statusUpcoming')}
                  count={upcoming.length}
                  accent="#D4AF37"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {upcoming.map(item => <PokerCard key={item.id} tournament={item} />)}
                </div>
              </div>
            )}

            {completed.length > 0 && (
              <div>
                <SectionHeading
                  icon={Spade}
                  title={t('common.statusCompleted')}
                  count={completed.length}
                  accent="rgba(255,255,255,0.45)"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {completed.map(item => <PokerCard key={item.id} tournament={item} />)}
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
