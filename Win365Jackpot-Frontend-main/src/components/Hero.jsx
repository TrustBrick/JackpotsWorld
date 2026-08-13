import React, { useEffect, useState, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-scroll'
import { useNavigate } from 'react-router-dom'
import { Gem, CalendarDays, MapPinned, Gift, MapPin, Star, ShieldCheck, Crown } from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchLocations } from '../services/locationService'
import { fetchHeroStats, fetchLandingSettings } from '../services/landingService'
import { flagFromCountryCode, flagIconUrl } from '../utils/countryFlags'

// ─── CSS ───────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes floatCard {
    0%   { opacity:0; transform: translateY(0) scale(0.45) rotate(-22deg); }
    12%  { opacity:0.85; }
    70%  { opacity:0.85; transform: translateY(-180px) scale(1.05) rotate(6deg); }
    100% { opacity:0;   transform: translateY(-260px) scale(0.75) rotate(-8deg); }
  }
  @keyframes floatLux {
    0%   { opacity:0; transform: translateY(0) scale(0.3) rotate(28deg); }
    12%  { opacity:0.9; }
    72%  { opacity:0.9; transform: translateY(-130px) scale(1.08) rotate(-10deg); }
    100% { opacity:0;   transform: translateY(-195px) scale(0.65) rotate(6deg); }
  }
  @keyframes cardGlow {
    0%,100% { box-shadow: 0 0 8px rgba(212,175,55,0.3); }
  @keyframes spinRing {
    to { transform: rotate(360deg); }
  }
  @keyframes spinRingR {
    to { transform: rotate(-360deg); }
  }
    50%      { box-shadow: 0 0 22px rgba(212,175,55,0.75), 0 0 42px rgba(212,175,55,0.28); }
  }
  @keyframes luxGlow {
    0%,100% { box-shadow: 0 0 6px rgba(212,175,55,0.2); }
    50%      { box-shadow: 0 0 22px rgba(212,175,55,0.65), 0 0 38px rgba(212,175,55,0.22); }
  }
  @keyframes scrollBounce {
    0%,100% { transform: translateX(-50%) translateY(0); opacity:1; }
    50%      { transform: translateX(-50%) translateY(10px); opacity:0.4; }
  }
  @keyframes pulse-dot {
    0%,100% { opacity:1; } 50% { opacity:0.3; }
  }
  @keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  @keyframes girlFadeIn {
    from { opacity:0; transform: translateX(28px); }
    to   { opacity:1; transform: translateX(0); }
  }
  @keyframes w365-countries-marquee {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  @keyframes badgeGlow {
    0%,100% { box-shadow: 0 0 10px rgba(212,175,55,0.35), 0 0 0 1px rgba(212,175,55,0.15) inset; }
    50%      { box-shadow: 0 0 26px rgba(212,175,55,0.85), 0 0 48px rgba(212,175,55,0.3), 0 0 0 1px rgba(212,175,55,0.3) inset; }
  }
  @media (prefers-reduced-motion: reduce) {
    .w365-countries-track { animation: none !important; }
  }
  /* Pause-on-hover only for devices with a real mouse — touch/mobile has no
     true hover state, so the ticker keeps scrolling there without change. */
  @media (hover: hover) and (pointer: fine) {
    .w365-location-ticker:hover .w365-countries-track { animation-play-state: paused !important; }
  }
  /* Partner plaque — logo left / text right on desktop, stacked+centered
     once the row no longer comfortably fits both side by side. */
  .w365-partner-plaque { flex-direction: row; text-align: left; }
  .w365-partner-plaque .w365-partner-info { align-items: flex-start; }
  @media (max-width: 720px) {
    .w365-partner-plaque {
      flex-direction: column; text-align: center;
      padding: clamp(14px,4vw,20px) clamp(20px,6vw,32px) !important;
      gap: clamp(10px,2.5vw,16px) !important;
    }
    .w365-partner-plaque .w365-partner-info { align-items: center; gap: 6px !important; }
    .w365-partner-plaque .w365-partner-emblem-wrap { width: 56px !important; height: 56px !important; }
    .w365-partner-plaque .w365-trust-row { gap: 4px 10px !important; }
  }
`

function injectCSS() {
  if (document.getElementById('hero-css-v3')) return
  const s = document.createElement('style')
  s.id = 'hero-css-v3'
  s.textContent = CSS
  document.head.appendChild(s)
}

// ─── Names ─────────────────────────────────────────────────────────────────
const NAMES = [
  'James Mitchell','Emma Clarke','Lucas Hernandez','Sofia Reyes','Liam O\'Brien',
  'Olivia Bennett','Noah Andersson','Ava Thompson','Ethan Kowalski','Isabella Ferreira',
  'Mason Turner','Mia Johansson','Logan Campbell','Charlotte Davies','Aiden Murphy',
  'Priya Nair','Rohan Mehta','Arjun Sharma','Carlos Mendez','Maria Delgado',
  'Omar Khalil','Fatima Hassan','Tariq Rahman','Layla Mansour','Aisha Diallo',
  'Kasun Perera','Ivan Volkov','Nadia Sokolova','Marco','Elena','Zoe','Felix',
]
function randomName() { return NAMES[Math.floor(Math.random() * NAMES.length)] }

// ─── Floating Cards ────────────────────────────────────────────────────────
const floatingCards = [
  { suit:'♠', val:'A',  pos:{ left:'5%',   top:'30%' }, delay:0,   red:false },
  { suit:'♥', val:'K',  pos:{ left:'11%',  top:'55%' }, delay:1.5, red:true  },
  { suit:'♦', val:'Q',  pos:{ right:'7%',  top:'26%' }, delay:0.8, red:true  },
  { suit:'♣', val:'J',  pos:{ right:'13%', top:'58%' }, delay:2.2, red:false },
  { suit:'♥', val:'A',  pos:{ left:'2%',   top:'70%' }, delay:3,   red:true  },
  { suit:'♠', val:'10', pos:{ right:'4%',  top:'74%' }, delay:1,   red:false },
]

const FloatingCard = memo(({ suit, val, pos, delay, red }) => (
  <div style={{
    position:'absolute', pointerEvents:'none', userSelect:'none',
    ...pos,
    animation:`floatCard 6.5s ${delay}s infinite ease-in-out`,
    willChange:'transform, opacity',
    zIndex:3,
  }}>
    <div style={{
      width:'clamp(32px,5.5vw,56px)',
      height:'clamp(44px,7.5vw,76px)',
      background:'linear-gradient(145deg,#1c001a,#2e0025)',
      border:`1.5px solid ${red ? 'rgba(255,60,100,0.6)' : 'rgba(212,175,55,0.6)'}`,
      borderRadius:8,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      fontWeight:800,
      fontFamily:"'Manrope', sans-serif",
      fontSize:'clamp(8px,1.4vw,11px)',
      color: red ? '#ff4466' : '#D4AF37',
      animation:`cardGlow 2.5s ${delay}s ease-in-out infinite`,
    }}>
      <div>{val}</div>
      <div style={{ fontSize:'clamp(11px,2vw,16px)', lineHeight:1 }}>{suit}</div>
    </div>
  </div>
))

// ─── Floating Luxury ──────────────────────────────────────────────────────
// Rolex kept in its own list — it renders on every breakpoint (see the two
// render sites below), unlike the rest of luxuryItems which stay desktop
// -only (narrow viewports have no margin room outside the centered text
// column for these without overlapping the winner feed / hero title / CTAs).
//
// Cache-busted with ?v=2 — this file is served with a 1-year Cache-Control
// (see public/images/logos/), so updating the image bytes at the same URL
// doesn't reach browsers that already cached the old one. Bump the version
// again any time this specific asset's content changes.
const rolexItems = [
  { logo:'/images/logos/rolex.png?v=2', label:'ROLEX', pos:{right:'19%',top:'14%'}, delay:3.5, color:'#D4AF37' },
  { logo:'/images/logos/rolex.png?v=2', label:'ROLEX', pos:{left:'1%',  top:'16%'}, delay:2.8, color:'#D4AF37' },
]

const luxuryItems = [
  { logo:'/images/logos/benz.png',  label:'BENZ',  pos:{left:'9%',  top:'36%'}, delay:0.5, color:'#C8C8C8' },
  { logo:'/images/logos/bmw.png',   label:'BMW',   pos:{right:'14%',top:'30%'}, delay:2.0, color:'#4FC3F7' },
  { logo:'/images/logos/apple.png', label:'APPLE', pos:{left:'11%', top:'62%'}, delay:1.2, color:'#E8E8E8' },
  { Icon: Gem,                       label:'VIP',   pos:{right:'3%', top:'60%'}, delay:4.2, color:'#B47FFF' },
]

const FloatingLuxury = memo(({ Icon, logo, label, pos, delay, color }) => {
  const size = 'clamp(48px,10.5vw,68px)'
  return (
    <div style={{
      position:'absolute', pointerEvents:'none', userSelect:'none',
      display:'flex', flexDirection:'column', alignItems:'center', gap:3,
      ...pos,
      animation:`floatLux 7.5s ${delay}s infinite ease-in-out`,
      willChange:'transform, opacity',
      zIndex:3,
    }}>
      <div style={{
        width:size, height:size, borderRadius:'50%',
        background:'linear-gradient(145deg,rgba(28,0,22,0.92),rgba(46,0,37,0.92))',
        border:`1.5px solid ${color}60`,
        display:'flex', alignItems:'center', justifyContent:'center',
        padding: logo ? 8 : 0,
        animation:`luxGlow 3s ${delay}s ease-in-out infinite`,
      }}>
        {logo
          ? <img src={logo} alt={label} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
          : <Icon size={22} color={color} strokeWidth={1.5} />
        }
      </div>
      <div style={{
        fontSize:'clamp(7px,1.5vw,9px)',
        color, opacity:0.85,
        fontWeight:900,
        letterSpacing:'0.13em',
        fontFamily:"'Manrope', sans-serif",
      }}>
        {label}
      </div>
    </div>
  )
})

// ─── Rings ─────────────────────────────────────────────────────────────────
const RINGS = [500, 700, 900, 1100]

// ─── Daily Winnings ────────────────────────────────────────────────────────
function getDailyWinnings() {
  const d = new Date()

  // shift day if before 6 AM
  if (d.getHours() < 6) {
    d.setDate(d.getDate() - 1)
  }

  // create deterministic seed
  const seed =
    d.getFullYear() * 10000 +
    (d.getMonth() + 1) * 100 +
    d.getDate()

  // pseudo-random number (0–1)
  const rand = Math.abs(Math.sin(seed) * 43758.5453123) % 1

  // range 5–50
  const value = Math.floor(rand * 46) + 5

  return {
    display: `$${value} Mn+`
  }
}

// ─── Winner Feed ──────────────────────────────────────────────────────────
const PLACES   = ['Mumbai','Delhi','Bangalore','Hyderabad','Goa','Colombo','Manila','Hanoi','Macau']
const GAMES    = ['Baccarat','Roulette','Blackjack','Poker','Slots','Sic Bo']
// Amount won is always USD, formatted one consistent way.
const WIN_MIN = 500
const WIN_MAX = 200000
function makeWinner(id) {
  const amt = Math.floor(Math.random() * (WIN_MAX - WIN_MIN) + WIN_MIN)
  return {
    id, name:randomName(),
    place:PLACES[~~(Math.random()*PLACES.length)],
    game:GAMES[~~(Math.random()*GAMES.length)],
    amount:`$${amt.toLocaleString()}`,
  }
}

function useWinnerFeed(max, interval) {
  const [entries, setEntries] = useState([])
  const counter = useRef(0)
  useEffect(() => {
    const spawn = () => {
      counter.current++
      setEntries(p => [...p, makeWinner(counter.current)].slice(-max))
    }
    spawn()
    const id = setInterval(spawn, interval)
    return () => clearInterval(id)
  }, [max, interval])
  return entries
}

function WinnerFeedDesktop() {
  const entries = useWinnerFeed(3, 3500)
  return (
    <div className="hidden md:flex" style={{
      position:'absolute', bottom:88, left:16, zIndex:20,
      flexDirection:'column', gap:7, width:256, pointerEvents:'none',
    }}>
      <AnimatePresence mode="popLayout">
        {entries.map((w, i) => {
          const isFading = entries.length >= 3 && i === 0
          return (
            <motion.div key={w.id} layout
              initial={{ opacity:0, y:18, x:-10 }}
              animate={{ opacity: isFading ? 0.18 : i === entries.length-1 ? 1 : 0.6, y:0, x:0 }}
              exit={{ opacity:0, y:-14, transition:{ duration:0.3 } }}
              transition={{ duration:0.38 }}
              style={{
                display:'flex', alignItems:'center', gap:9,
                borderRadius:10, padding:'10px 12px',
                background:'rgba(10,0,8,0.85)',
                border:'1px solid rgba(212,175,55,0.22)',
              }}
            >
              <span style={{ width:8, height:8, borderRadius:'50%', background:'#4ade80', flexShrink:0, animation:'pulse-dot 2s infinite' }} />
              <div style={{ minWidth:0 }}>
                <div style={{
                  fontFamily:"'Manrope', sans-serif", fontSize:12,
                  color:'rgba(255,255,255,0.9)', fontWeight:600,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                }}>
                  🏆 <span style={{ color:'#D4AF37' }}>{w.amount}</span> — {w.name}
                </div>
                <div style={{
                  fontFamily:"'Manrope', sans-serif", fontSize:10,
                  color:'rgba(255,255,255,0.4)', marginTop:2,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                }}>
                  {w.place} · {w.game}
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

function WinnerFeedMobile() {
  const entries = useWinnerFeed(2, 4000)
  return (
    <div className="md:hidden" style={{
      position:'absolute', top:58, left:8, zIndex:10,
      display:'flex', flexDirection:'column', gap:5,
      width:'clamp(144px,42vw,180px)', pointerEvents:'none',
    }}>
      <AnimatePresence mode="popLayout">
        {entries.map(w => (
          <motion.div key={w.id} layout
            initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, transition:{ duration:0.2 } }}
            transition={{ duration:0.25 }}
            style={{
              display:'flex', alignItems:'center', gap:6, borderRadius:8,
              padding:'6px 8px',
              background:'rgba(10,0,8,0.9)',
              border:'1px solid rgba(212,175,55,0.22)',
            }}
          >
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80', flexShrink:0, animation:'pulse-dot 2s infinite' }} />
            <div style={{ minWidth:0 }}>
              <div style={{
                fontFamily:"'Manrope', sans-serif", fontWeight:700,
                fontSize:'clamp(8px,2.2vw,9.5px)', color:'#fff',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}>
                🏆 <span style={{ color:'#D4AF37' }}>{w.amount}</span> {w.name}
              </div>
              <div style={{
                fontFamily:"'Manrope', sans-serif",
                fontSize:'clamp(7px,1.9vw,8px)', color:'rgba(255,255,255,0.45)',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}>
                {w.place} · {w.game}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ─── Countries ribbon fallback (used only until the API responds) ─────────
const FALLBACK_LOCATIONS = [
  { id: 'vn', name: 'Vietnam', country_code: 'VN' },
  { id: 'mo', name: 'Macau', country_code: 'MO' },
  { id: 'in', name: 'India (Goa)', country_code: 'IN' },
  { id: 'lk', name: 'Sri Lanka', country_code: 'LK' },
  { id: 'ph', name: 'Philippines', country_code: 'PH' },
  { id: 'us', name: 'Las Vegas', country_code: 'US' },
  { id: 'my', name: 'Malaysia', country_code: 'MY' },
  { id: 'sg', name: 'Singapore', country_code: 'SG' },
  { id: 'am', name: 'Armenia', country_code: 'AM' },
  { id: 'ge', name: 'Georgia', country_code: 'GE' },
  { id: 'kz', name: 'Kazakhstan', country_code: 'KZ' },
]

// ─── Partner emblem ─────────────────────────────────────────────────────────
// Hand-vectorized to match the provided reference art (red heart-shaped lobe
// + black circular lobe + tapered stem, gold trim throughout) — no standalone
// logo file exists anywhere in the project or as an accessible asset (see
// PartnerBadge note below), so this is a faithful recreation in code rather
// than an embedded image.
function PartnerEmblem({ size = 80 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id="pb-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F5E07A" />
          <stop offset="50%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
        <radialGradient id="pb-red" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ea4f45" />
          <stop offset="55%" stopColor="#c22019" />
          <stop offset="100%" stopColor="#821410" />
        </radialGradient>
        <radialGradient id="pb-black" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#333" />
          <stop offset="70%" stopColor="#0e0e0e" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
      </defs>

      {/* stem / base */}
      <path d="M45 66 Q39 83 32 92 Q50 98 68 92 Q61 83 55 66 Z"
        fill="url(#pb-black)" stroke="url(#pb-gold)" strokeWidth="2.4" strokeLinejoin="round" />

      {/* black circular lobe (lower-left) */}
      <circle cx="37" cy="50" r="24" fill="url(#pb-black)" stroke="url(#pb-gold)" strokeWidth="2.6" />

      {/* red heart-shaped lobe (upper-right) */}
      <path d="M64 32
               C64 23 56 16 47 18
               C40 20 36 26 37 33
               C38 45 51 57 64 70
               C77 57 90 45 91 33
               C92 26 88 20 81 18
               C72 16 64 23 64 32 Z"
        fill="url(#pb-red)" stroke="url(#pb-gold)" strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  )
}

const TRUST_ITEMS = [
  { Icon: ShieldCheck, label: 'Trusted' },
  { Icon: Crown, label: 'Premium' },
  { Icon: Gem, label: 'Exclusive' },
  { Icon: Gift, label: 'Gifts & Games' },
]

// ─── Sri Lankan Premium Valued Partner plaque ──────────────────────────────
// No literal Bellagio logo file is available in this project — the reference
// art supplied in chat isn't saved anywhere on disk this build can reach
// (no upload path resolves to a file), so PartnerEmblem above hand-recreates
// its exact composition (red heart lobe + black circle lobe + stem, gold
// trim) in SVG rather than embedding a raster copy. Swap in a real asset via
// PartnerEmblem if one becomes available in /public/images.
//
// Wide horizontal plaque (logo left, copy right) on desktop — deliberately
// breaks out of the Hero's normal 660px-capped content column (see the
// wrapper in the main render below) so it can occupy real horizontal width
// instead of reading as a narrow centered card. Collapses to a centered
// stacked column under 720px via .w365-partner-plaque in the CSS block up
// top, since a two-column layout has no room to breathe on phones.
function PartnerBadge() {
  return (
    <motion.div
      className="w365-partner-plaque"
      initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
      transition={{ delay:0.8, duration:0.5 }}
      style={{
        position:'relative',
        display:'flex', alignItems:'center', gap:'clamp(20px,4vw,40px)',
        padding:'clamp(18px,3.5vw,30px) clamp(24px,5vw,52px)',
        borderRadius:18,
        border:'1px solid rgba(212,175,55,0.45)',
        background:'linear-gradient(180deg, rgba(212,175,55,0.1) 0%, rgba(10,0,8,0.55) 100%)',
        boxShadow:'0 0 50px rgba(212,175,55,0.16), inset 0 1px 0 rgba(255,255,255,0.06)',
        width:'min(94vw, 920px)',
      }}
      aria-label="Our Sri Lankan Premium Valued Partner: Bellagio Casino, Colombo"
    >
      {/* Corner flourishes — plaque/certificate framing, not a plain box */}
      {[
        { top:10, left:10, borderWidth:'2px 0 0 2px', borderRadius:'6px 0 0 0' },
        { top:10, right:10, borderWidth:'2px 2px 0 0', borderRadius:'0 6px 0 0' },
        { bottom:10, left:10, borderWidth:'0 0 2px 2px', borderRadius:'0 0 0 6px' },
        { bottom:10, right:10, borderWidth:'0 2px 2px 0', borderRadius:'0 0 6px 0' },
      ].map((c, i) => (
        <span key={i} aria-hidden style={{
          position:'absolute', width:20, height:20,
          borderStyle:'solid', borderColor:'#D4AF37', opacity:0.65,
          ...c,
        }} />
      ))}

      <div className="w365-partner-emblem-wrap" style={{
        width:'clamp(72px,12vw,120px)', height:'clamp(72px,12vw,120px)',
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        filter:'drop-shadow(0 0 16px rgba(212,175,55,0.45))',
      }}>
        <PartnerEmblem size="100%" />
      </div>

      <div className="w365-partner-info" style={{ display:'flex', flexDirection:'column', gap:8, minWidth:0 }}>
        <div style={{
          fontFamily:"'Manrope', sans-serif", fontSize:'clamp(9px,1.6vw,11.5px)', fontWeight:700,
          letterSpacing:'0.16em', textTransform:'uppercase', color:'rgba(212,175,55,0.8)',
        }}>
          Our Sri Lankan Premium Valued Partner
        </div>

        <div style={{
          fontFamily:"'Manrope', sans-serif", fontSize:'clamp(24px,4.2vw,34px)', fontWeight:900,
          letterSpacing:'0.02em', color:'#F5E07A',
          textShadow:'0 0 22px rgba(212,175,55,0.5)', lineHeight:1.1,
        }}>
          BELLAGIO CASINO
        </div>

        <div style={{
          fontFamily:"'Manrope', sans-serif", fontSize:'clamp(10px,1.7vw,13px)', fontWeight:600,
          letterSpacing:'0.3em', color:'rgba(255,255,255,0.55)', textTransform:'uppercase',
        }}>
          Colombo
        </div>

        <div style={{ display:'flex', gap:4 }} aria-label="5 out of 5 stars">
          {[0,1,2,3,4].map(i => <Star key={i} size={15} color="#D4AF37" fill="#D4AF37" />)}
        </div>

        <div className="w365-trust-row" style={{ display:'flex', flexWrap:'wrap', gap:'6px 16px', marginTop:2 }}>
          {TRUST_ITEMS.map(({ Icon, label }, i) => (
            <span key={label} style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
              <Icon size={11} color="#D4AF37" strokeWidth={2} />
              <span style={{
                fontFamily:"'Manrope', sans-serif", fontSize:'clamp(8px,1.5vw,10px)', fontWeight:700,
                letterSpacing:'0.16em', color:'rgba(212,175,55,0.7)', textTransform:'uppercase',
              }}>
                {label}
              </span>
              {i < TRUST_ITEMS.length - 1 && (
                <span aria-hidden style={{ color:'rgba(212,175,55,0.35)', marginLeft:11 }}>|</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main Hero ────────────────────────────────────────────────────────────
export default function Hero() {
  const navigate = useNavigate()
  const [dailyCr, setDailyCr] = useState(getDailyWinnings)

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  const { data: locationsData } = useAutoFetch(fetchLocations, {}, { intervalMs: 60_000 })
  const locations = Array.isArray(locationsData) && locationsData.length > 0 ? locationsData : FALLBACK_LOCATIONS
  const countriesTrack = [...locations, ...locations]

  const { data: settings } = useAutoFetch(fetchLandingSettings, {}, { intervalMs: 60_000 })
  const { data: heroStatsData } = useAutoFetch(fetchHeroStats, {}, { intervalMs: 60_000 })

  // Background video loop fallback — some encodes don't honor the native
  // `loop` attribute reliably in every browser, so force-restart on end/pause.
  const videoRef = useRef(null)
  const restartVideo = () => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    v.play().catch(() => {})
  }

useEffect(() => {
  const handleResize = () => {
    setIsMobile(window.innerWidth < 768)
  }

  window.addEventListener('resize', handleResize)
  return () => window.removeEventListener('resize', handleResize)
}, [])

  useEffect(() => {
    injectCSS()
    const id = setInterval(() => setDailyCr(getDailyWinnings()), 60_000)
    return () => clearInterval(id)
  }, [])

  const FALLBACK_STATS = [
    { label:'Players',   value:'20K+' },
    { label:'Won Today', value:dailyCr.display },
    { label:'Countries', value:'10+' },
    { label:'Support',   value:'24/7' },
  ]
  const stats = (Array.isArray(heroStatsData) && heroStatsData.length > 0 ? heroStatsData : FALLBACK_STATS)
    .map(s => s.label?.toLowerCase() === 'won today' ? { ...s, value: dailyCr.display } : s)

  return (
    <section
      id="hero"
      style={{
        position:'relative', minHeight:'100vh',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        overflow:'hidden',
        background:'radial-gradient(ellipse at 50% 28%, #2e0024 0%, #160012 42%, #0A0005 100%)',
      }}
    >
      {/* Background video — sits behind everything else in the hero.
          `loop` is set natively, but the onEnded/onPause fallback below
          force-restarts playback for encodes some browsers won't loop
          seamlessly on their own (common with web-editor exports). */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onEnded={restartVideo}
        onPause={restartVideo}
        style={{
          position:'absolute', inset:0, width:'100%', height:'100%',
          objectFit:'cover', zIndex:0, pointerEvents:'none',
        }}
      >
        <source src={settings?.hero_background_video || "/videos/hero-background.mp4"} type="video/mp4" />
      </video>

      {/* Color-grading overlay — keeps the video in the site's dark magenta/gold
          palette and preserves text contrast, same gradient the section used
          as a plain background before the video was added */}
      <div style={{
        position:'absolute', inset:0, zIndex:1, pointerEvents:'none',
        background:'radial-gradient(ellipse at 50% 28%, rgba(46,0,36,0.62) 0%, rgba(22,0,18,0.78) 42%, rgba(10,0,5,0.92) 100%)',
      }} />

      {/* Spinning rings */}
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }} aria-hidden>
        {RINGS.map((s, i) => (
          <div key={i} style={{
            position:'absolute', width:s, height:s, borderRadius:'50%',
            border:'1px solid rgba(212,175,55,0.07)',
            animation:`${i % 2 === 0 ? 'spinRing' : 'spinRingR'} ${32 + i * 10}s linear infinite`,
            willChange:'transform',
          }} />
        ))}
      </div>

      {/* Floating cards — desktop only: on narrow viewports there's no margin
          room outside the centered text column, so these would otherwise
          overlap the winner feed / hero title / CTAs (see Dice desktop below,
          which already used this same guard) */}
      <div className="hidden md:contents">
        {floatingCards.map((c, i) => <FloatingCard key={i} {...c} />)}
      </div>

      {/* Floating luxury — desktop only, same reasoning as above */}
      <div className="hidden md:contents">
        {luxuryItems.map((item, i) => <FloatingLuxury key={i} {...item} />)}
      </div>

      {/* Rolex, right badge — shown on every breakpoint, including mobile;
          its position sits clear of the mobile winner feed / hero pill. */}
      <FloatingLuxury key="rolex-0" {...rolexItems[0]} />

      {/* Rolex, left badge — desktop only: at mobile widths this position
          overlaps WinnerFeedMobile's ticker (top:58, left:8, up to 180px
          wide), so it stays grouped with the other desktop-only items. */}
      <div className="hidden md:contents">
        <FloatingLuxury key="rolex-1" {...rolexItems[1]} />
      </div>

      {/* Dice desktop */}
      {[
        { left:'3%',  top:'14%'    },
        { right:'4%', top:'18%'    },
        { left:'7%',  bottom:'18%' },
        { right:'6%', bottom:'22%' },
      ].map((d, i) => (
        <div key={i} className="hidden md:block" style={{
          position:'absolute', opacity:0.18, pointerEvents:'none', userSelect:'none',
          fontSize:'clamp(24px,4vw,40px)',
          left:d.left, right:d.right, top:d.top, bottom:d.bottom,
          animation:`spinRing ${14 + i * 3}s linear infinite`,
          willChange:'transform',
        }}>🎲</div>
      ))}

      {/* Casino Girl — Desktop BIGGER */}
      <div
        className="hidden md:block"
        style={{
          position:'absolute', right:0, bottom:0,
          height:'min(96vh, 860px)',
          zIndex:5, pointerEvents:'none', userSelect:'none',
          WebkitMaskImage:'linear-gradient(to top, transparent 0%, black 11%)',
          maskImage:'linear-gradient(to top, transparent 0%, black 11%)',
          animation:'girlFadeIn 1.2s 0.5s both ease-out',
        }}
      >
        {/* <img
          src="/images/casino-girl.png"
          alt="Casino Girl"
          style={{
            height:'100%', width:'auto',
            objectFit:'contain', objectPosition:'bottom',
            maxWidth:640,
            opacity:0.82,
          }}
          onError={e => { e.currentTarget.style.display='none' }}
        /> */}
      </div>

      {/* Mobile hero accent — premium gold-glow gradient (replaces the model
          image on narrow viewports only; desktop is untouched above) */}
      <div
        className="md:hidden"
        style={{
          position:'absolute', right:0, bottom:0, left:0,
          height:'min(76vw, 360px)',
          zIndex:2, opacity:0.62,
          pointerEvents:'none', userSelect:'none',
          WebkitMaskImage:'linear-gradient(to top, transparent 0%, black 20%)',
          maskImage:'linear-gradient(to top, transparent 0%, black 20%)',
        }}
      >
        <div style={{
          width:'100%', height:'100%',
          background:'radial-gradient(ellipse at 75% 100%, rgba(212,175,55,0.4) 0%, rgba(46,0,36,0.3) 45%, transparent 75%)',
        }} />
      </div>

      {/* Winner feeds */}
      {isMobile ? <WinnerFeedMobile /> : <WinnerFeedDesktop />}

      {/* Main Content */}
      <div style={{
        position:'relative', zIndex:10, textAlign:'center', width:'100%',
        maxWidth:660,
        paddingTop:'clamp(72px,18vw,108px)',
        paddingBottom:'clamp(80px,12vw,90px)',
        paddingLeft:'clamp(16px,5vw,24px)',
        paddingRight:'clamp(16px,5vw,24px)',
      }}>

        {/* Badge */}
        <motion.div
          initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.2, duration:0.45 }}
          style={{
            display:'inline-flex', alignItems:'center', gap:9,
            border:'1.5px solid rgba(245,224,122,0.7)', borderRadius:999,
            padding:'8px 20px', marginBottom:'clamp(12px,3vw,24px)',
            background:'rgba(212,175,55,0.16)',
            fontFamily:"'Manrope', sans-serif",
            fontSize:'clamp(9px,2vw,11.5px)', fontWeight:900,
            letterSpacing:'0.16em',
            color:'#F5E07A',
            textShadow:'0 0 12px rgba(212,175,55,0.7)',
            animation:'badgeGlow 2.6s ease-in-out infinite',
          }}
        >
          <span style={{ width:7, height:7, borderRadius:'50%', background:'#4ade80', flexShrink:0, animation:'pulse-dot 2s infinite', display:'inline-block' }} />
          {(settings?.hero_badge_text || "Asia's #1 Offline Casinos VIP's Platform")
            .toUpperCase()
            .replace(/CASINO'S\b/, 'CASINOS')
            .replace(/\bASIA'S\b/, "ASIA's")}
        </motion.div>

        {/* H1 */}
        <motion.h1
          initial={{ opacity:0, y:32 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.35, duration:0.65 }}
          style={{
            fontFamily:"'Manrope', sans-serif",
            fontWeight:700,
            fontSize:'clamp(52px,13vw,120px)',
            lineHeight:0.9,
            margin:'0 0 6px 0',
            letterSpacing:'-0.01em',
          }}
        >
          <span style={{
            background:'linear-gradient(135deg, #D4AF37 0%, #F5E07A 40%, #C9972A 70%, #D4AF37 100%)',
            backgroundSize:'200% auto',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
            animation:'shimmer 3.5s linear infinite',
          }}>JACKPOTS</span>
          <br />
          <span style={{ color:'rgba(255,255,255,0.92)' }}>WORLD</span>
        </motion.h1>

        {/* Gold divider */}
        <motion.div
          initial={{ scaleX:0 }} animate={{ scaleX:1 }}
          transition={{ delay:0.58, duration:0.45 }}
          style={{
            width:56, height:2,
            background:'linear-gradient(90deg, transparent, #D4AF37, transparent)',
            margin:'10px auto 16px auto',
          }}
        />

        {/* Destinations badge — same component/styling as the top badge */}
        <motion.div
          initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.68, duration:0.45 }}
          style={{
            display:'inline-flex', alignItems:'center', gap:8,
            border:'1px solid rgba(212,175,55,0.35)', borderRadius:999,
            padding:'6px 16px', marginBottom:'clamp(12px,3vw,24px)',
            background:'rgba(212,175,55,0.07)',
            fontFamily:"'Manrope', sans-serif",
            fontSize:'clamp(8px,1.8vw,10px)', fontWeight:700,
            letterSpacing:'0.18em', textTransform:'uppercase',
            color:'rgba(212,175,55,0.8)',
          }}
        >
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80', flexShrink:0, animation:'pulse-dot 2s infinite', display:'inline-block' }} />
          {settings?.global_reach_tagline || 'Experience World-Class Casino Gaming Across'}
        </motion.div>
      </div>

      {/* Wide section — the ticker and partner plaque deliberately break out
          of the 660px-capped column above/below (title, badges, CTAs stay in
          that narrower centered column unchanged) so they can use real
          horizontal space on desktop instead of reading as a narrow pill/
          card, while each still centers itself and caps its own width so
          neither ever touches the viewport edge or overflows on mobile. */}
      <div style={{
        position:'relative', zIndex:10, width:'100%',
        display:'flex', flexDirection:'column', alignItems:'center',
        paddingLeft:'clamp(16px,5vw,24px)', paddingRight:'clamp(16px,5vw,24px)',
      }}>
        {/* Location ticker — small/thin premium pill, independent of the
            badge above (no longer size-locked to it). Same metallic-gold
            theme (gradient + shimmer sweep) as the CTA/heading elsewhere on
            the page, just compact. Only the location text scrolls inside it;
            data comes from the same admin-managed SupportedLocation API, so
            new locations added in the Admin Panel show up automatically.
            Hover-to-pause only applies on real-mouse (desktop) devices —
            see .w365-location-ticker:hover in the CSS block above — so
            touch/mobile keeps scrolling continuously without needing hover. */}
        <motion.div
          className="w365-location-ticker"
          initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.75, duration:0.45 }}
          style={{
            display:'inline-flex', alignItems:'center', gap:6,
            border:'1px solid #F5E07A', borderRadius:999,
            padding:'4px 16px', marginBottom:'clamp(12px,3vw,24px)',
            background:'linear-gradient(135deg,#9c7a24,#D4AF37,#F9E8A0,#D4AF37,#9c7a24)',
            backgroundSize:'220% auto',
            animation:'shimmer 4.5s linear infinite',
            boxShadow:'0 0 10px rgba(212,175,55,0.4), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.5)',
            fontFamily:"'Manrope', sans-serif",
            fontSize:'clamp(7px,1.3vw,9.5px)', fontWeight:700,
            letterSpacing:'0.14em', textTransform:'uppercase',
            color:'#1a0010',
            width:'min(94vw, 900px)',
            boxSizing:'border-box',
            overflow:'hidden',
            position:'relative',
          }}
          aria-label="Casino destinations we operate in"
        >
          <span aria-hidden style={{ width:4, height:4, borderRadius:'50%', background:'#1a6b1f', flexShrink:0, animation:'pulse-dot 2s infinite', display:'inline-block' }} />
          <div style={{ overflow:'hidden', flex:'1 1 auto', minWidth:0 }}>
            <div
              className="w365-countries-track"
              style={{
                display:'inline-flex', alignItems:'center', gap:'1.1em',
                whiteSpace:'nowrap', width:'max-content',
                animation:'w365-countries-marquee 26s linear infinite',
                willChange:'transform',
              }}
            >
              {countriesTrack.map((loc, i) => {
                const iconUrl = flagIconUrl(loc.country_code)
                const emoji = flagFromCountryCode(loc.country_code)
                return (
                  <span key={`${loc.id ?? loc.name}-${i}`} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                    {iconUrl ? (
                      <img src={iconUrl} alt="" aria-hidden style={{ width:'1.2em', height:'0.9em', objectFit:'cover', borderRadius:2, boxShadow:'0 0 0 1px rgba(0,0,0,0.15)', flexShrink:0 }} />
                    ) : emoji ? (
                      <span style={{ fontSize:'1.1em', lineHeight:1 }}>{emoji}</span>
                    ) : (
                      <MapPin size={7} />
                    )}
                    {loc.name}
                    <span aria-hidden style={{ color:'rgba(26,0,16,0.5)' }}>•</span>
                  </span>
                )
              })}
            </div>
          </div>
        </motion.div>

        <PartnerBadge />
      </div>

      <div style={{
        position:'relative', zIndex:10, textAlign:'center', width:'100%',
        maxWidth:660, margin:'0 auto',
        paddingLeft:'clamp(16px,5vw,24px)',
        paddingRight:'clamp(16px,5vw,24px)',
      }}>
        <motion.p
          initial={{ opacity:0 }} animate={{ opacity:1 }}
          transition={{ delay:0.82 }}
          style={{
            fontFamily:"'Manrope', sans-serif",
            color:'rgba(255,255,255,0.28)',
            fontSize:'clamp(8px,2vw,11px)', letterSpacing:'0.14em',
            marginTop:'clamp(8px,2vw,16px)',
            marginBottom:'clamp(20px,4vw,32px)',
          }}
        >
          {settings?.hero_tagline || 'www.jackpotsworld.vip'}
        </motion.p>

        {/* CTAs — className is a hook SupportAssistant.jsx queries to keep
            its own floating position clear of these buttons at runtime */}
        <motion.div
          className="w365-hero-ctas"
          initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.92 }}
          style={{
            display:'flex', gap:'clamp(8px,2.5vw,16px)', justifyContent:'center', flexWrap:'wrap',
            // width:fit-content (not the parent's full width) so this
            // container's own bounding box hugs the two buttons — SupportAssistant.jsx
            // measures this rect to keep clear of the CTAs, and a full-width
            // box padded with empty centered space would make that check
            // wildly over-conservative.
            width:'fit-content', maxWidth:'100%', margin:'0 auto',
          }}
        >
          <Link to="register" smooth duration={600} offset={-80}>
            <motion.button
              whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
              style={{
                background:'linear-gradient(135deg,#C9972A,#D4AF37,#F5E07A,#D4AF37)',
                backgroundSize:'200% auto',
                color:'#1a0010', border:'none', borderRadius:999,
                padding:'clamp(10px,2.5vw,14px) clamp(18px,4.5vw,38px)',
                fontFamily:"'Manrope', sans-serif",
                fontSize:'clamp(9px,2.2vw,13px)', fontWeight:900,
                letterSpacing:'0.13em', textTransform:'uppercase',
                cursor:'pointer',
                boxShadow:'0 0 28px rgba(212,175,55,0.4)',
                touchAction:'manipulation',
              }}
            >{(settings?.hero_cta_primary_label && !settings.hero_cta_primary_label.includes('?')) ? settings.hero_cta_primary_label : '🎰 Register — FREE'}</motion.button>
          </Link>
          <Link to="packages-all" smooth duration={600} offset={-80}>
            <motion.button
              whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
              style={{
                background:'transparent',
                color:'rgba(212,175,55,0.9)',
                border:'1.5px solid rgba(212,175,55,0.45)',
                borderRadius:999,
                padding:'clamp(10px,2.5vw,14px) clamp(18px,4.5vw,38px)',
                fontFamily:"'Manrope', sans-serif",
                fontSize:'clamp(9px,2.2vw,13px)', fontWeight:700,
                letterSpacing:'0.13em', textTransform:'uppercase',
                cursor:'pointer', touchAction:'manipulation',
              }}
            >{(settings?.hero_cta_secondary_label && !settings.hero_cta_secondary_label.includes('?')) ? settings.hero_cta_secondary_label : 'Packages ✨'}</motion.button>
          </Link>
        </motion.div>

        {/* Secondary nav — Events / Destinations / Promotions (moved here from
            the navbar). Styled as the exact same secondary button component
            as "Packages" above (transparent gold-outline, same padding/font/
            radius/hover-tap/transitions), keeping Register as the sole
            primary gold-filled/glow CTA on the page. */}
        <motion.div
          initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:1.0 }}
          style={{
            display:'flex', gap:'clamp(8px,2vw,12px)', justifyContent:'center',
            flexWrap:'wrap', marginTop:'clamp(10px,2.5vw,16px)',
          }}
        >
          {[
            { label:'Events', icon:CalendarDays, onClick:() => navigate('/events') },
            { label:'Destinations', icon:MapPinned, onClick:() => {
                const el = document.getElementById('packages')
                if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 80, behavior:'smooth' })
              } },
            { label:'Promotions', icon:Gift, onClick:() => navigate('/promotions') },
          ].map(({ label, icon:Icon, onClick }) => (
            <motion.button
              key={label}
              onClick={onClick}
              whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
              style={{
                display:'flex', alignItems:'center', gap:6,
                background:'transparent',
                color:'rgba(212,175,55,0.9)',
                border:'1.5px solid rgba(212,175,55,0.45)',
                borderRadius:999,
                padding:'clamp(10px,2.5vw,14px) clamp(18px,4.5vw,38px)',
                fontFamily:"'Manrope', sans-serif",
                fontSize:'clamp(9px,2.2vw,13px)', fontWeight:700,
                letterSpacing:'0.13em', textTransform:'uppercase',
                cursor:'pointer', touchAction:'manipulation',
              }}
            >
              <Icon size={12} />
              {label}
            </motion.button>
          ))}
        </motion.div>

        {/* Stats */}
        <motion.div
  initial={{ opacity: 0, y: 24 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 1.08 }}
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(4,1fr)',
    gap: 'clamp(6px,2vw,14px)',
    marginTop: 'clamp(20px,5vw,44px)',
    maxWidth: 'clamp(300px,90vw,640px)',
    marginLeft: 'auto',
    marginRight: 'auto',
  }}
>
  {stats.map((s, i) => (
    <div
      key={i}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 'clamp(64px,14vw,96px)', // fixed height so all cards are equal
        padding: '0 clamp(4px,1.5vw,10px)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(212,175,55,0.18)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontWeight: 700,
          fontSize: 'clamp(16px,3.8vw,28px)',
          background: 'linear-gradient(135deg,#D4AF37,#F5E07A)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1,
          whiteSpace: 'nowrap', // prevent value from wrapping
        }}
      >
        {s.value}
      </div>
      <div
        style={{
          fontFamily: "'Manrope', sans-serif",
          color: 'rgba(255,255,255,0.45)',
          fontSize: 'clamp(6px,1.4vw,9px)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          marginTop: 5,
          whiteSpace: 'nowrap', // prevent label from wrapping too
        }}
      >
        {s.label}
      </div>
    </div>
  ))}
</motion.div>
      </div>

      {/* Scroll indicator */}
      <div style={{
        position:'absolute', bottom:'clamp(12px,3vw,28px)', left:'50%',
        display:'flex', flexDirection:'column', alignItems:'center', gap:4,
        color:'rgba(212,175,55,0.3)',
        animation:'scrollBounce 1.6s 2s ease-in-out infinite',
        transform:'translateX(-50%)',
      }}>
        <div style={{ fontFamily:"'Manrope', sans-serif", fontSize:7, letterSpacing:'0.2em', textTransform:'uppercase' }}>Scroll</div>
        <div style={{ width:1, height:'clamp(20px,4vw,40px)', background:'linear-gradient(to bottom, rgba(212,175,55,0.4), transparent)' }} />
      </div>
    </section>
  )
}