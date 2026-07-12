import React, { useState, useRef } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { Shield } from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchVipTiers } from '../services/landingService'

// Fixed color palette cycled to color the "all benefits" comparison column —
// a display derivation, not distinct admin-editable content.
const BENEFIT_PALETTE = ['#D4AF37', '#34D399', '#60A5FA', '#A78BFA', '#F472B6', '#FB923C', '#22D3EE']

const FALLBACK_TIERS = [
  {
    id: 'bronze',
    label: 'Bronze',
    accentColor: '#92400e',
    accentBg: '#fef3c7',
    benefits: [
      { name: 'Level Up Bonus',  desc: 'One-time bonus credited when you reach this tier' },
      { name: 'Weekly Bonus',    desc: 'Weekly reward credited based on your activity' },
    ],
  },
  {
    id: 'silver',
    label: 'Silver',
    accentColor: '#374151',
    accentBg: '#f3f4f6',
    benefits: [
      { name: 'Level Up Bonus',  desc: 'One-time bonus credited when you reach this tier' },
      { name: 'Weekly Bonus',    desc: 'Weekly reward credited based on your activity' },
      { name: 'Monthly Bonus',   desc: 'Monthly loyalty bonus added to your balance' },
    ],
  },
  {
    id: 'gold',
    label: 'Gold',
    accentColor: '#78350f',
    accentBg: '#fef9c3',
    benefits: [
      { name: 'Level Up Bonus',  desc: 'One-time bonus credited when you reach this tier' },
      { name: 'Weekly Bonus',    desc: 'Weekly reward credited based on your activity' },
      { name: 'Monthly Bonus',   desc: 'Monthly loyalty bonus added to your balance' },
    ],
  },
  {
    id: 'jackpot1',
    label: 'Jackpot I',
    accentColor: '#1e3a8a',
    accentBg: '#eff6ff',
    benefits: [
      { name: 'Level Up Bonus',  desc: 'One-time bonus credited when you reach this tier' },
      { name: 'Weekly Bonus',    desc: 'Weekly reward credited based on your activity' },
      { name: 'Monthly Bonus',   desc: 'Monthly loyalty bonus added to your balance' },
      { name: 'Extras',          desc: 'Exclusive privileges and special access perks' },
    ],
  },
  {
    id: 'jackpot2',
    label: 'Jackpot II',
    accentColor: '#1e3a8a',
    accentBg: '#eff6ff',
    benefits: [
      { name: 'Level Up Bonus',       desc: 'One-time bonus credited when you reach this tier' },
      { name: 'Weekly Bonus',         desc: 'Weekly reward credited based on your activity' },
      { name: 'Monthly Bonus',        desc: 'Monthly loyalty bonus added to your balance' },
      { name: 'Extras',               desc: 'Exclusive privileges and special access perks' },
      { name: 'VIP Host Luxury Gifts', desc: 'Gurated gifts delivered by your personal VIP host' },
    ],
  },
  {
    id: 'jackpot3',
    label: 'Jackpot III',
    accentColor: '#1e3a8a',
    accentBg: '#eff6ff',
    benefits: [
      { name: 'Level Up Bonus',       desc: 'One-time bonus credited when you reach this tier' },
      { name: 'Weekly Bonus',         desc: 'Weekly reward credited based on your activity' },
      { name: 'Monthly Bonus',        desc: 'Monthly loyalty bonus added to your balance' },
      { name: 'Extras',               desc: 'Exclusive privileges and special access perks' },
      { name: 'VIP Host Luxury Gifts', desc: 'Gurated gifts delivered by your personal VIP host' },
    ],
  },
  {
    id: 'platinum',
    label: 'Platinum Jackpot',
    accentColor: '#1f2937',
    accentBg: '#f9fafb',
    benefits: [
      { name: 'Level Up Bonus',       desc: 'One-time bonus credited when you reach this tier' },
      { name: 'Weekly Bonus',         desc: 'Weekly reward credited based on your activity' },
      { name: 'Monthly Bonus',        desc: 'Monthly loyalty bonus added to your balance' },
      { name: 'Extras',               desc: 'Exclusive privileges and special access perks' },
      { name: 'VIP Host Luxury Gifts', desc: 'Gurated gifts delivered by your personal VIP host' },
    ],
  },
  {
    id: 'diamond',
    label: 'Diamond Jackpot',
    accentColor: '#1e3a8a',
    accentBg: '#dbeafe',
    benefits: [
      { name: 'Level Up Bonus',       desc: 'One-time bonus credited when you reach this tier' },
      { name: 'Weekly Bonus',         desc: 'Weekly reward credited based on your activity' },
      { name: 'Monthly Bonus',        desc: 'Monthly loyalty bonus added to your balance' },
      { name: 'Extras',               desc: 'Exclusive privileges and special access perks' },
      { name: 'VIP Host Luxury Gifts', desc: 'Gurated gifts delivered by your personal VIP host' },
    ],
  },
]

export default function VIPLevels() {
  const [active, setActive] = useState(null)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  const { data: tiersData } = useAutoFetch(fetchVipTiers, {}, { intervalMs: 60_000 })
  const TIERS = (Array.isArray(tiersData) && tiersData.length > 0 ? tiersData : FALLBACK_TIERS).map(t => ({
    id: t.id,
    label: t.label,
    accentColor: t.accentColor || t.accent_color,
    accentBg: t.accentBg || t.accent_bg,
    benefits: (t.benefits || []).map(b => ({ name: b.name, desc: b.desc || b.description })),
  }))

  const ALL_BENEFITS = [...new Set(TIERS.flatMap(t => t.benefits.map(b => b.name)))]
  const BENEFIT_COLORS = Object.fromEntries(ALL_BENEFITS.map((name, i) => [name, BENEFIT_PALETTE[i % BENEFIT_PALETTE.length]]))

  const activeId = active ?? TIERS[0]?.id
  const activeTier = TIERS.find(t => t.id === activeId) || TIERS[0]
  const activeBenefitNames = activeTier.benefits.map(b => b.name)

  const row1 = TIERS.slice(0, 4)
  const row2 = TIERS.slice(4)

  return (
    <section
      id="vip"
      ref={ref}
      style={{
        position: 'relative',
        padding: '96px 16px',
        background: 'var(--w365-bg)',
        overflow: 'hidden',
      }}
    >
      {/* subtle grid bg */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(212,175,55,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.03) 1px, transparent 1px)',
        backgroundSize: '80px 80px',
      }}/>

      <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: 56 }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            border: '1px solid rgba(212,175,55,0.2)',
            borderRadius: 99, padding: '5px 16px',
            marginBottom: 20,
          }}>
            <Shield size={12} style={{ color: '#D4AF37' }}/>
            <span style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(212,175,55,0.7)' }}>
              Prestige · Loyalty · Legacy
            </span>
          </div>
          <h2 style={{
            fontSize: 'clamp(28px, 5vw, 48px)',
            fontWeight: 800,
            color: '#D4AF37',
            letterSpacing: '0.04em',
            marginBottom: 10,
          }}>
            VIP Program Levels
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(var(--w365-text-rgb),0.3)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Bronze · Silver · Gold · Jackpot I · II · III · Platinum · Diamond
          </p>
        </motion.div>

        {/* ── Tier Selector Row 1 ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.15 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}
        >
          {row1.map(tier => (
            <TierButton key={tier.id} tier={tier} isActive={activeId === tier.id} onClick={() => setActive(tier.id)}/>
          ))}
        </motion.div>

        {/* ── Tier Selector Row 2 ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 32 }}
        >
          {row2.map(tier => (
            <TierButton key={tier.id} tier={tier} isActive={activeId === tier.id} onClick={() => setActive(tier.id)}/>
          ))}
        </motion.div>

        {/* ── Benefit Panel ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            style={{
              background: 'rgba(var(--w365-text-rgb),0.03)',
              border: '1px solid rgba(var(--w365-text-rgb),0.08)',
              borderRadius: 16,
              overflow: 'hidden',
              marginBottom: 40,
            }}
          >
            {/* Panel header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid rgba(var(--w365-text-rgb),0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--w365-text)', marginBottom: 2 }}>
                  {activeTier.label}
                </p>
                <p style={{ fontSize: 12, color: 'rgba(var(--w365-text-rgb),0.35)' }}>
                  {activeTier.benefits.length} of {ALL_BENEFITS.length} benefits included
                </p>
              </div>
              <span style={{
                fontSize: 11, padding: '4px 12px', borderRadius: 99,
                background: activeTier.accentBg,
                color: activeTier.accentColor,
                fontWeight: 600, letterSpacing: '0.05em',
              }}>
                {activeTier.label}
              </span>
            </div>

            {/* Benefits list */}
            <div style={{ padding: '8px 0' }}>
              {ALL_BENEFITS.map((name, i) => {
                const included = activeBenefitNames.includes(name)
                const detail = activeTier.benefits.find(b => b.name === name)
                return (
                  <div
                    key={name}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '14px 24px',
                      borderBottom: i < ALL_BENEFITS.length - 1 ? '1px solid rgba(var(--w365-text-rgb),0.04)' : 'none',
                      opacity: included ? 1 : 0.3,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    {/* dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: included ? (BENEFIT_COLORS[name] || '#888') : 'rgba(var(--w365-text-rgb),0.2)',
                    }}/>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: included ? 'var(--w365-text)' : 'rgba(var(--w365-text-rgb),0.4)' }}>
                        {name}
                      </span>
                      {included && detail && (
                        <span style={{ fontSize: 12, color: 'rgba(var(--w365-text-rgb),0.35)', marginLeft: 10 }}>
                          — {detail.desc}
                        </span>
                      )}
                    </div>
                    {/* check / cross */}
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: included ? 'rgba(52,211,153,0.12)' : 'transparent',
                      border: included ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(var(--w365-text-rgb),0.1)',
                    }}>
                      {included
                        ? <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#34D399" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <svg width="8" height="8" viewBox="0 0 8 8"><line x1="1" y1="1" x2="7" y2="7" stroke="rgba(var(--w365-text-rgb),0.2)" strokeWidth="1.2" strokeLinecap="round"/><line x1="7" y1="1" x2="1" y2="7" stroke="rgba(var(--w365-text-rgb),0.2)" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      }
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ── Permanent Note ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.3 }}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 16,
            padding: '20px 24px',
            border: '1px solid rgba(212,175,55,0.15)',
            borderRadius: 12,
            background: 'rgba(212,175,55,0.04)',
          }}
        >
          <Shield size={18} style={{ color: '#D4AF37', flexShrink: 0, marginTop: 1 }}/>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#D4AF37', marginBottom: 4 }}>
              Levels are permanent
            </p>
            <p style={{ fontSize: 13, color: 'rgba(var(--w365-text-rgb),0.4)', lineHeight: 1.65 }}>
              Your tier is a lifetime achievement. Total wagering accumulates across your entire account history and never resets — every bet builds your legacy.
            </p>
          </div>
        </motion.div>

      </div>
    </section>
  )
}

function TierButton({ tier, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 8px',
        borderRadius: 8,
        border: isActive
          ? '1px solid rgba(212,175,55,0.4)'
          : '1px solid rgba(var(--w365-text-rgb),0.07)',
        background: isActive
          ? 'rgba(212,175,55,0.08)'
          : 'rgba(var(--w365-text-rgb),0.02)',
        color: isActive ? '#D4AF37' : 'rgba(var(--w365-text-rgb),0.35)',
        fontSize: 12,
        fontWeight: isActive ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        letterSpacing: '0.02em',
        width: '100%',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.borderColor = 'rgba(var(--w365-text-rgb),0.15)'
          e.currentTarget.style.color = 'rgba(var(--w365-text-rgb),0.6)'
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.borderColor = 'rgba(var(--w365-text-rgb),0.07)'
          e.currentTarget.style.color = 'rgba(var(--w365-text-rgb),0.35)'
        }
      }}
    >
      {tier.label}
    </button>
  )
}