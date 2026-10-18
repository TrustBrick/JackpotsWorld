import React from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Trophy, MapPin, Crown, MessageCircle, Headset } from 'lucide-react'
import GoldLastWord from '../shared/GoldLastWord'
import useEnquiryNumber from '../../hooks/useEnquiryNumber'
import useEnquiryMessage from '../../hooks/useEnquiryMessage'
import { buildWhatsAppLink } from '../../services/enquiryContact'
import { enquiryContext, recordWhatsAppClick } from '../../services/whatsappEnquiryService'

/**
 * "Poker Destinations and VIP Experiences" — the descriptive band under the
 * tournament listings. The listings are what a returning visitor came for, so
 * they stay first; this explains what JackpotsWorld does around them (where
 * poker is offered, what VIP help exists, who to contact) for a first-time
 * visitor and for search engines. Contact reuses the site's existing live
 * support widget and WhatsApp enquiry number rather than a new channel.
 */
const CARDS = [
  { key: 'tournaments',  Icon: Trophy },
  { key: 'destinations', Icon: MapPin },
  { key: 'vip',          Icon: Crown },
]

export default function PokerInfoSection() {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const number = useEnquiryNumber()
  const waMessage = useEnquiryMessage('footer_general')
  const anim = (i = 0) => (reduceMotion ? {} : {
    initial: { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.3 },
    transition: { duration: 0.45, delay: i * 0.06 },
  })

  return (
    <section className="w365-page pb-20" aria-labelledby="poker-info-heading">
      <motion.div {...anim()} className="text-center max-w-3xl mx-auto mb-10">
        <h2 id="poker-info-heading" className="section-heading text-2xl md:text-3xl tracking-wide mb-4">
          <GoldLastWord text={t('poker.info.heading')} />
        </h2>
        <p className="font-body text-sm md:text-base leading-relaxed" style={{ color: 'var(--w365-text-muted)' }}>
          {t('poker.info.intro')}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        {CARDS.map(({ key, Icon }, i) => (
          <motion.article key={key} {...anim(i + 1)} className="casino-card p-6 flex flex-col gap-3">
            <span
              className="inline-flex items-center justify-center rounded-full"
              style={{ width: 42, height: 42, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)' }}
            >
              <Icon size={18} style={{ color: '#D4AF37' }} />
            </span>
            <h3 className="font-display text-lg" style={{ color: 'var(--w365-text)' }}>
              {t(`poker.info.${key}Title`)}
            </h3>
            <p className="font-body text-sm leading-relaxed" style={{ color: 'var(--w365-text-muted)' }}>
              {t(`poker.info.${key}Body`)}
            </p>
          </motion.article>
        ))}
      </div>

      <motion.div
        {...anim(4)}
        className="casino-card p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-5"
      >
        <div className="text-center md:text-left">
          <h3 className="font-display text-xl mb-2" style={{ color: 'var(--w365-text)' }}>
            {t('poker.info.contactTitle')}
          </h3>
          <p className="font-body text-sm leading-relaxed" style={{ color: 'var(--w365-text-muted)' }}>
            {t('poker.info.contactBody')}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
            className="btn-gold flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase"
          >
            <Headset size={14} /> {t('poker.info.contactChat')}
          </button>
          {number && (
            <a
              href={buildWhatsAppLink(number, waMessage)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => recordWhatsAppClick(enquiryContext({
                source: 'footer_general',
                message: waMessage,
                destinationNumber: number,
              }))}
              className="btn-outline-gold flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase"
            >
              <MessageCircle size={14} /> WhatsApp
            </a>
          )}
        </div>
      </motion.div>
    </section>
  )
}
