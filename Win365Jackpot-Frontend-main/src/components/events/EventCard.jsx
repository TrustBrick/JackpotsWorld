import React from 'react'
import { motion } from 'framer-motion'
import {
  MapPin, Building2, CalendarDays, Tag, ShieldCheck,
  Package, Phone, Mail, ArrowRight,
} from 'lucide-react'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * EventCard
 * Purely presentational — takes one `event` object (see src/data/events.js
 * for the expected shape) and renders it. When the dummy data is replaced
 * with a live `/api/events` response, nothing here needs to change as long
 * as the response objects keep the same field names.
 */
export default function EventCard({ event, onRegister }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="casino-card flex flex-col overflow-hidden h-full"
    >
      {/* Banner */}
      <div className="relative h-44 md:h-48 overflow-hidden">
        <img
          src={event.banner}
          alt={event.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(10,0,5,0.9) 100%)' }}
        />
        <span
          className="absolute top-3 left-3 px-3 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase"
          style={{
            background: 'rgba(212,175,55,0.15)',
            border: '1px solid rgba(212,175,55,0.5)',
            color: '#D4AF37',
          }}
        >
          <Tag size={10} className="inline mr-1 -mt-0.5" />
          {event.category}
        </span>
        <div className="absolute bottom-3 left-4 right-4">
          <p className="text-white/60 text-xs font-body flex items-center gap-1">
            <Building2 size={11} /> {event.casinoName}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <h3
          className="font-black text-lg text-white/90 leading-snug"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {event.title}
        </h3>

        <p className="text-white/55 text-sm font-body leading-relaxed line-clamp-3">
          {event.description}
        </p>

        <div className="grid grid-cols-2 gap-2 text-xs font-body text-white/60 mt-1">
          <div className="flex items-center gap-1.5">
            <MapPin size={13} className="text-gold shrink-0" />
            {event.city}, {event.country}
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays size={13} className="text-gold shrink-0" />
            {formatDate(event.startDate)} – {formatDate(event.endDate)}
          </div>
          <div className="col-span-2 flex items-center gap-1.5">
            <Building2 size={13} className="text-gold shrink-0" />
            {event.venue}
          </div>
        </div>

        <div className="section-divider my-1" />

        <div className="flex items-start gap-1.5 text-xs font-body text-white/50">
          <ShieldCheck size={13} className="text-gold shrink-0 mt-0.5" />
          <span>{event.entryRequirements}</span>
        </div>

        {event.packages?.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs font-body text-white/50">
            <Package size={13} className="text-gold shrink-0 mt-0.5" />
            <span>
              {event.packages.map(p => p.name).join(' · ')}
            </span>
          </div>
        )}

        {event.contact && (
          <div className="flex flex-wrap gap-3 text-xs font-body text-white/40 mt-1">
            <span className="flex items-center gap-1"><Mail size={11} /> {event.contact.email}</span>
            <span className="flex items-center gap-1"><Phone size={11} /> {event.contact.phone}</span>
          </div>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onRegister?.(event)}
          className="btn-gold mt-auto w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold tracking-widest uppercase"
        >
          Register
          <ArrowRight size={14} />
        </motion.button>
      </div>
    </motion.div>
  )
}
