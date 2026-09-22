// src/components/whatsapp/WhatsAppGate.jsx
//
// WHATSAPP-CAPTURE: asks for a name and a number, then opens WhatsApp.
//
// WHY THIS SITS IN FRONT OF THE BUTTON
// A wa.me conversation happens on WhatsApp's servers, between the visitor's
// phone and ours. Nothing they type there reaches this system, and nothing
// can without Meta's Business Cloud API (which would take the number out of
// the WhatsApp app the desk actually uses). So the only place a lead can be
// captured is here, a moment before the handoff.
//
// THE RULE THAT MATTERS: WHATSAPP ALWAYS OPENS.
// If the API is down, if the request times out, if the visitor is rate
// limited, if localStorage throws — WhatsApp still opens. A lost lead is a
// bad day; a visitor who tapped WhatsApp and got nothing is a broken site.
// Every failure path below ends in the same handoff.
//
// FRICTION IS THE REAL COST
// Every field here is a reason to give up, so there are two, and the second
// is optional. A visitor who has already given their details is remembered
// per-browser and goes straight through on the next button — see
// services/whatsappEnquiryService.js.
//
// USAGE
//   const openWhatsApp = useWhatsAppGate()
//   <button onClick={() => openWhatsApp({ source: 'floating_button' })}>
//
// Wrap the app once in <WhatsAppGateProvider>. Any button below it can call
// the hook; there is one modal, not one per button.
import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle, X } from 'lucide-react'

import { buildWhatsAppLink } from '../../services/enquiryContact'
import useEnquiryNumber from '../../hooks/useEnquiryNumber'
import { shouldCaptureDetails } from '../../hooks/useEnquiryMessage'
import { getToken } from '../../services/authStorage'
import {
  enquiryContext, recordWhatsAppClick, rememberContact, rememberedContact,
  sendWhatsAppEnquiry,
} from '../../services/whatsappEnquiryService'

const GateContext = createContext(null)

/** Call this from any WhatsApp button. Returns openWhatsApp({source, message}). */
export function useWhatsAppGate() {
  const ctx = useContext(GateContext)
  // Falling back to a plain handoff rather than throwing: a button rendered
  // outside the provider should still work, just without capture. A missing
  // provider must not break the site's primary call to action.
  return ctx?.open || (({ message } = {}) => {
    window.open(buildWhatsAppLink(undefined, message || ''), '_blank', 'noopener')
  })
}

const GOLD = '#d4af37'

export function WhatsAppGateProvider({ children }) {
  const [pending, setPending] = useState(null)   // {source, message} or null
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const enquiryNumber = useEnquiryNumber()

  // Read once per open rather than at mount: the visitor may have filled the
  // form in another tab since this one loaded.
  const rememberedRef = useRef(null)

  const handoff = useCallback((message) => {
    const link = buildWhatsAppLink(enquiryNumber, message || '')
    // A new tab, not a navigation: the visitor keeps the page they were
    // reading, which is the whole point of an enquiry button on a landing
    // page. noopener because the opened document is third-party.
    window.open(link, '_blank', 'noopener')
  }, [enquiryNumber])

  const open = useCallback(({ source = '', message = '' } = {}) => {
    // WHATSAPP-LEADS: record the press itself, first and unconditionally.
    //
    // Every branch below either opens a form or hands straight off, and one of
    // them (skip) used to leave no trace at all — so the single most useful
    // fact, WHICH button somebody reached for, was lost for exactly the
    // visitors who declined to type. Recording here means it is kept whatever
    // they do next. The call does not block: it is fire-and-forget with
    // keepalive, and the server folds it into the same lead as any form that
    // follows.
    const context = enquiryContext({
      source, message, destinationNumber: enquiryNumber,
    })
    recordWhatsAppClick(context)

    // A signed-in member has already given us their name and number. The API
    // fills both from their account, so prompting them in front of a WhatsApp
    // button would be friction for something we already know. The lead is
    // still recorded — silently.
    //
    // getToken takes the storage key ('access', as apiClient uses). Called
    // bare it reads the key "undefined", always returns null, and every
    // member was shown the form this branch exists to spare them.
    if (getToken('access')) {
      // Spreading `context` so this carries the same session and visitor ids
      // as the click above — that is what lets the server complete that one
      // lead with the member's details instead of filing a second.
      sendWhatsAppEnquiry({ ...context })
        .catch(() => { /* handoff happens regardless */ })
      handoff(message)
      return
    }

    const known = rememberedContact()
    if (known) {
      // Already told us who they are. Record this press too — a second
      // enquiry from the same person about a different package is a second
      // lead, not a duplicate — but do not make them type it again.
      rememberedRef.current = known
      sendWhatsAppEnquiry({
        ...context,
        name: known.name,
        whatsapp_number: known.whatsapp_number,
      }).catch(() => { /* handoff happens regardless */ })
      handoff(message)
      return
    }
    // WHATSAPP-LEADS: the per-button Back Office toggle. Off (the default, and
    // every button until somebody turns one on) means hand off exactly as
    // before -- the press is already recorded above, so nothing is lost by not
    // asking. Unknown keys and a failed config fetch both read as off, so the
    // fallback is always "behave as the site did yesterday".
    if (!shouldCaptureDetails(source)) {
      handoff(message)
      return
    }

    setPending({ source, message, context })
    setErrors({})
    setBusy(false)
  }, [enquiryNumber, handoff])

  const close = useCallback(() => {
    setPending(null)
    setBusy(false)
  }, [])

  const skip = useCallback(() => {
    // "Continue without giving details". Offered on purpose: a visitor who
    // will not fill the form should still reach WhatsApp, because the button
    // is the site's primary call to action and capture is secondary to it.
    const message = pending?.message || ''
    close()
    handoff(message)
  }, [pending, close, handoff])

  const submit = useCallback(async (e) => {
    e.preventDefault()
    if (busy) return

    const trimmedName = name.trim()
    const trimmedNumber = number.trim()
    const next = {}
    if (trimmedName.length < 2) next.name = 'Please enter your name.'
    if (trimmedNumber.replace(/\D/g, '').length < 6) {
      next.whatsapp_number = 'Please enter your WhatsApp number with country code.'
    }
    if (Object.keys(next).length) { setErrors(next); return }

    setBusy(true)
    const message = pending?.message || ''

    try {
      const res = await sendWhatsAppEnquiry({
        // The context captured when the modal opened, so this completes the
        // click already recorded for this button rather than filing a second
        // lead for one enquiry.
        ...(pending?.context || {}),
        name: trimmedName,
        whatsapp_number: trimmedNumber,
        email: email.trim(),
        message: note.trim() || message,
      })
      if (!res.ok && res.status === 400 && res.fieldErrors) {
        // The only case worth stopping for: the server can tell them exactly
        // what to fix. Anything else hands off rather than trapping them.
        const fe = res.fieldErrors
        if (fe.name || fe.whatsapp_number) {
          setErrors({
            name: Array.isArray(fe.name) ? fe.name.join(' ') : fe.name,
            whatsapp_number: Array.isArray(fe.whatsapp_number)
              ? fe.whatsapp_number.join(' ') : fe.whatsapp_number,
          })
          setBusy(false)
          return
        }
      }
      if (res.ok) rememberContact(trimmedName, trimmedNumber)
    } catch {
      // Network down, CORS, anything. The handoff below still runs.
    }

    close()
    handoff(message)
    // `email` belongs in here with the other field values. Without it this
    // callback closes over the value `email` had when the modal mounted --
    // the empty string -- so the field accepted what the visitor typed, the
    // DOM showed it, and the request sent "". A missing dependency fails
    // exactly this quietly: nothing errors, the enquiry saves, and only the
    // column is wrong.
  }, [busy, name, number, email, note, pending, enquiryNumber, close, handoff])

  const value = useMemo(() => ({ open }), [open])

  return (
    <GateContext.Provider value={value}>
      {children}
      {pending && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={close}
            style={{
              position: 'fixed', inset: 0, zIndex: 1200,
              background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 'clamp(12px, 4vw, 28px)', overflowY: 'auto',
            }}
          >
            <motion.div
              initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="Contact us on WhatsApp"
              style={{
                width: 'min(440px, 100%)', background: '#11110f',
                border: `1px solid ${GOLD}44`, borderRadius: 18,
                padding: 'clamp(20px, 5vw, 30px)', color: '#f5f2ea',
                boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <MessageCircle size={22} style={{ color: '#25D366', flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: 0.2 }}>
                    Before we continue
                  </h3>
                  <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.55, opacity: 0.78 }}>
                    Leave your name and WhatsApp number so a host can reach you
                    even if the chat does not go through.
                  </p>
                </div>
                <button
                  type="button" onClick={close} aria-label="Close"
                  style={{
                    background: 'none', border: 'none', color: '#f5f2ea99',
                    cursor: 'pointer', padding: 4, lineHeight: 0,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={submit} noValidate style={{ marginTop: 20 }}>
                <Field
                  label="Your name" value={name} error={errors.name}
                  onChange={v => { setName(v); setErrors(p => ({ ...p, name: undefined })) }}
                  autoFocus placeholder="Full name"
                />
                <Field
                  label="WhatsApp number" value={number} error={errors.whatsapp_number}
                  onChange={v => { setNumber(v); setErrors(p => ({ ...p, whatsapp_number: undefined })) }}
                  placeholder="+91 98765 43210" inputMode="tel"
                />
                {/* Optional, and labelled as such. The number is what answers
                    a WhatsApp enquiry, so a required address would cost leads
                    to collect something the desk may never use. */}
                <Field
                  label="Email (optional)" value={email} error={errors.email}
                  onChange={v => { setEmail(v); setErrors(p => ({ ...p, email: undefined })) }}
                  placeholder="you@example.com" inputMode="email"
                />
                <Field
                  label="What are you looking for? (optional)" value={note}
                  onChange={setNote} placeholder="Tell us briefly…" textarea
                />

                <button
                  type="submit" disabled={busy}
                  style={{
                    width: '100%', marginTop: 6, padding: '13px 18px',
                    borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer',
                    background: '#25D366', color: '#08170d',
                    fontSize: 15, fontWeight: 800, letterSpacing: 0.3,
                    opacity: busy ? 0.75 : 1,
                  }}
                >
                  {busy ? 'Opening WhatsApp…' : 'Continue to WhatsApp'}
                </button>

                <button
                  type="button" onClick={skip}
                  style={{
                    width: '100%', marginTop: 10, padding: '9px 14px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#f5f2ea77', fontSize: 12.5, textDecoration: 'underline',
                  }}
                >
                  Continue without giving details
                </button>
              </form>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}
    </GateContext.Provider>
  )
}

function Field({ label, value, onChange, error, textarea, ...rest }) {
  const base = {
    width: '100%', marginTop: 6, padding: '11px 13px', borderRadius: 10,
    background: '#00000055', color: '#f5f2ea', fontSize: 14.5,
    border: `1px solid ${error ? '#e0554e' : '#ffffff22'}`, outline: 'none',
  }
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', opacity: 0.66 }}>
        {label}
      </span>
      {textarea
        ? <textarea rows={3} value={value} onChange={e => onChange(e.target.value)}
                    style={{ ...base, resize: 'vertical' }} {...rest} />
        : <input value={value} onChange={e => onChange(e.target.value)}
                 style={base} {...rest} />}
      {error && (
        <span style={{ display: 'block', marginTop: 5, fontSize: 12, color: '#e0554e' }}>
          {error}
        </span>
      )}
    </label>
  )
}

export default WhatsAppGateProvider
