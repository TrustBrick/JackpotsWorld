// src/components/SessionTimeoutProvider.jsx
// The single mount point for the global session timeout. Lives inside the
// router in App.jsx so route changes count as activity, and wraps every route
// so the User, Affiliate, Admin and Super Admin panels are all covered by one
// manager — no per-page timers.

import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import sessionManager from '../services/sessionManager'
import SessionTimeoutModal from './SessionTimeoutModal'

export default function SessionTimeoutProvider({ children }) {
  const location = useLocation()
  const [warn, setWarn] = useState({ open: false, secondsLeft: 60 })
  const lastPath = useRef(location.pathname)

  useEffect(() => {
    const unsubscribe = sessionManager.subscribe(setWarn)
    sessionManager.start()
    return () => {
      unsubscribe()
      sessionManager.stop()
    }
  }, [])

  // In-app navigation is activity. Comparing against the last path handled
  // (rather than a "first render" flag) keeps this correct under StrictMode's
  // double-invoked effects: the initial load must not reset the idle clock,
  // which deliberately survives a refresh.
  useEffect(() => {
    if (lastPath.current === location.pathname) return
    lastPath.current = location.pathname
    sessionManager.markActivity(true)
  }, [location.pathname])

  return (
    <>
      {children}
      <SessionTimeoutModal
        open={warn.open}
        secondsLeft={warn.secondsLeft}
        onStay={() => sessionManager.extendSession()}
        onLogout={() => sessionManager.logoutNow()}
      />
    </>
  )
}
