import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { UserPlus, Ticket, PlaneTakeoff, Building2 } from 'lucide-react'

/* ─────────────────────────────────────────────────────────────────────────
   ReferralJourney — what JackpotsWorld actually does, in four steps.

   The rest of the landing page sells destinations, packages and VIP perks,
   and a visitor could read all of it without ever learning where the gaming
   happens or who they are playing against. This section says it plainly:
   JackpotsWorld is the referral and concierge platform, the casino is the
   offline venue, and the member plays there — directly with the casino.

   Deliberately the plainest block on the page. No animation on the copy
   itself beyond a single reveal, no marketing adjectives, nothing that
   competes with the statement. It exists to be unambiguous, and every claim
   in it is about work this business does itself.

   Everything here is hardcoded rather than Back Office managed, on purpose.
   This is the compliance-critical description of the business model; it
   should not be editable into something else from an admin form, and it
   should not disappear because an API call failed.
   ───────────────────────────────────────────────────────────────────────── */

const STEPS = [
  {
    icon: UserPlus,
    n: '1',
    title: 'Register with JackpotsWorld',
    body: 'Create your membership and tell us your preferred destination.',
  },
  {
    icon: Ticket,
    n: '2',
    title: 'Receive Your Referral',
    body: 'Our team provides the appropriate casino referral for your visit.',
  },
  {
    icon: PlaneTakeoff,
    n: '3',
    title: 'Visit the Casino',
    body: 'Travel to the selected offline casino and present your JackpotsWorld referral.',
  },
  {
    icon: Building2,
    n: '4',
    title: 'Play Directly at the Casino',
    body: 'Your casino visit and gaming activity take place directly at the casino.',
  },
]

function Step({ step, index, reduceMotion, inView }) {
  const { icon: Icon } = step
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : index * 0.09 }}
      style={{
        position: 'relative',
        background: 'rgba(var(--w365-text-rgb),0.03)',
        border: '1px solid rgba(212,175,55,0.18)',
        borderRadius: 16,
        padding: '26px 22px 22px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      {/* Step number, sitting on the card's top edge like a plate. */}
      <span style={{
        position: 'absolute', top: -13, left: 22,
        width: 28, height: 28, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#C9972A,#F5E07A)',
        color: '#1a0010',
        fontFamily: "'Manrope', sans-serif",
        fontSize: 12, fontWeight: 900,
        boxShadow: '0 0 18px rgba(212,175,55,0.35)',
      }}>
        {step.n}
      </span>

      <Icon size={22} style={{ color: '#D4AF37', flexShrink: 0 }} aria-hidden="true" />

      <h3 style={{
        fontFamily: "'Manrope', sans-serif",
        fontSize: 15, fontWeight: 800, lineHeight: 1.3,
        color: 'var(--w365-text)', margin: 0,
      }}>
        {step.title}
      </h3>

      <p style={{
        fontSize: 13, lineHeight: 1.65, margin: 0,
        color: 'rgba(var(--w365-text-rgb),0.55)',
      }}>
        {step.body}
      </p>
    </motion.div>
  )
}

export default function ReferralJourney() {
  const reduceMotion = useReducedMotion()
  const { ref, inView } = useInView({ threshold: 0.15, triggerOnce: true })

  return (
    <section
      id="how-it-works"
      ref={ref}
      style={{ padding: 'clamp(56px,9vw,96px) clamp(16px,5vw,24px)' }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: reduceMotion ? 0 : 0.5 }}
          style={{ textAlign: 'center', marginBottom: 'clamp(30px,5vw,48px)' }}
        >
          <p style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: 'clamp(9px,1.9vw,11px)', fontWeight: 800,
            letterSpacing: '0.3em', textTransform: 'uppercase',
            color: 'rgba(212,175,55,0.75)', margin: '0 0 12px',
          }}>
            Discover. Get Referred. Play Offline.
          </p>

          <h2 className="gold-text" style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: 'clamp(22px,4.4vw,40px)', fontWeight: 900,
            lineHeight: 1.18, margin: '0 0 14px',
          }}>
            Your Casino Journey Starts With JackpotsWorld
          </h2>

          <p style={{
            fontSize: 'clamp(12px,2.2vw,14px)', lineHeight: 1.75,
            color: 'rgba(var(--w365-text-rgb),0.55)',
            maxWidth: 620, margin: '0 auto',
          }}>
            JackpotsWorld connects members with selected offline casino destinations and VIP
            experiences. We are not an online casino — gaming takes place at the venue you visit.
          </p>
        </motion.div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,236px),1fr))',
          gap: 'clamp(16px,2.5vw,22px)',
        }}>
          {STEPS.map((step, i) => (
            <Step
              key={step.n}
              step={step}
              index={i}
              reduceMotion={reduceMotion}
              inView={inView}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
