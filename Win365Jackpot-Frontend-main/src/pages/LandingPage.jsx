import React from 'react'
import { useTheme } from '../context/ThemeContext'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import CountryPackages from '../components/CountryPackages'
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
          backgroundImage: 'url(/images/jackpotsworld_watermark.png)',
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