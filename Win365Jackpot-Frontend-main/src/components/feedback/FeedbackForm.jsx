import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Star, X, CheckCircle2 } from 'lucide-react'

import { OPEN_EVENT, markFeedbackSent, sendFeedback } from '../../services/feedbackPrompt'
import { T } from '../../i18n/useSiteText'

/**
 * VISITOR-FEEDBACK: the full feedback form, for a visitor who chooses to give
 * feedback (the round button, the header menu, the footer link). All three
 * open it through openFeedback() in services/feedbackPrompt.
 */

const GOLD = '#D4AF37'
const MESSAGE_MAX = 2000

const CATEGORIES = [
  { value: 'suggestion', label: T('Suggestion') },
  { value: 'problem',    label: T('Problem or bug') },
  { value: 'compliment', label: T('Compliment') },
  { value: 'other',      label: T('Other') },
]

const RATING_WORDS = ['', T('Poor'), T('Fair'), T('Good'), T('Very good'), T('Excellent')]

const EMPTY = { rating: 0, category: 'suggestion', message: '', name: '', email: '', website: '' }

export default function FeedbackForm() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [hover, setHover] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const firstStar = useRef(null)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => firstStar.current?.focus(), 50)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [open, sent])

  const close = () => {
    setOpen(false)
    // Reset after the closing animation so the form doesn't visibly clear.
    // A half-written message is kept; a sent one is cleared.
    const wasSent = sent
    setTimeout(() => {
      if (wasSent) setForm(EMPTY)
      setSent(false)
      setError('')
    }, 250)
  }

  const set = (field, value) => { setForm(f => ({ ...f, [field]: value })); setError('') }

  const submit = async e => {
    e.preventDefault()
    if (!form.rating) { setError(T('Please choose a star rating.')); return }
    if (form.message.trim().length < 3) { setError(T('Please write a few words of feedback.')); return }
    setSending(true)
    const { ok, status, data } = await sendFeedback({ ...form, trigger: 'manual' })
    setSending(false)
    if (ok) { markFeedbackSent(); setSent(true); return }
    if (status === 429) setError(T('You have sent feedback several times already. Please try again later.'))
    else if (data?.email) setError(T('Please enter a valid email address, or leave it blank.'))
    else setError(T('Sorry, we could not send your feedback. Please try again.'))
  }

  const shown = hover || form.rating

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
    background: 'var(--w365-surface-hi, rgba(255,255,255,0.05))',
    border: '1px solid var(--w365-border, rgba(255,255,255,0.12))',
    color: 'var(--w365-text, #fff)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--w365-text-muted, #aaa)' }

  return (
    <>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="feedback-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onMouseDown={e => { if (e.target === e.currentTarget) close() }}
              style={{
                position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
              }}
            >
              <motion.div
                role="dialog" aria-modal="true" aria-labelledby="jw-feedback-title"
                initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
                style={{
                  width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto',
                  background: 'var(--w365-card, #14110c)', color: 'var(--w365-text, #fff)',
                  border: `1px solid rgba(212,175,55,0.35)`, borderRadius: 16,
                  padding: '22px 22px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <h2 id="jw-feedback-title" style={{ margin: 0, fontSize: 20, color: 'var(--w365-heading, #fff)' }}>
                      {T('Share your feedback')}
                    </h2>
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--w365-text-muted, #aaa)' }}>
                      {T('Tell us what you like and what we can do better.')}
                    </p>
                  </div>
                  <button type="button" onClick={close} aria-label={T('Close')}
                    style={{ background: 'none', border: 'none', color: 'var(--w365-text-muted, #aaa)', cursor: 'pointer', padding: 4 }}>
                    <X size={20} />
                  </button>
                </div>

                {sent ? (
                  <div style={{ textAlign: 'center', padding: '28px 8px 10px' }}>
                    <CheckCircle2 size={44} color={GOLD} style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontSize: 17, fontWeight: 700 }}>{T('Thank you for your feedback!')}</div>
                    <p style={{ fontSize: 13, color: 'var(--w365-text-muted, #aaa)', margin: '8px 0 18px' }}>
                      {T('Our team reads every message.')}
                    </p>
                    <button type="button" onClick={close}
                      style={{ padding: '10px 22px', borderRadius: 10, border: 'none', cursor: 'pointer', background: GOLD, color: '#1a1406', fontWeight: 700 }}>
                      {T('Close')}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={submit} noValidate style={{ marginTop: 18 }}>
                    <span style={labelStyle} id="jw-feedback-rating">{T('How would you rate your experience?')}</span>
                    <div role="radiogroup" aria-labelledby="jw-feedback-rating"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}
                      onMouseLeave={() => setHover(0)}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n} type="button" role="radio" aria-checked={form.rating === n}
                          aria-label={`${n} – ${RATING_WORDS[n]}`}
                          ref={n === 1 ? firstStar : undefined}
                          onClick={() => set('rating', n)}
                          onMouseEnter={() => setHover(n)}
                          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0 }}
                        >
                          <Star size={30} color={GOLD} fill={n <= shown ? GOLD : 'transparent'} strokeWidth={1.6} />
                        </button>
                      ))}
                      <span style={{ marginLeft: 8, fontSize: 13, color: GOLD, fontWeight: 600, minWidth: 70 }}>
                        {RATING_WORDS[shown]}
                      </span>
                    </div>

                    <span style={labelStyle}>{T('What is it about?')}</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                      {CATEGORIES.map(c => {
                        const active = form.category === c.value
                        return (
                          <button key={c.value} type="button" aria-pressed={active}
                            onClick={() => set('category', c.value)}
                            style={{
                              padding: '6px 12px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
                              border: `1px solid ${active ? GOLD : 'var(--w365-border, rgba(255,255,255,0.15))'}`,
                              background: active ? 'rgba(212,175,55,0.15)' : 'transparent',
                              color: active ? GOLD : 'var(--w365-text, #fff)', fontWeight: active ? 700 : 500,
                            }}>
                            {c.label}
                          </button>
                        )
                      })}
                    </div>

                    <label style={labelStyle} htmlFor="jw-feedback-message">{T('Your feedback')}</label>
                    <textarea
                      id="jw-feedback-message" rows={4} maxLength={MESSAGE_MAX}
                      value={form.message} onChange={e => set('message', e.target.value)}
                      placeholder={T('Tell us more…')}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 96 }}
                    />
                    <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--w365-text-muted, #888)', margin: '3px 0 12px' }}>
                      {form.message.length}/{MESSAGE_MAX}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 6 }}>
                      <div>
                        <label style={labelStyle} htmlFor="jw-feedback-name">{T('Name (optional)')}</label>
                        <input id="jw-feedback-name" maxLength={120} autoComplete="name"
                          value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle} htmlFor="jw-feedback-email">{T('Email (optional)')}</label>
                        <input id="jw-feedback-email" type="email" autoComplete="email"
                          value={form.email} onChange={e => set('email', e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                    <p style={{ fontSize: 11.5, color: 'var(--w365-text-muted, #888)', margin: '4px 0 14px' }}>
                      {T('Leave your email only if you would like a reply.')}
                    </p>

                    {/* Honeypot: hidden from people, filled by bots. */}
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
                      value={form.website} onChange={e => set('website', e.target.value)}
                      style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }} />

                    {error && (
                      <div role="alert" style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</div>
                    )}

                    <button type="submit" disabled={sending}
                      style={{
                        width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
                        cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.7 : 1,
                        background: `linear-gradient(90deg, ${GOLD}, #b8912a)`, color: '#1a1406',
                        fontWeight: 800, fontSize: 14,
                      }}>
                      {sending ? T('Sending…') : T('Send feedback')}
                    </button>
                  </form>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
