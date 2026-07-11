import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Link } from 'react-scroll'
import {
  Plane, Hotel, Coins, Car, UtensilsCrossed, Wine,
  Ticket, Sparkles, ConciergeBell, ShieldCheck
} from "lucide-react";

import {
  Layers, LayoutGrid, Dices, Trophy, PenLine,
  Gem, Crown, Flame
} from "lucide-react";

import {
  Ship, Bed, Drama,
  Waves, CheckCircle2, MessageCircle, Anchor
} from "lucide-react";

/* ─────────────────────────────────────────────
   IMAGE NAMING GUIDE  →  /public/images/
   VIP SERVICES IMAGES → /public/images/vip/
   Recommended: 1400x800px, landscape, <300KB
───────────────────────────────────────────── */

import { WHATSAPP_NUMBER, PACKAGES } from '../data/packagesData'

const countries = [
  {
    flag: '🇻🇳', name: 'Vietnam', tagline: 'Paradise of the Orient',
    color: '#D32F2F', glow: 'rgba(211,47,47,0.3)',
    images: [
      { src: '/images/corona-vietnam.jpg',  label: 'Casino Corona, Phu Quoc' },
      { src: '/images/grand-vietnam.png',   label: 'Grand Casino, Ho Tram' },
      { src: '/images/crown-vietnam.jpeg',  label: 'Crown Casino, Danang' },
      { src: '/videos/vietnam.mp4',         label: 'Vietnam Experience', type: 'video' },
    ],
    casinos: 'Crown Casino - Danang, Casino Corona - Phu Quoc, Grand casino - Ho Tram',
    bestFor: "Slots, Baccarat, Hold'em Poker",
  },
  {
    flag: '🇲🇴', name: 'Macau', tagline: 'Vegas of the East',
    color: '#1565C0', glow: 'rgba(21,101,192,0.3)',
    images: [
      { src: '/images/cod-macau.jpg',       label: 'COD' },
      { src: '/images/wynn-macau.jpg',      label: 'Wynn' },
      { src: '/images/venitian-macau.jpg',  label: 'Venetian' },
      { src: '/images/lisbo-macau.jpg',     label: 'Lisboa Grand' },
    ],
    casinos: 'Venetian, Lisboa Grand, COD, Wynn',
    bestFor: 'High Stakes Baccarat, VIP Rooms',
  },
  {
    flag: '🇮🇳', name: 'India', tagline: 'Goa – Where Luck Meets Paradise',
    color: '#FF6F00', glow: 'rgba(255,111,0,0.3)',
    images: [
      { src: '/images/bigdaddy-india.png',     label: 'Big Daddy Casino' },
      { src: '/images/deltinjaqk-india.jpg',    label: 'Deltin Jaqk' },
      { src: '/images/deltinroyal-india.jpg',   label: 'Deltin Royal' },
      { src: '/images/majesticpride-india.jpg', label: 'Majestic Pride' },
      { src: '/images/casinopride-india.jpg',  label: 'Casino Pride' },
    ],
    casinos: 'Big Daddy Casino, Casino Pride, Deltin Jaqk, Deltin Royal, Majestic Pride',
    bestFor: 'Poker, Roulette, Live Dealer Games',
  },
  {
    flag: '🇱🇰', name: 'Sri Lanka', tagline: 'Jewel of the Indian Ocean',
    color: '#7B1FA2', glow: 'rgba(123,31,162,0.3)',
    images: [
      { src: '/images/majesticpride-srilanka.jpg', label: 'Majestic Pride' },
      { src: '/images/ballys-srilanka.jpg',        label: "Bally's" },
      { src: '/images/ballagio-srilanka.jpeg',     label: 'Ballagio' },
      { src: '/images/marina-srilanka.jpg',        label: 'Marina' },
      { src: '/images/cod-srilanka.jpg',           label: 'City of Dreams' },
    ],
    casinos: "Bally's Colombo, Marina, Ballagio, Majestic Pride, City of Dreams",
    bestFor: 'Blackjack, Slots, Live Poker',
  },
  {
    flag: '🇵🇭', name: 'Philippines', tagline: 'Entertainment City Manila',
    color: '#00838F', glow: 'rgba(0,131,143,0.3)',
    images: [
      { src: '/images/Solaire-ph.jpg', label: 'Solaire Resort Casino' },
      { src: '/images/cod-ph.jpg',     label: 'City of Dreams Manila' },
    ],
    casinos: 'Solaire Resort Casino, City of Dreams - Manila',
    bestFor: 'Baccarat, Roulette, Sports Betting',
  },
]

const VIP_SERVICES = [
  { src: '/images/vip/massage-1.jpg',   label: 'Classic Massage',     category: 'Wellness' },
  { src: '/images/vip/massage-2.png',   label: 'Luxury Spa',          category: 'Wellness' },
  { src: '/images/vip/bar-1.jpg',       label: 'Premium Bar Counter',  category: 'Bar & Drinks' },
  { src: '/images/vip/bar-2.jpg',       label: 'Exclusive Cellar',     category: 'Bar & Drinks' },
  { src: '/images/vip/dance-1.jpg',     label: 'Live Dance Show',      category: 'Entertainment' },
  { src: '/images/vip/dance-2.jpg',     label: 'VIP Stage & Lounge',   category: 'Entertainment' },
  { src: '/images/vip/lounge-1.jpg',    label: 'VIP Lounge Access',    category: 'VIP Lounge' },
  { src: '/images/vip/lounge-2.jpg',    label: 'Private Suite Lounge', category: 'VIP Lounge' },
  { src: '/images/vip/vip-room-1.jpg',  label: 'Exclusive VIP Room',   category: 'VIP Rooms' },
  { src: '/images/vip/vip-room-2.avif', label: 'High Roller Room',     category: 'VIP Rooms' },
  { src: '/images/vip/private-jet.png', label: 'Private Jet',     category: 'Luxury Travel' },
  { src: '/images/vip/luxury-cruise.jpg', label: 'Luxury Cruises',     category: 'Luxury Travel' },
  { src: '/images/vip/private-boat.jpg', label: 'Private Boats',     category: 'Luxury Travel' },
]

const INCLUSIONS = [
  { icon: <Plane      size={15} color="#D4AF37" />, label: 'Free Flights'   },
  { icon: <Hotel      size={15} color="#D4AF37" />, label: '5★ Hotels'      },
  { icon: <Coins      size={15} color="#D4AF37" />, label: 'Casino Credits' },
  { icon: <Car        size={15} color="#D4AF37" />, label: 'Transfers'      },
  { icon: <UtensilsCrossed size={15} color="#D4AF37" />, label: 'All Meals' },
  { icon: <Wine       size={15} color="#D4AF37" />, label: 'Free Drinks'    },
  { icon: <Ticket     size={15} color="#D4AF37" />, label: 'VIP Entry'      },
  { icon: <Sparkles   size={15} color="#D4AF37" />, label: 'Spa & Massage'  },
  { icon: <ConciergeBell size={15} color="#D4AF37" />, label: 'Concierge'  },
  { icon: <ShieldCheck size={15} color="#D4AF37" />, label: '24/7 Support'  },
]

/* ── WHATSAPP BUTTON ── */
function WhatsAppBtn({ label = 'Enquire on WhatsApp', pkg = '' }) {
  const msg = encodeURIComponent(
    pkg
      ? `Hi! I'm interested in the *${pkg}* Casino Tour Package. Please share more details.`
      : `Hi! I'm interested in your Casino Tour Packages. Please share more details.`
  )
  return (
    <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
      <motion.button
        whileHover={{ scale: 1.04, boxShadow: '0 0 30px rgba(37,211,102,0.5)' }}
        whileTap={{ scale: 0.97 }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 20px', borderRadius: 50, background: 'linear-gradient(135deg,#25D366,#128C7E)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 'clamp(0.75rem,3vw,0.85rem)', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="white" style={{ flexShrink: 0 }}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        {label}
      </motion.button>
    </a>
  )
}

/* ══════════════════════════════════════════════
   IMAGE CAROUSEL — mobile-first heights
   • Video slide: starts at low volume (0.18), not blasting
   • Re-mutes when leaving video slide
══════════════════════════════════════════════ */
function ImageCarousel({ images, color, glow }) {
  const [idx, setIdx]     = useState(0)
  const [muted, setMuted] = useState(true)   // ← always start muted
  const timerRef          = useRef(null)
  const videoRef          = useRef(null)

  // Sync muted state to video element
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.muted  = muted
    el.volume = muted ? 0 : 0.18
  }, [muted, idx])

  // When switching slides, always re-mute
  useEffect(() => {
    setMuted(true)   // ← re-mute on every slide change (was auto-unmuting before)
  }, [idx])

  useEffect(() => {
    setIdx(0)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setIdx(p => (p + 1) % images.length), 2800)
    return () => clearInterval(timerRef.current)
  }, [images])

  useEffect(() => {
    clearInterval(timerRef.current)
    if (images[idx]?.type !== 'video') {
      timerRef.current = setInterval(() => setIdx(p => (p + 1) % images.length), 2800)
    }
    return () => clearInterval(timerRef.current)
  }, [idx])

  const jumpTo = (i) => {
    setIdx(i)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setIdx(p => (p + 1) % images.length), 2800)
  }

  const isVideo = images[idx]?.type === 'video'

  return (
    <div style={{ borderRadius: '14px 14px 0 0', overflow: 'hidden', boxShadow: `0 0 32px ${glow}` }}>
      {/* Mobile-first height: 240px on small, 340px md, 420px lg */}
      <div style={{ position: 'relative', height: 'clamp(240px, 52vw, 420px)', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ position: 'absolute', inset: 0 }}
          >
            {isVideo ? (
              <video
                ref={videoRef}
                src={images[idx].src}
                autoPlay muted={muted} loop playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <img
                src={images[idx].src} alt={images[idx].label}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Slide counter */}
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: '0.68rem', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>
          {idx + 1} / {images.length}
        </div>

        {/* Speaker toggle — video slides only */}
        {isVideo && (
          <motion.button
            onClick={() => setMuted(v => !v)}
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.92 }}
            title={muted ? 'Unmute' : 'Mute'}
            style={{
              position: 'absolute', top: 10, left: 10,
              width: 36, height: 36, borderRadius: '50%',
              background: muted ? 'rgba(0,0,0,0.6)' : 'rgba(212,175,55,0.25)',
              backdropFilter: 'blur(8px)',
              border: muted ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(212,175,55,0.7)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s, border 0.2s', zIndex: 10,
            }}
          >
            {muted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            )}
          </motion.button>
        )}

        {/* Prev / Next arrows — bigger tap targets on mobile */}
        {[
          { l: '‹', fn: () => jumpTo((idx - 1 + images.length) % images.length), s: { left: 8 } },
          { l: '›', fn: () => jumpTo((idx + 1) % images.length), s: { right: 8 } },
        ].map(a => (
          <button key={a.l} onClick={a.fn}
            style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...a.s, width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s', touchAction: 'manipulation' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.75)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
          >{a.l}</button>
        ))}
      </div>

      {/* Caption + dots */}
      <div style={{ background: 'var(--w365-surface-hi)', borderTop: '1px solid rgba(212,175,55,0.15)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="font-body font-light" style={{ fontSize: 'clamp(0.72rem,2.8vw,0.85rem)', color: 'rgba(var(--w365-text-rgb),0.6)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{images[idx].label}</span>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
          {images.map((_, i) => (
            <button key={i} onClick={() => jumpTo(i)}
              style={{ padding: 0, border: 'none', cursor: 'pointer', borderRadius: i === idx ? 4 : '50%', width: i === idx ? 18 : 6, height: 6, background: i === idx ? color : 'rgba(var(--w365-text-rgb),0.2)', transition: 'all 0.25s', touchAction: 'manipulation' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── VIP SERVICES GALLERY — mobile-first ── */
function VIPServicesGallery() {
  const [activeCategory, setActiveCategory] = useState('All')
  const categories = ['All', 'Wellness', 'Bar & Drinks', 'Entertainment', 'VIP Lounge', 'VIP Rooms', 'Luxury Travel']
  const filtered = activeCategory === 'All' ? VIP_SERVICES : VIP_SERVICES.filter(v => v.category === activeCategory)
  const { ref: inViewRef, inView } = useInView({ threshold: 0.05, triggerOnce: true })

  return (
    <section id="vip-services" ref={inViewRef} style={{ padding: 'clamp(48px,10vw,80px) clamp(12px,4vw,16px)', background: 'linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(30,10,0,0.4) 50%,rgba(0,0,0,0) 100%)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }}
          style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-block', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 50, padding: '5px 18px', fontSize: 'clamp(0.6rem,2.5vw,0.72rem)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(212,175,55,0.7)', marginBottom: 12 }}>
            ✦ Exclusive VIP Services
          </div>
          <h2 className=" font-bold gold-text" style={{ fontSize: 'clamp(1.5rem,6vw,3rem)', fontWeight: 900, marginBottom: 10 }}>
            THE VIP EXPERIENCE
          </h2>
          <p className="font-body font-light" style={{ fontSize: 'clamp(0.82rem,3.2vw,1rem)', color: 'rgba(var(--w365-text-rgb),0.5)', maxWidth: 480, margin: '0 auto' }}>
            Every package includes world-class VIP amenities — from luxury spa retreats to exclusive nightlife.
          </p>
        </motion.div>

        {/* Category filter — horizontal scroll on mobile */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginBottom: 24, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className="font-body font-light"
              style={{ padding: '7px 16px', borderRadius: 50, border: `1px solid ${activeCategory === cat ? '#D4AF37' : 'rgba(var(--w365-text-rgb),0.15)'}`, background: activeCategory === cat ? 'rgba(212,175,55,0.15)' : 'transparent', color: activeCategory === cat ? '#D4AF37' : 'rgba(var(--w365-text-rgb),0.5)', fontSize: 'clamp(0.72rem,2.8vw,0.8rem)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0, touchAction: 'manipulation' }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Image grid — 1 col mobile, 2 col sm, 3 col lg */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,260px),1fr))', gap: 12, marginBottom: 40 }}>
          <AnimatePresence>
            {filtered.map((item, i) => (
              <motion.div key={item.src}
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3, delay: i * 0.04 }}
                whileHover={{ scale: 1.02, y: -3 }}
                style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', boxShadow: '0 6px 24px rgba(0,0,0,0.4)', cursor: 'pointer', border: '1px solid rgba(212,175,55,0.1)', aspectRatio: '16/10' }}>
                <img src={item.src} alt={item.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 50%)' }} />
                <div style={{ position: 'absolute', bottom: 10, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 6 }}>
                  <span className=" font-bold" style={{ fontSize: 'clamp(0.7rem,2.5vw,0.82rem)', fontWeight: 700, color: '#fff', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  <span className="font-body font-light" style={{ fontSize: 'clamp(0.58rem,2vw,0.65rem)', background: 'rgba(212,175,55,0.25)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: 20, padding: '2px 8px', color: '#D4AF37', letterSpacing: '0.06em', flexShrink: 0 }}>{item.category}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Video highlights */}
<div style={{ marginBottom: 36 }}>
  <div className="font-body font-light" style={{ textAlign: 'center', fontSize: 'clamp(0.6rem,2.2vw,0.72rem)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(var(--w365-text-rgb),0.3)', marginBottom: 16 }}>
    VIP Experience — Video Highlights
  </div>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: 12, justifyContent: 'center', maxWidth: 920, margin: '0 auto' }}>
    {[
      { src: '/videos/vip-lounge.mp4',   label: 'VIP Lounge Experience' },
      { src: '/videos/casino-floor.mp4', label: 'Casino Floor Nights' },
      { src: '/videos/spa-retreat.mp4',  label: 'Luxury Spa Retreat' },
    ].map((v, i) => (
      <div key={i} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(212,175,55,0.15)', background: 'rgba(255,255,255,0.03)', position: 'relative', aspectRatio: '16/9' }}>
        <video src={v.src} autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', bottom: 8, left: 10, right: 10 }}>
          <span className=" font-bold" style={{ fontSize: 'clamp(0.68rem,2.5vw,0.78rem)', color: '#fff', fontWeight: 700, background: 'rgba(0,0,0,0.55)', padding: '3px 9px', borderRadius: 6 }}>{v.label}</span>
        </div>
      </div>
    ))}
  </div>
</div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, delay: 0.3 }} style={{ textAlign: 'center' }}>
          <p className="font-body font-light" style={{ color: 'rgba(var(--w365-text-rgb),0.4)', marginBottom: 14, fontSize: 'clamp(0.8rem,3vw,0.9rem)' }}>
            Want to know more about VIP services? Chat with us instantly.
          </p>
          <div style={{ maxWidth: 320, margin: '0 auto' }}>
            <WhatsAppBtn label="Chat About VIP Services" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
const CRUISE_IMAGES = [
  // { src: '/images/vip/luxury-cruise.jpg', label: 'Luxury Cruise Ship'      },
  // { src: '/images/vip/private-boat.jpg',  label: 'Private Deck Experience' },
  // { src: '/images/cruise-casino.jpg',     label: 'Onboard Casino Floor'    },
  { src: '/images/vip/msc-cruise.jpg',      label: ' '        },
  { src: '/images/vip/star-cruises.jpg',     label: ' '      },
  // { src: '/images/cruise-pool.jpg',       label: 'Sky Deck & Pool'         },
]

function CruiseCarousel() {
  const [idx, setIdx] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setIdx(p => (p + 1) % CRUISE_IMAGES.length)
    }, 3000)
    return () => clearInterval(timerRef.current)
  }, [])

  const jump = (i) => {
    setIdx(i)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setIdx(p => (p + 1) % CRUISE_IMAGES.length)
    }, 3000)
  }

  return (
    <div style={{ position: 'relative', height: 'clamp(220px,45vw,400px)', overflow: 'hidden' }}>
      <AnimatePresence mode="wait">
        <motion.img
          key={idx}
          src={CRUISE_IMAGES[idx].src}
          alt={CRUISE_IMAGES[idx].label}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </AnimatePresence>

      {/* Gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />

      {/* Caption + dots */}
      <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <span style={{
          fontSize: 'clamp(0.7rem,2.5vw,0.82rem)', fontWeight: 600, color: '#fff',
          background: 'rgba(0,0,0,0.45)', padding: '3px 10px', borderRadius: 6,
        }}>
          {CRUISE_IMAGES[idx].label}
        </span>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {CRUISE_IMAGES.map((_, i) => (
            <button key={i} onClick={() => jump(i)} style={{
              padding: 0, border: 'none', cursor: 'pointer',
              borderRadius: i === idx ? 4 : '50%',
              width: i === idx ? 18 : 6, height: 6,
              background: i === idx ? '#22d3ee' : 'rgba(255,255,255,0.3)',
              transition: 'all 0.25s', touchAction: 'manipulation',
            }} />
          ))}
        </div>
      </div>

      {/* Prev / Next */}
      {[
        { label: '‹', fn: () => jump((idx - 1 + CRUISE_IMAGES.length) % CRUISE_IMAGES.length), side: { left: 10 } },
        { label: '›', fn: () => jump((idx + 1) % CRUISE_IMAGES.length), side: { right: 10 } },
      ].map(a => (
        <button key={a.label} onClick={a.fn} style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...a.side,
          width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
          fontSize: '1.2rem', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
        }}>
          {a.label}
        </button>
      ))}
    </div>
  )
}


/* ── PACKAGE CARDS SECTION — mobile-first ── */
function PackagesSection() {
  const { ref: inViewRef, inView } = useInView({ threshold: 0.05, triggerOnce: true })

  return (
    <section id="packages-all" ref={inViewRef} style={{ padding: 'clamp(48px,10vw,80px) clamp(12px,4vw,16px)', background: 'linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(20,10,0,0.5) 100%)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }}
          style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-block', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 50, padding: '5px 18px', fontSize: 'clamp(0.6rem,2.5vw,0.72rem)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(212,175,55,0.7)', marginBottom: 12 }}>
            ✦ All Packages
          </div>
          <h2 className=" font-bold gold-text" style={{ fontSize: 'clamp(1.6rem,7vw,3.2rem)', fontWeight: 900, marginBottom: 12 }}>
            TOUR PACKAGES
          </h2>
          <p className="font-body font-light" style={{ color: 'rgba(var(--w365-text-rgb),0.5)', maxWidth: 520, margin: '0 auto', fontSize: 'clamp(0.82rem,3.2vw,1rem)', lineHeight: 1.6 }}>
            Every package includes <strong style={{ color: 'rgba(212,175,55,0.9)' }}>Free Flights · 5★ Hotel · All Meals · Free Drinks · VIP Casino Access</strong>.
            Available for all 5 destinations.
          </p>
        </motion.div>

        {/* Inclusions strip — 2 col on mobile */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 7, marginBottom: 40, maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
          {INCLUSIONS.map((item, i) => (
  <motion.div key={i}
    initial={{ opacity: 0, y: 10 }}
    animate={inView ? { opacity: 1, y: 0 } : {}}
    transition={{ duration: 0.4, delay: i * 0.04 }}
    className="casino-card"
    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}
  >
    <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{item.icon}</span>
    <span className="font-body font-light" style={{ fontSize: 'clamp(0.68rem,2.5vw,0.78rem)', color: 'rgba(var(--w365-text-rgb),0.6)' }}>
      {item.label}
    </span>
  </motion.div>
))}
        </div>

        {/* Package cards — 1 col mobile, 2 col md, 3 col xl */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,300px),1fr))', gap: 16 }}>
          {PACKAGES.map((pkg, i) => {
  const services = [
    { label: 'Airport VIP Service', val: pkg.airportVIP },
    { label: 'Jackpot Rewards',     val: pkg.jackpotRewards },
    { label: 'VIP Transportation',  val: pkg.vipTransport,      note: pkg.vipTransportNote },
    { label: 'Spa Service',         val: pkg.spa,               note: pkg.spaNote },
    { label: 'Shopping Voucher',    val: pkg.shoppingVoucher,   note: pkg.shoppingNote },
    { label: 'Visa',                val: pkg.visa },
  ]
  return (
    <motion.div key={i}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay: i * 0.05 }}  // ← reduced delay
      className="casino-card"
      style={{ padding: 0, overflow: 'hidden', position: 'relative', border: `1px solid ${pkg.color}30` }}>

      {pkg.badge && (
        <div style={{ position: 'absolute', top: 12, right: 12, background: `${pkg.color}22`, border: `1px solid ${pkg.color}60`, borderRadius: 20, padding: '3px 10px', fontSize: '0.65rem', fontWeight: 800, color: pkg.color, letterSpacing: '0.08em', textTransform: 'uppercase', zIndex: 2 }}>
          {pkg.badge}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '20px 22px 14px', borderBottom: `1px solid ${pkg.color}20`, background: `linear-gradient(135deg, ${pkg.color}08 0%, transparent 70%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: '1.8rem' }}>{pkg.icon}</span>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: pkg.color, lineHeight: 1 }}>{pkg.name}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(var(--w365-text-rgb),0.35)', letterSpacing: '0.08em' }}>{pkg.duration} · All Destinations</div>
          </div>
        </div>
        <div className="gold-text" style={{ fontSize: '1.7rem', fontWeight: 900 }}>{pkg.price}</div>
        <div style={{ fontSize: '0.68rem', color: 'rgba(var(--w365-text-rgb),0.3)', marginTop: 2 }}>per person</div>
      </div>

      {/* Details */}
      <div style={{ padding: '14px 22px 18px' }}>
        {/* Core inclusions */}
        {[
          { icon: '✈️', label: `Flight: ${pkg.flight}` },
          { icon: '🏨', label: `Hotel: ${pkg.hotel}` },
          { icon: '🍽️', label: `Food: ${pkg.food}` },
          { icon: '🥂', label: `Liquor: ${pkg.liquor}` },
        ].map((row, j) => (
          <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: '0.8rem', color: 'rgba(var(--w365-text-rgb),0.65)', marginBottom: 6, lineHeight: 1.4 }}>
            <span style={{ flexShrink: 0 }}>{row.icon}</span>
            <span className="font-body font-light">{row.label}</span>
          </div>
        ))}

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${pkg.color}20`, margin: '12px 0' }} />

        {/* Service checkboxes */}
        {/* Replace the 2-col grid with this single-column list */}
<div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
  {services.map((s, j) => (
    <div key={j} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: '0.75rem',
      color: s.val ? 'rgba(var(--w365-text-rgb),0.72)' : 'rgba(var(--w365-text-rgb),0.22)',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        background: s.val ? 'rgba(76,175,80,0.18)' : 'rgba(var(--w365-text-rgb),0.06)',
        border: `1px solid ${s.val ? 'rgba(76,175,80,0.4)' : 'rgba(var(--w365-text-rgb),0.1)'}`,
        fontSize: '0.6rem', fontWeight: 700,
        color: s.val ? '#4CAF50' : 'rgba(var(--w365-text-rgb),0.2)',
      }}>
        {s.val ? '✓' : '✗'}
      </span>
      <span className="font-body font-light">
        {s.label}{s.note ? <span style={{ opacity: 0.5, fontSize: '0.65rem' }}> {s.note}</span> : null}
      </span>
    </div>
  ))}
</div>
      </div>

      {/* Book button */}
      <div style={{ padding: '0 22px 18px' }}>
        <WhatsAppBtn label={`Enquire – ${pkg.name}`} pkg={`${pkg.name} Package`} />
      </div>
    </motion.div>

    
  )
})}
        </div>


        {/* ── CRUISE CASINO PACKAGE — special highlighted card ── */}
  
<motion.div
  initial={{ opacity: 0, y: 40 }}
  animate={inView ? { opacity: 1, y: 0 } : {}}
  transition={{ duration: 0.7, delay: 0.3 }}
  style={{ marginTop: 48, maxWidth: 820, marginLeft: 'auto', marginRight: 'auto' }}
>
  {/* Label above */}
  <div style={{ textAlign: 'center', marginBottom: 16 }}>
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 'clamp(0.6rem,2.2vw,0.7rem)',
      letterSpacing: '0.18em', textTransform: 'uppercase',
      color: 'rgba(34,211,238,0.7)', border: '1px solid rgba(34,211,238,0.25)',
      borderRadius: 50, padding: '4px 16px',
    }}>
      <Anchor size={11} color="rgba(34,211,238,0.7)" />
      Limited Availability · Exclusive Experience
    </span>
  </div>

  <div style={{
    borderRadius: 20,
    border: '1px solid rgba(34,211,238,0.35)',
    background: 'rgba(34,211,238,0.03)',
    overflow: 'hidden',
    boxShadow: '0 0 60px rgba(34,211,238,0.08)',
  }}>
    {/* Auto-scrolling image strip */}
    <CruiseCarousel />

    {/* Content */}
    <div style={{ padding: 'clamp(20px,5vw,36px) clamp(18px,5vw,40px)' }}>

      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Ship size={26} color="#22d3ee" strokeWidth={1.5} />
            </div>
            <div>
              <div style={{
                fontSize: 'clamp(1.2rem,5vw,1.7rem)', fontWeight: 900,
                color: '#22d3ee', lineHeight: 1,
              }}>
                Cruise Casino Package
              </div>
              <div style={{
                fontSize: 'clamp(0.65rem,2.2vw,0.75rem)',
                color: 'rgba(var(--w365-text-rgb),0.4)', marginTop: 4, fontStyle: 'italic',
              }}>
                International Waters · Casino at Sea · Full Luxury Experience
              </div>
            </div>
          </div>

          {/* Route pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {['Luxury gaming experience at Cruise Casinos all over the World'].map(r => (
              <span key={r} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 'clamp(0.62rem,2vw,0.72rem)', padding: '3px 10px', borderRadius: 20,
                background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)',
                color: 'rgba(34,211,238,0.8)',
              }}>
                <Waves size={10} color="rgba(34,211,238,0.8)" />
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(34,211,238,0.12)', marginBottom: 20 }} />

      {/* Details grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,220px),1fr))',
        gap: 14, marginBottom: 24,
      }}>
        {[
          { icon: <Ship            size={18} color="#22d3ee" strokeWidth={1.5} />, label: 'Transport',     val: 'Luxury Cruise Ship'         },
          { icon: <Bed             size={18} color="#22d3ee" strokeWidth={1.5} />, label: 'Cabin',         val: 'Ocean View / Suite Cabin'   },
          { icon: <UtensilsCrossed size={18} color="#22d3ee" strokeWidth={1.5} />, label: 'Dining',        val: 'All-inclusive Fine Dining'  },
          { icon: <Wine            size={18} color="#22d3ee" strokeWidth={1.5} />, label: 'Drinks',        val: 'Unlimited Premium Bar'      },
          { icon: <Coins           size={18} color="#22d3ee" strokeWidth={1.5} />, label: 'Casino',        val: 'Onboard Casino (24/7)'      },
          { icon: <Drama           size={18} color="#22d3ee" strokeWidth={1.5} />, label: 'Entertainment', val: 'Live Shows & Nightclub'     },
          { icon: <Sparkles        size={18} color="#22d3ee" strokeWidth={1.5} />, label: 'Spa',           val: 'Full Spa & Wellness Centre' },
          { icon: <Waves           size={18} color="#22d3ee" strokeWidth={1.5} />, label: 'Amenities',     val: 'Pool, Gym, Sun Deck'        },
        ].map((row, j) => (
          <div key={j} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(34,211,238,0.08)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'rgba(34,211,238,0.06)',
              border: '1px solid rgba(34,211,238,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {row.icon}
            </div>
            <div>
              <div style={{
                fontSize: '0.62rem', color: 'rgba(var(--w365-text-rgb),0.3)',
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2,
              }}>
                {row.label}
              </div>
              <div style={{
                fontSize: 'clamp(0.72rem,2.5vw,0.8rem)',
                color: 'rgba(var(--w365-text-rgb),0.72)', fontWeight: 500,
              }}>
                {row.val}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Inclusions checklist */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,180px),1fr))',
        gap: 8, marginBottom: 28,
      }}>
        {[
          'Casino Credits Included',
          'VIP Boarding Lounge',
          'Port Excursions',
          'Professional Dealer Tables',
          'High Roller Rooms',
          'Jackpot Rewards Program',
          'Onboard Photography',
          '24/7 Concierge',
        ].map((item, j) => (
          <div key={j} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            fontSize: 'clamp(0.68rem,2.5vw,0.76rem)',
            color: 'rgba(var(--w365-text-rgb),0.65)',
          }}>
            <CheckCircle2 size={14} color="#22d3ee" strokeWidth={2.5} style={{ flexShrink: 0 }} />
            {item}
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ maxWidth: 380, margin: '0 auto' }}>
  <a
    href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi! I'm interested in the *Cruise Casino Package*. Please share more details.")}`}
    target="_blank"
    rel="noopener noreferrer"
    style={{ display: 'block', textDecoration: 'none' }}
  >
    <motion.button
      whileHover={{ scale: 1.04, boxShadow: '0 0 30px rgba(37,211,102,0.5)' }}
      whileTap={{ scale: 0.97 }}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '13px 20px',
        borderRadius: 50,
        background: 'linear-gradient(135deg,#25D366,#128C7E)',
        border: 'none',
        color: '#fff',
        fontWeight: 700,
        fontSize: 'clamp(0.75rem,3vw,0.85rem)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      <Ship size={16} color="white" />
      <MessageCircle size={16} color="white" />
      Enquire – Cruise Casino Package
    </motion.button>
  </a>
</div>

    </div>
  </div>
</motion.div>

        {/* Bottom CTA */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, delay: 0.5 }}
          style={{ textAlign: 'center', marginTop: 48, padding: 'clamp(24px,6vw,40px) clamp(16px,4vw,24px)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 18, background: 'rgba(212,175,55,0.03)' }}>
          <div style={{ fontSize: '1.8rem', marginBottom: 10 }}>💬</div>
          <h3 className=" font-bold text-theme" style={{ fontSize: 'clamp(1rem,4.5vw,1.4rem)', fontWeight: 800, marginBottom: 8 }}>Not sure which package is right for you?</h3>
          <p className="font-body font-light" style={{ color: 'rgba(var(--w365-text-rgb),0.45)', marginBottom: 20, fontSize: 'clamp(0.8rem,3vw,0.9rem)' }}>
            Our VIP travel consultants are available 24/7 on WhatsApp.
          </p>
          <div style={{ maxWidth: 340, margin: '0 auto' }}>
            <WhatsAppBtn label="💬 Chat with a VIP Consultant" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   • carouselRef: centers carousel in viewport on country select
   • carouselInViewRef: scroll listener mutes video when carousel leaves viewport
══════════════════════════════════════════════ */
export default function CountryPackages() {
  const [active, setActive]   = useState(0)
  const sectionRef            = useRef(null)
  const carouselRef           = useRef(null)
  const carouselInViewRef     = useRef(false)   // tracks whether carousel is visible
  const { ref: inViewRef, inView } = useInView({ threshold: 0.1, triggerOnce: true })

  const country = countries[active]

  // Scroll-mute: mute video the moment carousel leaves the viewport
  useEffect(() => {
    const handleScroll = () => {
      if (!carouselRef.current) return
      const rect = carouselRef.current.getBoundingClientRect()
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0

      if (!isVisible && carouselInViewRef.current) {
        // Just scrolled OUT — mute any playing video
        const video = carouselRef.current.querySelector('video')
        if (video) { video.muted = true; video.volume = 0 }
      }
      carouselInViewRef.current = isVisible
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const switchCountry = (i) => {
    setActive(i)
    setTimeout(() => {
      if (!carouselRef.current) return
      const rect    = carouselRef.current.getBoundingClientRect()
      const targetY = window.scrollY + rect.top - (window.innerHeight / 2 - rect.height / 2)
      window.scrollTo({ top: targetY, behavior: 'smooth' })
    }, 40)
  }

  return (
    <>
      {/* ─── DESTINATIONS SECTION ─── */}
      <section id="packages" className="relative px-3 md:px-4"
        style={{ paddingTop: 'clamp(40px,10vw,96px)', paddingBottom: 'clamp(32px,8vw,64px)' }}
        ref={el => { sectionRef.current = el; inViewRef(el) }}>
        <div className="max-w-7xl mx-auto">

          {/* Heading */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }}
            className="text-center" style={{ marginBottom: 'clamp(24px,6vw,64px)' }}>
            <div className="inline-block border border-gold/30 rounded-full px-4 py-1.5 font-body font-light tracking-widest uppercase text-gold/70 mb-3"
              style={{ fontSize: 'clamp(0.6rem,2.5vw,0.75rem)' }}>
              ✈ Choose Your Destination
            </div>
            <h2 className=" font-bold font-black gold-text" style={{ fontSize: 'clamp(1.7rem,7.5vw,3.2rem)', marginBottom: 10, lineHeight: 1.1 }}>
              CASINO DESTINATION
            </h2>
            <p className="font-body font-light text-theme-muted max-w-xl mx-auto" style={{ fontSize: 'clamp(0.82rem,3.2vw,1.1rem)' }}>
              Popular spectacular casino destinations. One unforgettable journey.
            </p>
          </motion.div>

          {/* Country Tabs — horizontal scroll on mobile */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, delay: 0.2 }}
            style={{ display: 'flex', gap: 8, marginBottom: 'clamp(20px,5vw,48px)', overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', justifyContent: 'flex-start' }}
            className="md:justify-center md:flex-wrap"
          >
            {countries.map((c, i) => (
              <motion.button key={i}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={() => switchCountry(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: 'clamp(8px,2.5vw,12px) clamp(12px,3.5vw,20px)',
                  borderRadius: 50,
                  fontSize: 'clamp(0.72rem,2.8vw,0.875rem)',
                  fontWeight: 600, letterSpacing: '0.05em',
                  whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'all 0.3s', cursor: 'pointer',
                  touchAction: 'manipulation',
                  border: active === i ? '1px solid #D4AF37' : '1px solid var(--w365-border)',
                  background: active === i ? 'linear-gradient(135deg,#D4AF37,#B8922B)' : 'transparent',
                  color: active === i ? '#0A0005' : 'var(--w365-text-muted)',
                  boxShadow: active === i ? `0 0 18px ${c.glow}` : 'none',
                }}
                className="font-body font-light"
              >
                <span style={{ fontSize: 'clamp(0.9rem,3.5vw,1.25rem)' }}>{c.flag}</span>
                <span>{c.name}</span>
              </motion.button>
            ))}
          </motion.div>

          {/* Animated Country Panel */}
          <AnimatePresence mode="wait">
            <motion.div key={active} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.35 }}>

              {/* Carousel — carouselRef enables center-scroll + scroll-mute */}
              <div ref={carouselRef}>
                <ImageCarousel images={country.images} color={country.color} glow={country.glow} />
              </div>

              {/* Info bar — stacked on mobile, 3-col on desktop */}
              <div className="casino-card cp-infobar"
                style={{ borderTop: 'none', borderRadius: '0 0 14px 14px', padding: 'clamp(14px,4vw,20px) clamp(14px,4vw,28px)', marginBottom: 'clamp(16px,4vw,40px)', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 'clamp(12px,3vw,24px)' }}>
                {/* Country name */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'clamp(1.3rem,5vw,1.8rem)' }}>{country.flag}</span>
                    <div>
                      <div className=" font-bold" style={{ fontSize: 'clamp(0.85rem,3.5vw,1.1rem)', fontWeight: 700, color: country.color, lineHeight: 1 }}>{country.name}</div>
                      <div className="font-body font-light" style={{ fontSize: 'clamp(0.62rem,2.2vw,0.75rem)', color: 'rgba(var(--w365-text-rgb),0.4)', fontStyle: 'italic' }}>{country.tagline}</div>
                    </div>
                  </div>
                </div>
                {/* Top casinos */}
                <div>
                  <div className="font-body font-light" style={{ fontSize: 'clamp(0.58rem,2vw,0.65rem)', color: 'rgba(var(--w365-text-rgb),0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Top Casinos</div>
                  {country.casinos.split(', ').map((c2, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: country.color, flexShrink: 0 }} />
                      <span className="font-body font-light" style={{ fontSize: 'clamp(0.68rem,2.5vw,0.82rem)', color: 'rgba(var(--w365-text-rgb),0.6)' }}>{c2}</span>
                    </div>
                  ))}
                </div>
                {/* Best for */}
                <div>
                  <div className="font-body font-light" style={{ fontSize: 'clamp(0.58rem,2vw,0.65rem)', color: 'rgba(var(--w365-text-rgb),0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Best For</div>
                  <div className="font-body font-light" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${country.color}18`, border: `1px solid ${country.color}40`, borderRadius: 8, padding: 'clamp(5px,1.5vw,7px) clamp(8px,2.5vw,13px)', fontSize: 'clamp(0.68rem,2.5vw,0.83rem)', fontWeight: 600, color: country.color }}>
                    🎯 {country.bestFor}
                  </div>
                </div>
              </div>

              {/* WhatsApp CTA */}
              <div style={{ maxWidth: 340, margin: '0 auto clamp(24px,6vw,40px)' }}>
                <WhatsAppBtn label={`Enquire – ${country.name} Trip`} pkg={`${country.name} Casino Tour`} />
              </div>

            </motion.div>
          </AnimatePresence>
        </div>

        <style>{`
          @media (max-width: 680px) { .cp-infobar { grid-template-columns: 1fr !important; } }
          @media (max-width: 860px) and (min-width: 681px) { .cp-infobar { grid-template-columns: 1fr 1fr !important; } }
          div::-webkit-scrollbar { display: none; }
        `}</style>
      </section>

      {/* ─── VIP SERVICES SECTION ─── */}
      <VIPServicesGallery />

      {/* ─── ALL PACKAGES SECTION ─── */}
      <PackagesSection />
    </>
  )
}