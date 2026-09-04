import React, { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { ChevronDown } from 'lucide-react'

/* ─────────────────────────────────────────────────────────────────────────
   BusinessModelFAQ — the four questions a visitor (or a reviewer) needs
   answered in plain words before anything else on this page is safe to read.

   Each answer states a limit on what JackpotsWorld does. That is the point:
   the rest of the page describes destinations, packages and VIP treatment,
   and none of that tells you who takes the money or where the gaming happens.

   Hardcoded, not Back Office managed, and for the same reason as
   ReferralJourney: this is the compliance-critical statement of what the
   business is not, and it must not be editable into something else from an
   admin form or vanish because an API call failed.

   The first panel is open on load. A visitor who reads nothing else sees
   "Is JackpotsWorld an online casino? No." without clicking.
   ───────────────────────────────────────────────────────────────────────── */

const FAQS = [
  {
    q: 'Is JackpotsWorld an online casino?',
    a: 'No. JackpotsWorld is an offline casino referral and VIP concierge platform. We connect '
     + 'members with casino destinations and provide the relevant referral for their visit. '
     + 'Gaming takes place directly at the selected casino.',
  },
  {
    q: 'Can I place a bet through JackpotsWorld?',
    a: 'No. Casino gaming does not take place on the JackpotsWorld website. Members visit the '
     + 'relevant offline casino to participate directly with the casino.',
  },
  {
    q: 'Does JackpotsWorld hold my gambling funds?',
    a: 'No. JackpotsWorld does not hold or custody funds used for casino gaming. Any '
     + 'gaming-related financial transactions are handled directly by the relevant casino.',
  },
  {
    q: 'How does the referral work?',
    a: 'Register with JackpotsWorld, select your destination, and contact our team. We provide '
     + 'the appropriate referral for your casino visit.',
  },
]

function FaqRow({ item, open, onToggle, reduceMotion }) {
  return (
    <div style={{
      borderBottom: '1px solid rgba(212,175,55,0.14)',
    }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '18px 4px', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 14,
          fontFamily: "'Manrope', sans-serif",
          color: 'var(--w365-text)',
          fontSize: 'clamp(13px,2.3vw,15px)', fontWeight: 700, lineHeight: 1.4,
        }}
      >
        <span style={{ flex: 1 }}>{item.q}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.25 }}
          style={{ display: 'inline-flex', flexShrink: 0, color: 'rgba(212,175,55,0.8)' }}
        >
          <ChevronDown size={18} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ overflow: 'hidden' }}
          >
            <p style={{
              margin: '0 0 20px', padding: '0 4px',
              fontSize: 'clamp(12px,2.1vw,13.5px)', lineHeight: 1.75,
              color: 'rgba(var(--w365-text-rgb),0.76)',
              maxWidth: 760,
            }}>
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function BusinessModelFAQ() {
  const reduceMotion = useReducedMotion()
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true })
  const [openIdx, setOpenIdx] = useState(0)

  return (
    <section
      id="faq"
      ref={ref}
      style={{ padding: 'clamp(48px,8vw,88px) clamp(16px,5vw,24px)' }}
    >
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <motion.h2
          initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: reduceMotion ? 0 : 0.5 }}
          className="gold-text"
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: 'clamp(20px,4vw,34px)', fontWeight: 900,
            textAlign: 'center', margin: '0 0 clamp(24px,4vw,40px)',
          }}
        >
          Frequently Asked Questions
        </motion.h2>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : 0.1 }}
          style={{
            borderTop: '1px solid rgba(212,175,55,0.14)',
          }}
        >
          {FAQS.map((item, i) => (
            <FaqRow
              key={item.q}
              item={item}
              open={openIdx === i}
              // Accordion, not a toggle-all: clicking the open row closes it.
              onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
              reduceMotion={reduceMotion}
            />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
