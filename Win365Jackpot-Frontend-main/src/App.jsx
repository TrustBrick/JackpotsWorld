import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'

// ── Route-level code splitting ─────────────────────────────────────────────
// LandingPage stays eager (first paint); everything else is only needed
// once the user navigates there, so it's split into its own chunk.
const Dashboard        = lazy(() => import('./components/user/Dashboard'))
const AdminPanel       = lazy(() => import('./admin/AdminPanel'))
const SuperAdminPanel  = lazy(() => import('./admin/SuperAdminPanel'))
const CookiesPolicy    = lazy(() => import('./pages/CookiesPolicy'))
const PrivacyPolicy    = lazy(() => import('./pages/PrivacyPolicy'))
const Events           = lazy(() => import('./pages/Events'))
const EventDetails     = lazy(() => import('./pages/EventDetails'))
const Promotions       = lazy(() => import('./pages/Promotions'))
const PromotionDetails = lazy(() => import('./pages/PromotionDetails'))
const Affiliates       = lazy(() => import('./pages/Affiliates'))
const Poker            = lazy(() => import('./pages/Poker'))
const PokerDetails     = lazy(() => import('./pages/PokerDetails'))
const AuthPage         = lazy(() => import('./pages/AuthPage'))
const AffiliatePanel   = lazy(() => import('./affiliate/AffiliatePanel'))

function RouteFallback() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--w365-bg, #0A0005)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '2px solid transparent', borderTopColor: '#D4AF37', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function isAdminSession() {
  try {
    const user  = JSON.parse(localStorage.getItem('admin_user') || '{}')
    const token = localStorage.getItem('admin_token')

    return !!(token && user?.is_staff === true)
  } catch {
    return false
  }
}

function isLoggedIn() {
  return !!localStorage.getItem('access')
}

// ── Route guards ─────────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/" replace />
  return children
}

function AdminRoute({ children }) {
  if (!localStorage.getItem('admin_token')) {
    return <Navigate to="/" replace />
  }

  if (!isAdminSession()) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        {/* New public pages */}
        <Route path="/events"           element={<Events />} />
        <Route path="/events/:id"       element={<EventDetails />} />
        <Route path="/promotions"       element={<Promotions />} />
        <Route path="/promotions/:id"   element={<PromotionDetails />} />
        <Route path="/affiliates"       element={<Affiliates />} />
        <Route path="/poker"            element={<Poker />} />
        <Route path="/poker/:id"        element={<PokerDetails />} />
        <Route path="/sign-in"          element={<AuthPage tab="login" />} />
        <Route path="/sign-up"          element={<AuthPage tab="register" />} />

        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />

        <Route path="/admin-panel" element={<AdminPanel />} />
        <Route path="/affiliate-panel" element={<AffiliatePanel />} />
        <Route path="/affiliate-login" element={<AffiliatePanel />} />
        <Route path="/super-admin" element={<SuperAdminPanel />} />  {/* ← Moved up */}

        <Route path="/cookies-policy" element={<CookiesPolicy />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />

        <Route path="*" element={<Navigate to="/" replace />} />  {/* ← Always last */}
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
