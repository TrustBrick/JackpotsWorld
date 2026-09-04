import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'

// Floating affiliate cards — same infinite-scroll strip design and animation
// as the winner cards in Testimonials.jsx (two rows, opposite directions),
// but themed around affiliate payouts instead of player wins.

const FIRST = [
  'Aarav', 'Priya', 'Rohan', 'Meera', 'Kiran', 'Sunita', 'Vikram', 'Ananya',
  'Arjun', 'Deepa', 'Rahul', 'Sneha', 'Carlos', 'Maria', 'Nguyen', 'Linh',
  'Kasun', 'Fatima', 'Omar', 'Yuki', 'Elena', 'Dmitri', 'Amara', 'Sione',
  'Tariq', 'Layla', 'Ravi', 'Pooja', 'Haruto', 'Aisha', 'Lucas', 'Sofia',
]
const LAST_INIT = 'ABCDFGHJKLMNPRSTWY'.split('')
const CITIES = [
  'Mumbai', 'Delhi', 'Chennai', 'Bangalore', 'Hyderabad', 'Kolkata',
  'Ho Chi Minh City', 'Hanoi', 'Manila', 'Colombo', 'Macau', 'Singapore',
  'Kuala Lumpur', 'Hong Kong', 'Tokyo', 'Dubai', 'London', 'Sydney',
]
const FLAGS = ['🇮🇳', '🇻🇳', '🇵🇭', '🇱🇰', '🇸🇬', '🇲🇾', '🇯🇵', '🇦🇺', '🇬🇧', '🇺🇸', '🇭🇰', '🇦🇪']
const COLORS = [
  '#FF6F00', '#8E24AA', '#D32F2F', '#00838F', '#43A047',
  '#1565C0', '#E65100', '#6A1B9A', '#00695C', '#AD1457',
  '#4527A0', '#2E7D32', '#F57F17', '#37474F', '#C62828',
]

function randBetween(min, max) {
  return Math.round(Math.random() * (max - min) + min)
}

function makeAffiliateCard(index) {
  const first = FIRST[Math.floor(Math.random() * FIRST.length)]
  const last = LAST_INIT[Math.floor(Math.random() * LAST_INIT.length)]
  const referrals = randBetween(8, 240)
  const commission = randBetween(400, 18000)
  return {
    id: `${index}-${Math.random().toString(36).slice(2)}`,
    name: `${first} ${last}.`,
    city: CITIES[Math.floor(Math.random() * CITIES.length)],
    flag: FLAGS[Math.floor(Math.random() * FLAGS.length)],
    referrals,
    commission: `$${commission.toLocaleString()}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    initials: `${first[0]}${last}`,
  }
}

function makePool(n) {
  return Array.from({ length: n }, (_, i) => makeAffiliateCard(i))
}

const CARD_W = 220
const CARD_GAP = 16
const STEP = CARD_W + CARD_GAP

function InfiniteScrollStrip({ cards, direction = 1, speed = 35 }) {
  const repeated = [...cards, ...cards, ...cards]
  const totalW = cards.length * STEP

  return (
    <div className="overflow-hidden w-full" style={{ maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)' }}>
      <motion.div
        className="flex gap-4"
        style={{ width: repeated.length * STEP }}
        animate={{ x: direction > 0 ? [-totalW, 0] : [0, -totalW] }}
        transition={{ duration: totalW / speed, repeat: Infinity, ease: 'linear' }}
      >
        {repeated.map((c, i) => (
          <div
            key={`${c.id}-${i}`}
            className="flex-shrink-0 rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{
              width: CARD_W,
              background: 'rgba(10,0,8,0.75)',
              border: `1px solid ${c.color}30`,
              boxShadow: `0 0 16px ${c.color}12`,
              backdropFilter: 'blur(12px)',
            }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-black text-[10px]"
              style={{ background: `${c.color}22`, border: `2px solid ${c.color}88`, color: c.color }}
            >
              {c.initials}
            </div>
            <div className="min-w-0">
              <div className="font-body font-light text-[11px] text-white font-bold truncate">{c.name}</div>
              <div className="font-body font-light text-[9px] text-white/60 truncate">{c.flag} {c.city}</div>
              <div className="font-body font-light text-[11px] font-black mt-0.5 truncate" style={{ color: c.color }}>
                💰 {c.commission}
              </div>
              <div className="font-body font-light text-[9px] text-white/50 truncate">{c.referrals} referred players</div>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

export default function AffiliateFloatingCards() {
  const [cards] = useState(() => makePool(60))
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true })
  const row1 = cards.slice(0, 30)
  const row2 = cards.slice(30, 60)

  return (
    <section className="relative py-4 overflow-hidden" ref={ref}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="text-center mb-8"
      >
        <div className="inline-block border border-gold/30 rounded-full px-5 py-1.5 text-xs font-body font-light tracking-widest uppercase text-gold/70 mb-4">
          💰 Affiliate Payouts
        </div>
        <h2 className="gold-text font-black text-2xl tracking-wide">Affiliates Earning Right Now</h2>
      </motion.div>

      <div className="w-full space-y-4">
        <InfiniteScrollStrip cards={row1} direction={1} speed={35} />
        <InfiniteScrollStrip cards={row2} direction={-1} speed={28} />
      </div>
    </section>
  )
}
