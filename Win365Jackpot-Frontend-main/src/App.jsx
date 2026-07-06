import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard   from './components/user/Dashboard'
import LandingPage from './pages/LandingPage'
import AdminPanel  from './admin/AdminPanel'
import CookiesPolicy from './pages/CookiesPolicy'
import PrivacyPolicy from './pages/PrivacyPolicy'
import SuperAdminPanel from "./admin/SuperAdminPanel";

// ── New pages ────────────────────────────────────────────────────────────────
import Events      from './pages/Events'
import Promotions  from './pages/Promotions'
import Affiliates  from './pages/Affiliates'
import Poker       from './pages/Poker'


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
      <Routes>
        <Route path="/" element={<LandingPage />} />

        {/* New public pages */}
        <Route path="/events"     element={<Events />} />
        <Route path="/promotions" element={<Promotions />} />
        <Route path="/affiliates" element={<Affiliates />} />
        <Route path="/poker"      element={<Poker />} />

        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />

        <Route path="/admin-panel" element={<AdminPanel />} />
        <Route path="/super-admin" element={<SuperAdminPanel />} />  {/* ← Moved up */}

        <Route path="/cookies-policy" element={<CookiesPolicy />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />

        <Route path="*" element={<Navigate to="/" replace />} />  {/* ← Always last */}
      </Routes>
    </BrowserRouter>
  )
}
