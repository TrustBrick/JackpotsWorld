import React, { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import AuthModal from '../components/AuthModal'

/**
 * Dedicated, shareable auth routes. Reuses the existing AuthModal (no separate
 * auth UI to build or maintain) — opened immediately on mount.
 *
 * Serves both the site-wide /sign-in and /sign-up, and the section-scoped ones
 * (/andhar-bahar/sign-up and friends). A section route passes `returnTo` so
 * the visitor lands back where they came from, and `prompt` so the page can
 * say what they are signing up FOR — which is the whole reason a section has
 * its own entry point rather than a generic one.
 *
 * ONE ACCOUNT, deliberately. A section-scoped page is a different doorway, not
 * a different account system: the same credentials work everywhere, so a
 * member who signs up from Andhar Bahar can register for Poker without a
 * second account, and their wallet, VIP level and referral attribution all
 * follow them. Separate accounts per game would fragment every one of those.
 */
export default function AuthPage({ tab, returnTo = null, prompt = '' }) {
  const navigate = useNavigate()
  // SignInPanel calls onAuthSuccess then onClose synchronously on a
  // successful login — without this flag, onClose's navigate fires last and
  // overrides the redirect below.
  const succeededRef = useRef(false)

  // `returnTo` is what makes a section-scoped auth page worth having. A
  // visitor who came for Andhar Bahar and signed up should land back on
  // Andhar Bahar — dropping them on the dashboard loses the event they were
  // looking at and the reason they registered. Unset keeps the original
  // behaviour exactly: cancel goes home, success goes to the dashboard.
  const cancelTo = returnTo || '/'
  const successTo = returnTo || '/dashboard'

  return (
    <div className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />
      {prompt && (
        <div className="max-w-3xl mx-auto px-4 pt-28 text-center">
          <p className="text-theme-muted font-body text-sm md:text-base leading-relaxed">
            {prompt}
          </p>
        </div>
      )}
      <AuthModal
        isOpen
        onClose={() => { if (!succeededRef.current) navigate(cancelTo) }}
        defaultTab={tab}
        onAuthSuccess={() => {
          // Tokens/user are already persisted by SignInPanel's own handle()
          // (which knows the chosen Remember Me value) — just navigate.
          succeededRef.current = true
          navigate(successTo)
        }}
      />
    </div>
  )
}
