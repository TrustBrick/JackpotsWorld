import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Link as RouterLink } from 'react-router-dom'
import {
  MapPin, CheckCircle2, ChevronDown, ArrowRight, Star,
} from 'lucide-react'

import Navbar from '../../components/Navbar'
import Footer from '../../components/Footer'
import ParticleStars from '../../components/ParticleStars'
import WhatsAppButton from '../../components/WhatsAppButton'
import PageScrollButtons from '../../components/PageScrollButtons'
import Seo from '../../components/Seo'
import { useTheme } from '../../context/ThemeContext'
import { SITE_URL, ROUTE_SEO, TITLE_SUFFIX } from '../../config/seo'

import useEnquiryNumber from '../../hooks/useEnquiryNumber'
import useEnquiryMessage from '../../hooks/useEnquiryMessage'
import { buildWhatsAppLink } from '../../services/enquiryContact'
import { useWhatsAppGate } from '../../components/whatsapp/WhatsAppGate'
import { SECTION_PAD, CONTAINER, HEADER_GAP } from '../../utils/layout'

// ─────────────────────────────────────────────────────────────────────────────
// DestinationLanding — the one template every standalone destination SEO page
// renders through (Casino/Poker in Sri Lanka, Casino/Poker in Macau, …). Each
// page file is a thin wrapper that passes a content object from
// ./content.js; nothing here is destination-specific.
//
// COMPLIANCE. JackpotsWorld refers guests to third-party offline casino
// destinations; it does not operate a casino, run games or take wagers. All
// copy in content.js is written to that line ("explore", "discover", "connect
// with", "available through participating partners") and every page states it
// outright in its FAQ. Keep any future edit on the same side of it. See
// components/WhyChooseUs.jsx for the same rule on the landing page.
//
// CTAs are of two kinds: kind:'enquiry' hands off to the site-wide WhatsApp
// enquiry flow (country-routed number + Back Office message + the capture
// gate); kind:'internal' is a React Router link to another page on the site.
// ─────────────────────────────────────────────────────────────────────────────

const GOLD = '#D4AF37'

// ── CTAs ────────────────────────────────────────────────────────────────────
function EnquiryCTA({ label, source = 'destination_general', message, variant = 'gold', Icon = ArrowRight }) {
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

function InternalCTA({ label, to, Icon = ArrowRight }) {
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

// A CTA from the content config, dispatched on `kind`.
function Cta({ cta }) {
  if (!cta) return null
  if (cta.kind === 'internal') return <InternalCTA label={cta.label} to={cta.to} Icon={cta.Icon} />
  return <EnquiryCTA label={cta.label} source={cta.source} message={cta.message} variant={cta.variant} Icon={cta.Icon} />
}

// ── Layout primitives ─────────────────────────────────────────────────────────
function Reveal({ children, delay = 0, style }) {
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

function SectionHeading({ eyebrow, title, intro }) {
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

const cardStyle = {
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

function IconCard({ Icon, title, desc }) {
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

function BulletList({ items, columns = 2 }) {
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

function FaqItem({ q, a }) {
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

// ── JSON-LD ───────────────────────────────────────────────────────────────────
function buildJsonLd(content) {
  const out = []
  if (content.faqs?.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: content.faqs.map(({ q, a }) => ({
        '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    })
  }
  out.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: content.breadcrumbName, item: `${SITE_URL}${content.path}` },
    ],
  })
  return out
}

// ── Template ──────────────────────────────────────────────────────────────────
export default function DestinationLanding({ content }) {
  const { theme } = useTheme()
  const route = ROUTE_SEO[content.path] || {}

  const section = { position: 'relative', padding: SECTION_PAD, zIndex: 1 }
  const container = { ...CONTAINER }
  const headerGap = { marginBottom: HEADER_GAP }

  return (
    <div key={theme} className="relative min-h-screen bg-surface overflow-x-hidden">
      <Seo
        path={content.path}
        title={route.title || content.seoFallbackTitle}
        description={route.description}
        keywords={route.keywords}
        jsonLd={buildJsonLd(content)}
      />

      <ParticleStars />
      <Navbar />

      <main style={{ position: 'relative', zIndex: 1 }}>
        {/* Hero */}
        <section style={{ ...section, paddingTop: 'clamp(90px, 16vw, 150px)' }}>
          <div style={container}>
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: 820, margin: '0 auto' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderRadius: 50,
                  background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.28)',
                  color: GOLD, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                  marginBottom: 22,
                }}>
                  <MapPin size={14} /> {content.hero.badge}
                </div>
                <h1 style={{
                  fontSize: 'clamp(2rem,6.5vw,3.5rem)', fontWeight: 800, lineHeight: 1.1, margin: 0,
                  color: 'var(--w365-heading, rgba(255,255,255,0.95))',
                }}>
                  {content.hero.h1}
                  {content.hero.h1Sub && (
                    <span style={{ display: 'block', color: GOLD, fontSize: 'clamp(1.05rem,3.4vw,1.6rem)', fontWeight: 700, marginTop: 14 }}>
                      {content.hero.h1Sub}
                    </span>
                  )}
                </h1>
                {content.hero.leadParas.map((p, i) => (
                  <p key={i} style={{
                    fontSize: i === 0 ? 'clamp(0.95rem,2.8vw,1.1rem)' : 'clamp(0.88rem,2.6vw,1rem)',
                    lineHeight: 1.75, color: `rgba(var(--w365-text-rgb),${i === 0 ? 0.72 : 0.6})`,
                    margin: `${i === 0 ? 22 : 14}px auto 0`, maxWidth: 680,
                  }}>
                    {p}
                  </p>
                ))}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 30 }}>
                  {content.hero.ctas.map((c, i) => <Cta key={i} cta={c} />)}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Intro (centered paragraphs) */}
        {content.intro && (
          <section style={section}>
            <div style={{ ...container, maxWidth: 820 }}>
              <Reveal>
                <SectionHeading eyebrow={content.intro.eyebrow} title={content.intro.title} />
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
                  {content.intro.paras.map((p, i) => (
                    <p key={i} style={{ fontSize: '0.95rem', lineHeight: 1.8, color: 'rgba(var(--w365-text-rgb),0.7)', margin: 0 }}>{p}</p>
                  ))}
                </div>
              </Reveal>
            </div>
          </section>
        )}

        {/* Why this destination */}
        {content.whyDestination && (
          <section style={section}>
            <div style={container}>
              <Reveal>
                <div style={headerGap}>
                  <SectionHeading eyebrow={content.whyDestination.eyebrow} title={content.whyDestination.title} intro={content.whyDestination.intro} />
                </div>
                <div style={{ maxWidth: 720, margin: '0 auto' }}>
                  <BulletList items={content.whyDestination.bullets} />
                </div>
                {content.whyDestination.closing && (
                  <p style={{ textAlign: 'center', fontSize: '0.9rem', lineHeight: 1.75, color: 'rgba(var(--w365-text-rgb),0.6)', margin: '26px auto 0', maxWidth: 640 }}>
                    {content.whyDestination.closing}
                  </p>
                )}
              </Reveal>
            </div>
          </section>
        )}

        {/* Discover cards */}
        {content.discover && (
          <section style={section}>
            <div style={container}>
              <Reveal>
                <div style={headerGap}>
                  <SectionHeading eyebrow={content.discover.eyebrow} title={content.discover.title} intro={content.discover.intro} />
                </div>
              </Reveal>
              <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                {content.discover.cards.map((c, i) => (
                  <Reveal key={c.title} delay={i * 0.06}><IconCard {...c} /></Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* VIP highlight box */}
        {content.vip && (
          <section style={section}>
            <div style={container}>
              <Reveal>
                <div style={{
                  border: '1px solid rgba(212,175,55,0.22)', borderRadius: 20,
                  background: 'linear-gradient(135deg, rgba(212,175,55,0.07), rgba(var(--w365-text-rgb),0.02))',
                  padding: 'clamp(26px, 5vw, 48px)',
                }}>
                  <SectionHeading eyebrow={content.vip.eyebrow} title={content.vip.title} intro={content.vip.intro} />
                  <div style={{ maxWidth: 680, margin: '26px auto 0' }}>
                    <BulletList items={content.vip.bullets} />
                  </div>
                  {content.vip.closing && (
                    <p style={{ textAlign: 'center', fontSize: '0.86rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.58)', margin: '24px auto 0', maxWidth: 620 }}>
                      {content.vip.closing}
                    </p>
                  )}
                  {content.vip.cta && (
                    <div style={{ textAlign: 'center', marginTop: 24 }}><Cta cta={content.vip.cta} /></div>
                  )}
                </div>
              </Reveal>
            </div>
          </section>
        )}

        {/* Feature text section (e.g. Poker in X) */}
        {content.feature && (
          <section style={section}>
            <div style={{ ...container, maxWidth: 820 }}>
              <Reveal>
                <SectionHeading eyebrow={content.feature.eyebrow} title={content.feature.title} />
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
                  {content.feature.paras.map((p, i) => (
                    <p key={i} style={{
                      fontSize: i === 0 ? '0.95rem' : '0.9rem', lineHeight: i === 0 ? 1.8 : 1.75,
                      color: `rgba(var(--w365-text-rgb),${i === 0 ? 0.7 : 0.6})`, margin: 0,
                    }}>{p}</p>
                  ))}
                </div>
                {content.feature.cta && (
                  <div style={{ textAlign: 'center', marginTop: 26 }}><Cta cta={content.feature.cta} /></div>
                )}
              </Reveal>
            </div>
          </section>
        )}

        {/* Two-column cards (Hotels + Travel) */}
        {content.twoCol && (
          <section style={section}>
            <div style={container}>
              <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                {content.twoCol.map((col, i) => (
                  <Reveal key={col.title} delay={i * 0.08}>
                    <div style={cardStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <col.Icon size={24} color={GOLD} strokeWidth={1.8} />
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'rgba(var(--w365-text-rgb),0.92)' }}>{col.title}</h3>
                      </div>
                      <p style={{ fontSize: '0.88rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.64)', margin: 0 }}>{col.para}</p>
                      <BulletList items={col.bullets} columns={1} />
                      {col.closing && (
                        <p style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'rgba(var(--w365-text-rgb),0.5)', margin: 0 }}>{col.closing}</p>
                      )}
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Steps */}
        {content.steps && (
          <section style={section}>
            <div style={container}>
              <Reveal>
                <div style={headerGap}><SectionHeading eyebrow={content.steps.eyebrow} title={content.steps.title} /></div>
              </Reveal>
              <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {content.steps.items.map((s, i) => (
                  <Reveal key={s.title} delay={i * 0.05}>
                    <div style={{ ...cardStyle, gap: 12 }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg,#9A7D20,#D4AF37,#F5D060)', color: '#1A0015',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.05rem',
                      }}>{i + 1}</div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'rgba(var(--w365-text-rgb),0.92)' }}>{s.title}</div>
                      <p style={{ fontSize: '0.84rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.62)', margin: 0 }}>{s.desc}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Why JackpotsWorld */}
        {content.whyUs && (
          <section style={section}>
            <div style={container}>
              <Reveal>
                <div style={headerGap}><SectionHeading eyebrow={content.whyUs.eyebrow} title={content.whyUs.title} /></div>
              </Reveal>
              <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                {content.whyUs.cards.map((c, i) => (
                  <Reveal key={c.title} delay={i * 0.06}><IconCard {...c} /></Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Plan */}
        {content.plan && (
          <section style={section}>
            <div style={{ ...container, maxWidth: 820 }}>
              <Reveal>
                <SectionHeading eyebrow={content.plan.eyebrow} title={content.plan.title} intro={content.plan.intro} />
                <div style={{ maxWidth: 680, margin: '26px auto 0' }}>
                  <BulletList items={content.plan.bullets} />
                </div>
                {content.plan.closing && (
                  <p style={{ textAlign: 'center', fontSize: '0.86rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.58)', margin: '24px auto 0', maxWidth: 620 }}>
                    {content.plan.closing}
                  </p>
                )}
              </Reveal>
            </div>
          </section>
        )}

        {/* FAQs */}
        {content.faqs?.length > 0 && (
          <section style={section}>
            <div style={{ ...container, maxWidth: 860 }}>
              <Reveal>
                <div style={headerGap}><SectionHeading eyebrow="FAQs" title={content.faqTitle} /></div>
              </Reveal>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {content.faqs.map(f => <Reveal key={f.q}><FaqItem {...f} /></Reveal>)}
              </div>
            </div>
          </section>
        )}

        {/* Cross-links */}
        {content.crossLinks && (
          <section style={section}>
            <div style={container}>
              <Reveal>
                <div style={headerGap}><SectionHeading eyebrow={content.crossLinks.eyebrow} title={content.crossLinks.title} /></div>
              </Reveal>
              <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {content.crossLinks.cards.map((c, i) => (
                  <Reveal key={c.title} delay={i * 0.06}>
                    <div style={cardStyle}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                        background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.28)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <c.Icon size={22} color={GOLD} strokeWidth={1.8} />
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(var(--w365-text-rgb),0.92)' }}>{c.title}</div>
                      <p style={{ fontSize: '0.84rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.62)', margin: 0 }}>{c.desc}</p>
                      <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                        <InternalCTA label={c.label} to={c.to} Icon={ArrowRight} />
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Final CTA */}
        <section style={{ ...section, paddingBottom: 'clamp(50px, 8vw, 90px)' }}>
          <div style={container}>
            <Reveal>
              <div style={{
                textAlign: 'center',
                border: '1px solid rgba(212,175,55,0.28)', borderRadius: 22,
                background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(var(--w365-text-rgb),0.02))',
                padding: 'clamp(30px, 6vw, 60px)',
              }}>
                <Star size={30} color={GOLD} style={{ marginBottom: 14 }} />
                <h2 style={{ fontSize: 'clamp(1.5rem,4.5vw,2.3rem)', fontWeight: 800, margin: 0, color: 'var(--w365-heading, rgba(255,255,255,0.95))' }}>
                  {content.final.title}
                </h2>
                <p style={{ fontSize: 'clamp(0.9rem,2.6vw,1.02rem)', lineHeight: 1.75, color: 'rgba(var(--w365-text-rgb),0.7)', margin: '16px auto 0', maxWidth: 600 }}>
                  {content.final.para}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 28 }}>
                  {content.final.ctas.map((c, i) => <Cta key={i} cta={c} />)}
                </div>
                <p style={{ fontSize: '0.75rem', lineHeight: 1.6, color: 'rgba(var(--w365-text-rgb),0.45)', margin: '30px auto 0', maxWidth: 640 }}>
                  {content.final.disclaimer}
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
      <WhatsAppButton />
      <PageScrollButtons />
    </div>
  )
}
