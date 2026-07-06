import React from 'react'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import CountryPackages from '../components/CountryPackages'
import GamesSection from '../components/GamesSection'
import WhyChooseUs from '../components/WhyChooseUs'
import Testimonials from '../components/Testimonials'
import Footer from '../components/Footer'
import WhatsAppButton from '../components/WhatsAppButton'
import ParticleStars from '../components/ParticleStars'
import GiftsSection from '../components/Giftssection'
import VIPLevels from '../components/VIPLevels'
import Register from '../components/Register'

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-casino-dark overflow-x-hidden">

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
          opacity: 0.15,
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
        <GamesSection />
        <GiftsSection />
        <VIPLevels />
        <WhyChooseUs />
        <Register />
        <Testimonials />
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  )
}