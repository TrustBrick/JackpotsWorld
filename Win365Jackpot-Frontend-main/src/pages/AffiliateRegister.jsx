import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Mail, Phone, Key, AlertCircle, CheckCircle2, ShieldCheck,
  Loader2, RotateCcw, LogIn,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import {
  C, W, Label, Hint, ErrBox, GoldBtn, FocusInput, PwInput, PhoneInput,
  DEFAULT_COUNTRY, DIGIT_MAP, apiFetch, validateEmail, ApiError,
} from '../components/AuthModal'

const API = import.meta.env.VITE_API_URL

// ─── OTP step ─────────────────────────────────────────────────────────────────
function OTPStep({ email, registrationData, onVerified, onBack }) {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(600)
  const [canResend, setCanResend] = useState(false)
  const inputRefs = useRef([])

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const formatTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const handleOtpChange = (idx, val) => {
    if (val.length > 1) {
      const digits = val.replace(/\D/g, '').slice(0, 6).split('')
      const newOtp = [...otp]
      digits.forEach((d, i) => { if (idx + i < 6) newOtp[idx + i] = d })
      setOtp(newOtp)
      inputRefs.current[Math.min(idx + digits.length, 5)]?.focus()
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
      const json = await apiFetch('/api/auth/verify-otp/', {
        method: 'POST',
        body: JSON.stringify({ email, otp: otpValue, mode: 'register', ...registrationData }),
      })
      onVerified(json)
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
      await apiFetch('/api/auth/send-otp/', { method: 'POST', body: JSON.stringify({ email, mode: 'register' }) })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setResending(false)
      inputRefs.current[0]?.focus()
    }
  }

  return (
    <motion.div key="otp" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(212,175,55,0.08)', border: '2px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <ShieldCheck size={24} color={C.gold} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 6 }}>Verify your email</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          We sent a 6-digit code to<br /><span style={{ color: C.gold, fontWeight: 600 }}>{email}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        {countdown > 0
          ? <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>
              Expires in <span style={{ color: countdown < 60 ? C.red : C.yellow, fontWeight: 700 }}>{formatTime(countdown)}</span>
            </span>
          : <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>Code expired — please resend</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 18 }}>
        {otp.map((digit, idx) => (
          <input
            key={idx}
            ref={el => inputRefs.current[idx] = el}
            type="tel" inputMode="numeric" maxLength={6}
            value={digit}
            onChange={e => handleOtpChange(idx, e.target.value)}
            onKeyDown={e => handleKeyDown(idx, e)}
            onFocus={e => e.target.select()}
            style={{
              width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 900,
              color: digit ? C.text : C.dim, background: C.bg,
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
        Verify &amp; Submit Application
      </GoldBtn>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontFamily: 'inherit' }}>
          ← Edit details
        </button>
        <button type="button" onClick={handleResend} disabled={!canResend || resending} style={{ background: 'none', border: 'none', cursor: canResend ? 'pointer' : 'not-allowed', fontSize: 11, color: canResend ? C.gold : C.dim, display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontFamily: 'inherit', fontWeight: canResend ? 600 : 400 }}>
          {resending ? <><Loader2 size={10} style={{ animation: 'spin 0.8s linear infinite' }} /> Resending…</> : <><RotateCcw size={10} /> Resend OTP</>}
        </button>
      </div>
    </motion.div>
  )
}

// ─── Success screen ───────────────────────────────────────────────────────────
function SuccessScreen({ onGoLogin }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '4px 0' }}>
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.1 }}
        style={{ width: 58, height: 58, borderRadius: '50%', background: C.greenBg, border: `2px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
        <CheckCircle2 size={28} color={C.green} />
      </motion.div>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 8 }}>Application Submitted!</div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, marginBottom: 26 }}>
        Your affiliate account has been created and your application is<br />
        under review. You'll be able to sign in once it's approved.
      </div>
      <GoldBtn onClick={onGoLogin} loading={false} disabled={false}>
        <LogIn size={13} /> Go to Affiliate Login
      </GoldBtn>
    </motion.div>
  )
}

// ─── Registration form ─────────────────────────────────────────────────────────
function RegisterForm({ onSubmitted }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailErr, setEmailErr] = useState('')
  const [phone, setPhone] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countries, setCountries] = useState([])
  const [country, setCountry] = useState(DEFAULT_COUNTRY)
  const [step, setStep] = useState('form') // 'form' | 'otp'

  useEffect(() => {
    fetch(`${API || ''}/api/auth/countries/`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        const mapped = data
          .map(c => ({ code: c.dial_code, iso2: c.code, flag: c.flag, name: c.name, digits: DIGIT_MAP[c.dial_code] || 10, placeholder: '0'.repeat(DIGIT_MAP[c.dial_code] || 10), format: v => v }))
          .filter(c => c.code && c.code !== '+')
        setCountries(mapped)
        const india = mapped.find(c => c.code === '+91')
        if (india) setCountry(india)
      })
      .catch(() => {})
  }, [])

  const emailValid = validateEmail(email).ok
  const phoneComplete = phone.length === country.digits
  const pwErrors = []
  if (pw.length < 8) pwErrors.push('8 characters')
  if (!/[A-Z]/.test(pw)) pwErrors.push('uppercase')
  if (!/[a-z]/.test(pw)) pwErrors.push('lowercase')
  if (!/[0-9]/.test(pw)) pwErrors.push('number')
  if (!/[!@#$%^&*]/.test(pw)) pwErrors.push('special character')
  const pwOk = pwErrors.length === 0
  const pwMatch = confirm && pw === confirm
  const pwMiss = confirm && pw !== confirm

  const canSubmit = name.trim() && emailValid && phoneComplete && pwOk && pwMatch

  const handle = async () => {
    if (!name.trim()) { setError('Full name is required'); return }
    const { ok: eok, error: eErr } = validateEmail(email)
    if (!eok) { setEmailErr(eErr); return }
    if (!phoneComplete) { setError(`Enter exactly ${country.digits} digits for ${country.name}`); return }
    if (!pwOk) { setError('Password does not meet requirements'); return }
    if (!pwMatch) { setError('Passwords do not match'); return }
    setError(''); setLoading(true)
    try {
      await apiFetch('/api/auth/send-otp/', { method: 'POST', body: JSON.stringify({ email, mode: 'register' }) })
      setStep('otp')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const registrationData = {
    name: name.trim(),
    phone: country.code + phone,
    country: country.iso2 || 'IN',
    dial_code: country.code,
    password: pw,
  }

  const handleVerified = async (verifyJson) => {
    const access = verifyJson?.tokens?.access
    if (access) {
      localStorage.setItem('access', access)
      localStorage.setItem('refresh', verifyJson.tokens.refresh)
      if (verifyJson.user) localStorage.setItem('user', JSON.stringify(verifyJson.user))
      // apiFetch (shared with AuthModal) never attaches a bearer token — this
      // endpoint requires one, so call it directly with the fresh token.
      try {
        await fetch(`${API || ''}/api/affiliate/apply/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
          body: JSON.stringify({}),
        })
      } catch { /* application still succeeds visually; admin can grant manually if this failed */ }
    }
    onSubmitted()
  }

  if (step === 'otp') {
    return <OTPStep email={email} registrationData={registrationData} onVerified={handleVerified} onBack={() => setStep('form')} />
  }

  return (
    <motion.div key="form" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}>
      <div style={W}>
        <Label><User size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Full name</Label>
        <FocusInput value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
      </div>

      <div style={W}>
        <Label><Mail size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Email address</Label>
        <FocusInput type="email" value={email} onChange={e => { setEmail(e.target.value.trim()); setEmailErr('') }}
          placeholder="you@gmail.com" hasError={!!emailErr} hasOk={emailValid && !emailErr}
          onBlur={() => setEmailErr(validateEmail(email).error || '')} />
        {emailErr && <Hint color={C.red} icon={AlertCircle}>{emailErr}</Hint>}
      </div>

      <div style={W}>
        <Label><Phone size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Mobile number</Label>
        <PhoneInput value={phone} country={country} countries={countries}
          onValueChange={setPhone} onCountryChange={c => { setCountry(c); setPhone('') }}
          hasOk={phoneComplete} />
        {phone.length > 0 && phone.length < country.digits && (
          <Hint color={C.yellow} icon={AlertCircle}>{country.digits - phone.length} more digit{country.digits - phone.length !== 1 ? 's' : ''} needed</Hint>
        )}
      </div>

      <div style={W}>
        <Label><Key size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />Password</Label>
        <PwInput value={pw} onChange={setPw} placeholder="Min. 8 characters" />
        {pw && !pwOk
          ? <Hint color={C.red} icon={AlertCircle}>Needs uppercase, lowercase, number &amp; special character</Hint>
          : pwOk ? <Hint color={C.green} icon={CheckCircle2}>Strong password</Hint> : null}
      </div>

      <div style={W}>
        <Label>Confirm password</Label>
        <PwInput value={confirm} onChange={setConfirm} placeholder="Re-enter password" />
        {pwMiss ? <Hint color={C.red} icon={AlertCircle}>Passwords do not match</Hint>
          : pwMatch ? <Hint color={C.green} icon={CheckCircle2}>Passwords match</Hint> : null}
      </div>

      <ErrBox msg={error} />

      <GoldBtn onClick={handle} loading={loading} disabled={!canSubmit}>
        Send Verification Code
      </GoldBtn>

      <div style={{ marginTop: 10, fontSize: 11, color: C.dim, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <ShieldCheck size={10} color={C.dim} />
        We'll send a 6-digit code to your email
      </div>
    </motion.div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AffiliateRegister() {
  const navigate = useNavigate()
  const [success, setSuccess] = useState(false)

  return (
    <div className="min-h-screen" style={{ background: '#0A0005' }}>
      <Navbar />

      <PageHeader
        eyebrow="Partner With Us"
        title="Become an Affiliate"
        subtitle="Apply in minutes — verify your email with a one-time code and our team will review your application."
      />

      <section className="max-w-md mx-auto px-4 pb-24">
        <div style={{
          background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
          boxShadow: '0 0 0 1px rgba(212,175,55,0.06), 0 28px 72px rgba(0,0,0,0.45)',
          padding: '26px 26px 22px', fontFamily: "-apple-system,'Segoe UI',sans-serif",
        }}>
          <AnimatePresence mode="wait">
            {success
              ? <SuccessScreen key="ok" onGoLogin={() => navigate('/affiliate-login')} />
              : <RegisterForm key="form" onSubmitted={() => setSuccess(true)} />}
          </AnimatePresence>
        </div>

        {!success && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
            Already an approved affiliate?{' '}
            <span style={{ color: C.gold, cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/affiliate-login')}>
              Sign in
            </span>
          </div>
        )}
      </section>
    </div>
  )
}
