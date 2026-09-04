import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Building2, CalendarDays, Clock, MapPin, Coins, Trophy, Users,
  AlertTriangle, RefreshCw, CheckCircle2, Ticket, ImageOff, Tag,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import Navbar from '../components/Navbar'
import PageScrollButtons from '../components/PageScrollButtons'
import AuthModal from '../components/AuthModal'
import RegistrationResultModal from '../components/teenpatti/RegistrationResultModal'
import {
  fetchTeenPattiDetail, registerForTeenPattiEvent, cancelTeenPattiRegistration,
} from '../services/teenPattiService'
import { getToken } from '../services/authStorage'
import { getFallbackImage, fixMojibakeCurrency } from '../utils/mediaFallback'
import Seo from '../components/Seo'
import { eventSchema, breadcrumbSchema } from '../utils/seoSchemas'
import { toMetaDescription, TITLE_SUFFIX } from '../config/seo'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatTime(hms) {
  if (!hms) return null
  const [h, m] = hms.split(':')
  const d = new Date()
  d.setHours(Number(h), Number(m))
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtMoney(amount, currency = 'USD') {
  const num = Number(amount || 0)
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(num)
  } catch {
    return `${currency} ${num.toLocaleString('en-US')}`
  }
}

const STATUS_STYLE = {
  live: { color: '#ff3366', label: 'Live Now' },
  upcoming: { color: '#D4AF37', label: 'Upcoming' },
  published: { color: '#D4AF37', label: 'Upcoming' },
  completed: { color: 'rgba(255,255,255,0.4)', label: 'Completed' },
}

function Fact({ icon: Icon, label, value }) {
  const { t } = useTranslation()
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <p className="text-[10px] uppercase tracking-widest text-white/55 font-body mb-1.5">{label}</p>
      <p className="text-sm font-bold text-white/85 flex items-center gap-2">
        <Icon size={14} className="text-gold shrink-0" />
        {/* Part 6's rule, applied to Teen Patti too: never invent a value. */}
        <span className={value ? '' : 'text-white/55 font-normal'}>{value || t('teenPatti.notAvailable')}</span>
      </p>
    </div>
  )
}

export default function TeenPattiDetails() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { theme } = useTheme()

  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [imgFailed, setImgFailed] = useState(false)
  const isLoggedIn = !!getToken('access')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchTeenPattiDetail(id)
      .then(setEvent)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  const handleRegister = async () => {
    if (!isLoggedIn) { setAuthOpen(true); return }
    setBusy(true)
    const res = await registerForTeenPattiEvent(id)
    setBusy(false)
    setResult(res)
    load()
  }

  const handleCancel = async () => {
    setBusy(true)
    const res = await cancelTeenPattiRegistration(id)
    setBusy(false)
    setResult({ ...res, message: res.ok ? 'Your seat has been released.' : res.message })
    load()
  }

  const status = event ? (STATUS_STYLE[event.status] || STATUS_STYLE.upcoming) : null
  const venue = event ? (event.casino_name || event.venue) : ''
  const place = event ? [event.city, event.country].filter(Boolean).join(', ') : ''
  const imgSrc = event
    ? (event.banner || event.image || getFallbackImage({ id: event.id, country: event.country }))
    : ''

  return (
    <div key={theme} className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />

      {event && (
        <Seo
          title={`${event.name}${TITLE_SUFFIX}`}
          description={toMetaDescription(
            event.description || event.short_description ||
            `${event.name} at ${venue || ''}${place ? `, ${place}` : ''}.`
          )}
          path={`/teen-patti/${event.id}`}
          image={event.image || event.banner}
          type="article"
          jsonLd={[
            // eventSchema reads event_date/event_time (the CasinoEvent column
            // names); Teen Patti calls the same two columns start_date/
            // start_time, so they're mapped here rather than branching the
            // shared builder.
            eventSchema(
              { ...event, event_date: event.start_date, event_time: event.start_time },
              '/teen-patti',
            ),
            breadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: 'Teen Patti', path: '/teen-patti' },
              { name: event.name, path: `/teen-patti/${event.id}` },
            ]),
          ]}
        />
      )}

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab="login"
        onAuthSuccess={() => { setAuthOpen(false); load() }}
      />
      <RegistrationResultModal result={result} onClose={() => setResult(null)} />

      <main className="pt-28 pb-24 px-4">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate('/teen-patti')}
            className="flex items-center gap-2 text-white/64 hover:text-gold transition-colors text-xs font-bold tracking-widest uppercase mb-6"
          >
            <ArrowLeft size={14} /> Back to Teen Patti
          </button>

          {loading ? (
            <div className="poker-card h-[520px] animate-pulse" style={{ opacity: 0.5 }} />
          ) : error || !event ? (
            <div className="flex flex-col items-center justify-center py-24 text-white/60">
              <AlertTriangle size={40} className="mb-4 text-red-400/60" />
              <p className="font-body mb-4">Couldn't load this event.</p>
              <button
                onClick={load}
                className="btn-outline-gold rounded-full px-5 py-2 text-sm font-bold flex items-center gap-2"
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
              <div className="poker-card overflow-hidden">
                <div className="relative h-56 md:h-72 overflow-hidden">
                  {!imgFailed ? (
                    <img
                      src={imgSrc}
                      alt={event.name}
                      className="w-full h-full object-cover"
                      onError={() => setImgFailed(true)}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(160deg, rgba(28,28,30,0.9), rgba(18,18,20,0.9))' }}
                    >
                      <ImageOff size={30} className="text-gold/30" />
                    </div>
                  )}
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(180deg, transparent 30%, rgba(10,10,12,0.95) 100%)' }}
                  />
                  <span
                    className="absolute top-4 left-4 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5"
                    style={{
                      background: `${status.color}18`,
                      border: `1px solid ${status.color}55`,
                      color: status.color,
                    }}
                  >
                    {event.status === 'live' && (
                      <span
                        className="w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ background: status.color, boxShadow: `0 0 6px ${status.color}` }}
                      />
                    )}
                    {status.label}
                  </span>
                </div>

                <div className="p-6 md:p-8">
                  <h1 className="font-black text-2xl md:text-3xl text-[rgba(var(--w365-text-rgb),0.92)] mb-2">
                    {fixMojibakeCurrency(event.name)}
                  </h1>
                  {event.short_description && (
                    <p className="text-white/74 font-body text-sm mb-6">{event.short_description}</p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                    <Fact icon={MapPin} label={t('teenPatti.location')} value={place} />
                    <Fact icon={Building2} label={t('teenPatti.venue')} value={venue} />
                    <Fact icon={Tag} label={t('teenPatti.eventType')} value={event.event_type} />
                    <Fact icon={CalendarDays} label={t('teenPatti.startDate')} value={formatDate(event.start_date)} />
                    <Fact
                      icon={CalendarDays}
                      label={t('teenPatti.endDate')}
                      value={event.end_date ? formatDate(event.end_date) : ''}
                    />
                    <Fact
                      icon={Clock}
                      label="Time"
                      value={
                        event.start_time
                          ? `${formatTime(event.start_time)}${event.end_time ? ` – ${formatTime(event.end_time)}` : ''}`
                          : ''
                      }
                    />
                    <Fact icon={Coins} label={t('teenPatti.entryFee')} value={fmtMoney(event.entry_fee, event.currency)} />
                    <Fact icon={Trophy} label={t('teenPatti.prizePool')} value={fmtMoney(event.prize_pool, event.currency)} />
                    <Fact
                      icon={Users}
                      label={t('teenPatti.seats')}
                      value={
                        event.max_participants != null
                          ? `${event.current_participants} / ${event.max_participants} filled`
                          : `${event.current_participants} registered`
                      }
                    />
                  </div>

                  {event.description && (
                    <div className="mb-7">
                      <h2 className="text-xs uppercase tracking-widest text-gold/70 font-body mb-2">{t('teenPatti.about')}</h2>
                      <p className="text-white/78 font-body text-sm leading-relaxed whitespace-pre-line">
                        {event.description}
                      </p>
                    </div>
                  )}

                  {event.is_registered ? (
                    <div
                      className="rounded-xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4"
                      style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.35)' }}
                    >
                      <div className="text-center sm:text-left">
                        <p className="flex items-center justify-center sm:justify-start gap-2 text-sm font-bold" style={{ color: '#34D399' }}>
                          <CheckCircle2 size={16} /> You're registered
                        </p>
                        {event.my_confirmation_id && (
                          <p
                            className="text-xs text-white/74 font-body mt-1 flex items-center justify-center sm:justify-start gap-1.5"
                            style={{ fontFamily: "'Courier New', monospace" }}
                          >
                            <Ticket size={12} /> {event.my_confirmation_id}
                          </p>
                        )}
                      </div>
                      {event.status !== 'live' && event.status !== 'completed' && (
                        <button
                          onClick={handleCancel}
                          disabled={busy}
                          className="btn-outline-gold rounded-full px-6 py-2.5 text-xs font-bold tracking-widest uppercase disabled:opacity-40"
                        >
                          {busy ? t('common.loading') : t('teenPatti.cancelRegistration')}
                        </button>
                      )}
                    </div>
                  ) : event.status === 'completed' ? (
                    <p className="text-center text-white/55 font-body text-sm py-3">This event has finished.</p>
                  ) : (
                    <button
                      onClick={handleRegister}
                      disabled={!event.can_register || busy}
                      className="btn-gold w-full rounded-full py-3.5 text-xs font-bold tracking-widest uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                      style={!event.can_register ? { animation: 'none', filter: 'grayscale(0.7)' } : undefined}
                    >
                      {event.is_full
                        ? t('teenPatti.eventFull')
                        : !event.registration_open
                          ? t('teenPatti.registrationClosed')
                          : busy
                            ? t('teenPatti.registering')
                            : t('teenPatti.registerNow')}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      <PageScrollButtons />
    </div>
  )
}
