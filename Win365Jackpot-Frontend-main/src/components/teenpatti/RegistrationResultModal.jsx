import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, X, Ticket, CalendarDays, MapPin } from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * RegistrationResultModal — the Part 20 step 9 confirmation. Shows the
 * server-issued confirmation ID on success, or the server's own refusal
 * message on failure (never a locally invented one, so the user always sees
 * the real reason the seat wasn't granted).
 */
export default function RegistrationResultModal({ result, onClose }) {
  const ok = result?.ok
  const registration = result?.registration

  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{ background: 'rgba(4,4,6,0.82)', backdropFilter: 'blur(6px)' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={ok ? 'Registration confirmed' : 'Registration failed'}
            className="poker-card w-full max-w-md p-7 relative"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 text-white/55 hover:text-white/80 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex flex-col items-center text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{
                  background: ok ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                  border: `1px solid ${ok ? 'rgba(52,211,153,0.45)' : 'rgba(248,113,113,0.45)'}`,
                }}
              >
                {ok
                  ? <CheckCircle2 size={30} style={{ color: '#34D399' }} />
                  : <AlertTriangle size={28} style={{ color: '#F87171' }} />}
              </div>

              <h3 className="font-black text-xl text-[rgba(var(--w365-text-rgb),0.92)] mb-2">
                {ok ? 'Seat Confirmed' : 'Registration Not Completed'}
              </h3>
              <p className="text-white/74 text-sm font-body mb-5">{result.message}</p>

              {ok && registration && (
                <div
                  className="w-full rounded-xl px-4 py-4 mb-5 text-left"
                  style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.28)' }}
                >
                  <p className="text-[10px] uppercase tracking-widest text-white/60 font-body mb-1">
                    Confirmation ID
                  </p>
                  <p
                    className="text-lg font-black text-gold mb-3 flex items-center gap-2"
                    style={{ fontFamily: "'Courier New', monospace", letterSpacing: '0.06em' }}
                  >
                    <Ticket size={16} /> {registration.confirmation_id}
                  </p>

                  <p className="text-sm font-bold text-white/85 mb-1.5">{registration.event_name}</p>
                  <p className="text-xs text-white/70 font-body flex items-center gap-1.5 mb-1">
                    <CalendarDays size={12} className="text-gold" />
                    {formatDate(registration.event_start_date)}
                  </p>
                  {(registration.event_city || registration.event_country) && (
                    <p className="text-xs text-white/70 font-body flex items-center gap-1.5">
                      <MapPin size={12} className="text-gold" />
                      {[registration.event_city, registration.event_country].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={onClose}
                className="btn-gold w-full rounded-full py-3 text-xs font-bold tracking-widest uppercase"
              >
                {ok ? 'Done' : 'Close'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
