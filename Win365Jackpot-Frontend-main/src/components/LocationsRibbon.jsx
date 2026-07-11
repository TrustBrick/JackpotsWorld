import React from 'react'
import { MapPin } from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchLocations } from '../services/locationService'
import { flagFromCountryCode } from '../utils/countryFlags'

const FALLBACK = [
  { id: 'vn', name: 'Vietnam', country_code: 'VN' },
  { id: 'mo', name: 'Macau', country_code: 'MO' },
  { id: 'in', name: 'India', country_code: 'IN' },
  { id: 'lk', name: 'Sri Lanka', country_code: 'LK' },
  { id: 'ph', name: 'Philippines', country_code: 'PH' },
]

export default function LocationsRibbon() {
  const { data } = useAutoFetch(fetchLocations, {}, { intervalMs: 60_000 })
  const locations = Array.isArray(data) && data.length > 0 ? data : FALLBACK

  // Render the list twice back-to-back so the marquee loops seamlessly.
  const track = [...locations, ...locations]

  return (
    <div
      className="relative overflow-hidden"
      style={{
        borderTop: '1px solid var(--w365-border)',
        borderBottom: '1px solid var(--w365-border)',
        background: 'var(--w365-surface-hi, rgba(212,175,55,0.04))',
        padding: '10px 0',
      }}
      aria-label="Casino locations we operate in"
    >
      <div
        className="w365-marquee-track flex items-center gap-10 whitespace-nowrap"
        style={{
          width: 'max-content',
          animation: 'w365-marquee 28s linear infinite',
        }}
      >
        {track.map((loc, i) => (
          <div
            key={`${loc.id}-${i}`}
            className="flex items-center gap-2 text-sm font-body font-semibold tracking-widest uppercase"
            style={{ color: 'var(--w365-text)' }}
          >
            <span style={{ fontSize: 18 }}>{flagFromCountryCode(loc.country_code) || <MapPin size={14} className="text-gold" />}</span>
            {loc.name}
            <span style={{ color: '#D4AF37', marginLeft: 8 }}>•</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes w365-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .w365-marquee-track { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
