import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useInView } from 'react-intersection-observer'

// ─── Testimonial data (main cards) ───────────────────────────────────────────
const testimonials = [
  {
    name: 'Rajesh K.', city: 'Mumbai, India',       flag: '🇮🇳', rating: 5,
    won: '$8.5 Lakhs', dest: 'Macau',   color: '#FF6F00', seed: 'rajesh',
    text: 'Jackpots World made my Macau trip absolutely magical! VIP treatment from airport to casino floor. Won big at the Venetian Baccarat tables. The package was worth every rupee!',
  },
  {
    name: 'Priya S.', city: 'Chennai, India',        flag: '🇮🇳', rating: 5,
    won: '$2.2 Lakhs', dest: 'Goa',    color: '#8E24AA', seed: 'priya',
    text: "First casino experience ever and it couldn't have been better. The Jackpots World team guided me through everything. Walked out with a massive win at Delta Corp roulette!",
  },
  {
    name: 'Nguyen T.', city: 'Ho Chi Minh City',     flag: '🇻🇳', rating: 5,
    won: '$4,200',     dest: 'Vietnam', color: '#D32F2F', seed: 'nguyen',
    text: "The Diamond Elite package in Vietnam was extraordinary. Private butler, unlimited credits, and I hit the poker jackpot! Jackpots World is truly Asia's best.",
  },
  {
    name: 'Arjun M.', city: 'Bangalore, India',      flag: '🇮🇳', rating: 5,
    won: '$12 Lakhs', dest: 'Philippines', color: '#00838F', seed: 'arjun',
    text: "Okada Manila with Jackpots World's VIP package — hands down the best experience of my life. Hit a jackpot on the Konami slots and the cashout was instant. 10/10!",
  },
  {
    name: 'Kasun P.', city: 'Colombo, Sri Lanka',    flag: '🇱🇰', rating: 5,
    won: 'LKR 900K',  dest: 'Sri Lanka', color: '#7B1FA2', seed: 'kasun',
    text: "Bally's Colombo via Jackpots World was unreal. Got a VIP membership, exclusive table access, and walked away with a life-changing win. The support team was exceptional.",
  },
  {
    name: 'Carlos R.', city: 'Manila, Philippines',  flag: '🇵🇭', rating: 5,
    won: '₱185,000',  dest: 'Philippines', color: '#43A047', seed: 'carlos',
    text: 'City of Dreams Manila via Jackpots World — simply the BEST! Their concierge handled everything perfectly. Won big at Blackjack 21 and the payout was smooth.',
  },
]

// ─── Photo pool — randomuser.me IDs spread across genders ────────────────────
// 120 unique portrait IDs so infinite scroll never repeats
const PHOTO_POOL = [
  // men
  ...[ 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,
       21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
       41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60 ]
    .map(id => `https://randomuser.me/api/portraits/men/${id}.jpg`),
  // women
  ...[ 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,
       21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
       41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60 ]
    .map(id => `https://randomuser.me/api/portraits/women/${id}.jpg`),
]

// ─── Randomised name pool ─────────────────────────────────────────────────────
const FIRST = [
  'Aarav','Priya','Rohan','Meera','Kiran','Sunita','Vikram','Ananya',
  'Arjun','Deepa','Rahul','Sneha','Carlos','Maria','Nguyen','Linh',
  'Kasun','Fatima','Omar','Yuki','Elena','Dmitri','Amara','Sione',
  'Tariq','Layla','Ravi','Pooja','Haruto','Aisha','Lucas','Sofia',
  'Ivan','Nadia','Kenji','Zara','Leo','Mia','Chen','Hiroshi',
  'Anita','Vikrant','Suresh','Lakshmi','Prabhu','Kavya','Nolan','Isla',
]
const LAST_INIT = 'ABCDFGHJKLMNPRSTWY'.split('')

// ─── Currency / win amounts per locale ───────────────────────────────────────
const WIN_POOLS = [
  { fmt: v => `$${v.toFixed(1)} L`,  min: 1.2, max: 18,   step: 0.1 }, // INR lakhs
  { fmt: v => `$${v.toLocaleString()}`,       min: 800,  max: 9500, step: 100, int: true }, // USD
  { fmt: v => `€${v.toLocaleString()}`,       min: 600,  max: 7000, step: 100, int: true }, // EUR
  { fmt: v => `£${v.toLocaleString()}`,       min: 500,  max: 6500, step: 100, int: true }, // GBP
  { fmt: v => `¥${v.toLocaleString()}`,       min: 80000,max:950000,step:1000, int: true }, // JPY
  { fmt: v => `A$${v.toLocaleString()}`,      min: 900,  max: 8000, step: 100, int: true }, // AUD
  { fmt: v => `SGD ${v.toLocaleString()}`,    min: 800,  max: 8500, step: 100, int: true }, // SGD
  { fmt: v => `LKR ${v.toLocaleString()}`,    min:150000,max:980000,step:1000, int: true }, // LKR
  { fmt: v => `₱${v.toLocaleString()}`,       min: 30000,max:250000,step:1000, int: true }, // PHP
  { fmt: v => `₫${v.toLocaleString()}`,       min:2000000,max:15000000,step:100000,int:true}, // VND
  { fmt: v => `MYR ${v.toFixed(0)}`,          min: 2000, max: 18000,step: 500, int: true }, // MYR
  { fmt: v => `HKD ${v.toLocaleString()}`,    min: 5000, max: 60000,step: 500, int: true }, // HKD
]

const DESTINATIONS = ['Macau','Vietnam','Goa','Philippines','Sri Lanka','Singapore','Malaysia','Las Vegas','Georgia','Armenia']
const GAMES        = ['Baccarat','Roulette','Blackjack','Poker','Slots','Sic Bo','Dragon Tiger','Craps']
const CITIES = [
  'Mumbai','Delhi','Chennai','Bangalore','Hyderabad','Kolkata',
  'Ho Chi Minh City','Hanoi','Manila','Colombo','Macau','Singapore',
  'Kuala Lumpur','Hong Kong','Tokyo','Dubai','London','Sydney',
]
const FLAGS = ['🇮🇳','🇻🇳','🇵🇭','🇱🇰','🇸🇬','🇲🇾','🇯🇵','🇦🇺','🇬🇧','🇺🇸','🇭🇰','🇦🇪']
const COLORS = [
  '#FF6F00','#8E24AA','#D32F2F','#00838F','#43A047',
  '#1565C0','#E65100','#6A1B9A','#00695C','#AD1457',
  '#4527A0','#2E7D32','#F57F17','#37474F','#C62828',
]

// seeded shuffle so photo order is stable on first render
function seededShuffle(arr, seed) {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const SHUFFLED_PHOTOS = seededShuffle(PHOTO_POOL, 42)

function randBetween(min, max, int = false) {
  const v = Math.random() * (max - min) + min
  return int ? Math.round(v) : v
}

function makeScrollCard(index) {
  const first  = FIRST[Math.floor(Math.random() * FIRST.length)]
  const last   = LAST_INIT[Math.floor(Math.random() * LAST_INIT.length)]
  const pool   = WIN_POOLS[Math.floor(Math.random() * WIN_POOLS.length)]
  const amount = pool.int
    ? pool.fmt(randBetween(pool.min, pool.max, true))
    : pool.fmt(randBetween(pool.min, pool.max))
  return {
    id:    `${index}-${Math.random().toString(36).slice(2)}`,
    name:  `${first} ${last}.`,
    city:  CITIES[Math.floor(Math.random() * CITIES.length)],
    flag:  FLAGS[Math.floor(Math.random() * FLAGS.length)],
    dest:  DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)],
    game:  GAMES[Math.floor(Math.random() * GAMES.length)],
    won:   amount,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    photo: SHUFFLED_PHOTOS[index % SHUFFLED_PHOTOS.length],
  }
}

// Pre-generate 60 unique scroll cards
function makeInitialPool(n = 60) {
  return Array.from({ length: n }, (_, i) => makeScrollCard(i))
}

// ─── Deterministic main-card photos ──────────────────────────────────────────
const MAIN_PHOTOS = {
  rajesh: 'https://randomuser.me/api/portraits/men/32.jpg',
  priya:  'https://randomuser.me/api/portraits/women/44.jpg',
  nguyen: 'https://randomuser.me/api/portraits/men/62.jpg',
  arjun:  'https://randomuser.me/api/portraits/men/11.jpg',
  kasun:  'https://randomuser.me/api/portraits/men/77.jpg',
  carlos: 'https://randomuser.me/api/portraits/men/55.jpg',
}

// ─── Avatar component ─────────────────────────────────────────────────────────
function Avatar({ src, name, color, size = 'lg' }) {
  const [loaded, setLoaded] = useState(false)
  const [err,    setErr]    = useState(false)
  const dim  = size === 'lg' ? 'w-20 h-20' : 'w-9 h-9'
  const text = size === 'lg' ? 'text-xl'   : 'text-[10px]'
  const initials = name.split(' ').map(n => n[0]).join('').slice(0,2)
  return (
    <div
      className={`${dim} rounded-full overflow-hidden border-2 flex items-center justify-center flex-shrink-0 relative`}
      style={{ borderColor: `${color}88`, background: `${color}22` }}
    >
      {!err && (
        <img
          src={src} alt={name}
          onLoad={() => setLoaded(true)}
          onError={() => setErr(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {(!loaded || err) && (
        <span className={` font-bold font-black ${text} z-10`} style={{ color }}>
          {initials}
        </span>
      )}
    </div>
  )
}

// ─── Infinite scroll strip ────────────────────────────────────────────────────
const CARD_W    = 220   // px per card
const CARD_GAP  = 16    // px gap
const STEP      = CARD_W + CARD_GAP

function InfiniteScrollStrip({ cards, direction = 1, speed = 38 }) {
  // Duplicate cards so we can loop seamlessly
  const repeated = [...cards, ...cards, ...cards]
  const totalW   = cards.length * STEP
  const animDur  = (totalW / speed)

  return (
    <div className="overflow-hidden w-full" style={{ maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)' }}>
      <motion.div
        className="flex gap-4"
        style={{ width: repeated.length * STEP }}
        animate={{ x: direction > 0 ? [-totalW, 0] : [0, -totalW] }}
        transition={{ duration: animDur, repeat: Infinity, ease: 'linear' }}
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
            <Avatar src={c.photo} name={c.name} color={c.color} size="sm" />
            <div className="min-w-0">
              <div className="font-body font-light text-[11px] text-white font-bold truncate">{c.name}</div>
              <div className="font-body font-light text-[9px] text-white/40 truncate">{c.flag} {c.city}</div>
              <div className="font-body font-light text-[11px] font-black mt-0.5 truncate" style={{ color: c.color }}>
                🏆 {c.won}
              </div>
              <div className="font-body font-light text-[9px] text-white/30 truncate">{c.game} · {c.dest}</div>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Testimonials() {
  const [current, setCurrent]     = useState(0)
  const [scrollCards]             = useState(() => makeInitialPool(60))
  const { ref, inView }           = useInView({ threshold: 0.1, triggerOnce: true })

  // Split into two rows for opposite directions
  const row1 = scrollCards.slice(0,  30)
  const row2 = scrollCards.slice(30, 60)

  useEffect(() => {
    const timer = setInterval(() => setCurrent(p => (p + 1) % testimonials.length), 5000)
    return () => clearInterval(timer)
  }, [])

  const t = testimonials[current]

  return (
    <section className="relative py-24 px-4 overflow-hidden" ref={ref}>

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(212,175,55,0.06),transparent_65%)]" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity:0, y:30 }}
          animate={inView ? { opacity:1, y:0 } : {}}
          transition={{ duration:0.7 }}
          className="text-center mb-16"
        >
          <div className="inline-block border border-gold/30 rounded-full px-5 py-1.5 text-xs font-body font-light tracking-widest uppercase text-gold/70 mb-4">
            🏆 Winner Stories
          </div>
          <h2 className=" font-bold text-4xl md:text-5xl font-black gold-text mb-4">
            REAL WINNERS, REAL STOREIS
          </h2>
          <p className="font-body font-light text-lg text-white/60">Thousands have won. You could be next.</p>
        </motion.div>

        {/* ── Main testimonial card ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity:0, x:60 }}
            animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x:-60 }}
            transition={{ duration:0.4 }}
            className="casino-card p-8 md:p-12 text-center mb-8 neon-border relative overflow-hidden"
          >
            <div className="absolute top-6 left-8 text-8xl font-serif text-gold/10 leading-none select-none">"</div>

            <div className="flex justify-center mb-4">
              <Avatar src={MAIN_PHOTOS[t.seed]} name={t.name} color={t.color} size="lg" />
            </div>

            <div className="flex justify-center gap-1 mb-4">
              {[...Array(t.rating)].map((_,i) => (
                <motion.span key={i} initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:i*0.1 }} className="text-gold text-xl">★</motion.span>
              ))}
            </div>

            <p className="font-body font-light text-lg md:text-xl text-white/80 leading-relaxed mb-6 max-w-2xl mx-auto italic">
              "{t.text}"
            </p>

            <div
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full mb-4 font-body font-light font-bold text-sm"
              style={{ background:`${t.color}22`, border:`1px solid ${t.color}55`, color:t.color }}
            >
              🏆 Won {t.won} in {t.dest}
            </div>

            <div>
              <div className=" font-bold font-bold text-white text-base">{t.name}</div>
              <div className="font-body font-light text-sm text-white/50">{t.flag} {t.city}</div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ── Dots ── */}
        <div className="flex justify-center gap-2 mb-16">
          {testimonials.map((_,i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`rounded-full transition-all duration-300 ${current===i ? 'w-8 h-2.5 bg-gold' : 'w-2.5 h-2.5 bg-white/20 hover:bg-gold/50'}`}
            />
          ))}
        </div>
      </div>

      {/* ── Infinite scroll strips — full bleed ── */}
      <div className="w-full space-y-4">
        <InfiniteScrollStrip cards={row1} direction={1}  speed={35} />
        <InfiniteScrollStrip cards={row2} direction={-1} speed={28} />
      </div>

    </section>
  )
}