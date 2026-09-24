import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Zap, Sparkles, Flame, Crown, Layers, MapPin, ShieldCheck, Gift, Globe,
  Star, BadgeCheck, Users, CalendarRange, Radio, ChevronDown, ArrowRight,
  RefreshCw, AlertTriangle, Clock, LogIn, UserPlus, Check,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import Navbar from '../components/Navbar'
import PageHeader from '../components/shared/PageHeader'
import PageScrollButtons from '../components/PageScrollButtons'
import SectionHeroMedia from '../components/shared/SectionHeroMedia'
import HeroBackgroundVideo from '../components/shared/HeroBackgroundVideo'
import HighlightedText from '../components/shared/HighlightedText'
import AuthModal from '../components/AuthModal'
import {
  fetchAndharBaharContent, registerForAndharBaharEvent,
} from '../services/andharBaharService'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { getToken } from '../services/authStorage'
import { scrollToSectionWhenReady } from '../utils/scroll'
import { hasAmount } from '../utils/money'
import GoldLastWord from '../components/shared/GoldLastWord'

/* ─────────────────────────────────────────────────────────────────────────
   Andhar Bahar — the third game destination, alongside Poker and Teen Patti.

   NOTHING ON THIS PAGE IS HARDCODED COPY. Every headline, paragraph, CTA
   label, CTA target, benefit card, how-to-play step, event and FAQ comes from
   GET /api/andhar-bahar/content/ and is edited in Back Office → Andhar Bahar.
   The only strings in this file are structural labels a CMS should not own
   (a "Filter" control, a loading message, an error retry) and the FALLBACK
   block below.

   ── Why there is a fallback at all ────────────────────────────────────────
   The same reasoning the landing FAQ uses. If the API is slow, down, or the
   section has been emptied, a page reached from a live navigation link must
   say something rather than render a blank column. The fallback is
   deliberately thin — the hero copy and nothing else — so an admin who
   genuinely empties a section sees it empty, and only a *failure* shows the
   default. It is never merged with real content: it is used when there is no
   content at all.

   ── Design ────────────────────────────────────────────────────────────────
   Built from the components the Poker and Teen Patti pages already use
   (PageHeader, HeroBackgroundVideo, SectionHeroMedia, casino-card,
   gold-text, section-divider) rather than new ones, so it inherits the
   existing gold/black identity exactly and adds no new design tokens.

   No claim on this page asserts an outcome. The seeded copy describes pace,
   simplicity and venue quality; the model docstring on the backend explains
   why, and the Back Office is where the wording lives if it ever needs to
   change.
   ───────────────────────────────────────────────────────────────────────── */

const SECTION = 'andhar_bahar'

// Admin-editable `icon_name` -> Lucide component. Same string-keyed lookup
// WhyChooseUs and AdminPanel already use; an unknown name falls back rather
// than crashing the page.
const ICON_MAP = {
  Zap, Sparkles, Flame, Crown, Layers, MapPin, ShieldCheck, Gift, Globe,
  Star, BadgeCheck, Users, Clock,
}

// "Talk to a VIP Host" is not a destination — the VIP host is the live-support
// concierge, which the navbar mounts on every page (ChatBot.jsx). This is the
// value an admin puts in the CTA's link field to mean "open it"; goTo() below
// turns it into the same "open-chat" event the Dashboard's Live Support tab
// fires. Spellings an admin might reasonably type are all accepted.
const VIP_HOST_TARGET = '#vip-host'
const VIP_HOST_TARGETS = new Set([VIP_HOST_TARGET, '/#vip-host', 'vip-host'])

// Shown ONLY when the API returned nothing at all. See the note above.
const FALLBACK = {
  hero_eyebrow: 'Card Game Experience',
  hero_title: 'Andhar Bahar',
  hero_subtitle: 'One card. Two sides. A decision in seconds.',
  hero_description:
    'Andhar Bahar is one of the fastest and most approachable card games on an Indian '
    + 'casino floor. We introduce members to the partner venues that run it.',
  hero_cta_primary_label: 'Explore Andhar Bahar',
  hero_cta_primary_link: '#andhar-bahar-events',
  hero_cta_secondary_label: 'Talk to a VIP Host',
  hero_cta_secondary_link: VIP_HOST_TARGET,
  hero_trust_text: 'Verified partner venues · Hosted introductions · Play at the casino, never online',
  signup_prompt:
    'Interested in Andhar Bahar? Sign up to find out where the events are '
    + 'happening and where the tables are live.',
}

const GOLD = '#D4AF37'

// "published" is an admin-set state that has not been date-promoted yet; to a
// visitor it belongs with Upcoming. Same rule the Teen Patti page applies.
const UPCOMING_STATUSES = new Set(['upcoming', 'published'])

function statusOf(ev) {
  // Prefer the date-derived status over the stored column, the way Poker and
  // Teen Patti do: the column is written on a schedule, so between runs an
  // event that has started still carries the status it was saved as. Falls
  // back to the column for an older API build.
  return ev.computed_status || ev.status || ''
}

function formatDateRange(ev) {
  if (!ev.start_date) return ''
  const opts = { day: 'numeric', month: 'short', year: 'numeric' }
  const start = new Date(`${ev.start_date}T00:00:00`)
  const startLabel = start.toLocaleDateString(undefined, opts)
  if (!ev.end_date || ev.end_date === ev.start_date) return startLabel
  const end = new Date(`${ev.end_date}T00:00:00`)
  return `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(undefined, opts)}`
}

// ── Section shell ───────────────────────────────────────────────────────────
function Section({ id, children, className = '' }) {
  return (
    <section id={id} className={`w365-page pb-16 md:pb-20 ${className}`}>
      {children}
    </section>
  )
}

function SectionHeading({ icon: Icon, title, count = null, accent = GOLD }) {
  return (
    <div className="flex items-center gap-3 mb-7">
      {Icon && <Icon size={18} style={{ color: accent }} />}
      <h2 className="section-heading text-xl md:text-2xl tracking-wide">
        <GoldLastWord text={title} />
      </h2>
      {count !== null && (
        <span
          className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest shrink-0"
          style={{ background: `${accent}15`, border: `1px solid ${accent}44`, color: accent }}
        >
          {count}
        </span>
      )}
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${accent}44, transparent)` }} />
    </div>
  )
}

// ── Highlight card ──────────────────────────────────────────────────────────
function HighlightCard({ item, index, reduceMotion }) {
  const Icon = ICON_MAP[item.icon_name] || Sparkles
  const color = item.color || GOLD
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : index * 0.05 }}
      className="casino-card p-6 flex flex-col gap-3 h-full"
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}55` }}
      >
        <Icon size={19} style={{ color }} />
      </div>
      <h3 className="font-body font-bold text-sm text-theme">{item.title}</h3>
      {item.description && (
        <p className="text-theme-muted text-xs font-body leading-relaxed">{item.description}</p>
      )}
    </motion.div>
  )
}

// ── How-to-play step ────────────────────────────────────────────────────────
function StepCard({ step, index, reduceMotion }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : index * 0.06 }}
      className="casino-card p-6 flex flex-col gap-2 h-full relative overflow-hidden"
    >
      <span
        className="gold-text font-black text-3xl leading-none"
        style={{ fontFamily: "'JW Display J', 'Playfair Display', Georgia, 'Times New Roman', serif" }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <h3 className="font-body font-bold text-sm text-theme mt-1">{step.title}</h3>
      {step.description && (
        <p className="text-theme-muted text-xs font-body leading-relaxed">{step.description}</p>
      )}
    </motion.div>
  )
}

// ── Event card ──────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  live: { label: 'Live Now', color: '#34d399' },
  upcoming: { label: 'Upcoming', color: GOLD },
  published: { label: 'Upcoming', color: GOLD },
  completed: { label: 'Completed', color: 'rgba(255,255,255,0.45)' },
}

function EventCard({ ev, index, reduceMotion, isLoggedIn, onRegister, registering }) {
  const status = statusOf(ev)
  const style = STATUS_STYLE[status] || STATUS_STYLE.upcoming
  const dates = formatDateRange(ev)
  const venue = ev.casino_name || ev.venue || ''
  const place = [ev.city, ev.country].filter(Boolean).join(', ')

  return (
    <motion.article
      initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : index * 0.05 }}
      className="casino-card overflow-hidden flex flex-col h-full"
    >
      {ev.image && (
        <div className="relative w-full" style={{ aspectRatio: '16 / 9', overflow: 'hidden' }}>
          <img
            src={ev.image}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(10,0,5,0.85), transparent 60%)' }}
          />
        </div>
      )}

      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase"
            style={{ background: `${style.color}18`, border: `1px solid ${style.color}55`, color: style.color }}
          >
            {status === 'live' && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse align-middle"
                style={{ background: style.color }}
              />
            )}
            {style.label}
          </span>
          {ev.is_featured && (
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase"
              style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}55`, color: GOLD }}
            >
              Featured
            </span>
          )}
          {ev.event_type && (
            <span className="text-[10px] tracking-widest uppercase text-theme-muted">{ev.event_type}</span>
          )}
        </div>

        <h3 className="font-body font-bold text-base text-theme leading-snug">{ev.name}</h3>

        {ev.short_description && (
          <p className="text-theme-muted text-xs font-body leading-relaxed">{ev.short_description}</p>
        )}

        <div className="mt-auto pt-3 flex flex-col gap-1.5 text-xs font-body">
          {venue && (
            <div className="flex items-center gap-2 text-theme-muted">
              <MapPin size={12} style={{ color: GOLD }} className="shrink-0" />
              <span className="truncate">{venue}{place ? ` · ${place}` : ''}</span>
            </div>
          )}
          {!venue && place && (
            <div className="flex items-center gap-2 text-theme-muted">
              <MapPin size={12} style={{ color: GOLD }} className="shrink-0" />
              <span className="truncate">{place}</span>
            </div>
          )}
          {dates && (
            <div className="flex items-center gap-2 text-theme-muted">
              <CalendarRange size={12} style={{ color: GOLD }} className="shrink-0" />
              <span>{dates}</span>
            </div>
          )}
          {/* Only rendered when a venue has actually published a minimum —
              a blank one shows nothing rather than a guessed zero. */}
          {hasAmount(ev.min_buy_in) && (
            <div className="flex items-center gap-2 text-theme-muted">
              <Layers size={12} style={{ color: GOLD }} className="shrink-0" />
              <span>From {ev.currency || ''} {Number(ev.min_buy_in).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* ── Register ──
            Interest capture, not a booking: there is no seat to hold, so this
            tells a VIP host to get in touch. A finished event offers nothing —
            registering for it would only produce a call nobody wants. */}
        {status !== 'completed' && (
          <div className="pt-4">
            {ev.is_registered ? (
              <div
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase"
                style={{ background: '#34d39918', border: '1px solid #34d39955', color: '#34d399' }}
              >
                <Check size={14} /> Registered
              </div>
            ) : (
              <button
                onClick={() => onRegister(ev)}
                disabled={registering}
                className="btn-gold w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase"
                style={{ opacity: registering ? 0.6 : 1, cursor: registering ? 'wait' : 'pointer' }}
              >
                {registering
                  ? 'Registering…'
                  : isLoggedIn ? <>Register Interest <ArrowRight size={13} /></>
                  : <><UserPlus size={13} /> Sign Up To Register</>}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.article>
  )
}

// ── FAQ ─────────────────────────────────────────────────────────────────────
function FaqRow({ item, open, onToggle, reduceMotion }) {
  const panelId = `ab-faq-panel-${item.id}`
  const buttonId = `ab-faq-button-${item.id}`
  return (
    <div style={{ borderBottom: '1px solid rgba(212,175,55,0.14)' }}>
      <button
        id={buttonId}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '18px 4px', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 14,
          fontFamily: "'JW Display J', 'Playfair Display', Georgia, 'Times New Roman', serif",
          color: 'var(--w365-text)',
          fontSize: 'clamp(13px,2.3vw,15px)', fontWeight: 700, lineHeight: 1.4,
        }}
      >
        <span style={{ flex: 1 }}>{item.question}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.25 }}
          style={{ display: 'inline-flex', flexShrink: 0, color: 'rgba(212,175,55,0.8)' }}
        >
          <ChevronDown size={18} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ overflow: 'hidden' }}
          >
            <p style={{
              margin: '0 0 20px', padding: '0 4px',
              fontSize: 'clamp(12px,2.1vw,13.5px)', lineHeight: 1.75,
              color: 'rgba(var(--w365-text-rgb),0.76)', maxWidth: 760,
            }}>
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function AndharBahar() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [openFaq, setOpenFaq] = useState(0)
  const [heroRatio, setHeroRatio] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState('register')
  const [registeringId, setRegisteringId] = useState(null)
  const [notice, setNotice] = useState(null)
  const isLoggedIn = !!getToken('access')

  const { data, loading, error, reload } = useAutoFetch(
    fetchAndharBaharContent, {}, { intervalMs: 120_000 },
  )

  const content = data?.content || null
  const copy = content || FALLBACK
  const isPublished = data ? data.is_published !== false : true

  const highlights = useMemo(() => data?.highlights || [], [data])
  const steps = useMemo(() => data?.steps || [], [data])
  const events = useMemo(() => data?.events || [], [data])
  const faqs = useMemo(() => data?.faqs || [], [data])
  const backgroundMedia = data?.media?.background || null

  const { live, upcoming, past } = useMemo(() => {
    const buckets = { live: [], upcoming: [], past: [] }
    events.forEach(ev => {
      const s = statusOf(ev)
      if (s === 'live') buckets.live.push(ev)
      else if (UPCOMING_STATUSES.has(s)) buckets.upcoming.push(ev)
      else buckets.past.push(ev)
    })
    return buckets
  }, [events])

  // A CTA target may be an in-page anchor ("#andhar-bahar-events"), an
  // internal route ("/poker"), a route with a section on it ("/#contact"), or
  // an external URL — all four are legitimate things for an admin to type, so
  // all four are handled rather than assuming one.
  const goTo = (target) => {
    const href = (target || '').trim()
    if (!href) return
    // The concierge is already on this page, so reaching a VIP host is not a
    // navigation at all — sending the visitor to another route to find one is
    // what made this CTA feel broken. ChatBot listens for "open-chat" from
    // anywhere in the app; the Dashboard's Live Support tab opens it the same
    // way.
    if (VIP_HOST_TARGETS.has(href.toLowerCase())) {
      window.dispatchEvent(new CustomEvent('open-chat'))
      return
    }
    if (href.startsWith('#')) {
      const el = document.querySelector(href)
      if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      return
    }
    if (/^https?:\/\//i.test(href)) {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    // "/#contact" is a route AND a position on it. React Router applies only
    // the route, and ScrollToTop deliberately stands down whenever a hash is
    // present (a hash means "somewhere other than the top") — so without this
    // the hash half was silently dropped and the visitor landed at the top of
    // the destination, which read as the CTA just bouncing them home. The
    // footer "Talk to a VIP Host" points at is rendered by the landing page
    // alone, which is why this CTA has to leave the page at all.
    const hashAt = href.indexOf('#')
    if (hashAt > 0) {
      const section = href.slice(hashAt + 1)
      navigate(href)
      // Retries while the destination mounts and measures against the fixed
      // navbar, so the section's first line isn't left under it. It runs on a
      // timer rather than in an effect, so this page unmounting mid-navigation
      // doesn't cancel it — the same helper the navbar's cross-page links use.
      if (section) scrollToSectionWhenReady(section)
      return
    }
    navigate(href)
  }

  const hasAnyContent = highlights.length || steps.length || events.length || faqs.length

  const openAuth = (tab) => { setAuthTab(tab); setAuthOpen(true) }

  /**
   * Register interest in one event.
   *
   * A signed-out visitor gets the auth modal rather than a failed request —
   * the endpoint is IsAuthenticated, so posting first would just produce a 401
   * and a confusing error for someone who has done nothing wrong.
   *
   * On success the whole page is reloaded rather than the card patched
   * locally: `is_registered` lives on the event payload, and one refetch keeps
   * the card, the events list and anything else reading that payload in step,
   * instead of one component holding a truth the others do not have.
   */
  const handleRegister = async (ev) => {
    if (!isLoggedIn) { openAuth('register'); return }
    if (registeringId) return
    setRegisteringId(ev.id)
    setNotice(null)
    try {
      const res = await registerForAndharBaharEvent(ev.id)
      setNotice({ ok: res.ok, message: res.message })
      if (res.ok) reload()
    } catch {
      setNotice({ ok: false, message: 'Could not register just now. Please try again.' })
    }
    setRegisteringId(null)
  }

  return (
    <div key={theme} className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab={authTab}
        // Stays on the page rather than redirecting: the visitor opened this
        // to register for an event that is still on screen behind it.
        onAuthSuccess={() => { setAuthOpen(false); reload() }}
      />

      <main>
        <PageHeader
          eyebrow={copy.hero_eyebrow}
          title={copy.hero_title}
          subtitle={copy.hero_subtitle}
          backgroundRatio={heroRatio}
          background={
            backgroundMedia
              ? <HeroBackgroundVideo item={backgroundMedia} onNaturalSize={setHeroRatio} />
              : null
          }
          belowTitle={
            <div className="mx-auto mt-6" style={{ width: 'min(100%, 720px)' }}>
              <SectionHeroMedia
                section={SECTION}
                badgeLabel={copy.hero_title}
                marginBottom={0}
              />
            </div>
          }
        />

        {/* ── Hero copy + CTAs ── */}
        <Section className="pt-2">
          <div className="max-w-3xl mx-auto text-center flex flex-col items-center gap-6">
            {copy.hero_description && (
              <p className="text-theme-muted font-body text-sm md:text-base leading-relaxed">
                <HighlightedText text={copy.hero_description} />
              </p>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {copy.hero_cta_primary_label && (
                <motion.button
                  whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                  onClick={() => goTo(copy.hero_cta_primary_link)}
                  className="btn-gold flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold tracking-widest uppercase"
                >
                  {copy.hero_cta_primary_label} <ArrowRight size={15} />
                </motion.button>
              )}
              {copy.hero_cta_secondary_label && (
                <motion.button
                  whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                  onClick={() => goTo(copy.hero_cta_secondary_link)}
                  className="btn-outline-gold flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold tracking-widest uppercase"
                >
                  {copy.hero_cta_secondary_label}
                </motion.button>
              )}
            </div>

            {copy.hero_trust_text && (
              <p className="text-theme-muted font-body text-[11px] md:text-xs tracking-wide opacity-80">
                {copy.hero_trust_text}
              </p>
            )}

            {/* The sign-up ask, for a signed-out visitor only. Wording comes
                from Back Office (`signup_prompt`), like everything else on
                this page. The buttons go to the section's OWN auth routes so
                the visitor is told what they are signing up for and lands back
                here afterwards — see pages/AndharBaharAuth.jsx. */}
            {!isLoggedIn && (
              <div className="casino-card w-full max-w-2xl flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 mt-2">
                <p className="text-theme-muted text-sm font-body text-center sm:text-left">
                  {copy.signup_prompt || FALLBACK.signup_prompt}
                </p>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => navigate('/andhar-bahar/sign-in')}
                    className="btn-outline-gold flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase"
                  >
                    <LogIn size={13} /> Sign In
                  </button>
                  <button
                    onClick={() => navigate('/andhar-bahar/sign-up')}
                    className="btn-gold flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase"
                  >
                    <UserPlus size={13} /> Sign Up
                  </button>
                </div>
              </div>
            )}

            {/* Result of the last registration attempt. Cleared on the next
                one, so it never accumulates. */}
            {notice && (
              <div
                role="status"
                aria-live="polite"
                className="w-full max-w-2xl px-5 py-3 rounded-xl text-sm font-body"
                style={{
                  background: notice.ok ? '#34d39914' : 'rgba(248,113,113,0.10)',
                  border: `1px solid ${notice.ok ? '#34d39944' : 'rgba(248,113,113,0.35)'}`,
                  color: notice.ok ? '#34d399' : '#f87171',
                }}
              >
                {notice.message}
              </div>
            )}
          </div>
        </Section>

        {/* Loading and failure states. `loading` alone is not enough: the
            auto-refresh keeps `data` while it re-fetches, so this only shows
            on the genuinely empty first paint. */}
        {loading && !data && (
          <Section>
            <div className="flex items-center justify-center gap-3 py-16 text-theme-muted font-body text-sm">
              <RefreshCw size={16} className="animate-spin" style={{ color: GOLD }} />
              Loading Andhar Bahar…
            </div>
          </Section>
        )}

        {error && !data && (
          <Section>
            <div className="casino-card p-8 flex flex-col items-center gap-4 text-center">
              <AlertTriangle size={22} style={{ color: GOLD }} />
              <p className="text-theme-muted font-body text-sm">
                We could not load this page just now.
              </p>
              <button
                onClick={reload}
                className="btn-outline-gold px-6 py-2 rounded-full text-xs font-bold tracking-widest uppercase"
              >
                Try again
              </button>
            </div>
          </Section>
        )}

        {/* The page's own master switch, set in Back Office. A route that was
            live yesterday explains itself rather than 404ing. */}
        {data && !isPublished && (
          <Section>
            <div className="casino-card p-10 text-center">
              <p className="text-theme-muted font-body text-sm">
                This section is not available right now. Please check back soon.
              </p>
            </div>
          </Section>
        )}

        {isPublished && (
          <>
            {/* ── Game introduction ── */}
            {content?.intro_body && (
              <Section id="andhar-bahar-intro">
                <div className="max-w-3xl mx-auto">
                  <SectionHeading icon={Sparkles} title={content.intro_title} />
                  <p className="text-theme-muted font-body text-sm md:text-base leading-relaxed">
                    <HighlightedText text={content.intro_body} />
                  </p>
                </div>
              </Section>
            )}

            {/* ── How a round works ── */}
            {steps.length > 0 && (
              <Section id="andhar-bahar-how-to-play">
                <SectionHeading icon={Layers} title={content?.how_to_play_title || 'How A Round Works'} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {steps.map((step, i) => (
                    <StepCard key={step.id} step={step} index={i} reduceMotion={reduceMotion} />
                  ))}
                </div>
                {content?.how_to_play_note && (
                  <p className="text-theme-muted font-body text-xs mt-6 opacity-80 max-w-3xl">
                    {content.how_to_play_note}
                  </p>
                )}
              </Section>
            )}

            {/* ── Highlights ── */}
            {highlights.length > 0 && (
              <Section id="andhar-bahar-highlights">
                <SectionHeading icon={Crown} title={content?.highlights_title || 'Why Players Enjoy It'} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {highlights.map((item, i) => (
                    <HighlightCard key={item.id} item={item} index={i} reduceMotion={reduceMotion} />
                  ))}
                </div>
              </Section>
            )}

            {/* ── Events / destinations ── */}
            <Section id="andhar-bahar-events">
              <SectionHeading
                icon={CalendarRange}
                title={content?.events_title || 'Andhar Bahar Destinations & Events'}
                count={events.length}
              />
              {content?.events_subtitle && (
                <p className="text-theme-muted font-body text-sm mb-8 max-w-3xl -mt-3">
                  {content.events_subtitle}
                </p>
              )}

              {events.length === 0 ? (
                <div className="casino-card p-10 text-center">
                  <p className="text-theme-muted font-body text-sm">
                    No Andhar Bahar dates are published right now. Speak to your VIP host about
                    the venues currently running tables.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-12">
                  {live.length > 0 && (
                    <div>
                      <SectionHeading icon={Radio} title="Live Now" count={live.length} accent="#34d399" />
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {live.map((ev, i) => (
                          <EventCard
                            key={ev.id} ev={ev} index={i} reduceMotion={reduceMotion}
                            isLoggedIn={isLoggedIn}
                            onRegister={handleRegister}
                            registering={registeringId === ev.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {upcoming.length > 0 && (
                    <div>
                      <SectionHeading icon={CalendarRange} title="Upcoming" count={upcoming.length} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {upcoming.map((ev, i) => (
                          <EventCard
                            key={ev.id} ev={ev} index={i} reduceMotion={reduceMotion}
                            isLoggedIn={isLoggedIn}
                            onRegister={handleRegister}
                            registering={registeringId === ev.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {past.length > 0 && (
                    <div>
                      <SectionHeading
                        icon={Clock} title="Completed" count={past.length}
                        accent="rgba(212,175,55,0.55)"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {past.map((ev, i) => (
                          <EventCard
                            key={ev.id} ev={ev} index={i} reduceMotion={reduceMotion}
                            isLoggedIn={isLoggedIn}
                            onRegister={handleRegister}
                            registering={registeringId === ev.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* ── FAQ ── */}
            {faqs.length > 0 && (
              <Section id="andhar-bahar-faq">
                <div className="max-w-3xl mx-auto">
                  <SectionHeading icon={ShieldCheck} title="Frequently Asked Questions" />
                  <div style={{ borderTop: '1px solid rgba(212,175,55,0.14)' }}>
                    {faqs.map((item, i) => (
                      <FaqRow
                        key={item.id}
                        item={item}
                        open={openFaq === i}
                        onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
                        reduceMotion={reduceMotion}
                      />
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {/* ── Closing CTA. Reuses the hero's own admin-set labels rather
                   than a second pair of fields nobody would remember to keep
                   in step. ── */}
            {Boolean(hasAnyContent) && copy.hero_cta_secondary_label && (
              <Section className="text-center">
                <div className="section-divider max-w-xs mx-auto mb-8" />
                <h2 className="section-heading text-xl md:text-2xl mb-3 tracking-wide">
                  <GoldLastWord text={copy.hero_title} />
                </h2>
                <p className="text-theme-muted font-body text-sm mb-8 max-w-xl mx-auto">
                  {copy.hero_subtitle}
                </p>
                <motion.button
                  whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                  onClick={() => goTo(copy.hero_cta_secondary_link)}
                  className="btn-gold inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold tracking-widest uppercase"
                >
                  {copy.hero_cta_secondary_label} <ArrowRight size={15} />
                </motion.button>
              </Section>
            )}
          </>
        )}
      </main>

      <PageScrollButtons />
    </div>
  )
}
