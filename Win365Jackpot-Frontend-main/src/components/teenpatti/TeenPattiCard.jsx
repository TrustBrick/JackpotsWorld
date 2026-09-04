import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Building2, CalendarDays, Clock, MapPin, Coins, Trophy,
  Users, ArrowRight, ImageOff, CheckCircle2, Star,
} from 'lucide-react'
import { getFallbackImage, fixMojibakeCurrency } from '../../utils/mediaFallback'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(hms) {
  if (!hms) return ''
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
    // Unknown/blank currency code from the Back Office — fall back rather
    // than letting Intl throw and blank the whole card.
    return `${currency} ${num.toLocaleString('en-US')}`
  }
}

// "published" is the pre-schedule state an admin sets on save; to a visitor it
// reads as upcoming, so both share the gold treatment.
const STATUS_STYLE = {
  live:      { color: '#ff3366', labelKey: 'teenPatti.liveNow' },
  upcoming:  { color: '#D4AF37', labelKey: 'filters.upcoming' },
  published: { color: '#D4AF37', labelKey: 'filters.upcoming' },
  completed: { color: 'rgba(255,255,255,0.4)', labelKey: 'filters.completed' },
}

/**
 * TeenPattiCard — consumes TeenPattiEventPublicSerializer from
 * GET /api/teen-patti/. Reuses the .poker-card surface so the Teen Patti grid
 * sits in the same visual language as the rest of the site rather than
 * introducing a second card style.
 */
function TeenPattiCard({ event, onRegister, registering }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [imgFailed, setImgFailed] = useState(false)

  const status = STATUS_STYLE[event.status] || STATUS_STYLE.upcoming
  const imgSrc = event.image || event.banner || getFallbackImage({ id: event.id, country: event.country })
  const venue = event.casino_name || event.venue
  const place = [event.city, event.country].filter(Boolean).join(', ')

  const hasSeatLimit = event.max_participants != null
  const filledPct = hasSeatLimit && event.max_participants > 0
    ? Math.min(100, Math.round((event.current_participants / event.max_participants) * 100))
    : 0

  const isCompleted = event.status === 'completed'
  const showRegister = !isCompleted && !event.is_registered

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="poker-card flex flex-col overflow-hidden h-full"
    >
      <div className="relative h-40 overflow-hidden rounded-t-[20px]">
        {!imgFailed ? (
          <img
            src={imgSrc}
            alt={event.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(160deg, rgba(28,28,30,0.9), rgba(18,18,20,0.9))' }}
          >
            <ImageOff size={24} className="text-gold/30" />
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(10,10,12,0.92) 100%)' }}
        />

        <span
          className="absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5"
          style={{ background: `${status.color}18`, border: `1px solid ${status.color}55`, color: status.color }}
        >
          {event.status === 'live' && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: status.color, boxShadow: `0 0 6px ${status.color}` }}
            />
          )}
          {t(status.labelKey)}
        </span>

        {event.is_featured && (
          <span
            className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center gap-1"
            style={{ background: 'rgba(212,175,55,0.16)', border: '1px solid rgba(212,175,55,0.5)', color: '#D4AF37' }}
          >
            <Star size={10} fill="#D4AF37" /> {t('teenPatti.featured')}
          </span>
        )}

        {event.event_type && (
          <span className="absolute bottom-3 left-3 text-[10px] font-body tracking-wider uppercase text-white/78">
            {event.event_type}
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 p-5 gap-3">
        <h3 className="font-black text-lg text-[rgba(var(--w365-text-rgb),0.90)] leading-snug">
          {fixMojibakeCurrency(event.name)}
        </h3>

        {place && (
          <p className="text-[rgba(var(--w365-text-rgb),0.55)] text-xs font-body flex items-center gap-1.5">
            <MapPin size={13} className="text-gold shrink-0" /> {place}
          </p>
        )}
        {venue && (
          <p className="text-[rgba(var(--w365-text-rgb),0.55)] text-xs font-body flex items-center gap-1.5 -mt-1.5">
            <Building2 size={13} className="text-gold shrink-0" /> {venue}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs font-body text-[rgba(var(--w365-text-rgb),0.60)]">
          <div className="flex items-center gap-1.5">
            <CalendarDays size={13} className="text-gold shrink-0" /> {formatDate(event.start_date)}
          </div>
          {event.start_time && (
            <div className="flex items-center gap-1.5">
              <Clock size={13} className="text-gold shrink-0" />
              {formatTime(event.start_time)}
              {event.end_time ? ` – ${formatTime(event.end_time)}` : ''}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-1">
          <div
            className="rounded-xl px-3 py-2"
            style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)' }}
          >
            <p className="text-[9px] uppercase tracking-widest text-white/60 font-body mb-0.5">{t('teenPatti.entry')}</p>
            <p className="text-sm font-black text-gold flex items-center gap-1">
              <Coins size={12} /> {fmtMoney(event.entry_fee, event.currency)}
            </p>
          </div>
          <div
            className="rounded-xl px-3 py-2"
            style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)' }}
          >
            <p className="text-[9px] uppercase tracking-widest text-white/60 font-body mb-0.5">{t('teenPatti.prizePool')}</p>
            <p className="text-sm font-black text-gold flex items-center gap-1">
              <Trophy size={12} /> {fmtMoney(event.prize_pool, event.currency)}
            </p>
          </div>
        </div>

        {hasSeatLimit && (
          <div className="mt-1">
            <div className="flex items-center justify-between text-[11px] font-body mb-1.5">
              <span className="text-white/70 flex items-center gap-1.5">
                <Users size={12} className="text-gold" />
                {t('teenPatti.seatsFilled', { filled: event.current_participants, total: event.max_participants })}
              </span>
              <span style={{ color: event.is_full ? '#ff3366' : '#D4AF37' }} className="font-bold">
                {event.is_full ? t('teenPatti.full') : t('teenPatti.seatsLeft', { count: event.seats_remaining })}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${filledPct}%`,
                  background: event.is_full
                    ? 'linear-gradient(90deg, #b91c3c, #ff3366)'
                    : 'linear-gradient(90deg, #9A7D20, #D4AF37, #F5D060)',
                }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-auto pt-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(`/teen-patti/${event.id}`)}
            className="btn-outline-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
          >
            {t('teenPatti.details')}
          </motion.button>

          {event.is_registered ? (
            <span
              className="flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase"
              style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.45)', color: '#34D399' }}
            >
              <CheckCircle2 size={13} /> {t('teenPatti.registered')}
            </span>
          ) : showRegister ? (
            <motion.button
              whileHover={event.can_register ? { scale: 1.02 } : undefined}
              whileTap={event.can_register ? { scale: 0.97 } : undefined}
              disabled={!event.can_register || registering}
              onClick={() => onRegister?.(event)}
              className="btn-gold flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              style={!event.can_register ? { animation: 'none', filter: 'grayscale(0.7)' } : undefined}
            >
              {event.is_full ? t('teenPatti.eventFull') : registering ? t('teenPatti.registering') : t('teenPatti.registerNow')}
              {event.can_register && !registering && <ArrowRight size={13} />}
            </motion.button>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}

export default React.memo(TeenPattiCard)
