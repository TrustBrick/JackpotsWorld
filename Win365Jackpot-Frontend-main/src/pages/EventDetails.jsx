import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MapPin, Building2, CalendarDays, Clock, Tag, ArrowLeft,
  LogIn, UserPlus, ImageOff, AlertTriangle, RefreshCw,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import AuthModal from '../components/AuthModal'
import { fetchEventDetail, requestEventTicket } from '../services/eventService'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}
function formatTime(hms) {
  if (!hms) return ''
  const [h, m] = hms.split(':')
  const d = new Date()
  d.setHours(Number(h), Number(m))
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function EventDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [ticketState, setTicketState] = useState({ loading: false, message: '' })

  const isLoggedIn = !!localStorage.getItem('access')

  const load = () => {
    setLoading(true)
    setError(false)
    fetchEventDetail(id)
      .then(setEvent)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  const handleGetTicket = async () => {
    if (!isLoggedIn) { setAuthOpen(true); return }
    setTicketState({ loading: true, message: '' })
    const { ok, message } = await requestEventTicket(id)
    setTicketState({ loading: false, message })
    if (ok) setTimeout(() => setTicketState(s => ({ ...s, message: '' })), 4000)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} defaultTab="login" onAuthSuccess={() => setAuthOpen(false)} />

      <section className="max-w-3xl mx-auto px-4 pt-28 pb-24">
        <button
          onClick={() => navigate('/events')}
          className="flex items-center gap-1.5 text-sm font-body text-white/50 hover:text-gold transition-colors mb-6"
        >
          <ArrowLeft size={15} /> Back to Events
        </button>

        {loading ? (
          <div className="casino-card h-[480px] animate-pulse" style={{ opacity: 0.5 }} />
        ) : error || !event ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-white/40">
            <AlertTriangle size={40} className="mb-4 text-red-400/60" />
            <p className="font-body mb-4">Couldn't load this event.</p>
            <button onClick={load} className="btn-outline-gold rounded-full px-5 py-2 text-sm font-bold flex items-center gap-2">
              <RefreshCw size={14} /> Retry
            </button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="casino-card overflow-hidden">
            <div className="relative h-56 md:h-72 overflow-hidden">
              {event.image ? (
                <img src={event.image} alt={event.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--w365-card), var(--w365-bg-mid))' }}>
                  <ImageOff size={32} className="text-gold/30" />
                </div>
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(10,0,5,0.9) 100%)' }} />
              {event.category && (
                <span className="absolute top-4 left-4 px-3 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase"
                  style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.5)', color: '#D4AF37' }}>
                  <Tag size={10} className="inline mr-1 -mt-0.5" /> {event.category}
                </span>
              )}
            </div>

            <div className="p-6 md:p-8">
              <h1 className="font-black text-2xl md:text-3xl text-white/90 mb-4">{event.name}</h1>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm font-body text-white/60 mb-6">
                <div className="flex items-center gap-2"><MapPin size={15} className="text-gold shrink-0" /> {event.city ? `${event.city}, ` : ''}{event.country}</div>
                <div className="flex items-center gap-2"><CalendarDays size={15} className="text-gold shrink-0" /> {formatDate(event.event_date)}</div>
                {event.event_time && <div className="flex items-center gap-2"><Clock size={15} className="text-gold shrink-0" /> {formatTime(event.event_time)}</div>}
                {event.venue && <div className="flex items-center gap-2"><Building2 size={15} className="text-gold shrink-0" /> {event.venue}</div>}
              </div>

              {event.description && (
                <p className="text-white/55 text-sm font-body leading-relaxed mb-6">{event.description}</p>
              )}
              {event.ticket_note && (
                <p className="text-gold/70 text-xs font-body mb-6">{event.ticket_note}</p>
              )}

              {!isLoggedIn ? (
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-5 py-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)' }}>
                  <p className="text-white/60 text-sm font-body text-center md:text-left">Sign in to get your ticket for this event.</p>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setAuthOpen(true)} className="btn-outline-gold flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase">
                      <LogIn size={13} /> Sign In
                    </button>
                    <button onClick={() => setAuthOpen(true)} className="btn-gold flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase">
                      <UserPlus size={13} /> Sign Up
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleGetTicket}
                  disabled={ticketState.loading}
                  className="btn-gold w-full rounded-full py-3 text-sm font-bold tracking-widest uppercase disabled:opacity-60"
                >
                  {ticketState.loading ? 'Processing…' : 'Get Ticket'}
                </button>
              )}
              {ticketState.message && (
                <p className="text-center text-sm font-body text-gold mt-3">{ticketState.message}</p>
              )}
            </div>
          </motion.div>
        )}
      </section>
    </div>
  )
}
