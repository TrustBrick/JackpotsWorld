import React, { useEffect, useState, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-scroll'
import { useNavigate } from 'react-router-dom'
import { Gem, CalendarDays, MapPinned, Gift, MapPin } from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchLocations } from '../services/locationService'
import { flagFromCountryCode } from '../utils/countryFlags'

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
  @media (prefers-reduced-motion: reduce) {
    .w365-countries-track { animation: none !important; }
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
      fontFamily:"'Space Grotesk', sans-serif",
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
const luxuryItems = [
  { logo:'/images/logos/benz.png',  label:'BENZ',  pos:{left:'9%',  top:'36%'}, delay:0.5, color:'#C8C8C8' },
  { logo:'/images/logos/bmw.png',   label:'BMW',   pos:{right:'14%',top:'30%'}, delay:2.0, color:'#4FC3F7' },
  { logo:'/images/logos/apple.png', label:'APPLE', pos:{left:'11%', top:'62%'}, delay:1.2, color:'#E8E8E8' },
  { logo:'/images/logos/rolex.png', label:'ROLEX', pos:{right:'19%',top:'14%'}, delay:3.5, color:'#D4AF37' },
  { Icon: Gem,                       label:'VIP',   pos:{right:'3%', top:'60%'}, delay:4.2, color:'#B47FFF' },
  { logo:'/images/logos/rolex.png', label:'ROLEX', pos:{left:'1%',  top:'16%'}, delay:2.8, color:'#D4AF37' },
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
        fontFamily:"'Space Grotesk', sans-serif",
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
const CURRENCIES = [
  { min:500,   max:8000,   fmt: v=>`$${v.toLocaleString()}`  },
  { min:5000,  max:200000, fmt: v=>`₱${v.toLocaleString()}`  },
  { min:400,   max:6000,   fmt: v=>`€${v.toLocaleString()}`  },
  { min:300,   max:5000,   fmt: v=>`£${v.toLocaleString()}`  },
  { min:50000, max:1000000,fmt: v=>`¥${v.toLocaleString()}`  },
]
function makeWinner(id) {
  const cur = CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)]
  const amt = Math.floor(Math.random() * (cur.max - cur.min) + cur.min)
  return {
    id, name:randomName(),
    place:PLACES[~~(Math.random()*PLACES.length)],
    game:GAMES[~~(Math.random()*GAMES.length)],
    amount:cur.fmt(amt),
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
                  fontFamily:"'Space Grotesk', sans-serif", fontSize:12,
                  color:'rgba(255,255,255,0.9)', fontWeight:600,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                }}>
                  🏆 <span style={{ color:'#D4AF37' }}>{w.amount}</span> — {w.name}
                </div>
                <div style={{
                  fontFamily:"'Space Grotesk', sans-serif", fontSize:10,
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
                fontFamily:"'Space Grotesk', sans-serif", fontWeight:700,
                fontSize:'clamp(8px,2.2vw,9.5px)', color:'#fff',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}>
                🏆 <span style={{ color:'#D4AF37' }}>{w.amount}</span> {w.name}
              </div>
              <div style={{
                fontFamily:"'Space Grotesk', sans-serif",
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
  { id: 'in', name: 'India', country_code: 'IN' },
  { id: 'lk', name: 'Sri Lanka', country_code: 'LK' },
  { id: 'ph', name: 'Philippines', country_code: 'PH' },
]

// ─── Main Hero ────────────────────────────────────────────────────────────
export default function Hero() {
  const navigate = useNavigate()
  const [dailyCr, setDailyCr] = useState(getDailyWinnings)

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // Countries ribbon — pinned to the exact rendered size of the "Experience
  // World-Class Casino Gaming Across" badge above it, so the scrolling text
  // never grows the pill wider/taller than that badge at any breakpoint.
  const countriesBadgeRef = useRef(null)
  const [countriesBadgeSize, setCountriesBadgeSize] = useState(null)
  useEffect(() => {
    const el = countriesBadgeRef.current
    if (!el) return
    const update = () => setCountriesBadgeSize({ width: el.offsetWidth, height: el.offsetHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // Web-font swap (e.g. Space Grotesk finishing load) can reflow the badge
    // narrower after the first measurement without ResizeObserver firing
    // again reliably in every browser, so re-measure once fonts settle too.
    document.fonts?.ready?.then(update)
    // Belt-and-suspenders: some browsers throttle ResizeObserver callbacks
    // for backgrounded/occluded tabs, so also re-measure on window resize.
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const { data: locationsData } = useAutoFetch(fetchLocations, {}, { intervalMs: 60_000 })
  const locations = Array.isArray(locationsData) && locationsData.length > 0 ? locationsData : FALLBACK_LOCATIONS
  const countriesTrack = [...locations, ...locations]

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

  const stats = [
    { value:'20K+',          label:'Players'   },
    { value:dailyCr.display, label:'Won Today' },
    { value:'10+',            label:'Countries' },
    { value:'24/7',          label:'Support'   },
  ]

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
        <source src="/videos/hero-background.mp4" type="video/mp4" />
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

      {/* Casino Girl — Mobile */}
      <div
        className="md:hidden"
        style={{
          position:'absolute', right:0, bottom:0,
          height:'min(76vw, 360px)',
          zIndex:2, opacity:0.62,
          pointerEvents:'none', userSelect:'none',
          WebkitMaskImage:'linear-gradient(to top, transparent 0%, black 20%), linear-gradient(to left, black 55%, transparent 100%)',
          maskImage:'linear-gradient(to top, transparent 0%, black 20%), linear-gradient(to left, black 55%, transparent 100%)',
          WebkitMaskComposite:'destination-in', maskComposite:'intersect',
        }}
      >
        <img
          src="/images/casino-girl.png" alt=""
          style={{ height:'100%', width:'auto', objectFit:'contain', objectPosition:'bottom right' }}
          onError={e => { e.currentTarget.style.display='none' }}
        />
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
            display:'inline-flex', alignItems:'center', gap:8,
            border:'1px solid rgba(212,175,55,0.35)', borderRadius:999,
            padding:'6px 16px', marginBottom:'clamp(12px,3vw,24px)',
            background:'rgba(212,175,55,0.07)',
            fontFamily:"'Space Grotesk', sans-serif",
            fontSize:'clamp(8px,1.8vw,10px)', fontWeight:700,
            letterSpacing:'0.18em', textTransform:'uppercase',
            color:'rgba(212,175,55,0.8)',
          }}
        >
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80', flexShrink:0, animation:'pulse-dot 2s infinite', display:'inline-block' }} />
          Asia's #1 Offline Casino Promotion Platform
        </motion.div>

        {/* H1 */}
        <motion.h1
          initial={{ opacity:0, y:32 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.35, duration:0.65 }}
          style={{
            fontFamily:"'Poppins', sans-serif",
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
          ref={countriesBadgeRef}
          initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.68, duration:0.45 }}
          style={{
            display:'inline-flex', alignItems:'center', gap:8,
            border:'1px solid rgba(212,175,55,0.35)', borderRadius:999,
            padding:'6px 16px', marginBottom:'clamp(12px,3vw,24px)',
            background:'rgba(212,175,55,0.07)',
            fontFamily:"'Space Grotesk', sans-serif",
            fontSize:'clamp(8px,1.8vw,10px)', fontWeight:700,
            letterSpacing:'0.18em', textTransform:'uppercase',
            color:'rgba(212,175,55,0.8)',
          }}
        >
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80', flexShrink:0, animation:'pulse-dot 2s infinite', display:'inline-block' }} />
          Experience World-Class Casino Gaming Across
        </motion.div>

        {/* Countries ribbon — same size/position/layout as before (pinned to
            the badge above's exact rendered width/height), restyled to the
            premium metallic-gold theme: same gradient + shimmer sweep as
            the CTA button/JACKPOTS heading elsewhere on this page. Only the
            country text scrolls inside it; data comes from the same
            admin-managed SupportedLocation API, so new countries added in
            the Admin Panel show up automatically. */}
        <motion.div
          initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.75, duration:0.45 }}
          style={{
            display:'inline-flex', alignItems:'center', gap:8,
            border:'1.5px solid #F5E07A', borderRadius:999,
            padding:'6px 16px', marginBottom:'clamp(12px,3vw,24px)',
            background:'linear-gradient(135deg,#9c7a24,#D4AF37,#F9E8A0,#D4AF37,#9c7a24)',
            backgroundSize:'220% auto',
            animation:'shimmer 4.5s linear infinite',
            boxShadow:'0 0 16px rgba(212,175,55,0.5), 0 4px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 2px rgba(120,80,10,0.35)',
            fontFamily:"'Space Grotesk', sans-serif",
            fontSize:'clamp(8px,1.8vw,10px)', fontWeight:700,
            letterSpacing:'0.18em', textTransform:'uppercase',
            color:'#1a0010',
            width: countriesBadgeSize ? countriesBadgeSize.width : undefined,
            height: countriesBadgeSize ? countriesBadgeSize.height : undefined,
            boxSizing:'border-box',
            overflow:'hidden',
            position:'relative',
          }}
          aria-label="Casino destinations we operate in"
        >
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#1a6b1f', flexShrink:0, animation:'pulse-dot 2s infinite', display:'inline-block' }} />
          <div style={{ overflow:'hidden', flex:'1 1 auto', minWidth:0 }}>
            <div
              className="w365-countries-track"
              style={{
                display:'inline-flex', alignItems:'center', gap:'1.4em',
                whiteSpace:'nowrap', width:'max-content',
                animation:'w365-countries-marquee 16s linear infinite',
                willChange:'transform',
              }}
            >
              {countriesTrack.map((loc, i) => (
                <span key={`${loc.id ?? loc.name}-${i}`} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:'1.3em', lineHeight:1 }}>
                    {flagFromCountryCode(loc.country_code) || <MapPin size={9} />}
                  </span>
                  {loc.name}
                  <span aria-hidden style={{ color:'rgba(26,0,16,0.55)' }}>•</span>
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity:0 }} animate={{ opacity:1 }}
          transition={{ delay:0.82 }}
          style={{
            fontFamily:"'Space Grotesk', sans-serif",
            color:'rgba(255,255,255,0.28)',
            fontSize:'clamp(8px,2vw,11px)', letterSpacing:'0.14em',
            marginBottom:'clamp(20px,4vw,32px)',
          }}
        >
          www.jackpotsworld.casino
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:0.92 }}
          style={{ display:'flex', gap:'clamp(8px,2.5vw,16px)', justifyContent:'center', flexWrap:'wrap' }}
        >
          <Link to="register" smooth duration={600} offset={-80}>
            <motion.button
              whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
              style={{
                background:'linear-gradient(135deg,#C9972A,#D4AF37,#F5E07A,#D4AF37)',
                backgroundSize:'200% auto',
                color:'#1a0010', border:'none', borderRadius:999,
                padding:'clamp(10px,2.5vw,14px) clamp(18px,4.5vw,38px)',
                fontFamily:"'Space Grotesk', sans-serif",
                fontSize:'clamp(9px,2.2vw,13px)', fontWeight:900,
                letterSpacing:'0.13em', textTransform:'uppercase',
                cursor:'pointer',
                boxShadow:'0 0 28px rgba(212,175,55,0.4)',
                touchAction:'manipulation',
              }}
            >🎰 Register — FREE</motion.button>
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
                fontFamily:"'Space Grotesk', sans-serif",
                fontSize:'clamp(9px,2.2vw,13px)', fontWeight:700,
                letterSpacing:'0.13em', textTransform:'uppercase',
                cursor:'pointer', touchAction:'manipulation',
              }}
            >Packages ✨</motion.button>
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
                fontFamily:"'Space Grotesk', sans-serif",
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
          fontFamily: "'Space Grotesk', sans-serif",
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
          fontFamily: "'Space Grotesk', sans-serif",
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
        <div style={{ fontFamily:"'Space Grotesk', sans-serif", fontSize:7, letterSpacing:'0.2em', textTransform:'uppercase' }}>Scroll</div>
        <div style={{ width:1, height:'clamp(20px,4vw,40px)', background:'linear-gradient(to bottom, rgba(212,175,55,0.4), transparent)' }} />
      </div>
    </section>
  )
}