import React, { useState, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Link } from 'react-scroll'
import { ChevronRight, Gift } from 'lucide-react'

// ─── Gift Data ────────────────────────────────────────────────────────────────
const gifts = [
  {
    id:        'rolex',
    tier:      'LEGENDARY',
    tierColor: '#D4AF37',
    name:      'Rolex Submariner',
    subtitle:  'Swiss Precision · Timeless Prestige',
    logoSrc:   '/images/logos/rolex.png',
    logoAlt:   'Rolex',
    value:     '$15K+',
    description: 'The icon of icons. A genuine Rolex Submariner — waterproof to 300m, Oystersteel bracelet, Cerachrom bezel. Worn by champions.',
    perks:     ['Authenticated Certificate', 'Luxury Gift Box', 'Free Engraving', 'Worldwide Delivery'],
    accent:    '#D4AF37',
    featured:  true,
  },
  {
    id:        'bmw',
    tier:      'ULTRA',
    tierColor: '#4FC3F7',
    name:      'BMW M3 Competition',
    subtitle:  '510 HP · Twin-Turbo · The Ultimate Machine',
    logoSrc:   '/images/logos/bmw.png',
    logoAlt:   'BMW',
    value:     '$120K+',
    description: 'Pure M. The BMW M3 Competition — 510 horsepower, 0–100 in 3.9 seconds. Win it, drive it, live it.',
    perks:     ['Full Registration', 'Insurance 1st Year', 'VIP Delivery Ceremony', 'Track Day Experience'],
    accent:    '#4FC3F7',
    featured:  false,
  },
  {
    id:        'benz',
    tier:      'ULTRA',
    tierColor: '#C0C0C0',
    name:      'Mercedes-Benz GLE',
    subtitle:  'AMG Line · 9G-Tronic · Pure Luxury',
    logoSrc:   '/images/logos/benz.png',
    logoAlt:   'Mercedes-Benz',
    value:     '$95K+',
    description: 'The three-pointed star. A Mercedes-Benz GLE AMG Line — commanding presence, whisper-quiet cabin, cutting-edge tech.',
    perks:     ['Full Registration', 'Insurance 1st Year', 'Concierge Delivery', 'AMG Accessories Pack'],
    accent:    '#C8C8C8',
    featured:  false,
  },
  {
    id:        'apple',
    tier:      'ELITE',
    tierColor: '#A8A8A8',
    name:      'Apple Ultra Bundle',
    subtitle:  'iPhone 16 Pro Max · MacBook Pro · Vision Pro',
    logoSrc:   '/images/logos/apple.png',
    logoAlt:   'Apple',
    value:     '$6K+',
    description: 'The complete Apple ecosystem. iPhone 16 Pro Max, MacBook Pro M4, Apple Watch Ultra 2, and the future — Vision Pro.',
    perks:     ['Apple Care+ 2 Years', 'Setup & Delivery', 'Engraving Option', 'Accessories Kit'],
    accent:    '#A8A8A8',
    featured:  false,
  },
]

const steps = [
  { n:'01', icon:'🎰', label:'Play & Win',    desc:'Earn with every game — Baccarat, Slots, Roulette & more'     },
  { n:'02', icon:'💰', label:'Go Highroller', desc:'Qualify as a Highroller and unlock the exclusive prize vault' },
  { n:'03', icon:'🎁', label:'Redeem Gifts',  desc:'Choose your dream prize from our luxury gifts catalogue'      },
  { n:'04', icon:'🚀', label:'We Deliver',     desc:'Verified, authenticated, delivered to your door worldwide'    },
]

// ─── Tier Badge ───────────────────────────────────────────────────────────────
function TierBadge({ tier, color }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        background: `${color}15`,
        border: `1px solid ${color}45`,
        color,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {tier}
    </span>
  )
}

// ─── Rolex Featured Card (full width, horizontal layout) ──────────────────────
function FeaturedCard({ gift }) {
  const ref    = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0f0a00 0%, #1a1200 50%, #0f0a00 100%)',
        border: `1px solid ${gift.accent}35`,
        transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = `0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px ${gift.accent}55`
        e.currentTarget.style.borderColor = `${gift.accent}60`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = `${gift.accent}35`
      }}
    >
      {/* #1 Prize ribbon */}
      <div style={{
        position: 'absolute', top: 16, right: -28, transform: 'rotate(45deg)',
        background: '#D4AF37', color: '#0a0005',
        padding: '4px 40px', fontSize: 8, fontWeight: 900,
        letterSpacing: '0.2em', textTransform: 'uppercase', zIndex: 10,
      }}>
        #1 PRIZE
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 280 }}>
        {/* Left — logo column */}
        <div style={{
          width: 220, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '32px 24px',
          borderRight: `1px solid ${gift.accent}20`,
          background: `linear-gradient(180deg, ${gift.accent}08 0%, transparent 100%)`,
        }}>
          <div style={{
            width: 96, height: 96,
            borderRadius: 20,
            background: `linear-gradient(135deg, ${gift.accent}18, ${gift.accent}06)`,
            border: `1.5px solid ${gift.accent}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <img
              src={gift.logoSrc} alt={gift.logoAlt}
              style={{ width: 56, height: 56, objectFit: 'contain' }}
              onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
            />
            <span style={{ display: 'none', color: gift.accent, fontWeight: 900, fontSize: 13, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              {gift.logoAlt.slice(0, 3).toUpperCase()}
            </span>
          </div>
          <TierBadge tier={gift.tier} color={gift.tierColor} />
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4 }}>Market Value</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: gift.accent }}>{gift.value}</div>
          </div>
        </div>

        {/* Right — content */}
        <div style={{ flex: 1, padding: '32px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 900, color: '#fff', margin: '0 0 4px' }}>
              {gift.name}
            </h3>
            <p style={{ fontSize: 12, color: `${gift.accent}90`, margin: '0 0 14px', letterSpacing: '0.04em' }}>
              {gift.subtitle}
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: '0 0 20px', maxWidth: 560 }}>
              {gift.description}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', marginBottom: 24 }}>
              {gift.perks.map((perk, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: gift.accent, flexShrink: 0 }} />
                  {perk}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link to="register" smooth duration={600} offset={-80}>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: '12px 28px', borderRadius: 10,
                  background: `linear-gradient(135deg, ${gift.accent}, ${gift.accent}bb)`,
                  border: 'none', color: '#0a0005',
                  fontWeight: 900, fontSize: 11,
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                <Gift size={13} />
                Claim This Prize
                <ChevronRight size={13} />
              </motion.button>
            </Link>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>
              Highroller exclusive
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Regular Gift Card ────────────────────────────────────────────────────────
function GiftCard({ gift, index }) {
  const ref    = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5 }}
      style={{
        position: 'relative',
        borderRadius: 14,
        overflow: 'hidden',
        background: '#0d0d0d',
        border: `1px solid ${gift.accent}25`,
        display: 'flex', flexDirection: 'column',
        transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = `0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px ${gift.accent}45`
        e.currentTarget.style.borderColor = `${gift.accent}50`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = `${gift.accent}25`
      }}
    >
      {/* Top accent line */}
      <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${gift.accent}80, transparent)` }} />

      {/* Logo area */}
      <div style={{
        padding: '28px 0 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        borderBottom: `1px solid ${gift.accent}15`,
        background: `linear-gradient(180deg, ${gift.accent}06 0%, transparent 100%)`,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 16,
          background: `linear-gradient(135deg, ${gift.accent}15, ${gift.accent}05)`,
          border: `1.5px solid ${gift.accent}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 14,
        }}>
          <img
            src={gift.logoSrc} alt={gift.logoAlt}
            style={{ width: 44, height: 44, objectFit: 'contain' }}
            onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
          />
          <span style={{ display: 'none', color: gift.accent, fontWeight: 900, fontSize: 12, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            {gift.logoAlt.slice(0, 3).toUpperCase()}
          </span>
        </div>
        <TierBadge tier={gift.tier} color={gift.tierColor} />
      </div>

      {/* Content */}
      <div style={{ padding: '20px 20px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: '0 0 3px' }}>{gift.name}</h3>
        <p style={{ fontSize: 10, color: `${gift.accent}85`, margin: '0 0 10px', letterSpacing: '0.04em' }}>{gift.subtitle}</p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, margin: '0 0 14px', flex: 1 }}>
          {gift.description}
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {gift.perks.map((perk, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: gift.accent, flexShrink: 0 }} />
              {perk}
            </li>
          ))}
        </ul>

        {/* Market value row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: `${gift.accent}0d`, border: `1px solid ${gift.accent}20`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>🎰</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: gift.accent, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              HIGHROLLER
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 2 }}>
              Market Value
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: gift.accent }}>{gift.value}</div>
          </div>
        </div>

        {/* CTA */}
        <Link to="register" smooth duration={600} offset={-80}>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 9,
              background: `${gift.accent}15`, border: `1px solid ${gift.accent}45`,
              color: gift.accent, fontWeight: 900, fontSize: 10,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Gift size={12} />
            Claim This Prize
            <ChevronRight size={12} />
          </motion.button>
        </Link>
      </div>
    </motion.div>
  )
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export default function GiftsSection() {
  const headerRef    = useRef(null)
  const headerInView = useInView(headerRef, { once: true })

  const featured = gifts.find(g => g.featured)
  const rest      = gifts.filter(g => !g.featured)

  return (
    <section
      id="gifts"
      style={{
        position: 'relative',
        padding: 'clamp(64px,10vw,120px) 0',
        overflow: 'hidden',
        background: '#080808',
      }}
    >
      {/* Subtle top gradient */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 800, height: 300, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.07) 0%, transparent 70%)',
      }} />

      <div style={{ position: 'relative', zIndex: 10, maxWidth: 1200, margin: '0 auto', padding: '0 clamp(16px,4vw,40px)' }}>

        {/* ── Header ── */}
        <div ref={headerRef} style={{ textAlign: 'center', marginBottom: 'clamp(40px,8vw,72px)' }}>
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={headerInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 18px', borderRadius: 999, marginBottom: 24,
              background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.3)',
              fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase',
              color: 'rgba(212,175,55,0.8)', fontWeight: 700,
            }}
          >
            🎁 Highroller Rewards Programme
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            animate={headerInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            style={{
              fontSize: 'clamp(28px,6vw,60px)', fontWeight: 900,
              lineHeight: 1.1, marginBottom: 16,
              color: '#fff',
            }}
          >
            <span style={{
              background: 'linear-gradient(135deg, #D4AF37, #F5E07A)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              WIN MORE
            </span>
            <br />
            <span style={{ fontSize: 'clamp(18px,4vw,40px)', color: 'rgba(255,255,255,0.85)' }}>
              THAN JUST MONEY
            </span>
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={headerInView ? { opacity: 1, scaleX: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            style={{ width: 60, height: 1, background: 'rgba(212,175,55,0.5)', margin: '0 auto 20px' }}
          />

          <motion.p
            initial={{ opacity: 0 }}
            animate={headerInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.3 }}
            style={{ fontSize: 'clamp(13px,2vw,16px)', color: 'rgba(255,255,255,0.5)', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}
          >
            Highrollers play differently. Walk away with a{' '}
            <span style={{ color: '#D4AF37' }}>Rolex, BMW, Mercedes-Benz</span>{' '}
            or the complete{' '}
            <span style={{ color: '#D4AF37' }}>Apple ecosystem</span>.
            Real prizes. Real delivery. No catch.
          </motion.p>
        </div>

        {/* ── Rolex Featured Card ── */}
        <div style={{ marginBottom: 20 }}>
          <FeaturedCard gift={featured} />
        </div>

        {/* ── Three Cards Below ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 64 }}>
          {rest.map((gift, i) => (
            <GiftCard key={gift.id} gift={gift} index={i} />
          ))}
        </div>

        {/* ── How to Win Steps ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6 }}
          style={{ marginBottom: 56 }}
        >
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h3 style={{ fontSize: 'clamp(18px,3.5vw,28px)', fontWeight: 900, color: 'rgba(255,255,255,0.9)', margin: '0 0 8px' }}>
              How to{' '}
              <span style={{
                background: 'linear-gradient(135deg, #D4AF37, #F5E07A)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                Earn & Redeem
              </span>
            </h3>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>
              4 simple steps to your dream prize
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                whileHover={{ y: -4 }}
                style={{
                  position: 'relative', borderRadius: 12, padding: '28px 18px 22px',
                  textAlign: 'center',
                  background: 'rgba(212,175,55,0.03)', border: '1px solid rgba(212,175,55,0.12)',
                  transition: 'border-color 0.25s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)' }}
              >
                <div style={{
                  position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                  background: '#D4AF37', color: '#0a0005',
                  fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                  padding: '3px 10px', borderRadius: 999,
                }}>
                  {step.n}
                </div>
                <div style={{ fontSize: 28, marginBottom: 12, marginTop: 4 }}>{step.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>{step.label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>{step.desc}</div>
                {i < steps.length - 1 && (
                  <div style={{
                    position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)',
                    color: 'rgba(212,175,55,0.25)', fontSize: 18, zIndex: 1,
                  }}>›</div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── CTA Banner ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6 }}
          style={{
            borderRadius: 20, overflow: 'hidden', textAlign: 'center',
            padding: 'clamp(40px,6vw,64px) clamp(24px,6vw,80px)',
            background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(212,175,55,0.03) 50%, rgba(212,175,55,0.07) 100%)',
            border: '1px solid rgba(212,175,55,0.25)',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>🏆</div>
          <h3 style={{ fontSize: 'clamp(20px,4vw,36px)', fontWeight: 900, color: '#fff', margin: '0 0 12px', lineHeight: 1.2 }}>
            Your Dream Prize Awaits
          </h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', maxWidth: 480, margin: '0 auto 32px', lineHeight: 1.7 }}>
            Register today, start playing as a Highroller, and watch your prize counter rise.{' '}
            <span style={{ color: '#D4AF37' }}>50,000+ members</span> are already on their way to something legendary.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="register" smooth duration={600} offset={-80}>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: '14px 32px', borderRadius: 10,
                  background: 'linear-gradient(135deg, #D4AF37, #c9a227)',
                  border: 'none', color: '#0a0005',
                  fontWeight: 900, fontSize: 11, letterSpacing: '0.18em',
                  textTransform: 'uppercase', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <Gift size={15} />
                Start Winning Prizes
              </motion.button>
            </Link>
            <Link to="packages" smooth duration={600} offset={-80}>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: '14px 32px', borderRadius: 10,
                  background: 'transparent',
                  border: '1px solid rgba(212,175,55,0.4)', color: 'rgba(212,175,55,0.85)',
                  fontWeight: 700, fontSize: 11, letterSpacing: '0.18em',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                View All Packages
              </motion.button>
            </Link>
          </div>
        </motion.div>

      </div>
    </section>
  )
}