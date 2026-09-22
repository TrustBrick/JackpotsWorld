import React, { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { MessageCircle, Headset } from 'lucide-react'
import { useExperiencePillar, iconFor, SECTION_PAD, CONTAINER, HEADER_GAP } from './shared'
import ExperienceEnquiryModal from './ExperienceEnquiryModal'
import useEnquiryNumber from '../../hooks/useEnquiryNumber'
import useEnquiryMessage from '../../hooks/useEnquiryMessage'
import { buildWhatsAppLink } from '../../services/enquiryContact'
import { enquiryContext, recordWhatsAppClick } from '../../services/whatsappEnquiryService'

/**
 * §12 VIP CONCIERGE — the glue between everything above it.
 *
 * ITS OWN IDENTITY: centred and quiet. The three sections before this one are
 * left-aligned and busy because they are showing you options; this one is
 * symmetrical and still, because it is the answer rather than another choice.
 * It closes the destination story before the page returns to the existing VIP
 * membership and registration sections.
 *
 * NO SECOND SUPPORT SYSTEM. "Talk to a VIP host" dispatches the same
 * `open-chat` event every other host CTA on this site uses, so it opens the
 * EXISTING live support widget. The WhatsApp button uses the existing
 * per-country number and the existing Back-Office-editable message. Nothing
 * about support or enquiry is reimplemented here — the only new thing is the
 * per-service enquiry form, which saves the lead before handing off.
 */
export default function VipConciergeSection() {
  const { items, loading } = useExperiencePillar('concierge')
  const reduceMotion = useReducedMotion()
  const [enquiring, setEnquiring] = useState(null)

  const number = useEnquiryNumber()
  const waMessage = useEnquiryMessage('footer_general')

  if (loading || items.length === 0) return null

  const openLiveSupport = () => {
    // The same event the Dashboard's Live Support tab and every "Talk to a VIP
    // Host" CTA already fire. ChatBot listens for it anywhere in the app.
    window.dispatchEvent(new CustomEvent('open-chat'))
  }

  return (
    <section
      id="vip-concierge"
      style={{
        padding: SECTION_PAD,
        background: 'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(212,175,55,0.07) 0%, transparent 70%)',
      }}
    >
      <div style={{ ...CONTAINER, textAlign: 'center' }}>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55 }}
        >
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 54, height: 54, borderRadius: '50%', marginBottom: 20,
              background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)',
            }}
          >
            <Headset size={23} style={{ color: '#D4AF37' }} />
          </span>

          <p
            className="font-body"
            style={{ fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--w365-text-muted)', marginBottom: 12 }}
          >
            One Point Of Contact
          </p>
          <h2
            className="font-display section-heading"
            style={{ fontSize: 'clamp(1.9rem, 6.2vw, 3.3rem)', fontWeight: 600, lineHeight: 1.06, marginBottom: 16 }}
          >
            Your Personal Destination <span className="gold-text">Concierge</span>
          </h2>
          <p
            className="font-body"
            style={{
              color: 'var(--w365-text-muted)', fontSize: 'clamp(0.95rem, 2.5vw, 1.08rem)',
              lineHeight: 1.75, maxWidth: 680, margin: `0 auto ${HEADER_GAP}`,
            }}
          >
            Travel, stays, introductions, tables and transfers — arranged by one
            host who knows the whole trip, so you are not coordinating five
            different bookings yourself.
          </p>
        </motion.div>

        <div className="exp-concierge-grid" style={{ textAlign: 'left', marginBottom: HEADER_GAP }}>
          {items.map((item, i) => (
            <ConciergeService
              key={item.id}
              item={item}
              index={i}
              reduceMotion={reduceMotion}
              onEnquire={() => setEnquiring(item)}
            />
          ))}
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}
        >
          <button
            onClick={openLiveSupport}
            className="btn-gold"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              padding: '13px 28px', borderRadius: 999,
              fontSize: 12.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
            }}
          >
            <Headset size={15} /> Talk To A VIP Host
          </button>
          <a
            href={buildWhatsAppLink(number, waMessage)}
            target="_blank"
            rel="noopener noreferrer"
            // WHATSAPP-LEADS: records the press without altering the link.
            onClick={() => recordWhatsAppClick(enquiryContext({
              source: 'vip_concierge',
              message: waMessage,
              destinationNumber: number,
            }))}
            className="btn-outline-gold"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              padding: '13px 28px', borderRadius: 999,
              fontSize: 12.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
            }}
          >
            <MessageCircle size={15} /> WhatsApp
          </a>
        </motion.div>
      </div>

      <ExperienceEnquiryModal
        experience={enquiring}
        isOpen={!!enquiring}
        onClose={() => setEnquiring(null)}
      />
    </section>
  )
}

function ConciergeService({ item, index, reduceMotion, onEnquire }) {
  const Icon = iconFor(item.icon_name)
  const accent = item.accent_color || '#D4AF37'
  const [hovered, setHovered] = useState(false)

  return (
    <motion.button
      type="button"
      onClick={onEnquire}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, delay: reduceMotion ? 0 : Math.min(index, 6) * 0.06 }}
      // A button rather than a div with a click handler: this is an
      // interactive control, so it should be tabbable and announce itself as
      // one without any extra ARIA.
      style={{
        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', gap: 14, alignItems: 'flex-start',
        padding: 'clamp(15px, 3vw, 20px)', borderRadius: 14,
        background: hovered ? 'rgba(212,175,55,0.05)' : 'rgba(0,0,0,0.22)',
        border: `1px solid ${hovered ? `${accent}55` : 'rgba(255,255,255,0.07)'}`,
        transition: 'background 0.25s, border-color 0.25s',
      }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: `${accent}15`, border: `1px solid ${accent}3d`,
        }}
      >
        <Icon size={17} style={{ color: accent }} />
      </span>

      <span style={{ display: 'block' }}>
        <span
          className="font-heading"
          style={{ display: 'block', fontSize: 'clamp(0.95rem, 2.4vw, 1.05rem)', fontWeight: 800, lineHeight: 1.3, marginBottom: 5, color: 'var(--w365-text)' }}
        >
          {item.title}
        </span>
        {item.subtitle && (
          <span
            className="font-body"
            style={{ display: 'block', fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent, opacity: 0.9, marginBottom: 7 }}
          >
            {item.subtitle}
          </span>
        )}
        {item.description && (
          <span
            className="font-body"
            style={{ display: 'block', fontSize: 13, lineHeight: 1.62, color: 'var(--w365-text-muted)' }}
          >
            {item.description}
          </span>
        )}
      </span>
    </motion.button>
  )
}
