import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Link as RouterLink } from 'react-router-dom'
import { CheckCircle2, ChevronDown, ArrowRight } from 'lucide-react'

import useEnquiryNumber from '../../hooks/useEnquiryNumber'
import useEnquiryMessage from '../../hooks/useEnquiryMessage'
import { buildWhatsAppLink } from '../../services/enquiryContact'
import { useWhatsAppGate } from '../../components/whatsapp/WhatsAppGate'
import { SITE_URL } from '../../config/seo'

// Shared building blocks for the marketing landing pages (the destination
// template in DestinationLanding.jsx and the /premium-casino hub). Visual
// language — gold accent, glass cards, scroll-reveal — matches the landing
// page's sections; see components/WhyChooseUs.jsx.
//
// CTAs are of two kinds: kind:'enquiry' hands off to the site-wide WhatsApp
// enquiry flow; kind:'internal' is a React Router link to another page.

export const GOLD = '#D4AF37'

export function EnquiryCTA({ label, source = 'landing_general', message, variant = 'gold', Icon = ArrowRight }) {
  const number = useEnquiryNumber()
  const generalMsg = useEnquiryMessage('tour_packages_general')
  const text = message || generalMsg
  const openWhatsApp = useWhatsAppGate()

  const isGold = variant === 'gold'
  const background = isGold
    ? 'linear-gradient(135deg,#9A7D20,#D4AF37,#F5D060)'
    : 'linear-gradient(135deg,#25D366,#128C7E)'
  const color = isGold ? '#1A0015' : '#fff'

  return (
    <a
      href={buildWhatsAppLink(number, text)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => { e.preventDefault(); openWhatsApp({ source, message: text }) }}
      style={{ textDecoration: 'none', display: 'inline-block' }}
    >
      <motion.span
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          padding: '14px 26px', borderRadius: 50, background, border: 'none', color,
          fontWeight: 700, fontSize: 'clamp(0.78rem,2.6vw,0.9rem)', letterSpacing: '0.04em',
          cursor: 'pointer', boxShadow: isGold ? '0 10px 30px rgba(212,175,55,0.28)' : '0 10px 30px rgba(37,211,102,0.28)',
        }}
      >
        <Icon size={18} strokeWidth={2} />
        {label}
      </motion.span>
    </a>
  )
}

export function InternalCTA({ label, to, Icon = ArrowRight }) {
  return (
    <RouterLink to={to} style={{ textDecoration: 'none', display: 'inline-block' }}>
      <motion.span
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          padding: '14px 26px', borderRadius: 50,
          background: 'linear-gradient(135deg,#9A7D20,#D4AF37,#F5D060)', border: 'none', color: '#1A0015',
          fontWeight: 700, fontSize: 'clamp(0.78rem,2.6vw,0.9rem)', letterSpacing: '0.04em',
          cursor: 'pointer', boxShadow: '0 10px 30px rgba(212,175,55,0.28)',
        }}
      >
        <Icon size={18} strokeWidth={2} />
        {label}
      </motion.span>
    </RouterLink>
  )
}

export function Cta({ cta }) {
  if (!cta) return null
  if (cta.kind === 'internal') return <InternalCTA label={cta.label} to={cta.to} Icon={cta.Icon} />
  return <EnquiryCTA label={cta.label} source={cta.source} message={cta.message} variant={cta.variant} Icon={cta.Icon} />
}

export function Reveal({ children, delay = 0, style }) {
  const { ref, inView } = useInView({ threshold: 0.08, triggerOnce: true })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: 'easeOut' }}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function SectionHeading({ eyebrow, title, intro }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto' }}>
      {eyebrow && (
        <div style={{
          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: GOLD, marginBottom: 12,
        }}>
          {eyebrow}
        </div>
      )}
      <h2 style={{
        fontSize: 'clamp(1.5rem,4.5vw,2.4rem)', fontWeight: 800, lineHeight: 1.15,
        color: 'var(--w365-heading, rgba(255,255,255,0.92))', margin: 0,
      }}>
        {title}
      </h2>
      {intro && (
        <p style={{
          fontSize: 'clamp(0.9rem,2.6vw,1.02rem)', lineHeight: 1.75,
          color: 'rgba(var(--w365-text-rgb),0.7)', margin: '16px auto 0', maxWidth: 640,
        }}>
          {intro}
        </p>
      )}
    </div>
  )
}

export const cardStyle = {
  background: 'rgba(var(--w365-text-rgb),0.03)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  border: '1px solid rgba(var(--w365-text-rgb),0.08)',
  borderRadius: 16,
  padding: '26px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  height: '100%',
}

export function IconCard({ Icon, title, desc }) {
  return (
    <div style={cardStyle}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={22} color={GOLD} strokeWidth={1.8} />
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(var(--w365-text-rgb),0.92)', letterSpacing: '-0.01em' }}>
        {title}
      </div>
      <p style={{ fontSize: '0.86rem', color: 'rgba(var(--w365-text-rgb),0.64)', lineHeight: 1.7, margin: 0 }}>
        {desc}
      </p>
      <div style={{ marginTop: 'auto', height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${GOLD}55, transparent)` }} />
    </div>
  )
}

export function BulletList({ items, columns = 2 }) {
  return (
    <ul style={{
      listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '12px 28px',
      gridTemplateColumns: `repeat(auto-fit, minmax(${columns === 1 ? 280 : 230}px, 1fr))`,
    }}>
      {items.map(item => (
        <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <CheckCircle2 size={18} color={GOLD} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: '0.9rem', color: 'rgba(var(--w365-text-rgb),0.78)', lineHeight: 1.6 }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      border: '1px solid rgba(var(--w365-text-rgb),0.1)', borderRadius: 14,
      background: 'rgba(var(--w365-text-rgb),0.03)', overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, padding: '18px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', color: 'rgba(var(--w365-text-rgb),0.9)', fontSize: '0.96rem', fontWeight: 600,
        }}
      >
        {q}
        <ChevronDown size={20} color={GOLD}
          style={{ flexShrink: 0, transition: 'transform 0.25s ease', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div style={{ padding: '0 20px 20px', fontSize: '0.88rem', lineHeight: 1.75, color: 'rgba(var(--w365-text-rgb),0.66)' }}>
          {a}
        </div>
      )}
    </div>
  )
}

export function buildFaqJsonLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

export function buildBreadcrumbJsonLd(name, path) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name, item: `${SITE_URL}${path}` },
    ],
  }
}
