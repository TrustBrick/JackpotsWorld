import React from 'react'
import { MapPin, Star, ArrowRight } from 'lucide-react'

import Navbar from '../../components/Navbar'
import Footer from '../../components/Footer'
import ParticleStars from '../../components/ParticleStars'
import WhatsAppButton from '../../components/WhatsAppButton'
import PageScrollButtons from '../../components/PageScrollButtons'
import Seo from '../../components/Seo'
import { useTheme } from '../../context/ThemeContext'
import { ROUTE_SEO } from '../../config/seo'
import { SECTION_PAD, CONTAINER, HEADER_GAP } from '../../utils/layout'

import {
  GOLD, Cta, InternalCTA, Reveal, SectionHeading, cardStyle,
  IconCard, BulletList, FaqItem, buildFaqJsonLd, buildBreadcrumbJsonLd,
} from './landingPrimitives'

// ─────────────────────────────────────────────────────────────────────────────
// DestinationLanding — the template every standalone destination SEO page
// renders through (Casino in Sri Lanka, Casino in Macau, …). Each page file is
// a thin wrapper passing a content object from ./content.js; nothing here is
// destination-specific. Shared UI lives in ./landingPrimitives.jsx.
//
// COMPLIANCE. JackpotsWorld refers guests to third-party offline casino
// destinations; it does not operate a casino, run games or take wagers. All
// copy in content.js stays on that line and every page's FAQ states it.
// ─────────────────────────────────────────────────────────────────────────────

export default function DestinationLanding({ content }) {
  const { theme } = useTheme()
  const route = ROUTE_SEO[content.path] || {}

  const section = { position: 'relative', padding: SECTION_PAD, zIndex: 1 }
  const container = { ...CONTAINER }
  const headerGap = { marginBottom: HEADER_GAP }

  const jsonLd = [
    ...(content.faqs?.length ? [buildFaqJsonLd(content.faqs)] : []),
    buildBreadcrumbJsonLd(content.breadcrumbName, content.path),
  ]

  return (
    <div key={theme} className="relative min-h-screen bg-surface overflow-x-hidden">
      <Seo
        path={content.path}
        title={route.title || content.seoFallbackTitle}
        description={route.description}
        keywords={route.keywords}
        jsonLd={jsonLd}
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
