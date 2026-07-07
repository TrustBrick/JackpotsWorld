import React from 'react'
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

  return (
    <div className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />
      <AuthModal
        isOpen
        onClose={() => navigate('/')}
        defaultTab={tab}
        onAuthSuccess={(userData) => {
          localStorage.setItem('user', JSON.stringify(userData))
          navigate('/dashboard')
        }}
      />
    </div>
  )
}
