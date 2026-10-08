import React from 'react'
import { Sparkles, Crown, Hotel, Plane, Headphones, Spade, Gem, Star, Gift, LayoutGrid, ArrowRight, ShieldCheck } from 'lucide-react'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import ParticleStars from '../components/ParticleStars'
import WhatsAppButton from '../components/WhatsAppButton'
import PageScrollButtons from '../components/PageScrollButtons'
import Seo from '../components/Seo'
import { useTheme } from '../context/ThemeContext'
import { ROUTE_SEO } from '../config/seo'
import { SECTION_PAD, CONTAINER, HEADER_GAP } from '../utils/layout'

import {
  GOLD, Cta, InternalCTA, Reveal, SectionHeading, cardStyle,
  IconCard, BulletList, FaqItem, buildFaqJsonLd, buildBreadcrumbJsonLd,
} from './destinations/landingPrimitives'

// ─────────────────────────────────────────────────────────────────────────────
// PremiumCasino (/premium-casino) — the top-level casino hub page: what a
// land-based casino is, entertainment, VIP, poker, events, nightlife and how
// JackpotsWorld connects guests with third-party destinations. Not a specific
// destination (those are the DestinationLanding pages it cross-links to).
//
// COMPLIANCE: JackpotsWorld does not operate casinos or gaming facilities; it
// connects guests with selected third-party casino destinations and services.
// The copy, the "Casino Games & Table Games" note and the closing "Important
// Information" block all state this — keep any edit on that line.
// ─────────────────────────────────────────────────────────────────────────────

const PATH = '/premium-casino'

const FAQS = [
  { q: 'What is a land-based casino?', a: 'A land-based casino is a physical casino venue where eligible guests can experience casino gaming and entertainment in person.' },
  { q: 'Does JackpotsWorld operate a casino?', a: 'No. JackpotsWorld is a platform that connects guests with selected third-party casino destinations and related travel and hospitality services. Gaming facilities are operated by the respective casino operators.' },
  { q: 'Can I find poker at casino destinations?', a: 'Poker availability depends on the individual casino. Some participating venues may offer poker tables, live poker or poker tournaments.' },
  { q: 'What is a VIP casino experience?', a: 'A VIP casino experience may include premium hospitality, guest assistance, accommodation, travel services and other benefits depending on the selected destination and package.' },
  { q: 'Can I find casino events and nightlife?', a: 'Selected casino destinations may offer casino events, gaming nights, entertainment, dining and nightlife. Availability depends on the venue and event schedule.' },
  { q: 'What is the best casino?', a: 'The best casino depends on your destination, preferred games, hospitality requirements, entertainment preferences and available services. JackpotsWorld helps guests explore selected casino destinations based on their requirements.' },
  { q: 'Can I find luxury casino destinations?', a: 'Yes. JackpotsWorld connects guests with selected premium and VIP-oriented casino destinations where available.' },
  { q: 'Are casino rewards or bonuses available?', a: 'Casino rewards, bonuses and promotions depend on the individual casino operator and applicable terms. Availability and eligibility can vary by destination.' },
  { q: 'Can I plan a casino weekend or night out?', a: 'Yes. Selected casino destinations can be part of a weekend trip or night-out experience combining casino entertainment, dining, hospitality and nightlife.' },
  { q: 'How can I enquire about a casino destination?', a: 'Contact JackpotsWorld through the enquiry channels available on our website. Our team can provide information about current destinations, packages and available services.' },
]

const ENTERTAINMENT = [
  { Icon: Sparkles, title: 'Casino Gaming', desc: 'Explore participating casino venues and learn about the gaming experiences available through the respective casino operator.' },
  { Icon: Spade, title: 'Poker', desc: 'Discover poker destinations, poker tables and live poker experiences where available.' },
  { Icon: Gem, title: 'Live Dealing Games', desc: 'Selected casino destinations may offer live dealing games and traditional table-game experiences.' },
  { Icon: Crown, title: 'Casino Lounges', desc: 'Premium casino venues may include dedicated lounges and hospitality areas for guests.' },
  { Icon: Star, title: 'Casino Events', desc: 'Discover selected casino events, entertainment programs and destination experiences where available.' },
  { Icon: Gift, title: 'Casino Night Experiences', desc: 'A casino night can combine gaming, dining, entertainment and hospitality for an evening experience.' },
]

const WHY_US = [
  { Icon: Gem, title: 'Selected Casino Destinations', desc: 'Discover third-party casino destinations through our partner network.' },
  { Icon: Crown, title: 'Premium Experiences', desc: 'Explore luxury hospitality and VIP-oriented packages.' },
  { Icon: Spade, title: 'Poker & Casino Entertainment', desc: 'Discover participating destinations offering poker and other casino experiences.' },
  { Icon: Plane, title: 'Travel & Hospitality', desc: 'Explore accommodation and destination services associated with selected packages.' },
  { Icon: Headphones, title: 'Guest Support', desc: 'Receive assistance with destination and package information before your trip.' },
  { Icon: LayoutGrid, title: 'One Platform', desc: 'Explore casino destinations, packages and related services through one platform.' },
]

const STEPS = [
  { title: 'Explore', desc: 'Discover selected casino destinations and premium experiences.' },
  { title: 'Choose Your Experience', desc: 'Select a destination based on your casino, poker, hospitality and travel preferences.' },
  { title: 'Enquire', desc: 'Contact JackpotsWorld to check current destination and package availability.' },
  { title: 'Review', desc: 'Review the package inclusions, eligibility requirements and applicable terms.' },
  { title: 'Experience', desc: 'Travel to your selected destination and enjoy the confirmed casino and hospitality experience.' },
]

const CROSS_LINKS = [
  { Icon: Sparkles, title: 'Casino in Sri Lanka', desc: 'Explore premium casino and poker destinations and VIP experiences in Sri Lanka.', label: 'Explore Sri Lanka', to: '/casino-in-sri-lanka' },
  { Icon: Sparkles, title: 'Casino in Macau', desc: 'Discover premium casino and poker destinations and VIP experiences in Macau.', label: 'Explore Macau', to: '/casino-macau' },
]

const POKER_MSG = 'Hi! I’m interested in *poker destinations* through JackpotsWorld. Please share more details.'
const VIP_MSG = 'Hi! I’m interested in *VIP casino packages* through JackpotsWorld. Please share more details.'
const GENERAL_MSG = 'Hi! I’d like to explore *casino destinations* with JackpotsWorld 🎰'

// A text section: heading + paragraphs + optional bullets + optional closing + CTA.
function InfoSection({ eyebrow, title, intro, paras = [], bullets, bulletCols = 2, closing, cta, boxed = false, maxWidth = 820 }) {
  const inner = (
    <>
      <SectionHeading eyebrow={eyebrow} title={title} intro={intro} />
      {paras.length > 0 && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
          {paras.map((p, i) => (
            <p key={i} style={{ fontSize: '0.95rem', lineHeight: 1.8, color: 'rgba(var(--w365-text-rgb),0.7)', margin: 0 }}>{p}</p>
          ))}
        </div>
      )}
      {bullets && (
        <div style={{ maxWidth: 720, margin: '24px auto 0' }}>
          <BulletList items={bullets} columns={bulletCols} />
        </div>
      )}
      {closing && (
        <p style={{ textAlign: 'center', fontSize: '0.86rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.58)', margin: '24px auto 0', maxWidth: 640 }}>
          {closing}
        </p>
      )}
      {cta && <div style={{ textAlign: 'center', marginTop: 24 }}><Cta cta={cta} /></div>}
    </>
  )
  return (
    <Reveal>
      {boxed ? (
        <div style={{
          border: '1px solid rgba(212,175,55,0.22)', borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(212,175,55,0.07), rgba(var(--w365-text-rgb),0.02))',
          padding: 'clamp(26px, 5vw, 48px)', maxWidth: 980, margin: '0 auto',
        }}>{inner}</div>
      ) : (
        <div style={{ maxWidth, margin: '0 auto' }}>{inner}</div>
      )}
    </Reveal>
  )
}

export default function PremiumCasino() {
  const { theme } = useTheme()
  const route = ROUTE_SEO[PATH] || {}
  const section = { position: 'relative', padding: SECTION_PAD, zIndex: 1 }
  const container = { ...CONTAINER }
  const headerGap = { marginBottom: HEADER_GAP }

  return (
    <div key={theme} className="relative min-h-screen bg-surface overflow-x-hidden">
      <Seo
        path={PATH}
        title={route.title}
        description={route.description}
        keywords={route.keywords}
        jsonLd={[buildFaqJsonLd(FAQS), buildBreadcrumbJsonLd('Premium Casino Experiences', PATH)]}
      />

      <ParticleStars />
      <Navbar />

      <main style={{ position: 'relative', zIndex: 1 }}>
        {/* Hero */}
        <section style={{ ...section, paddingTop: 'clamp(90px, 16vw, 150px)' }}>
          <div style={container}>
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: 840, margin: '0 auto' }}>
                <h1 style={{ fontSize: 'clamp(2rem,6.5vw,3.4rem)', fontWeight: 800, lineHeight: 1.1, margin: 0, color: 'var(--w365-heading, rgba(255,255,255,0.95))' }}>
                  Premium Casino Experiences
                  <span style={{ display: 'block', color: GOLD, fontSize: 'clamp(1.05rem,3.4vw,1.6rem)', fontWeight: 700, marginTop: 14 }}>
                    Discover Luxury Casino Destinations
                  </span>
                </h1>
                <p style={{ fontSize: 'clamp(0.95rem,2.8vw,1.1rem)', lineHeight: 1.75, color: 'rgba(var(--w365-text-rgb),0.72)', margin: '22px auto 0', maxWidth: 700 }}>
                  Discover premium casino experiences with JackpotsWorld. Explore selected land-based casino
                  destinations, luxury hospitality, VIP packages, casino entertainment, poker experiences,
                  casino events and destination services through our network of casino partners.
                </p>
                <p style={{ fontSize: 'clamp(0.88rem,2.6vw,1rem)', lineHeight: 1.75, color: 'rgba(var(--w365-text-rgb),0.6)', margin: '14px auto 0', maxWidth: 700 }}>
                  Whether you are planning a casino night, a weekend getaway, a VIP trip or a complete casino
                  holiday, JackpotsWorld helps you discover and connect with selected physical casino
                  destinations and related hospitality services.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 30 }}>
                  <Cta cta={{ kind: 'enquiry', label: 'Explore Casino Destinations', source: 'premium_hero', message: GENERAL_MSG, Icon: Sparkles }} />
                  <Cta cta={{ kind: 'enquiry', label: 'Enquire About VIP Packages', source: 'premium_vip_hero', variant: 'whatsapp', message: VIP_MSG, Icon: Crown }} />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Overview" title="Discover Premium Casino Experiences"
            paras={[
              'A casino experience can be much more than casino gaming. Modern casino destinations combine entertainment, hospitality, restaurants, hotels, events and nightlife to create a complete destination experience.',
              'JackpotsWorld connects guests with selected third-party casino destinations and related services, helping visitors explore available options before planning their trip.',
              'From a premium casino lounge to a VIP casino experience, our platform helps guests discover destinations that combine casino entertainment with hospitality and travel.',
            ]}
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Explained" title="What Is a Land-Based Casino?"
            paras={[
              'A land-based casino, also known as a physical casino, is a real-world casino venue where eligible guests can experience casino gaming and entertainment in person.',
              'Unlike online casino platforms, a physical casino can provide a complete destination experience that may include:',
            ]}
            bullets={['Casino gaming', 'Poker tables', 'Live dealing games', 'Casino lounges', 'Restaurants and dining', 'Hotels and accommodation', 'Entertainment', 'Casino events', 'Nightlife', 'VIP hospitality', 'Premium guest services']}
            closing="JackpotsWorld focuses on connecting guests with selected physical casino destinations rather than operating casino gaming facilities itself."
          />
        </div></section>

        {/* Entertainment cards */}
        <section style={section}><div style={container}>
          <Reveal><div style={headerGap}>
            <SectionHeading eyebrow="Entertainment" title="Explore Casino Entertainment" intro="Casino destinations can offer a wide range of entertainment and hospitality experiences. Depending on the destination, guests may discover:" />
          </div></Reveal>
          <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {ENTERTAINMENT.map((c, i) => <Reveal key={c.title} delay={i * 0.05}><IconCard {...c} /></Reveal>)}
          </div>
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            boxed
            eyebrow="VIP" title="Luxury Casino & VIP Experiences"
            intro="For guests looking for a more exclusive experience, selected destinations may provide premium hospitality and VIP services. A luxury casino experience may include:"
            bullets={['Premium hospitality', 'VIP casino access', 'Dedicated guest support', 'Hotel accommodation', 'Dining options', 'Travel assistance', 'Casino lounge access', 'Destination services', 'Exclusive partner benefits']}
            closing="Availability depends on the selected destination and casino partner. JackpotsWorld helps guests explore available VIP casino experience options and understand the package details before travelling."
            cta={{ kind: 'enquiry', label: 'Enquire About VIP Packages', source: 'premium_vip', variant: 'whatsapp', message: VIP_MSG, Icon: Crown }}
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Events" title="Casino Events & Entertainment"
            paras={['Casino destinations can be popular locations for entertainment, social events and special occasions. Depending on the venue, guests may be able to discover:']}
            bullets={['Casino events', 'Gaming nights', 'Weekend casino events', 'Live entertainment', 'Dining experiences', 'Casino parties', 'Nightlife experiences', 'VIP events', 'Special promotions']}
            closing="Event schedules and availability vary by casino and destination. Contact JackpotsWorld for information about current events and available packages."
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Nightlife" title="Casino Nightlife"
            paras={[
              'For visitors looking for a night out, selected casino destinations can combine gaming, dining, entertainment and nightlife.',
              'A casino night may include an evening at the casino venue followed by dining, entertainment or other destination experiences. Guests can explore options such as:',
            ]}
            bullets={['Casino lounges', 'Restaurants', 'Live entertainment', 'Gaming tables', 'Poker', 'VIP hospitality', 'Nightlife', 'Weekend events']}
            closing="Availability depends on the destination and individual venue."
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Poker" title="Poker & Live Poker Experiences"
            paras={[
              'Poker is one of the most popular casino table games and can be an important part of a casino destination experience. Depending on the casino, guests may be able to find:',
            ]}
            bullets={['Poker tables', 'Live poker', 'Casino poker', 'Tournament poker', 'Table-game experiences', 'Live dealing games', 'VIP poker experiences']}
            closing="Poker availability, schedules, minimums, eligibility requirements and game formats vary by casino. JackpotsWorld can help guests explore participating destinations and available poker experiences."
            cta={{ kind: 'enquiry', label: 'Explore Poker Destinations', source: 'premium_poker', message: POKER_MSG, Icon: Spade }}
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Games" title="Casino Games & Table Games"
            paras={[
              'Different casino destinations offer different gaming experiences. Depending on the venue, guests may find traditional table games and other casino entertainment. Examples can include:',
            ]}
            bullets={['Poker', 'Roulette', 'Blackjack', 'Baccarat', 'Other table games', 'Live dealing games']}
            closing="Specific games and availability are determined by the individual casino operator. JackpotsWorld does not operate these gaming facilities. We connect guests with selected third-party casino destinations and related services."
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Guidance" title="Casino Reviews & Destination Information"
            paras={['Choosing a casino destination involves more than searching for the phrase best casino. Guests may want to consider:']}
            bullets={['Casino location', 'Available games', 'Poker availability', 'Hospitality', 'Hotel options', 'Dining', 'Entertainment', 'Casino events', 'VIP services', 'Travel requirements', 'Destination experience']}
            closing="JackpotsWorld provides destination and package information to help guests understand their available options before making travel arrangements."
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Match" title="Find the Best Casino Experience for You"
            paras={[
              'The best casino experience depends on what you are looking for.',
              'Some guests may prefer a premium casino with luxury hospitality, while others may be interested in poker, live dealing games, casino events, nightlife or a complete weekend casino experience. JackpotsWorld helps visitors explore options based on:',
            ]}
            bullets={['Preferred destination', 'Casino experience', 'Poker interests', 'VIP requirements', 'Hotel preferences', 'Travel dates', 'Entertainment preferences', 'Hospitality requirements']}
            closing="Rather than operating one casino, JackpotsWorld provides access to selected casino destinations through its partner network."
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Destinations" title="Casino Destinations in India & Around the World"
            paras={[
              'JackpotsWorld helps guests explore casino destinations in different locations.',
              'For travellers searching for the best casino in Goa, casino destinations in other countries or premium land-based casino experiences, available options depend on current partner destinations and local regulations. Guests can explore destination-specific casino experiences and packages through JackpotsWorld.',
            ]}
            cta={{ kind: 'enquiry', label: 'Explore Casino Destinations', source: 'premium_destinations', message: GENERAL_MSG, Icon: Sparkles }}
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Rewards" title="Casino Rewards & VIP Benefits"
            intro="Selected casino packages may provide access to partner benefits and hospitality services. Depending on the destination and package, benefits may include:"
            bullets={['VIP support', 'Premium hospitality', 'Hotel accommodation', 'Travel assistance', 'Partner benefits', 'Exclusive JackpotsWorld benefits', 'Destination services']}
            closing="Casino rewards, bonuses, promotions and benefits are determined by the relevant casino operator or partner and may vary by destination. Always check the applicable terms and eligibility requirements before participating."
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Venue" title="Casino Venue & Hospitality"
            paras={['A premium casino venue can form part of a complete entertainment destination. Guests may be able to enjoy:']}
            bullets={['Gaming areas', 'Poker tables', 'Casino lounges', 'Restaurants', 'Hotels', 'Entertainment', 'Events', 'VIP hospitality', 'Nightlife']}
            closing="JackpotsWorld helps guests discover selected venues and understand the destination services available through participating partners."
          />
        </div></section>

        <section style={section}><div style={container}>
          <InfoSection
            eyebrow="Plan" title="Plan a Casino Weekend or Night Out"
            paras={['Planning a weekend casino event, casino night or casino party can be part of a larger travel experience. JackpotsWorld can help guests explore available:']}
            bullets={['Casino destinations', 'Hotels', 'VIP packages', 'Dining options', 'Casino events', 'Poker experiences', 'Entertainment', 'Travel services']}
            closing="Package availability depends on the destination and selected partner."
          />
        </div></section>

        {/* How it works */}
        <section style={section}><div style={container}>
          <Reveal><div style={headerGap}><SectionHeading eyebrow="How It Works" title="How JackpotsWorld Works" /></div></Reveal>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.05}>
                <div style={{ ...cardStyle, gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#9A7D20,#D4AF37,#F5D060)', color: '#1A0015', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.05rem' }}>{i + 1}</div>
                  <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'rgba(var(--w365-text-rgb),0.92)' }}>{s.title}</div>
                  <p style={{ fontSize: '0.84rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.62)', margin: 0 }}>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div></section>

        {/* Why choose */}
        <section style={section}><div style={container}>
          <Reveal><div style={headerGap}><SectionHeading eyebrow="Why Us" title="Why Choose JackpotsWorld?" /></div></Reveal>
          <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {WHY_US.map((c, i) => <Reveal key={c.title} delay={i * 0.06}><IconCard {...c} /></Reveal>)}
          </div>
        </div></section>

        {/* FAQ */}
        <section style={section}><div style={{ ...container, maxWidth: 860 }}>
          <Reveal><div style={headerGap}><SectionHeading eyebrow="FAQs" title="Frequently Asked Questions" /></div></Reveal>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FAQS.map(f => <Reveal key={f.q}><FaqItem {...f} /></Reveal>)}
          </div>
        </div></section>

        {/* Cross-links */}
        <section style={section}><div style={container}>
          <Reveal><div style={headerGap}><SectionHeading eyebrow="Destinations" title="Explore JackpotsWorld Destinations" /></div></Reveal>
          <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {CROSS_LINKS.map((c, i) => (
              <Reveal key={c.title} delay={i * 0.06}>
                <div style={cardStyle}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <c.Icon size={22} color={GOLD} strokeWidth={1.8} />
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(var(--w365-text-rgb),0.92)' }}>{c.title}</div>
                  <p style={{ fontSize: '0.84rem', lineHeight: 1.7, color: 'rgba(var(--w365-text-rgb),0.62)', margin: 0 }}>{c.desc}</p>
                  <div style={{ marginTop: 'auto', paddingTop: 6 }}><InternalCTA label={c.label} to={c.to} Icon={ArrowRight} /></div>
                </div>
              </Reveal>
            ))}
          </div>
        </div></section>

        {/* Final CTA */}
        <section style={section}><div style={container}>
          <Reveal>
            <div style={{ textAlign: 'center', border: '1px solid rgba(212,175,55,0.28)', borderRadius: 22, background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(var(--w365-text-rgb),0.02))', padding: 'clamp(30px, 6vw, 60px)' }}>
              <Star size={30} color={GOLD} style={{ marginBottom: 14 }} />
              <h2 style={{ fontSize: 'clamp(1.5rem,4.5vw,2.3rem)', fontWeight: 800, margin: 0, color: 'var(--w365-heading, rgba(255,255,255,0.95))' }}>Explore JackpotsWorld</h2>
              <p style={{ fontSize: 'clamp(0.9rem,2.6vw,1.02rem)', lineHeight: 1.75, color: 'rgba(var(--w365-text-rgb),0.7)', margin: '16px auto 0', maxWidth: 620 }}>
                Discover premium casino destinations, luxury hospitality, poker experiences, VIP packages and
                casino entertainment through JackpotsWorld.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 28 }}>
                <Cta cta={{ kind: 'enquiry', label: 'Explore Casino Destinations', source: 'premium_final', message: GENERAL_MSG, Icon: Sparkles }} />
                <Cta cta={{ kind: 'enquiry', label: 'Explore VIP Packages', source: 'premium_final_vip', variant: 'whatsapp', message: VIP_MSG, Icon: Crown }} />
              </div>
            </div>
          </Reveal>
        </div></section>

        {/* Important information */}
        <section style={{ ...section, paddingBottom: 'clamp(50px, 8vw, 90px)' }}><div style={{ ...container, maxWidth: 900 }}>
          <Reveal>
            <div style={{ border: '1px solid rgba(var(--w365-text-rgb),0.1)', borderRadius: 16, background: 'rgba(var(--w365-text-rgb),0.02)', padding: 'clamp(22px, 4vw, 34px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <ShieldCheck size={20} color={GOLD} strokeWidth={1.8} />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'rgba(var(--w365-text-rgb),0.88)' }}>Important Information</h2>
              </div>
              {[
                'JackpotsWorld is a platform connecting guests with selected third-party casino destinations, travel services and hospitality partners. JackpotsWorld does not operate the casinos or gaming facilities described on this page.',
                'Casino gaming, poker, gambling activities, promotions, rewards and bonuses are subject to the rules, terms, eligibility requirements and applicable laws of the relevant casino operator and destination.',
                'Guests should verify local requirements and applicable regulations before travelling or participating in any casino activity.',
              ].map((p, i) => (
                <p key={i} style={{ fontSize: '0.82rem', lineHeight: 1.75, color: 'rgba(var(--w365-text-rgb),0.55)', margin: i === 0 ? 0 : '12px 0 0' }}>{p}</p>
              ))}
            </div>
          </Reveal>
        </div></section>
      </main>

      <Footer />
      <WhatsAppButton />
      <PageScrollButtons />
    </div>
  )
}
