import React, { memo } from 'react'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import {
  ShieldCheck, Zap, Gift, Globe, HeadphonesIcon,
  PlaneTakeoff, Crown, BarChart3,
  CheckCircle, Lock, BadgeCheck, MapPin, Star,
} from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchWhyChooseUsFeatures } from '../services/landingService'

// Maps the admin-editable `icon_name` string to its Lucide component —
// same string-keyed lookup pattern already used by AdminPanel.jsx's ICON_MAP.
const ICON_MAP = {
  ShieldCheck, Zap, Gift, Globe, HeadphonesIcon,
  PlaneTakeoff, Crown, BarChart3, CheckCircle, Lock, BadgeCheck, MapPin, Star,
}

const FALLBACK_FEATURES = [
  { color: '#34d399', icon_name: 'ShieldCheck', title: 'Secure & Licensed', description: 'All casino partners are fully licensed and regulated. Your safety and privacy are our top priority.' },
  { color: '#fbbf24', icon_name: 'Zap', title: 'Seamless Buying', description: 'Deposit and withdraw seamlessly across all types of currencies at casinos.' },
  { color: '#f472b6', icon_name: 'Gift', title: 'Exclusive VIP Privilege', description: 'Special welcome bonuses, reload offers, and cashback deals available only on Jackpots World.' },
  { color: '#60a5fa', icon_name: 'Globe', title: '15+ Countries Access', description: 'One registration unlocks casino opportunities in Vietnam, Macau, India, Sri Lanka, Philippines and more.' },
  { color: '#a78bfa', icon_name: 'HeadphonesIcon', title: '24/7 Live Support', description: 'Our multilingual support team is available round the clock via WhatsApp, chat, and call.' },
  { color: '#22d3ee', icon_name: 'PlaneTakeoff', title: 'Full Trip Packages', description: 'We handle flights, hotels, transfers, and casino entry. Hassle-free from home to high-stakes table.' },
  { color: '#D4AF37', icon_name: 'Crown', title: 'Every Booking to Every Bet', description: 'Earn loyalty points on every booking. Unlock exclusive perks, private rooms, and concierge service.' },
  { color: '#fb923c', icon_name: 'BarChart3', title: 'Smart Tools to Track Your Betting Sessions', description: 'Smart tools to track your sessions, analyse your results, and optimise your gaming strategy.' },
]

const FeatureCard = memo(({ Icon, color, bg, border, title, desc }) => (
  <div
    style={{
      background: 'rgba(var(--w365-text-rgb),0.03)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      border: `1px solid rgba(var(--w365-text-rgb),0.07)`,
      borderRadius: 16,
      padding: '24px 22px',
      cursor: 'default',
      transition: 'transform 0.22s ease, border-color 0.22s ease, background 0.22s ease',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-5px)'
      e.currentTarget.style.borderColor = border
      e.currentTarget.style.background = bg
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = ''
      e.currentTarget.style.borderColor = 'rgba(var(--w365-text-rgb),0.07)'
      e.currentTarget.style.background = 'rgba(var(--w365-text-rgb),0.02)'
    }}
  >
    {/* Icon badge */}
    <div style={{
      width: 48, height: 48, borderRadius: 12, flexShrink: 0,
      background: bg,
      border: `1px solid ${border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={22} color={color} strokeWidth={1.8} />
    </div>

    {/* Text */}
    <div>
      <div style={{
        fontSize: '0.95rem', fontWeight: 700,
        color: 'rgba(var(--w365-text-rgb),0.92)',
        marginBottom: 7, letterSpacing: '-0.01em',
      }}>
        {title}
      </div>
      <p style={{
        fontSize: '0.8rem', color: 'rgba(var(--w365-text-rgb),0.45)',
        lineHeight: 1.7, margin: 0,
      }}>
        {desc}
      </p>
    </div>

    {/* Bottom accent line */}
    <div style={{
      marginTop: 'auto',
      height: 2, borderRadius: 2,
      background: `linear-gradient(90deg, ${color}40, transparent)`,
    }} />
  </div>
))

export default function WhyChooseUs() {
  const { ref, inView } = useInView({ threshold: 0.08, triggerOnce: true })

  const { data: featuresData } = useAutoFetch(fetchWhyChooseUsFeatures, {}, { intervalMs: 60_000 })

  const features = (Array.isArray(featuresData) && featuresData.length > 0 ? featuresData : FALLBACK_FEATURES).map(f => ({
    Icon: ICON_MAP[f.icon_name] || ShieldCheck,
    color: f.color,
    bg: `${f.color}14`,
    border: `${f.color}2e`,
    title: f.title,
    desc: f.description,
  }))

  return (
    <section
      id="why"
      ref={ref}
      style={{
        position: 'relative',
        padding: 'clamp(56px,12vw,96px) clamp(14px,4vw,24px)',
      }}
    >
      {/* Subtle bg glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 80% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)',
      }} />

      <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: 'clamp(36px,8vw,64px)' }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: '1px solid rgba(212,175,55,0.3)', borderRadius: 50,
            padding: '5px 18px', marginBottom: 14,
            fontSize: 'clamp(0.6rem,2.5vw,0.72rem)',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'rgba(212,175,55,0.7)',
          }}>
            <Zap size={11} color="rgba(212,175,55,0.7)" />
            Our Advantages
          </div>
          <h2 className="font-bold gold-text" style={{
            fontSize: 'clamp(1.8rem,7vw,3.2rem)',
            fontWeight: 900, marginBottom: 12, lineHeight: 1.1,
          }}>
            WHY Jackpots World?
          </h2>
          <p className="font-body font-light" style={{
            fontSize: 'clamp(0.85rem,3.2vw,1.05rem)',
            color: 'rgba(var(--w365-text-rgb),0.5)',
            maxWidth: 480, margin: '0 auto', lineHeight: 1.6,
          }}>
            We don't just book casino trips — we craft legendary experiences.
          </p>
        </motion.div>

        {/* ── Feature Grid ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.15 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
            gap: 14,
          }}
        >
          {features.map((f, i) => <FeatureCard key={i} {...f} />)}
        </motion.div>

      </div>
    </section>
  )
}