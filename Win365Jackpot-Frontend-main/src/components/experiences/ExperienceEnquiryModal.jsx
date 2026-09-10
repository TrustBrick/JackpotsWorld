import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Loader2, MessageCircle } from 'lucide-react'
import { sendExperienceEnquiry } from '../../services/experienceService'
import useEnquiryNumber from '../../hooks/useEnquiryNumber'
import useEnquiryMessage from '../../hooks/useEnquiryMessage'
import { buildWhatsAppLink } from '../../services/enquiryContact'

/**
 * "Enquire Now" for one experience card.
 *
 * WHY A FORM AND NOT JUST A WHATSAPP LINK. Every other enquiry button on this
 * site opens wa.me and records nothing, so a visitor who opens the composer
 * and never presses send is a lead nobody ever sees. This saves the details
 * FIRST, then hands off to WhatsApp exactly as before — the handoff is a
 * bonus, not the only copy of the enquiry.
 *
 * The WhatsApp half is entirely the existing machinery: useEnquiryMessage for
 * the Back-Office-editable text, useEnquiryNumber for the per-country number,
 * buildWhatsAppLink for the URL. Nothing about that flow is reimplemented
 * here.
 *
 * BOOK vs ENQUIRE. There is no booking anywhere in this component, and the
 * success copy promises a reply rather than a reservation, because none of
 * these services are actually bookable through this site.
 */

const FIELD_LABEL = {
  name: 'Your name',
  email: 'Email address',
  phone: 'Phone number',
  destination: 'Destination',
  travel_date: 'Travel date',
  party_size: 'Guests',
  requirements: 'Requirements',
  message: 'Anything else',
}

const EMPTY = {
  name: '', email: '', phone: '',
  destination: '', travel_date: '', party_size: '', requirements: '', message: '',
}

const INPUT_STYLE = {
  width: '100%', padding: '11px 13px', borderRadius: 10,
  background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(212,175,55,0.28)',
  color: 'var(--w365-text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}

/**
 * MODULE SCOPE ON PURPOSE. Defined inside the parent's render, this would be a
 * brand-new component type on every keystroke, so React would unmount and
 * remount each input as you typed and the field would lose focus after every
 * character.
 */
function EnquiryField({
  name, value, error, onChange, type = 'text', span = 1, textarea = false, inputRef, ...rest
}) {
  const id = `exp-${name}`
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label
        htmlFor={id}
        style={{ display: 'block', marginBottom: 6, fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--w365-text-muted)' }}
      >
        {FIELD_LABEL[name]}
      </label>
      {textarea ? (
        <textarea
          id={id} rows={3} value={value}
          onChange={e => onChange(name, e.target.value)}
          style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit' }}
          {...rest}
        />
      ) : (
        <input
          id={id} type={type} value={value} ref={inputRef}
          onChange={e => onChange(name, e.target.value)}
          style={INPUT_STYLE}
          {...rest}
        />
      )}
      {error && (
        <p role="alert" style={{ margin: '5px 0 0', fontSize: 11.5, color: '#f87171' }}>{error}</p>
      )}
    </div>
  )
}

export default function ExperienceEnquiryModal({ experience, isOpen, onClose }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState('')
  const [sent, setSent] = useState(null)
  const dialogRef = useRef(null)
  const firstFieldRef = useRef(null)

  const number = useEnquiryNumber()
  // Resolved at render time, not on click: the success screen shows a real
  // <a href> so it opens the native app on a phone, middle-clicks and
  // right-click-copies — building the URL inside an onClick is the pattern
  // that gets blocked as a popup.
  const waMessage = useEnquiryMessage(
    experience?.enquiry_key || '',
    { experience: experience?.title || '', package: experience?.title || '' },
  )

  // A fresh form each time the modal opens for a different card, so yesterday's
  // half-typed enquiry never appears under today's heading.
  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY); setErrors({}); setBanner(''); setSent(null); setBusy(false)
    }
  }, [isOpen, experience?.id])

  // Escape closes, and focus moves into the dialog on open — this is a modal
  // over the page, so leaving focus behind it would strand a keyboard user.
  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => firstFieldRef.current?.focus(), 60)
    // The page behind must not scroll under the dialog.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen || !experience) return null

  const set = (key, value) => {
    setForm(p => ({ ...p, [key]: value }))
    // Clear the field's error as soon as the visitor edits it, rather than
    // leaving a stale complaint under a field they have already fixed.
    setErrors(p => (p[key] ? { ...p, [key]: undefined } : p))
  }

  const submit = async e => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setBanner(''); setErrors({})

    const payload = {
      experience: experience.id,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      destination: form.destination.trim(),
      requirements: form.requirements.trim(),
      message: form.message.trim(),
    }
    // Omitted rather than sent empty: the API takes these as optional, and
    // "" is not a valid date or number.
    if (form.travel_date) payload.travel_date = form.travel_date
    if (form.party_size) payload.party_size = Number(form.party_size)

    try {
      const res = await sendExperienceEnquiry(payload)
      if (res.ok) {
        setSent(res)
      } else {
        setErrors(res.fieldErrors || {})
        setBanner(res.message)
      }
    } catch {
      setBanner('We could not send that just now. Please try again.')
    }
    setBusy(false)
  }

  const inputStyle = INPUT_STYLE

  const fieldError = key => {
    const raw = errors[key]
    if (!raw) return ''
    return Array.isArray(raw) ? raw.join(' ') : String(raw)
  }

  // One place that knows how to hand a field its current value and error, so
  // the JSX below stays a list of fields rather than a wall of wiring.
  const fieldProps = name => ({
    name, value: form[name], error: fieldError(name), onChange: set,
  })

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 'clamp(12px, 4vw, 28px)', overflowY: 'auto',
        }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="exp-enquiry-title"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          onClick={e => e.stopPropagation()}
          className="casino-card"
          style={{ width: '100%', maxWidth: 560, padding: 'clamp(20px, 5vw, 30px)', position: 'relative', margin: 'auto' }}
        >
          <button
            onClick={onClose}
            aria-label="Close enquiry"
            style={{
              position: 'absolute', top: 14, right: 14, width: 34, height: 34,
              borderRadius: '50%', border: '1px solid rgba(212,175,55,0.3)',
              background: 'rgba(0,0,0,0.4)', color: 'var(--w365-text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>

          {sent ? (
            <div style={{ textAlign: 'center', padding: '14px 4px 4px' }}>
              <div
                style={{
                  width: 54, height: 54, borderRadius: '50%', margin: '0 auto 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.4)',
                }}
              >
                <Check size={24} style={{ color: '#34d399' }} />
              </div>
              <h3 id="exp-enquiry-title" className="font-heading gold-text" style={{ fontSize: 'clamp(1.15rem,4vw,1.5rem)', fontWeight: 800, marginBottom: 10 }}>
                Enquiry received
              </h3>
              <p className="font-body" style={{ color: 'var(--w365-text-muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                {sent.message}
              </p>
              {/* The existing WhatsApp handoff, unchanged — offered, not
                  forced, because the enquiry is already saved either way. */}
              <a
                href={buildWhatsAppLink(number, waMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gold"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 999, fontWeight: 800, fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase' }}
              >
                <MessageCircle size={15} /> Continue on WhatsApp
              </a>
              <button
                onClick={onClose}
                style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: 'var(--w365-text-muted)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <p className="font-body" style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--w365-text-muted)', marginBottom: 6 }}>
                Enquire
              </p>
              <h3 id="exp-enquiry-title" className="font-heading gold-text" style={{ fontSize: 'clamp(1.2rem,4.5vw,1.6rem)', fontWeight: 800, lineHeight: 1.2, marginBottom: 6 }}>
                {experience.title}
              </h3>
              <p className="font-body" style={{ color: 'var(--w365-text-muted)', fontSize: 13, lineHeight: 1.55, marginBottom: 20 }}>
                Tell us what you have in mind and a VIP host will come back to you. Nothing is booked or charged from this form.
              </p>

              {banner && (
                <div
                  role="alert"
                  style={{ padding: '10px 13px', borderRadius: 10, marginBottom: 16, fontSize: 13, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', color: '#f87171' }}
                >
                  {banner}
                </div>
              )}

              <form onSubmit={submit} noValidate>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label htmlFor="exp-name" style={{ display: 'block', marginBottom: 6, fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--w365-text-muted)' }}>
                      {FIELD_LABEL.name}
                    </label>
                    <input
                      id="exp-name" ref={firstFieldRef} value={form.name}
                      onChange={e => set('name', e.target.value)}
                      style={inputStyle} autoComplete="name"
                    />
                    {fieldError('name') && (
                      <p role="alert" style={{ margin: '5px 0 0', fontSize: 11.5, color: '#f87171' }}>{fieldError('name')}</p>
                    )}
                  </div>

                  <EnquiryField {...fieldProps('email')} type="email" autoComplete="email" />
                  <EnquiryField {...fieldProps('phone')} type="tel" autoComplete="tel" />
                  <EnquiryField {...fieldProps('destination')} placeholder="Where to?" />
                  <EnquiryField {...fieldProps('travel_date')} type="date" />
                  <EnquiryField {...fieldProps('party_size')} type="number" min="1" max="500" placeholder="2" />
                  <EnquiryField {...fieldProps('requirements')} placeholder="Suites, dietary, access…" />
                  <EnquiryField {...fieldProps('message')} span={2} textarea />
                </div>

                <p className="font-body" style={{ fontSize: 11.5, color: 'var(--w365-text-muted)', margin: '14px 0 0', lineHeight: 1.5 }}>
                  Add an email address or a phone number so we can reply.
                </p>

                <button
                  type="submit"
                  disabled={busy}
                  className="btn-gold"
                  style={{
                    width: '100%', marginTop: 16, padding: '13px 20px', borderRadius: 999,
                    fontWeight: 800, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                    opacity: busy ? 0.65 : 1, cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  {busy
                    ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                    : 'Send Enquiry'}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
