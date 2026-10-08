import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import {
  Sparkles, Crown, Hotel, Plane, Headphones, Spade, Gem, MapPin,
  Building2, Utensils, Waves, Car, LayoutGrid, CheckCircle2, ChevronDown,
  ArrowRight, Star, ShieldCheck,
} from 'lucide-react'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import ParticleStars from '../components/ParticleStars'
import WhatsAppButton from '../components/WhatsAppButton'
import PageScrollButtons from '../components/PageScrollButtons'
import Seo from '../components/Seo'
import { useTheme } from '../context/ThemeContext'
import { SITE_URL, ROUTE_SEO, TITLE_SUFFIX } from '../config/seo'

import useEnquiryNumber from '../hooks/useEnquiryNumber'
import useEnquiryMessage from '../hooks/useEnquiryMessage'
import { buildWhatsAppLink } from '../services/enquiryContact'
import { useWhatsAppGate } from '../components/whatsapp/WhatsAppGate'
import { SECTION_PAD, CONTAINER, HEADER_GAP } from '../utils/layout'

// ─────────────────────────────────────────────────────────────────────────────
// Casino in Sri Lanka — a standalone SEO landing page for the "best casino in
// Sri Lanka" / "poker in Sri Lanka" search intent. It is a marketing page, not
// a product surface: every call to action hands off to the same WhatsApp
// enquiry flow the rest of the site uses (useEnquiryNumber + the WhatsApp gate),
// so there is nothing here to book, pay for or submit.
//
// COMPLIANCE. JackpotsWorld refers guests to third-party offline casino
// destinations; it does not operate a casino, run games or take wagers. The
// copy below is written to that line — "explore", "discover", "connect with",
// "available through participating partners" — and the FAQ states it outright.
// Keep any future edit on the same side of it; a sentence that reads as "we run
// the casino" is the one thing this page must never say. See WhyChooseUs.jsx
// for the same rule applied to the landing page.
// ─────────────────────────────────────────────────────────────────────────────

const PATH = '/casino-in-sri-lanka'
const GOLD = '#D4AF37'

const FAQS = [
  {
    q: 'What is the best casino in Sri Lanka?',
    a: 'The best casino destination depends on your preferred location, casino experience, hospitality requirements and available packages. JackpotsWorld helps visitors explore selected casino destinations and partner experiences in Sri Lanka.',
  },
  {
    q: 'Does JackpotsWorld operate a casino in Sri Lanka?',
    a: 'No. JackpotsWorld is a platform that connects guests with casino destinations and related travel services. Gaming facilities are operated by the respective casino operators.',
  },
  {
    q: 'Can I book a VIP casino package in Sri Lanka?',
    a: 'Selected VIP packages may be available through participating partners. Package availability and benefits vary by destination. Contact JackpotsWorld for current options.',
  },
  {
    q: 'Can I find poker in Sri Lanka?',
    a: 'Poker availability depends on the individual casino destination and its current schedule and conditions. Contact JackpotsWorld for current information about available poker experiences.',
  },
  {
    q: 'Does JackpotsWorld provide hotel arrangements?',
    a: 'Hotel and accommodation assistance may be available with selected packages. Availability depends on the destination and package selected.',
  },
  {
    q: 'Can JackpotsWorld help with travel arrangements?',
    a: 'Travel-related assistance may be available depending on the selected package and destination. Contact our team to understand the services available.',
  },
  {
    q: 'Are casino packages available for international visitors?',
    a: 'Available packages and eligibility depend on the destination, partner and applicable local requirements. Guests should confirm the current terms before travelling.',
  },
  {
    q: 'How do I enquire about a Sri Lanka casino package?',
    a: 'Contact JackpotsWorld through the available enquiry channels on our website. Our team can provide information about current destinations, packages and available services.',
  },
]

// schema.org/FAQPage — eligible for the FAQ rich result, and the answers above
// are the exact text rendered on the page, which the markup requires.
const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'Casino in Sri Lanka', item: `${SITE_URL}${PATH}` },
  ],
}

// ── Shared enquiry CTA ──────────────────────────────────────────────────────
// Mirrors the anchor-based pattern in CountryPackages.jsx: a real <a href>
// (so it opens the native app, middle-clicks and right-click-copies), with the
// WhatsApp gate intercepting the click to capture a lead before the handoff.
// Every CTA on this page — including the "explore more destinations" cross
// links whose own pages do not exist yet — funnels here.
function EnquiryCTA({ label, source = 'sri_lanka_general', message, variant = 'gold', Icon = ArrowRight }) {
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

// Fades a section in once it scrolls into view — the same reveal WhyChooseUs
// and the other landing sections use (triggerOnce so it does not re-animate).
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
      <div style={{
        fontSize: '1rem', fontWeight: 700, color: 'rgba(var(--w365-text-rgb),0.92)', letterSpacing: '-0.01em',
      }}>
        {title}
      </div>
      <p style={{ fontSize: '0.86rem', color: 'rgba(var(--w365-text-rgb),0.64)', lineHeight: 1.7, margin: 0 }}>
        {desc}
      </p>
      <div style={{
        marginTop: 'auto', height: 2, borderRadius: 2,
        background: `linear-gradient(90deg, ${GOLD}55, transparent)`,
      }} />
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
          <span style={{ fontSize: '0.9rem', color: 'rgba(var(--w365-text-rgb),0.78)', lineHeight: 1.6 }}>
            {item}
          </span>
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
        <ChevronDown
          size={20} color={GOLD}
          style={{ flexShrink: 0, transition: 'transform 0.25s ease', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      {open && (
        <div style={{
          padding: '0 20px 20px', fontSize: '0.88rem', lineHeight: 1.75,
          color: 'rgba(var(--w365-text-rgb),0.66)',
        }}>
          {a}
        </div>
      )}
    </div>
  )
}

const DESTINATION_CARDS = [
  { Icon: Sparkles, title: 'Casino Experiences', desc: 'Explore participating casino destinations and understand the experiences and services available to guests.' },
  { Icon: Crown, title: 'VIP Packages', desc: 'Discover selected premium packages designed for guests looking for enhanced hospitality and destination services.' },
  { Icon: Hotel, title: 'Accommodation', desc: 'Explore hotel and accommodation options associated with selected packages and destinations.' },
  { Icon: Plane, title: 'Travel Assistance', desc: 'Get assistance with relevant travel and destination requirements where available.' },
  { Icon: Headphones, title: 'Guest Support', desc: 'Our support team can help you understand available destinations, packages and services before your trip.' },
]

const WHY_JW_CARDS = [
  { Icon: Gem, title: 'Premium Casino Destinations', desc: 'Explore selected casino destinations through our international partner network.' },
  { Icon: Crown, title: 'VIP Experiences', desc: 'Discover premium packages designed around hospitality and destination experiences.' },
  { Icon: Plane, title: 'Travel & Hospitality', desc: 'Explore accommodation and travel-related services connected with selected packages.' },
  { Icon: Headphones, title: 'Guest Support', desc: 'Get assistance before and during your destination planning.' },
  { Icon: LayoutGrid, title: 'One Platform', desc: 'Discover casino destinations, packages and related travel services through one platform.' },
]

const STEPS = [
  { title: 'Explore', desc: 'Browse available casino destinations and experiences in Sri Lanka.' },
  { title: 'Choose Your Experience', desc: 'Select a destination or package based on your preferred casino, hospitality and travel requirements.' },
  { title: 'Contact JackpotsWorld', desc: 'Contact our team to check availability, package details and applicable terms.' },
  { title: 'Confirm Your Package', desc: 'Review the available services, inclusions and conditions before confirming your arrangements.' },
  { title: 'Experience Sri Lanka', desc: 'Travel to Sri Lanka and enjoy your confirmed casino and destination experience.' },
]

const CROSS_LINKS = [
  { Icon: Sparkles, title: 'Casino in Macau', desc: 'Discover premium casino destinations and VIP experiences in Macau.', label: 'Enquire about Macau', source: 'cross_link_casino_macau', message: 'Hi! I’m interested in casino destinations in *Macau*. Please share more details.' },
  { Icon: Spade, title: 'Poker in Macau', desc: 'Discover premium poker destinations and related VIP packages in Macau.', label: 'Enquire about Macau Poker', source: 'cross_link_poker_macau', message: 'Hi! I’m interested in *poker in Macau*. Please share more details.' },
  { Icon: Spade, title: 'Poker in Sri Lanka', desc: 'Explore available poker experiences and casino destinations in Sri Lanka.', label: 'Enquire about Poker', source: 'cross_link_poker_sri_lanka', message: 'Hi! I’m interested in *poker in Sri Lanka*. Please share more details.' },
]

const PLAN_OPTIONS = [
  'Preferred casino destination', 'Travel dates', 'Accommodation requirements',
  'VIP package preferences', 'Poker interests', 'Hospitality requirements', 'Travel services',
]

const VIP_BENEFITS = [
  'Premium hospitality', 'Hotel accommodation options', 'Travel coordination',
  'Guest assistance', 'Partner benefits', 'Exclusive JackpotsWorld benefits', 'VIP support',
]

const WHY_SRI_LANKA = [
  'Premium hospitality', 'Casino entertainment', 'Hotels and accommodation',
  'Restaurants and dining', 'Beaches and tourism experiences', 'Local attractions',
  'Travel and transportation options', 'VIP and premium experiences',
]

const ACCOMMODATION = [
  'Premium hotels', 'Convenient accommodation', 'VIP hospitality options',
  'Hotel packages', 'Travel coordination', 'Destination support',
]

const TRAVEL_ASSISTANCE = [
  'Hotel arrangements', 'Travel coordination', 'Transportation',
  'Destination information', 'Guest support', 'Package coordination',
]

const route = ROUTE_SEO[PATH] || {}

export default function CasinoInSriLanka() {
  const { theme } = useTheme()

  const section = { position: 'relative', padding: SECTION_PAD, zIndex: 1 }
  const container = { ...CONTAINER }
  const headerGap = { marginBottom: HEADER_GAP }

  return (
    <div key={theme} className="relative min-h-screen bg-surface overflow-x-hidden">
      <Seo
        path={PATH}
        title={route.title || `Best Casino in Sri Lanka${TITLE_SUFFIX}`}
        description={route.description}
        keywords={route.keywords}
        jsonLd={[FAQ_JSONLD, BREADCRUMB_JSONLD]}
      />

      <ParticleStars />
      <Navbar />

      <main style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Hero ── */}
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
                  <MapPin size={14} /> Sri Lanka
                </div>
                <h1 style={{
                  fontSize: 'clamp(2rem,6.5vw,3.5rem)', fontWeight: 800, lineHeight: 1.1, margin: 0,
                  color: 'var(--w365-heading, rgba(255,255,255,0.95))',
                }}>
                  Best Casino in Sri Lanka
                  <span style={{ display: 'block', color: GOLD, fontSize: 'clamp(1.05rem,3.4vw,1.6rem)', fontWeight: 700, marginTop: 14 }}>
                    Premium Casino Destinations &amp; VIP Experiences
                  </span>
                </h1>
                <p style={{
                  fontSize: 'clamp(0.95rem,2.8vw,1.1rem)', lineHeight: 1.75,
                  color: 'rgba(var(--w365-text-rgb),0.72)', margin: '22px auto 0', maxWidth: 680,
                }}>
                  Discover premium casino destinations in Sri Lanka with JackpotsWorld. Explore selected
                  casino experiences, VIP packages, accommodation options, travel assistance and exclusive
                  destination benefits through our partner network.
                </p>
                <p style={{
                  fontSize: 'clamp(0.88rem,2.6vw,1rem)', lineHeight: 1.75,
                  color: 'rgba(var(--w365-text-rgb),0.6)', margin: '14px auto 0', maxWidth: 680,
                }}>
                  Whether you are planning a dedicated casino trip or combining entertainment with a luxury
                  holiday, JackpotsWorld helps you discover and connect with casino destinations and related
                  travel services in Sri Lanka.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 30 }}>
                  <EnquiryCTA label="Explore Casino Destinations" source="sri_lanka_hero" Icon={Sparkles} />
                  <EnquiryCTA label="Enquire About VIP Packages" source="sri_lanka_vip_hero" variant="whatsapp" message={'Hi! I’m interested in *VIP casino packages in Sri Lanka*. Please share more details.'} Icon={Crown} />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Explore Casino Experiences ── */}
        <section style={section}>
          <div style={{ ...container, maxWidth: 820 }}>
            <Reveal>
              <SectionHeading
                eyebrow="Explore"
                title="Explore Casino Experiences in Sri Lanka"
              />
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.8, color: 'rgba(var(--w365-text-rgb),0.7)', margin: 0 }}>
                  Sri Lanka offers a unique combination of entertainment, hospitality, tourism and travel
                  experiences. For visitors interested in casino destinations, the country provides an
                  opportunity to combine a casino experience with hotels, restaurants, beaches and other
                  attractions.
                </p>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.8, color: 'rgba(var(--w365-text-rgb),0.7)', margin: 0 }}>
                  JackpotsWorld connects guests with destination services, making it easier to explore
                  available options before planning your trip. From premium casino experiences to VIP
                  hospitality and travel assistance, our platform brings destination-related services
                  together in one place.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Why Choose Sri Lanka ── */}
        <section style={section}>
          <div style={container}>
            <Reveal>
              <div style={headerGap}>
                <SectionHeading
                  eyebrow="The Destination"
                  title="Why Choose Sri Lanka for a Casino Experience?"
                  intro="Sri Lanka is an attractive destination for travellers who want to combine entertainment with a wider holiday experience. Visitors can enjoy a destination that offers:"
                />
              </div>
              <div style={{ maxWidth: 720, margin: '0 auto' }}>
                <BulletList items={WHY_SRI_LANKA} />
              </div>
              <p style={{
                textAlign: 'center', fontSize: '0.9rem', lineHeight: 1.75,
                color: 'rgba(var(--w365-text-rgb),0.6)', margin: '26px auto 0', maxWidth: 640,
              }}>
                With JackpotsWorld, you can explore available casino destinations and packages while planning
                the other parts of your trip.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── Discover Premium Casino Destinations ── */}
        <section style={section}>
          <div style={container}>
            <Reveal>
              <div style={headerGap}>
                <SectionHeading
                  eyebrow="Discover"
                  title="Discover Premium Casino Destinations"
                  intro="JackpotsWorld works with selected third-party casino destinations and partners to help guests explore available experiences."
                />
              </div>
            </Reveal>
            <div style={{
              display: 'grid', gap: 18,
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            }}>
              {DESTINATION_CARDS.map((c, i) => (
                <Reveal key={c.title} delay={i * 0.06}>
                  <IconCard {...c} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── VIP Casino Packages ── */}
        <section style={section}>
          <div style={container}>
            <Reveal>
              <div style={{
                border: '1px solid rgba(212,175,55,0.22)', borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(212,175,55,0.07), rgba(var(--w365-text-rgb),0.02))',
                padding: 'clamp(26px, 5vw, 48px)',
              }}>
                <SectionHeading
                  eyebrow="VIP"
                  title="VIP Casino Packages in Sri Lanka"
                  intro="Looking for a more premium casino experience? JackpotsWorld provides access to selected VIP-oriented packages through participating partners. Depending on the destination and package, available benefits may include:"
                />
                <div style={{ maxWidth: 680, margin: '26px auto 0' }}>
                  <BulletList items={VIP_BENEFITS} />
                </div>
                <p style={{
                  textAlign: 'center', fontSize: '0.86rem', lineHeight: 1.7,
                  color: 'rgba(var(--w365-text-rgb),0.58)', margin: '24px auto 0', maxWidth: 620,
                }}>
                  Package benefits, availability and eligibility can vary by destination. Contact
                  JackpotsWorld to learn about the current packages available for your preferred destination.
                </p>
                <div style={{ textAlign: 'center', marginTop: 24 }}>
                  <EnquiryCTA label="Enquire About VIP Packages" source="sri_lanka_vip" variant="whatsapp" message={'Hi! I’m interested in *VIP casino packages in Sri Lanka*. Please share more details.'} Icon={Crown} />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Poker in Sri Lanka ── */}
        <section style={section}>
          <div style={{ ...container, maxWidth: 820 }}>
            <Reveal>
              <SectionHeading
                eyebrow="Poker"
                title="Poker in Sri Lanka"
              />
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.8, color: 'rgba(var(--w365-text-rgb),0.7)', margin: 0 }}>
                  Sri Lanka can also be explored by visitors interested in poker and other casino experiences.
                  Through our partner network, JackpotsWorld helps guests discover available poker experiences
                  at participating casino destinations.
                </p>
                <p style={{ fontSize: '0.9rem', lineHeight: 1.75, color: 'rgba(var(--w365-text-rgb),0.6)', margin: 0 }}>
                  Poker availability, venue schedules, eligibility requirements and applicable conditions may
                  vary by casino. If you are specifically looking for poker in Sri Lanka, contact our team to
                  find out about currently available destinations and packages.
                </p>
              </div>
              <div style={{ textAlign: 'center', marginTop: 26 }}>
                <EnquiryCTA label="Explore Poker in Sri Lanka" source="sri_lanka_poker" message={'Hi! I’m interested in *poker in Sri Lanka*. Please share more details.'} Icon={Spade} />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Hotels + Travel (two columns) ── */}
        <section style={section}>
          <div style={container}>
            <div style={{
              display: 'grid', gap: 18,
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            }}>
              <Reveal>
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Building2 size={24} color={GOLD} strokeWidth={1.8} />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'rgba(var(--w365-text-rgb),0.92)' }}>
                      Hotels and Accommodation
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.88rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.64)', margin: 0 }}>
                    A casino trip can be part of a complete travel experience. JackpotsWorld can help guests
                    explore accommodation options connected with selected casino destinations and packages.
                    Depending on availability, guests may be able to explore:
                  </p>
                  <BulletList items={ACCOMMODATION} columns={1} />
                  <p style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'rgba(var(--w365-text-rgb),0.5)', margin: 0 }}>
                    Accommodation availability depends on the selected destination and package.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={0.08}>
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Car size={24} color={GOLD} strokeWidth={1.8} />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'rgba(var(--w365-text-rgb),0.92)' }}>
                      Travel Assistance
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.88rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.64)', margin: 0 }}>
                    Planning an international casino trip involves more than choosing a destination.
                    JackpotsWorld helps simplify the planning process by connecting guests with relevant
                    travel and destination services. Depending on your selected package, assistance may be
                    available for:
                  </p>
                  <BulletList items={TRAVEL_ASSISTANCE} columns={1} />
                  <p style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'rgba(var(--w365-text-rgb),0.5)', margin: 0 }}>
                    Our team can help you understand what is included before you confirm your package.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── How JackpotsWorld Works ── */}
        <section style={section}>
          <div style={container}>
            <Reveal>
              <div style={headerGap}>
                <SectionHeading eyebrow="How It Works" title="How JackpotsWorld Works" />
              </div>
            </Reveal>
            <div style={{
              display: 'grid', gap: 16,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}>
              {STEPS.map((s, i) => (
                <Reveal key={s.title} delay={i * 0.05}>
                  <div style={{ ...cardStyle, gap: 12 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg,#9A7D20,#D4AF37,#F5D060)', color: '#1A0015',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '1.05rem',
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'rgba(var(--w365-text-rgb),0.92)' }}>
                      {s.title}
                    </div>
                    <p style={{ fontSize: '0.84rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.62)', margin: 0 }}>
                      {s.desc}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Why Choose JackpotsWorld ── */}
        <section style={section}>
          <div style={container}>
            <Reveal>
              <div style={headerGap}>
                <SectionHeading eyebrow="Why Us" title="Why Choose JackpotsWorld?" />
              </div>
            </Reveal>
            <div style={{
              display: 'grid', gap: 18,
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            }}>
              {WHY_JW_CARDS.map((c, i) => (
                <Reveal key={c.title} delay={i * 0.06}>
                  <IconCard {...c} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Plan Your Trip ── */}
        <section style={section}>
          <div style={{ ...container, maxWidth: 820 }}>
            <Reveal>
              <SectionHeading
                eyebrow="Plan"
                title="Plan Your Sri Lanka Casino Trip"
                intro="Whether you are travelling alone, with friends or as part of a VIP group, JackpotsWorld provides a convenient way to explore casino destinations and related services. You can explore available options based on:"
              />
              <div style={{ maxWidth: 680, margin: '26px auto 0' }}>
                <BulletList items={PLAN_OPTIONS} />
              </div>
              <p style={{
                textAlign: 'center', fontSize: '0.86rem', lineHeight: 1.7,
                color: 'rgba(var(--w365-text-rgb),0.58)', margin: '24px auto 0', maxWidth: 620,
              }}>
                Our team can help you understand available options before you make your travel arrangements.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── FAQs ── */}
        <section style={section}>
          <div style={{ ...container, maxWidth: 860 }}>
            <Reveal>
              <div style={headerGap}>
                <SectionHeading eyebrow="FAQs" title="Sri Lanka Casino Destination FAQs" />
              </div>
            </Reveal>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {FAQS.map((f) => (
                <Reveal key={f.q}>
                  <FaqItem {...f} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Explore More Destinations (cross-links → enquiry) ── */}
        <section style={section}>
          <div style={container}>
            <Reveal>
              <div style={headerGap}>
                <SectionHeading eyebrow="More" title="Explore More JackpotsWorld Destinations" />
              </div>
            </Reveal>
            <div style={{
              display: 'grid', gap: 18,
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            }}>
              {CROSS_LINKS.map((c, i) => (
                <Reveal key={c.title} delay={i * 0.06}>
                  <div style={cardStyle}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                      background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.28)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <c.Icon size={22} color={GOLD} strokeWidth={1.8} />
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(var(--w365-text-rgb),0.92)' }}>
                      {c.title}
                    </div>
                    <p style={{ fontSize: '0.84rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.62)', margin: 0 }}>
                      {c.desc}
                    </p>
                    <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                      <EnquiryCTA label={c.label} source={c.source} message={c.message} Icon={ArrowRight} />
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
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
                <h2 style={{
                  fontSize: 'clamp(1.5rem,4.5vw,2.3rem)', fontWeight: 800, margin: 0,
                  color: 'var(--w365-heading, rgba(255,255,255,0.95))',
                }}>
                  Start Your Sri Lanka Experience
                </h2>
                <p style={{
                  fontSize: 'clamp(0.9rem,2.6vw,1.02rem)', lineHeight: 1.75,
                  color: 'rgba(var(--w365-text-rgb),0.7)', margin: '16px auto 0', maxWidth: 600,
                }}>
                  Discover premium casino destinations, VIP packages, hospitality and travel experiences
                  with JackpotsWorld.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 28 }}>
                  <EnquiryCTA label="Explore Sri Lanka Casino Destinations" source="sri_lanka_final" Icon={Sparkles} />
                  <EnquiryCTA label="Contact JackpotsWorld" source="sri_lanka_contact" variant="whatsapp" message={'Hi! I’d like to get in touch with JackpotsWorld about casino destinations in Sri Lanka 🎰'} Icon={Headphones} />
                </div>
                <p style={{
                  fontSize: '0.75rem', lineHeight: 1.6, color: 'rgba(var(--w365-text-rgb),0.45)',
                  margin: '30px auto 0', maxWidth: 640,
                }}>
                  JackpotsWorld is a referral and travel platform that connects guests with third-party
                  casino destinations and related services. Gaming facilities are operated by the respective
                  casino operators, and availability, benefits and eligibility vary by destination.
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
