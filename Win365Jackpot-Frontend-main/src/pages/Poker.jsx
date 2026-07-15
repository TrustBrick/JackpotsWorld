import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { LogIn, UserPlus, AlertTriangle, RefreshCw, Spade } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import PageScrollButtons from '../components/PageScrollButtons'
import PokerCard from '../components/poker/PokerCard'
import AuthModal from '../components/AuthModal'
import { fetchPokerTournaments } from '../services/pokerService'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { getToken } from '../services/authStorage'

const EMPTY_PARAMS = {}
const STATUS_ORDER = { live: 0, upcoming: 1, completed: 2 }

export default function Poker() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [authOpen, setAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState('login')
  const isLoggedIn = !!getToken('access')

  const { data, loading, error, reload } = useAutoFetch(fetchPokerTournaments, EMPTY_PARAMS, { intervalMs: 60_000 })
  const tournaments = useMemo(() => {
    const list = data?.results || []
    return [...list].sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99))
  }, [data])

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
        ) : tournaments.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-white/40">
            <Spade size={40} className="mb-4 text-gold/50" />
            <p className="font-body">{t('poker.noTournaments')}</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map(t => (
              <PokerCard key={t.id} tournament={t} />
            ))}
          </div>
        )}
      </section>
      </main>

      <PageScrollButtons />
    </div>
  )
}
