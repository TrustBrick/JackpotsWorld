import React, { memo } from 'react'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import {
  ShieldCheck, Zap, Gift, Globe, HeadphonesIcon,
  PlaneTakeoff, Crown, BarChart3,
  CheckCircle, Lock, BadgeCheck, MapPin, Star,
} from 'lucide-react'

const features = [
  {
    Icon: ShieldCheck,
    color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.18)',
    title: 'Secure & Licensed',
    desc: 'All casino partners are fully licensed and regulated. Your safety and privacy are our top priority.',
  },
  {
    Icon: Zap,
    color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.18)',
    title: 'Instant Payments',
    desc: 'Deposit and withdraw seamlessly across all types of currencies at casinos.',
  },
  {
    Icon: Gift,
    color: '#f472b6', bg: 'rgba(244,114,182,0.08)', border: 'rgba(244,114,182,0.18)',
    title: 'Exclusive Bonuses',
    desc: 'Special welcome bonuses, reload offers, and cashback deals available only on Jackpots World.',
  },
  {
    Icon: Globe,
    color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.18)',
    title: '10+ Country Access',
    desc: 'One registration unlocks casino opportunities in Vietnam, Macau, India, Sri Lanka, Philippines and more.',
  },
  {
    Icon: HeadphonesIcon,
    color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.18)',
    title: '24/7 Live Support',
    desc: 'Our multilingual support team is available round the clock via WhatsApp, chat, and call.',
  },
  {
    Icon: PlaneTakeoff,
    color: '#22d3ee', bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.18)',
    title: 'Full Trip Packages',
    desc: 'We handle flights, hotels, transfers, and casino entry. Hassle-free from home to high-stakes table.',
  },
  {
    Icon: Crown,
    color: '#D4AF37', bg: 'rgba(212,175,55,0.08)', border: 'rgba(212,175,55,0.18)',
    title: 'VIP Membership',
    desc: 'Earn loyalty points on every booking. Unlock exclusive perks, private rooms, and concierge service.',
  },
  {
    Icon: BarChart3,
    color: '#fb923c', bg: 'rgba(251,146,60,0.08)', border: 'rgba(251,146,60,0.18)',
    title: 'Win Rate Analytics',
    desc: 'Smart tools to track your sessions, analyse performance, and optimise your gaming strategy.',
  },
]

const TRUST_BADGES = [
  { Icon: CheckCircle, label: 'Licensed Partners',    color: '#34d399' },
  { Icon: Lock,        label: 'SSL Secured',           color: '#60a5fa' },
  { Icon: BadgeCheck,  label: 'Fair Play Certified',   color: '#a78bfa' },
  { Icon: MapPin,      label: 'Pan-Asia Coverage',     color: '#fbbf24' },
  { Icon: Star,        label: '5 Star Rated',          color: '#D4AF37' },
]

const FeatureCard = memo(({ Icon, color, bg, border, title, desc }) => (
  <div
    style={{
      background: 'rgba(255,255,255,0.03)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      border: `1px solid rgba(255,255,255,0.07)`,
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
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
      e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
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
        color: 'rgba(255,255,255,0.92)',
        marginBottom: 7, letterSpacing: '-0.01em',
      }}>
        {title}
      </div>
      <p style={{
        fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)',
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
            color: 'rgba(255,255,255,0.5)',
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

        {/* ── Trust Banner ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
          style={{
            marginTop: 48,
            borderRadius: 18,
            border: '1px solid rgba(212,175,55,0.18)',
            background: 'rgba(212,175,55,0.03)',
            padding: 'clamp(28px,6vw,48px) clamp(20px,5vw,40px)',
            textAlign: 'center',
          }}
        >
          <div className="font-bold gold-text" style={{
            fontSize: 'clamp(1.2rem,5vw,1.8rem)',
            fontWeight: 900, marginBottom: 10, lineHeight: 1.2,
          }}>
            Join 50,000+ Winning Players Across Asia
          </div>
          <p className="font-body font-light" style={{
            color: 'rgba(255,255,255,0.45)',
            marginBottom: 28, maxWidth: 480,
            margin: '0 auto 28px',
            fontSize: 'clamp(0.82rem,3vw,0.95rem)',
            lineHeight: 1.6,
          }}>
            From first-time casino visitors to high-rollers — Jackpots World is your trusted partner for every bet.
          </p>

          {/* Badges */}
          <div style={{
            display: 'flex', flexWrap: 'wrap',
            justifyContent: 'center', gap: 10,
          }}>
            {TRUST_BADGES.map(({ Icon, label, color }, i) => (
              <div key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '7px 14px', borderRadius: 50,
                background: `${color}0d`,
                border: `1px solid ${color}30`,
                fontSize: 'clamp(0.68rem,2.5vw,0.78rem)',
                fontWeight: 600, color: color,
                letterSpacing: '0.02em',
              }}>
                <Icon size={13} color={color} strokeWidth={2} />
                {label}
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  )
}