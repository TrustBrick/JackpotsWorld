import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-scroll'
import {
  Menu, X, Gift, LogIn, UserPlus, LogOut,
  ChevronDown, User, Crown, Wallet,
} from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import AuthModal from './AuthModal'

// ─── Nav link config ──────────────────────────────────────────────────────────
// type: 'scroll'  -> existing homepage sections (react-scroll on "/", falls
//                     back to navigate-then-scroll from any other page)
//       'route'   -> dedicated pages, navigated via React Router
//       'contact' -> always scrolls to the homepage Contact section, from
//                     any page (never opens a separate page)
const navLinks = [
  { label: 'Home',         type: 'scroll',  to: 'hero'     },
  { label: 'VIP Levels',   type: 'scroll',  to: 'vip'      },
  { label: 'Events',       type: 'route',   path: '/events'     },
  { label: 'Destinations', type: 'scroll',  to: 'packages' },
  { label: 'Promotions',   type: 'route',   path: '/promotions' },
  { label: 'Affiliates',   type: 'route',   path: '/affiliates' },
  { label: 'Poker',        type: 'route',   path: '/poker'      },
  { label: 'Contacts',     type: 'contact', to: 'contact'  },
  { label: 'Why Us',       type: 'scroll',  to: 'why'      },
  { label: 'Register',     type: 'scroll',  to: 'register' },
  { label: 'Gifts',        type: 'scroll',  to: 'gifts', isGift: true },
]

// ─── User Dropdown ────────────────────────────────────────────────────────────
function UserDropdown({ user, onLogout, onRequireAuth }) {
  const [open, setOpen] = useState(false)
  const ref             = useRef(null)
  const navigate        = useNavigate()

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email?.[0]?.toUpperCase() || '?'

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-200"
        style={{
          background: 'rgba(212,175,55,0.1)',
          border:     '1px solid rgba(212,175,55,0.35)',
          color:      '#D4AF37',
        }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #B8941E)', color: '#0a0005' }}
        >
          {initials}
        </div>
        <span
          className="font-body text-sm font-semibold tracking-wide hidden lg:block"
          style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {user.name || user.email?.split('@')[0]}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{   opacity: 0, y: -8,  scale: 0.95 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2 rounded-2xl overflow-hidden z-50 min-w-[200px]"
            style={{
              background: 'linear-gradient(160deg, #120008, #0a0005)',
              border:     '1px solid rgba(212,175,55,0.2)',
              boxShadow:  '0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(212,175,55,0.06)',
            }}
          >
            <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

            <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212,175,55,0.1)' }}>
              <div className="text-xs text-white/35 tracking-widest uppercase mb-0.5">Logged in as</div>
              <div className="text-sm text-white/85 font-bold truncate">{user.name || user.email}</div>
              {user.name && <div className="text-xs text-white/30 truncate">{user.email}</div>}
            </div>

            <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212,175,55,0.1)' }}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 text-white/40"><Crown size={11} /> VIP Level</span>
                <span className="font-black" style={{ color: '#D4AF37' }}>VIP {user.vip_level || 1}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white/40"><Wallet size={11} /> Wallet</span>
                <span className="font-black text-emerald-400">
                  ${Number(user.wallet_balance || 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="py-1.5">
              <button
                onClick={() => {
  const token = localStorage.getItem('access')

  if (!token) {
  onRequireAuth?.()
} else {
    navigate('/dashboard')   // go to dashboard
  }
}}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all duration-150 text-left"
                style={{ color: 'rgba(255,255,255,0.55)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'white' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
              >
                <User size={14} /> Dashboard
              </button>
              <button
                onClick={() => { setOpen(false); onLogout() }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all duration-150 text-left font-semibold"
                style={{ color: 'rgba(255,80,100,0.8)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,51,102,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Nav label (shared between the "Gifts" pill and plain text links) ────────
function NavLabel({ link }) {
  if (link.isGift) {
    return (
      <motion.span
        whileHover={{ scale: 1.08 }}
        className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-body text-sm font-bold tracking-widest uppercase"
        style={{
          background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))',
          border:     '1px solid rgba(212,175,55,0.55)',
          color:      '#D4AF37',
          boxShadow:  '0 0 14px rgba(212,175,55,0.25)',
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" style={{ boxShadow: '0 0 6px #D4AF37' }} />
        <Gift size={13} strokeWidth={2} />
        Gifts
        <motion.span
          className="absolute inset-0 rounded-full"
          animate={{ opacity: [0, 0.15, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)' }}
        />
      </motion.span>
    )
  }
  return (
    <span className="nav-link whitespace-nowrap text-[13px] lg:text-[14px] tracking-wide">
      {link.label}
    </span>
  )
}

function NavLabelMobile({ link }) {
  if (link.isGift) {
    return (
      <span
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-body text-sm font-bold tracking-widest uppercase"
        style={{
          background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))',
          border:     '1px solid rgba(212,175,55,0.5)',
          color:      '#D4AF37',
        }}
      >
        <Gift size={13} />Gifts 🎁
      </span>
    )
  }
  return (
    <span
      className="nav-link block py-2.5 text-base border-b"
      style={{ borderColor: 'rgba(212,175,55,0.08)' }}
    >
      {link.label}
    </span>
  )
}

// ─── Main Navbar ──────────────────────────────────────────────────────────────
export default function Navbar() {
  const [scrolled,   setScrolled]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [modalTab,   setModalTab]   = useState('login')
  const [user,       setUser]       = useState(null)

  const navigate  = useNavigate()
  const location  = useLocation()
  const isHome    = location.pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
  const saved = localStorage.getItem('user')
  if (saved) setUser(JSON.parse(saved))
}, [])

  // ── Cross-page scroll support ──────────────────────────────────────────────
  // If a nav item that scrolls to a homepage section (Home, VIP Levels,
  // Destinations, Why Us, Gifts, Register, Contacts) is clicked while on a
  // different route (e.g. /events), we navigate home first and then scroll
  // to the target section once it mounts. On the homepage itself, the
  // original react-scroll <Link> behaviour is left completely untouched.
  useEffect(() => {
    const target = sessionStorage.getItem('jw_scroll_target')
    if (!target || !isHome) return
    sessionStorage.removeItem('jw_scroll_target')

    let attempts = 0
    const tryScroll = () => {
      const el = document.getElementById(target) || document.getElementsByName(target)[0]
      if (el) {
        const y = el.getBoundingClientRect().top + window.pageYOffset - 80
        window.scrollTo({ top: y, behavior: 'smooth' })
      } else if (attempts < 30) {
        attempts += 1
        setTimeout(tryScroll, 100)
      }
    }
    setTimeout(tryScroll, 60)
  }, [isHome])

  const goToSection = (target) => {
    if (isHome) {
      const el = document.getElementById(target) || document.getElementsByName(target)[0]
      if (el) {
        const y = el.getBoundingClientRect().top + window.pageYOffset - 80
        window.scrollTo({ top: y, behavior: 'smooth' })
      }
    } else {
      sessionStorage.setItem('jw_scroll_target', target)
      navigate('/')
    }
  }

  const openLogin    = () => { setModalTab('login');    setModalOpen(true) }
  const openRegister = () => { setModalTab('register'); setModalOpen(true) }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('user')
    localStorage.removeItem('access')    // ← was 'user_token'
    localStorage.removeItem('refresh')   // ← was 'user_refresh'
}

  const handleAuthSuccess = (userData) => {
  setModalOpen(false)
  setUser(userData)
  localStorage.setItem('user', JSON.stringify(userData))
  setTimeout(() => navigate('/dashboard'), 50)
}

  return (
    <>
      <AuthModal
  isOpen={modalOpen}
  onClose={() => setModalOpen(false)}
  defaultTab={modalTab}
  onAuthSuccess={handleAuthSuccess}
/>

      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0,   opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-casino-dark/95 backdrop-blur-md border-b border-gold/20 py-3'
            : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">

         {/* Logo */}
{isHome ? (
  <Link to="hero" smooth duration={500} className="cursor-pointer flex items-center gap-2">
    <img
      src='images/jackpotsworld_watermark.png'
      className="w-5 h-5 object-contain"
    />
    <div className="flex flex-col leading-none">
      <span className="font-bold text-md md:text-2xl gold-text font-black tracking-wider">Jackpots</span>
      <span className="font-body text-xs md:text-xs tracking-[0.4em] text-gold/70 uppercase">World</span>
    </div>
  </Link>
) : (
  <span onClick={() => navigate('/')} className="cursor-pointer flex items-center gap-2">
    <img
      src='images/jackpotsworld_watermark.png'
      className="w-5 h-5 object-contain"
    />
    <div className="flex flex-col leading-none">
      <span className="font-bold text-md md:text-2xl gold-text font-black tracking-wider">Jackpots</span>
      <span className="font-body text-xs md:text-xs tracking-[0.4em] text-gold/70 uppercase">World</span>
    </div>
  </span>
)}

          {/* Desktop nav links */}
          <ul className="hidden md:flex flex-1 justify-center items-center gap-4 mx-8">
            {navLinks.map(link => (
              <li key={link.label}>
                {link.type === 'route' ? (
                  <span onClick={() => navigate(link.path)} className="cursor-pointer">
                    <NavLabel link={link} />
                  </span>
                ) : link.type === 'contact' ? (
                  <span onClick={() => goToSection(link.to)} className="cursor-pointer">
                    <NavLabel link={link} />
                  </span>
                ) : isHome ? (
                  <Link to={link.to} smooth duration={600} offset={-80} className="cursor-pointer">
                    <NavLabel link={link} />
                  </Link>
                ) : (
                  <span onClick={() => goToSection(link.to)} className="cursor-pointer">
                    <NavLabel link={link} />
                  </span>
                )}
              </li>
            ))}
          </ul>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-2.5">
            {user ? (
              <UserDropdown 
  user={user} 
  onLogout={handleLogout} 
  onRequireAuth={() => {
    setModalTab('login')
    setModalOpen(true)
  }}
/>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={openLogin}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full font-body text-sm font-semibold tracking-widest uppercase transition-all duration-200"
                  style={{
                    background: 'transparent',
                    border:     '1px solid rgba(212,175,55,0.35)',
                    color:      'rgba(212,175,55,0.85)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background  = 'rgba(212,175,55,0.08)'
                    e.currentTarget.style.borderColor = 'rgba(212,175,55,0.6)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background  = 'transparent'
                    e.currentTarget.style.borderColor = 'rgba(212,175,55,0.35)'
                  }}
                >
                  <LogIn size={13} />
                  Login
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={openRegister}
                  className="btn-gold flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-bold tracking-widest uppercase"
                >
                  <UserPlus size={13} />
                  Signup
                </motion.button>
              </>
            )}
          </div>

          {/* ── Mobile: auth buttons + hamburger (all in topbar) ── */}
          <div className="md:hidden flex items-center gap-2">

            {user ? (
              // Logged in → show dropdown in topbar
              <UserDropdown user={user} onLogout={handleLogout} />
            ) : (
              // Not logged in → show Login + Signup in topbar
              <>
                <button
                  onClick={openLogin}
                  style={{
                    background:    'transparent',
                    border:        '1px solid rgba(212,175,55,0.35)',
                    color:         'rgba(212,175,55,0.85)',
                    borderRadius:  99,
                    padding:       '6px 11px',
                    fontSize:      11,
                    fontWeight:    700,
                    letterSpacing: '0.04em',
                    cursor:        'pointer',
                    display:       'flex',
                    alignItems:    'center',
                    gap:           4,
                    whiteSpace:    'nowrap',
                  }}
                >
                  <LogIn size={11} /> Login
                </button>

                <button
                  onClick={openRegister}
                  className="btn-gold"
                  style={{
                    borderRadius:  99,
                    padding:       '6px 11px',
                    fontSize:      11,
                    fontWeight:    700,
                    letterSpacing: '0.04em',
                    cursor:        'pointer',
                    display:       'flex',
                    alignItems:    'center',
                    gap:           4,
                    border:        'none',
                    whiteSpace:    'nowrap',
                  }}
                >
                  <UserPlus size={11} /> Sign Up
                </button>
              </>
            )}

            {/* Hamburger toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              style={{
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                padding:    4,
                color:      '#D4AF37',
                display:    'flex',
                alignItems: 'center',
              }}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

        </div>

        {/* ── Mobile dropdown — nav links only, no auth section ── */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{   opacity: 0, height: 0      }}
              className="md:hidden overflow-hidden"
              style={{
                background: '#0A0005',
                borderTop:  '1px solid rgba(212,175,55,0.25)',
                boxShadow:  '0 8px 32px rgba(0,0,0,0.8)',
              }}
            >
              <ul className="py-5 px-6 flex flex-col gap-1">
                {navLinks.map(link => (
                  <li key={link.label}>
                    {link.type === 'route' ? (
                      <span
                        className="cursor-pointer block"
                        onClick={() => { setMobileOpen(false); navigate(link.path) }}
                      >
                        <NavLabelMobile link={link} />
                      </span>
                    ) : link.type === 'contact' ? (
                      <span
                        className="cursor-pointer block"
                        onClick={() => { setMobileOpen(false); goToSection(link.to) }}
                      >
                        <NavLabelMobile link={link} />
                      </span>
                    ) : isHome ? (
                      <Link
                        to={link.to}
                        smooth
                        duration={600}
                        offset={-80}
                        className="cursor-pointer block"
                        onClick={() => setMobileOpen(false)}
                      >
                        <NavLabelMobile link={link} />
                      </Link>
                    ) : (
                      <span
                        className="cursor-pointer block"
                        onClick={() => { setMobileOpen(false); goToSection(link.to) }}
                      >
                        <NavLabelMobile link={link} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
    </>
  )
}
