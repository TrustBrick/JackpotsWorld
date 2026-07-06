import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X, Mail, Eye, EyeOff, Key, User, Gift, Phone,
  Loader2, CheckCircle2, AlertCircle, ArrowRight, ChevronDown, ShieldCheck, RotateCcw,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL

// ─── Network / API helper ─────────────────────────────────────────────────────
// Centralizes every fetch call in this file so failures are classified
// correctly instead of collapsing into one generic "Network error" message:
//   1. fetch() itself throwing        -> backend truly unreachable (down,
//                                        wrong port, CORS block, offline)
//   2. response received but not JSON -> wrong URL / wrong endpoint / proxy
//                                        error page (e.g. Vite's own 404 html)
//   3. response received, JSON, !ok   -> real backend validation/error,
//                                        parsed into a specific message
if (!API && import.meta.env.DEV) {
  // This is almost always the actual cause of a blanket "Network Error":
  // VITE_API_URL is missing from .env, so every fetch call below silently
  // becomes fetch("undefined/api/..."), which Vite's dev server answers
  // with its own index.html — not JSON — which then fails to parse.
  // eslint-disable-next-line no-console
  console.error(
    '[AuthModal] VITE_API_URL is not set. Add it to your .env file ' +
    '(e.g. VITE_API_URL=http://127.0.0.1:8000) and restart `npm run dev`.'
  )
}

class ApiError extends Error {
  constructor(message, data, status) {
    super(message)
    this.data = data
    this.status = status
  }
}

/** Pulls a specific, human-readable message out of a DRF-style error body. */
function extractApiMessage(json, status) {
  if (!json || typeof json !== 'object') {
    return status >= 500
      ? 'Server returned an error. Please try again in a moment.'
      : 'Invalid data. Please check the form and try again.'
  }

  if (typeof json.detail === 'string') return json.detail
  if (typeof json.error === 'string') return json.error

  if (Array.isArray(json.non_field_errors) && json.non_field_errors.length) {
    return json.non_field_errors[0]
  }

  if (json.email) {
    const msg = Array.isArray(json.email) ? json.email[0] : json.email
    if (String(msg).toLowerCase().includes('exist')) return 'Email already exists.'
    return `Email: ${msg}`
  }

  if (json.username) {
    const msg = Array.isArray(json.username) ? json.username[0] : json.username
    if (String(msg).toLowerCase().includes('exist')) return 'Username already exists.'
    return `Username: ${msg}`
  }

  const fieldKeys = Object.keys(json).filter(k => Array.isArray(json[k]) && json[k].length)
  if (fieldKeys.length) {
    const key = fieldKeys[0]
    return `${key}: ${json[key][0]}`
  }

  if (status >= 500) return 'Server returned an error. Please try again in a moment.'
  if (status === 400) return 'Invalid data. Please check the form and try again.'
  return 'Something went wrong. Please try again.'
}

/**
 * apiFetch
 * Drop-in replacement for `fetch` used everywhere in this file. On success
 * resolves with the parsed JSON body. On failure throws an ApiError whose
 * `.message` is always one of the specific, user-facing strings this
 * component is supposed to show (never a generic "Network error").
 */
async function apiFetch(path, options = {}) {
  let res
  try {
    res = await fetch(`${API || ''}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (networkErr) {
    // fetch() itself threw: connection refused, DNS failure, CORS
    // preflight rejected, or the device is offline. The backend is
    // genuinely unreachable from the browser's point of view.
    throw new ApiError('Backend server is unavailable. Please check your connection or try again shortly.')
  }

  let json = null
  try {
    json = await res.json()
  } catch (parseErr) {
    // We got *a* response, but it wasn't JSON — almost always means the
    // request hit the wrong URL (e.g. VITE_API_URL missing/misconfigured,
    // so it landed on Vite's own dev server instead of Django).
    throw new ApiError(
      `Server returned an unexpected response (status ${res.status}). ` +
      'Please verify VITE_API_URL points to your Django backend.'
    )
  }

  if (!res.ok) {
    throw new ApiError(extractApiMessage(json, res.status), json, res.status)
  }

  return json
}

// ─── Strict email validation ──────────────────────────────────────────────────
const VALID_EMAIL = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/
const COMMON_TYPOS = {
  'gmal.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoomail.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outook.com': 'outlook.com',
}

function validateEmail(val) {
  const v = val.trim()
  if (!v) return { ok: false, error: 'Email is required' }
  if (!VALID_EMAIL.test(v)) return { ok: false, error: 'Enter a valid email address' }
  const domain = v.split('@')[1]?.toLowerCase()
  if (COMMON_TYPOS[domain]) return { ok: false, error: `Did you mean @${COMMON_TYPOS[domain]}?` }
  return { ok: true, error: null }
}

const DEFAULT_COUNTRY = { code: '+91', flag: '🇮🇳', name: 'India', digits: 10, placeholder: '0000000000', format: v => v }

const DIGIT_MAP = {
  '+91': 10, '+1': 10, '+44': 10, '+61': 9, '+971': 9, '+65': 8, '+49': 11, '+33': 9,
  '+81': 10, '+86': 11, '+55': 11, '+27': 9, '+234': 10, '+92': 10, '+880': 10,
  '+94': 9, '+977': 10, '+966': 9, '+20': 10, '+62': 11, '+63': 10, '+84': 10,
  '+82': 10, '+52': 10, '+54': 10, '+57': 10, '+56': 9, '+51': 9, '+90': 10,
  '+98': 10, '+7': 10, '+380': 9, '+48': 9, '+31': 9, '+32': 9, '+41': 9,
  '+43': 10, '+34': 9, '+39': 10, '+351': 9, '+46': 9, '+47': 8, '+45': 8,
  '+358': 10, '+353': 9, '+64': 9, '+852': 8, '+853': 8, '+886': 9, '+66': 9,
  '+95': 9, '+855': 9, '+856': 10, '+60': 10, '+673': 7, '+675': 8,
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:          '#0d1117',
  surface:     '#161b22',
  surfaceHi:   '#1c2128',
  border:      '#30363d',
  gold:        '#d4af37',
  goldGlow:    'rgba(212,175,55,0.09)',
  text:        '#e6edf3',
  muted:       '#8b949e',
  dim:         '#484f58',
  green:       '#3fb950',
  greenBorder: 'rgba(63,185,80,0.35)',
  greenBg:     'rgba(63,185,80,0.07)',
  red:         '#f85149',
  redBorder:   'rgba(248,81,73,0.35)',
  redBg:       'rgba(248,81,73,0.07)',
  yellow:      '#e3b341',
}

// ─── Atoms ────────────────────────────────────────────────────────────────────
function FocusInput({ type = 'text', value, onChange, placeholder, hasError, hasOk, extraStyle, onKeyDown, ...rest }) {
  const [focus, setFocus] = useState(false)
  const st = {
    width: '100%', padding: '10px 13px', fontSize: 14,
    color: C.text, background: C.bg,
    border: `1.5px solid ${hasError ? C.redBorder : hasOk ? C.greenBorder : focus ? C.gold : C.border}`,
    borderRadius: 8, outline: 'none',
    boxShadow: focus && !hasError ? `0 0 0 3px ${C.goldGlow}` : 'none',
    transition: 'border 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box', fontFamily: 'inherit',
    ...extraStyle,
  }
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={st} onKeyDown={onKeyDown}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} {...rest} />
  )
}

function PwInput({ value, onChange, placeholder = 'Password', onKeyDown }) {
  const [show, setShow] = useState(false)
  const [focus, setFocus] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder}
        onKeyDown={onKeyDown}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: '100%', padding: '10px 40px 10px 13px', fontSize: 14,
          color: C.text, background: C.bg,
          border: `1.5px solid ${focus ? C.gold : C.border}`,
          borderRadius: 8, outline: 'none',
          boxShadow: focus ? `0 0 0 3px ${C.goldGlow}` : 'none',
          transition: 'border 0.15s, box-shadow 0.15s',
          boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />
      <button type="button" onClick={() => setShow(s => !s)} style={{
        position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, display: 'flex',
      }}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

// ─── Country-aware phone input ─────────────────────────────────────────────────
function PhoneInput({ value, country, countries = [], onValueChange, onCountryChange, hasError, hasOk }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focus, setFocus] = useState(false)
  const dropRef = useRef(null)

  const filtered = countries.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.code.includes(search)
  )

  useEffect(() => {
    const handler = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleDigits = e => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, country.digits || 15)
    onValueChange(raw)
  }

  const inputBorder = hasError ? C.redBorder : hasOk ? C.greenBorder : focus ? C.gold : C.border
  const inputShadow = focus && !hasError ? `0 0 0 3px ${C.goldGlow}` : 'none'

  return (
    <div style={{ position: 'relative' }} ref={dropRef}>
      <div style={{
        display: 'flex', border: `1.5px solid ${inputBorder}`,
        borderRadius: 8, overflow: 'hidden',
        boxShadow: inputShadow, transition: 'border 0.15s, box-shadow 0.15s',
        background: C.bg,
      }}>
        <button type="button" onClick={() => setOpen(o => !o)} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '0 10px', background: C.surfaceHi,
          border: 'none', borderRight: `1px solid ${C.border}`,
          cursor: 'pointer', flexShrink: 0, height: 42,
          color: C.text, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 16 }}>{country.flag || '🌐'}</span>
          <span style={{ color: C.muted, fontSize: 12 }}>{country.code}</span>
          <ChevronDown size={11} color={C.dim} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
        <input
          type="tel" value={value} onChange={handleDigits}
          placeholder={'0'.repeat(country.digits || 10)}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, padding: '10px 13px', fontSize: 14, color: C.text, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit', letterSpacing: '0.06em', minWidth: 0 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: 10, fontSize: 10, color: value.length === (country.digits || 10) ? C.green : C.dim, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {value.length}/{country.digits || 10}
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 999, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search country or dial code…" autoFocus
                style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {filtered.length === 0 && <div style={{ padding: 14, fontSize: 12, color: C.muted, textAlign: 'center' }}>No countries found</div>}
              {filtered.map((c, i) => (
                <button key={`${c.code}-${i}`} type="button"
                  onClick={() => { onCountryChange(c); setOpen(false); setSearch('') }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: c.code === country.code ? C.surfaceHi : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: `1px solid rgba(48,54,61,0.4)` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surfaceHi}
                  onMouseLeave={e => e.currentTarget.style.background = c.code === country.code ? C.surfaceHi : 'none'}>
                  <span style={{ fontSize: 17, flexShrink: 0 }}>{c.flag || '🌐'}</span>
                  <span style={{ fontSize: 12, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: C.gold, fontWeight: 700, flexShrink: 0 }}>{c.code}</span>
                  <span style={{ fontSize: 10, color: C.dim, flexShrink: 0, marginLeft: 4 }}>{c.digits}d</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const Label = ({ children }) => (
  <div style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{children}</div>
)
const Hint = ({ color, icon: Icon, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color, marginTop: 5 }}>
    <Icon size={10} />{children}
  </div>
)
function ErrBox({ msg }) {
  if (!msg) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 13px', background: C.redBg, border: `1.5px solid ${C.redBorder}`, borderRadius: 8, marginBottom: 14, fontSize: 12.5, color: C.red, lineHeight: 1.5 }}>
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{msg}
    </div>
  )
}
function GoldBtn({ onClick, loading, disabled, children }) {
  const off = loading || disabled
  return (
    <button onClick={onClick} disabled={off}
      style={{
        width: '100%', padding: '11px 16px', fontSize: 13, fontWeight: 800, letterSpacing: '0.04em',
        background: off ? 'rgba(212,175,55,0.08)' : `linear-gradient(135deg, ${C.gold}, #b8941e)`,
        color: off ? C.dim : '#08080a',
        border: 'none', borderRadius: 8, cursor: off ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        transition: 'filter 0.15s, transform 0.1s', marginTop: 6, fontFamily: 'inherit',
        boxShadow: off ? 'none' : '0 2px 14px rgba(212,175,55,0.22)',
      }}
      onMouseEnter={e => { if (!off) e.currentTarget.style.filter = 'brightness(1.1)' }}
      onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}>
      {loading
        ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />Please wait…</>
        : <>{children}<ArrowRight size={13} /></>}
    </button>
  )
}

const W = { marginBottom: 15 }

// ─── OTP Step ─────────────────────────────────────────────────────────────────
function OTPStep({ email, registrationData, onSuccess, onBack }) {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(600) // 10 minutes in seconds
  const [canResend, setCanResend] = useState(false)
  const inputRefs = useRef([])

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const formatTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const handleOtpChange = (idx, val) => {
    // Support paste of full 6-digit code
    if (val.length > 1) {
      const digits = val.replace(/\D/g, '').slice(0, 6).split('')
      const newOtp = [...otp]
      digits.forEach((d, i) => { if (idx + i < 6) newOtp[idx + i] = d })
      setOtp(newOtp)
      const nextFocus = Math.min(idx + digits.length, 5)
      inputRefs.current[nextFocus]?.focus()
      return
    }
    const digit = val.replace(/\D/g, '')
    const newOtp = [...otp]
    newOtp[idx] = digit
    setOtp(newOtp)
    if (digit && idx < 5) inputRefs.current[idx + 1]?.focus()
  }

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace') {
      if (otp[idx]) {
        const newOtp = [...otp]; newOtp[idx] = ''; setOtp(newOtp)
      } else if (idx > 0) {
        inputRefs.current[idx - 1]?.focus()
        const newOtp = [...otp]; newOtp[idx - 1] = ''; setOtp(newOtp)
      }
    }
    if (e.key === 'Enter') handleVerify()
  }

  const otpValue = otp.join('')
  const otpComplete = otpValue.length === 6

  const handleVerify = async () => {
    if (!otpComplete) return
    setError(''); setLoading(true)
    try {
      await apiFetch('/api/auth/verify-otp/', {
        method: 'POST',
        body: JSON.stringify({
          email,
          otp: otpValue,
          mode: 'register',
          ...registrationData,   // name, phone, password, referral_code
        }),
      })
      // Registration + OTP both succeeded
      onSuccess?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setOtp(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true); setError(''); setCanResend(false); setCountdown(600)
    setOtp(['', '', '', '', '', ''])
    try {
      await apiFetch('/api/auth/send-otp/', {
        method: 'POST',
        body: JSON.stringify({ email, mode: 'register' }),
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setResending(false)
      inputRefs.current[0]?.focus()
    }
  }

  return (
    <motion.div key="otp" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'rgba(212,175,55,0.08)', border: `2px solid rgba(212,175,55,0.3)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
        }}>
          <ShieldCheck size={24} color={C.gold} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 6 }}>Verify your email</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          We sent a 6-digit code to<br />
          <span style={{ color: C.gold, fontWeight: 600 }}>{email}</span>
        </div>
      </div>

      {/* Timer */}
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        {countdown > 0
          ? <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>
              Expires in <span style={{ color: countdown < 60 ? C.red : C.yellow, fontWeight: 700 }}>{formatTime(countdown)}</span>
            </span>
          : <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>Code expired — please resend</span>}
      </div>

      {/* OTP boxes */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 18 }}>
        {otp.map((digit, idx) => (
          <input
            key={idx}
            ref={el => inputRefs.current[idx] = el}
            type="tel"
            inputMode="numeric"
            maxLength={6}  // allow paste
            value={digit}
            onChange={e => handleOtpChange(idx, e.target.value)}
            onKeyDown={e => handleKeyDown(idx, e)}
            onFocus={e => e.target.select()}
            style={{
              width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 900,
              color: digit ? C.text : C.dim,
              background: C.bg,
              border: `2px solid ${digit ? C.gold : C.border}`,
              borderRadius: 8, outline: 'none', fontFamily: 'monospace',
              transition: 'border 0.12s, box-shadow 0.12s',
              boxShadow: digit ? `0 0 0 3px ${C.goldGlow}` : 'none',
              caretColor: 'transparent',
            }}
          />
        ))}
      </div>

      <ErrBox msg={error} />

      <GoldBtn onClick={handleVerify} loading={loading} disabled={!otpComplete || countdown === 0}>
        Verify &amp; Create Account
      </GoldBtn>

      {/* Resend + Back */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <button type="button" onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontFamily: 'inherit' }}>
          ← Edit details
        </button>
        <button type="button" onClick={handleResend} disabled={!canResend || resending}
          style={{
            background: 'none', border: 'none', cursor: canResend ? 'pointer' : 'not-allowed',
            fontSize: 11, color: canResend ? C.gold : C.dim,
            display: 'flex', alignItems: 'center', gap: 4,
            padding: 0, fontFamily: 'inherit', fontWeight: canResend ? 600 : 400,
            transition: 'color 0.15s',
          }}>
          {resending ? <><Loader2 size={10} style={{ animation: 'spin 0.8s linear infinite' }} /> Resending…</> : <><RotateCcw size={10} /> Resend OTP</>}
        </button>
      </div>
    </motion.div>
  )
}

// ─── Success ──────────────────────────────────────────────────────────────────
function SuccessScreen({ onGoLogin }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '4px 0' }}>
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.1 }}
        style={{ width: 58, height: 58, borderRadius: '50%', background: C.greenBg, border: `2px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
        <CheckCircle2 size={28} color={C.green} />
      </motion.div>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 8 }}>Account Created!</div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, marginBottom: 26 }}>
        Your account is ready.<br />Sign in to continue.
      </div>
      <GoldBtn onClick={onGoLogin} loading={false} disabled={false}>Go to Sign In</GoldBtn>
    </motion.div>
  )
}

// ─── Sign In ──────────────────────────────────────────────────────────────────
function SignInPanel({ onSuccess, onClose }) {
  const navigate = useNavigate()
  const [email,    setEmail]    = useState('')
  const [pw,       setPw]       = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [emailErr, setEmailErr] = useState('')

  const onEmailBlur = () => {
    if (!email) return
    const { error: e } = validateEmail(email)
    setEmailErr(e || '')
  }

  const handle = async () => {
    const { ok: eok, error: eErr } = validateEmail(email)
    if (!eok) { setEmailErr(eErr); return }
    if (!pw)  { setError('Password is required'); return }
    setError(''); setLoading(true)
    try {
      const json = await apiFetch('/api/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ email, password: pw }),
      })
      localStorage.setItem('access',  json.tokens.access)
      localStorage.setItem('refresh', json.tokens.refresh)
      localStorage.setItem('user',    JSON.stringify(json.user))
      onSuccess?.(json.user)
      navigate('/dashboard')
      onClose?.()
    } catch (err) {
      if (err instanceof ApiError && err.data?.email) {
        setEmailErr(Array.isArray(err.data.email) ? err.data.email[0] : err.data.email)
        return
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const kd = e => e.key === 'Enter' && handle()

  return (
    <motion.div key="li" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}>
      <div style={W}>
        <Label><Mail size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Email address</Label>
        <FocusInput type="email" value={email} onChange={e => { setEmail(e.target.value.trim()); setEmailErr('') }}
          placeholder="you@gmail.com" hasError={!!emailErr} hasOk={validateEmail(email).ok && !emailErr}
          onBlur={onEmailBlur} onKeyDown={kd} />
        {emailErr && <Hint color={C.red} icon={AlertCircle}>{emailErr}</Hint>}
      </div>
      <div style={W}>
        <Label><Key size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Password</Label>
        <PwInput value={pw} onChange={setPw} onKeyDown={kd} />
      </div>
      <ErrBox msg={error} />
      <GoldBtn onClick={handle} loading={loading} disabled={!email || !pw}>Sign in</GoldBtn>
    </motion.div>
  )
}

// ─── Register ─────────────────────────────────────────────────────────────────
function RegisterPanel({ onRegistered }) {
  // Form fields
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [emailErr, setEmailErr] = useState('')
  const [phone,    setPhone]    = useState('')
  const [pw,       setPw]       = useState('')
  const [confirm,  setConfirm]  = useState('')

  const [emailDup, setEmailDup] = useState(null)
  const [phoneDup, setPhoneDup] = useState(null)
  const [ckEmail,  setCkEmail]  = useState(false)
  const [ckPhone,  setCkPhone]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const [countries,    setCountries]    = useState([])
  const [countriesErr, setCountriesErr] = useState(false)
  const [country,      setCountry]      = useState(DEFAULT_COUNTRY)

  const [step, setStep] = useState('form') // 'form' | 'otp'

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) sessionStorage.setItem('referral_code', ref)
  }, [])

  const eTimer = useRef(null), pTimer = useRef(null)
  useEffect(() => () => { clearTimeout(eTimer.current); clearTimeout(pTimer.current) }, [])

  useEffect(() => {
    fetch(`${API || ''}/api/auth/countries/`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) { setCountriesErr(true); return }
        const mapped = data
          .map(c => ({ code: c.dial_code, flag: c.flag, name: c.name, digits: DIGIT_MAP[c.dial_code] || 10, placeholder: '0'.repeat(DIGIT_MAP[c.dial_code] || 10), format: v => v }))
          .filter(c => c.code && c.code !== '+')
        setCountries(mapped)
        const india = mapped.find(c => c.code === '+91')
        if (india) setCountry(india)
      })
      .catch(() => setCountriesErr(true))
  }, [])

  const handleCountryChange = c => { setCountry(c); setPhone(''); setPhoneDup(null) }

  const checkDup = async id => {
    try {
      const r = await fetch(`${API || ''}/api/auth/check-user/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: id }),
      })
      return (await r.json()).exists === true
    } catch {
      return false
    }
  }

  const onEmailCh = v => {
    setEmail(v.trim()); setEmailDup(null); setEmailErr(''); clearTimeout(eTimer.current)
    const { ok } = validateEmail(v.trim())
    if (!ok) return
    setCkEmail(true)
    eTimer.current = setTimeout(async () => {
      try { setEmailDup(await checkDup(v.trim())) } catch {}
      finally { setCkEmail(false) }
    }, 400)
  }

  const onEmailBlur = () => {
    if (!email) return
    const { error: e } = validateEmail(email)
    setEmailErr(e || '')
  }

  const onPhoneCh = raw => {
    setPhone(raw); setPhoneDup(null); clearTimeout(pTimer.current)
    if (raw.length < country.digits) return
    setCkPhone(true)
    const fullPhone = country.code + raw
    pTimer.current = setTimeout(async () => {
      try { setPhoneDup(await checkDup(fullPhone)) } catch {}
      finally { setCkPhone(false) }
    }, 400)
  }

  const DH = ({ checking, dup, type }) => {
    if (checking)      return <Hint color={C.muted} icon={Loader2}>Checking…</Hint>
    if (dup === true)  return <Hint color={C.red}   icon={AlertCircle}>This {type} is already registered</Hint>
    if (dup === false) return <Hint color={C.green}  icon={CheckCircle2}>Available</Hint>
    return null
  }

  const emailValid    = validateEmail(email).ok
  const phoneComplete = phone.length === country.digits
  const pwErrors = []
  if (pw.length < 8)           pwErrors.push('8 characters')
  if (!/[A-Z]/.test(pw))       pwErrors.push('uppercase')
  if (!/[a-z]/.test(pw))       pwErrors.push('lowercase')
  if (!/[0-9]/.test(pw))       pwErrors.push('number')
  if (!/[!@#$%^&*]/.test(pw))  pwErrors.push('special character')
  const pwOk    = pwErrors.length === 0
  const pwMatch = confirm && pw === confirm
  const pwMiss  = confirm && pw !== confirm

  const canSubmit =
    name.trim() && emailValid && emailDup !== true && !ckEmail &&
    (phone === '' || (phoneComplete && phoneDup !== true && !ckPhone)) &&
    pwOk && pwMatch

  const handle = async () => {
    if (!name.trim())                         { setError('Full name is required'); return }
    const { ok: eok, error: eErr } = validateEmail(email)
    if (!eok)                                 { setEmailErr(eErr); setError(''); return }
    if (emailDup)                             { setError('Email already registered'); return }
    if (phone && !phoneComplete)              { setError(`Enter exactly ${country.digits} digits for ${country.name}`); return }
    if (phoneComplete && phoneDup)            { setError('Mobile number already registered'); return }
    if (!pwOk)                                { setError('Password does not meet requirements'); return }
    if (!pwMatch)                             { setError('Passwords do not match'); return }
    setError(''); setLoading(true)
    try {
      // Send OTP to email for registration verification
      await apiFetch('/api/auth/send-otp/', {
        method: 'POST',
        body: JSON.stringify({ email, mode: 'register' }),
      })
      // Advance to OTP step
      setStep('otp')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // The data to pass down to OTPStep so it can call verify-otp with everything
  const registrationData = {
    name:           name.trim(),
    phone:          phone ? country.code + phone : undefined,
    password:       pw,
    referral_code:  sessionStorage.getItem('referral_code') || '',
  }

  // ── OTP step ──────────────────────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <OTPStep
        email={email}
        registrationData={registrationData}
        onSuccess={() => {
          sessionStorage.removeItem('referral_code')
          onRegistered?.()
        }}
        onBack={() => setStep('form')}
      />
    )
  }

  // ── Form step ─────────────────────────────────────────────────────────────
  return (
    <motion.div key="rg" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}>

      {/* Full name */}
      <div style={W}>
        <Label><User size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Full name</Label>
        <FocusInput value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
      </div>

      {/* Email */}
      <div style={W}>
        <Label><Mail size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Email address</Label>
        <FocusInput type="email" value={email} onChange={e => onEmailCh(e.target.value)} onBlur={onEmailBlur}
          placeholder="you@gmail.com" hasError={!!emailErr || emailDup === true} hasOk={emailDup === false && emailValid && !emailErr} />
        {fieldErrors.email
          ? <Hint color={C.red} icon={AlertCircle}>{fieldErrors.email[0]}</Hint>
          : emailErr
            ? <Hint color={C.red} icon={AlertCircle}>{emailErr}</Hint>
            : <DH checking={ckEmail} dup={emailDup} type="email" />}
      </div>

      {/* Phone */}
      <div style={W}>
        <Label><Phone size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Mobile number</Label>
        <PhoneInput value={phone} country={country} countries={countries}
          onValueChange={v => { onPhoneCh(v); setFieldErrors(prev => ({ ...prev, phone: null })) }}
          onCountryChange={handleCountryChange}
          hasError={phoneDup === true || fieldErrors.phone}
          hasOk={phoneComplete && phoneDup === false && !fieldErrors.phone} />
        {fieldErrors.phone
          ? <Hint color={C.red} icon={AlertCircle}>{fieldErrors.phone[0]}</Hint>
          : phone.length > 0 && phone.length < country.digits
            ? <Hint color={C.yellow} icon={AlertCircle}>{country.digits - phone.length} more digit{country.digits - phone.length !== 1 ? 's' : ''} needed</Hint>
            : phoneComplete ? <DH checking={ckPhone} dup={phoneDup} type="mobile number" /> : null}
      </div>

      {/* Password */}
      <div style={W}>
        <Label>Password</Label>
        <PwInput value={pw} onChange={v => { setPw(v); setFieldErrors(prev => ({ ...prev, password: null })) }} placeholder="Min. 8 characters" />
        {fieldErrors.password
          ? <Hint color={C.red} icon={AlertCircle}>{fieldErrors.password[0]}</Hint>
          : pw && !pwOk
            ? <Hint color={C.red} icon={AlertCircle}>Needs uppercase, lowercase, number &amp; special character</Hint>
            : pwOk ? <Hint color={C.green} icon={CheckCircle2}>Strong password</Hint> : null}
      </div>

      {/* Confirm password */}
      <div style={W}>
        <Label>Confirm password</Label>
        <PwInput value={confirm} onChange={v => { setConfirm(v); setFieldErrors(prev => ({ ...prev, confirm_password: null })) }} placeholder="Re-enter password" />
        {fieldErrors.confirm_password
          ? <Hint color={C.red} icon={AlertCircle}>{fieldErrors.confirm_password[0]}</Hint>
          : pwMiss ? <Hint color={C.red} icon={AlertCircle}>Passwords do not match</Hint>
          : pwMatch ? <Hint color={C.green} icon={CheckCircle2}>Passwords match</Hint> : null}
      </div>

      <ErrBox msg={error} />

      <GoldBtn onClick={handle} loading={loading} disabled={!canSubmit}>
        Send Verification Code
      </GoldBtn>

      {/* Small info note */}
      <div style={{ marginTop: 10, fontSize: 11, color: C.dim, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <ShieldCheck size={10} color={C.dim} />
        We'll send a 6-digit code to your email
      </div>
    </motion.div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export default function AuthModal({ isOpen, onClose, defaultTab = 'login', onAuthSuccess }) {
  const [tab,     setTab]     = useState(defaultTab)
  const [success, setSuccess] = useState(false)

  useEffect(() => { if (defaultTab) setTab(defaultTab) }, [defaultTab])
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const switchTab = t => { setTab(t); setSuccess(false) }
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div key="ov"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(1,4,9,0.88)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, fontFamily: "-apple-system,'Segoe UI',sans-serif",
        }}
        onClick={onClose}>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 400,
            background: C.surface, borderRadius: 14,
            border: `1px solid ${C.border}`,
            boxShadow: `0 0 0 1px rgba(212,175,55,0.06), 0 28px 72px rgba(0,0,0,0.65)`,
            overflow: 'hidden',
          }}>

          {/* Header */}
          <div style={{
            padding: '22px 26px 18px',
            background: `linear-gradient(135deg, #1c2128 0%, ${C.surface} 100%)`,
            borderBottom: `1px solid ${C.border}`,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -50, left: '50%', transform: 'translateX(-50%)', width: 200, height: 100, borderRadius: '50%', background: 'rgba(212,175,55,0.08)', filter: 'blur(36px)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: 3, color: '#fff', fontFamily: 'Georgia, serif', lineHeight: 1 }}>
                  <span style={{ color: C.gold }}>JACKPOTS</span>WORLD
                </div>
                <div style={{ fontSize: 10.5, color: C.muted, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 6 }}>
                  {success ? '✦ Registration complete'
                    : tab === 'login' ? '✦ Sign in to your account'
                    : '✦ Create a new account'}
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 7, cursor: 'pointer', padding: '6px 8px', color: C.muted, display: 'flex', lineHeight: 1 }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '22px 26px 20px', overflowY: 'auto', maxHeight: '72vh' }}>
            {!success && (
              <div style={{ display: 'flex', background: C.bg, borderRadius: 9, padding: 3, marginBottom: 20, border: `1px solid ${C.border}` }}>
                {[['login', 'Sign In'], ['register', 'Register']].map(([t, label]) => (
                  <button key={t} onClick={() => switchTab(t)} style={{
                    flex: 1, padding: '8px 0', fontSize: 13, fontWeight: tab === t ? 700 : 500,
                    color: tab === t ? C.text : C.muted,
                    background: tab === t ? `linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))` : 'transparent',
                    border: tab === t ? `1px solid rgba(212,175,55,0.25)` : '1px solid transparent',
                    borderRadius: 7, cursor: 'pointer', transition: 'all 0.18s', letterSpacing: '0.02em',
                  }}>{label}</button>
                ))}
              </div>
            )}

            <AnimatePresence mode="wait">
              {success
                ? <SuccessScreen key="ok" onGoLogin={() => { setSuccess(false); setTab('login') }} />
                : tab === 'login'
                  ? <SignInPanel key="li" onSuccess={onAuthSuccess} onClose={onClose} />
                  : <RegisterPanel key="rg" onRegistered={() => setSuccess(true)} />}
            </AnimatePresence>
          </div>

          {/* Footer */}
          {!success && (
            <div style={{ padding: '12px 26px', background: C.bg, borderTop: `1px solid ${C.border}`, fontSize: 11.5, color: C.muted, textAlign: 'center', lineHeight: 1.7 }}>
              {tab === 'login'
                ? <>New here?{' '}<span style={{ color: C.gold, cursor: 'pointer', fontWeight: 600 }} onClick={() => switchTab('register')}>Create an account</span></>
                : <>Already registered?{' '}<span style={{ color: C.gold, cursor: 'pointer', fontWeight: 600 }} onClick={() => switchTab('login')}>Sign in</span></>}
              <div style={{ marginTop: 4, color: C.dim, fontSize: 11 }}>
                By continuing you agree to our{' '}
                <span style={{ color: C.gold, cursor: 'pointer' }}>Terms</span>{' '}&amp;{' '}
                <span style={{ color: C.gold, cursor: 'pointer' }}>Privacy Policy</span>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
