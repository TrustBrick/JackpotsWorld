import React from 'react'
import { useTheme } from '../context/ThemeContext'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import ReferralJourney from '../components/ReferralJourney'
import CountryPackages from '../components/CountryPackages'
import FeaturedDestinationShowcase from '../components/FeaturedDestinationShowcase'
import EventsPreviewSection from '../components/EventsPreviewSection'
import PromotionsPreviewSection from '../components/PromotionsPreviewSection'
import GlobalReachCard from '../components/GlobalReachCard'
import WhyChooseUs from '../components/WhyChooseUs'
import Footer from '../components/Footer'
import ParticleStars from '../components/ParticleStars'
import GiftsSection from '../components/Giftssection'
import VIPLevels from '../components/VIPLevels'
import BusinessModelFAQ from '../components/BusinessModelFAQ'
import Register from '../components/Register'
import PageScrollButtons from '../components/PageScrollButtons'
// VIP DESTINATION PILLARS: the non-casino half of the story (§4). Each one
// renders nothing at all until it has Back Office rows, so adding them here
// cannot leave empty headings on the page.
import BeyondTheCasinoSection from '../components/experiences/BeyondTheCasinoSection'
import LuxuryTravelSection from '../components/experiences/LuxuryTravelSection'
import StaysSection from '../components/experiences/StaysSection'
import DiningEntertainmentSection from '../components/experiences/DiningEntertainmentSection'
import VipConciergeSection from '../components/experiences/VipConciergeSection'

export default function LandingPage() {
  const { theme } = useTheme()
  return (
    <div key={theme} className="relative min-h-screen bg-surface overflow-x-hidden">

      {/* ── Sticky Watermark ── */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'clamp(320px, 55vw, 720px)',
          height: 'clamp(320px, 55vw, 720px)',
          // Transparent-background cut of the emblem — the old
          // jackpotsworld_watermark.png was opaque RGB, so this fixed
          // overlay painted a dimmed black square across the page.
          //
          // 512px rather than the full-resolution file: this renders at most
          // 720px wide at 6-15% opacity (--w365-watermark-opacity), where the
          // upscale is imperceptible, and it keeps the landing page from
          // pulling ~2.9 MB for a decorative background.
          backgroundImage: 'url(/assets/images/jackpotsworld-logo-512.png)',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          opacity: 'var(--w365-watermark-opacity, 0.15)',
          pointerEvents: 'none',
          zIndex: 0,
          userSelect: 'none',
        }}
      />

      <ParticleStars />
      <Navbar />
      <main style={{ position: 'relative', zIndex: 1 }}>
        <Hero />
        {/* The whole offering in one screen, immediately under the hero.
            The header nav is deliberately unchanged, so this band is where a
            visitor who skims learns the site is more than casinos — and every
            card is a Back Office row whose CTA target is editable, so where
            each one sends people can change without a deploy. */}
        <BeyondTheCasinoSection />
        {/* Immediately under the hero, before anything starts selling. A
            visitor should learn that we refer and the casino hosts before
            they read a single package price — not three screens later. */}
        <ReferralJourney />
        <CountryPackages />
        {/* After the destinations (CountryPackages renders them, and the
            packages section they live in), before Events below. Renders
            nothing at all when no showcase is active. */}
        <FeaturedDestinationShowcase />
        {/* §4 story order: the destinations and the casino packages above have
            established WHERE and WHAT TO PLAY; these two answer how you get
            there and where you sleep, before the page moves on to what is on
            while you are there. */}
        <LuxuryTravelSection />
        <StaysSection />
        {/* id is the Events stop on the journey rail. The grid itself, and all
            three cards in it, are unchanged. */}
        <div id="events-preview" className="grid md:grid-cols-3 gap-6 max-w-7xl mx-auto px-4 pb-16 items-stretch">
          <GlobalReachCard />
          <EventsPreviewSection />
          <PromotionsPreviewSection />
        </div>
        {/* After the events grid, because an evening follows a day out. */}
        <DiningEntertainmentSection />
        {/* Closes the destination story — the one host who arranges all of the
            above — before the page returns to the existing membership and
            registration sections. */}
        <VipConciergeSection />
        <GiftsSection />
        <VIPLevels />
        <WhyChooseUs />
        {/* Last thing before the registration form: the four questions whose
            answers a member needs before handing over their details. */}
        <BusinessModelFAQ />
        <Register />
      </main>
      <Footer />
      <PageScrollButtons />
    </div>
  )
}