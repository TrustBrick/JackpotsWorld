import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogIn, UserPlus, X, Coins, Trophy, CalendarDays, MapPin, Users } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import PokerCard from '../components/poker/PokerCard'
import AuthModal from '../components/AuthModal'
import { fetchPokerEvents } from '../data/poker'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Poker page
 *
 * Same swap-friendly pattern as Events.jsx / Promotions.jsx:
 *   const data = await fetchPokerEvents()
 * Point `fetchPokerEvents()` at `GET /api/poker-events` later — no other
 * changes required.
 */
export default function Poker() {
  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState(null)
  const [authOpen, setAuthOpen]       = useState(false)
  const [authTab, setAuthTab]         = useState('login')

  const isLoggedIn = !!localStorage.getItem('access')

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchPokerEvents()
      .then(data => { if (active) setTournaments(data) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const openAuth = (tab) => { setAuthTab(tab); setAuthOpen(true) }

  const handleRegister = (tournament) => {
    if (!isLoggedIn) { openAuth('register'); return }
    // Placeholder — wire up to real tournament registration flow.
    console.log('Register clicked for tournament:', tournament.id)
  }

  const liveEvents     = tournaments.filter(t => t.status === 'live')
  const upcomingEvents = tournaments.filter(t => t.status !== 'live')

  return (
    <div className="min-h-screen" style={{ background: '#0A0005' }}>
      <Navbar />

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab={authTab}
        onAuthSuccess={() => setAuthOpen(false)}
      />

      <PageHeader
        eyebrow="High Stakes, Live Action"
        title="Poker"
        subtitle="Upcoming tournaments and live tables from our partner casinos — register your seat or watch the schedule fill in real time."
      />

      {!isLoggedIn && (
        <div className="max-w-3xl mx-auto px-4 -mt-6 mb-10">
          <div
            className="casino-card flex flex-col md:flex-row items-center justify-between gap-4 px-6 py-4"
          >
            <p className="text-white/60 text-sm font-body text-center md:text-left">
              Sign in to register for tournaments and track your seated events.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => openAuth('login')}
                className="btn-outline-gold flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase"
              >
                <LogIn size={13} /> Login
              </button>
              <button
                onClick={() => openAuth('register')}
                className="btn-gold flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase"
              >
                <UserPlus size={13} /> Register
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="max-w-7xl mx-auto px-4 pb-24">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="casino-card h-[280px] animate-pulse" style={{ opacity: 0.5 }} />
            ))}
          </div>
        ) : (
          <>
            {liveEvents.length > 0 && (
              <div className="mb-12">
                <h2 className="gold-text font-black text-xl md:text-2xl mb-5 tracking-wide">
                  Live Now
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {liveEvents.map(t => (
                    <PokerCard key={t.id} tournament={t} onRegister={handleRegister} onViewDetails={setSelected} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="gold-text font-black text-xl md:text-2xl mb-5 tracking-wide">
                Upcoming Tournaments
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingEvents.map(t => (
                  <PokerCard key={t.id} tournament={t} onRegister={handleRegister} onViewDetails={setSelected} />
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Details modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            style={{ background: 'rgba(10,0,5,0.85)' }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="casino-card max-w-md w-full p-6 relative"
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute top-4 right-4 text-white/50 hover:text-gold transition-colors"
              >
                <X size={18} />
              </button>

              <p className="text-gold/70 text-xs tracking-widest uppercase font-body mb-1">
                {selected.casino}
              </p>
              <h3
                className="gold-text font-black text-2xl mb-4"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {selected.title}
              </h3>

              <div className="flex flex-col gap-2 text-sm font-body text-white/65 mb-5">
                <span className="flex items-center gap-2"><Coins size={14} className="text-gold" /> Buy-in: {selected.buyIn}</span>
                <span className="flex items-center gap-2"><Trophy size={14} className="text-gold" /> {selected.prizePool}</span>
                <span className="flex items-center gap-2"><CalendarDays size={14} className="text-gold" /> {formatDate(selected.date)}</span>
                <span className="flex items-center gap-2"><MapPin size={14} className="text-gold" /> {selected.venue}</span>
                <span className="flex items-center gap-2"><Users size={14} className="text-gold" /> {selected.seatsAvailable} seats available</span>
              </div>

              <button
                onClick={() => handleRegister(selected)}
                className="btn-gold w-full rounded-full py-2.5 text-sm font-bold tracking-widest uppercase"
              >
                Register
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
