import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { ChevronDown } from 'lucide-react'
import { useAutoFetch } from '../hooks/useAutoFetch'
import { fetchFaqs } from '../services/landingService'

/* ─────────────────────────────────────────────────────────────────────────
   BusinessModelFAQ — the questions a visitor (or a reviewer) needs answered
   in plain words before anything else on this page is safe to read.

   Each answer states a limit on what JackpotsWorld does. That is the point:
   the rest of the page describes destinations, packages and VIP treatment,
   and none of that tells you who takes the money or where the gaming happens.

   ── Back Office managed, with the compliance wording protected ────────────
   This list WAS hardcoded, and the comment here said why: it is the
   compliance-critical statement of what the business is not, and it must not
   vanish because an API call failed. It is now editable from Back Office →
   FAQs, which is what was asked for, and the original reasoning is honoured
   by two things rather than by refusing to make it editable:

     1. Migration 0086 seeds the exact four original questions, verbatim. A
        fresh install and every existing database say what they have always
        said; changing them is a deliberate admin act with an audit trail
        (FAQ.updated_by / updated_at), not a side effect of this change.

     2. FALLBACK_FAQS below is rendered whenever the API returns nothing — an
        outage, a 500, a slow first paint, or a table someone emptied. So the
        failure mode the original comment was guarding against still cannot
        happen: this section never renders blank, and never renders without
        the statement that JackpotsWorld is not an online casino.

   The fallback is never merged with live data. If the API answers with rows,
   those rows are the whole truth; the fallback only stands in when there is
   nothing at all.
   ───────────────────────────────────────────────────────────────────────── */

// The seeded originals, kept here as the offline safety net described above.
// Must stay in step with migration 0086's LANDING_FAQS.
const FALLBACK_FAQS = [
  {
    id: 'fallback-1',
    question: 'Is JackpotsWorld an online casino?',
    answer: 'No. JackpotsWorld is an offline casino referral and VIP concierge platform. We connect '
      + 'members with casino destinations and provide the relevant referral for their visit. '
      + 'Gaming takes place directly at the selected casino.',
  },
  {
    id: 'fallback-2',
    question: 'Can I place a bet through JackpotsWorld?',
    answer: 'No. Casino gaming does not take place on the JackpotsWorld website. Members visit the '
      + 'relevant offline casino to participate directly with the casino.',
  },
  {
    id: 'fallback-3',
    question: 'Does JackpotsWorld hold my gambling funds?',
    answer: 'No. JackpotsWorld does not hold or custody funds used for casino gaming. Any '
      + 'gaming-related financial transactions are handled directly by the relevant casino.',
  },
  {
    id: 'fallback-4',
    question: 'How does the referral work?',
    answer: 'Register with JackpotsWorld, select your destination, and contact our team. We provide '
      + 'the appropriate referral for your casino visit.',
  },
]

const FAQ_PARAMS = { category: 'landing' }

function FaqRow({ item, open, onToggle, reduceMotion }) {
  // Wired ids so a screen reader announces the panel as belonging to its
  // question, and so the expanded region is reachable from the button.
  const panelId = `faq-panel-${item.id}`
  const buttonId = `faq-button-${item.id}`
  return (
    <div style={{
      borderBottom: '1px solid rgba(212,175,55,0.14)',
    }}>
      <button
        id={buttonId}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '18px 4px', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 14,
          fontFamily: "'Manrope', sans-serif",
          color: 'var(--w365-text)',
          fontSize: 'clamp(13px,2.3vw,15px)', fontWeight: 700, lineHeight: 1.4,
        }}
      >
        <span style={{ flex: 1 }}>{item.question}</span>
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
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
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
              // Admin-authored answers may contain deliberate line breaks;
              // honour them without allowing any markup through.
              whiteSpace: 'pre-line',
            }}>
              {item.answer}
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

  const { data } = useAutoFetch(fetchFaqs, FAQ_PARAMS, { intervalMs: 300_000 })

  // Live rows if there are any, the built-in statement otherwise. Never both —
  // see the note at the top of this file.
  const faqs = useMemo(() => {
    const rows = Array.isArray(data) ? data : []
    return rows.length ? rows : FALLBACK_FAQS
  }, [data])

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
          {faqs.map((item, i) => (
            <FaqRow
              key={item.id}
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
