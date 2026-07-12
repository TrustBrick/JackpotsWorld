import React, { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import AuthModal from '../components/AuthModal'

/**
 * Dedicated, shareable /sign-in and /sign-up routes. Reuses the existing
 * AuthModal (no separate auth UI to build/maintain) — opened immediately
 * on mount, closing navigates back home.
 */
export default function AuthPage({ tab }) {
  const navigate = useNavigate()
  // SignInPanel calls onAuthSuccess then onClose synchronously on a
  // successful login — without this flag, onClose's navigate('/') fires
  // last and overrides the dashboard redirect below.
  const succeededRef = useRef(false)

  return (
    <div className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />
      <AuthModal
        isOpen
        onClose={() => { if (!succeededRef.current) navigate('/') }}
        defaultTab={tab}
        onAuthSuccess={() => {
          // Tokens/user are already persisted by SignInPanel's own handle()
          // (which knows the chosen Remember Me value) — just navigate.
          succeededRef.current = true
          navigate('/dashboard')
        }}
      />
    </div>
  )
}
