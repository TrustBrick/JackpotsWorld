import React from 'react'
import { useTheme } from '../context/ThemeContext'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import CountryPackages from '../components/CountryPackages'
import FeaturedDestinationShowcase from '../components/FeaturedDestinationShowcase'
import EventsPreviewSection from '../components/EventsPreviewSection'
import PromotionsPreviewSection from '../components/PromotionsPreviewSection'
import GlobalReachCard from '../components/GlobalReachCard'
import WhyChooseUs from '../components/WhyChooseUs'
import Testimonials from '../components/Testimonials'
import Footer from '../components/Footer'
import ParticleStars from '../components/ParticleStars'
import GiftsSection from '../components/Giftssection'
import VIPLevels from '../components/VIPLevels'
import Register from '../components/Register'
import PageScrollButtons from '../components/PageScrollButtons'

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
        <CountryPackages />
        {/* After the destinations (CountryPackages renders them, and the
            packages section they live in), before Events below. Renders
            nothing at all when no showcase is active. */}
        <FeaturedDestinationShowcase />
        <div className="grid md:grid-cols-3 gap-6 max-w-7xl mx-auto px-4 pb-16 items-stretch">
          <GlobalReachCard />
          <EventsPreviewSection />
          <PromotionsPreviewSection />
        </div>
        <GiftsSection />
        <VIPLevels />
        <WhyChooseUs />
        <Register />
        <Testimonials />
      </main>
      <Footer />
      <PageScrollButtons />
    </div>
  )
}