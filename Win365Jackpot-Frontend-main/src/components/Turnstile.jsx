import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

if (!SITE_KEY && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.error('[Turnstile] VITE_TURNSTILE_SITE_KEY is not set. Add it to your .env file.')
}

/**
 * Reusable Cloudflare Turnstile "Verify you are human" checkbox.
 * Renders explicitly against window.turnstile (loaded via the
 * challenges.cloudflare.com/turnstile/v0/api.js script tag in index.html)
 * so it works regardless of when that script finishes loading.
 *
 * Props:
 *   onVerify(token) — called once the checkbox is solved
 *   onExpire()       — token expired, caller should treat form as unverified again
 *   onError()         — Cloudflare returned an error
 *   theme             — 'dark' | 'light' | 'auto' (default 'dark', matches app UI)
 *
 * Ref API:
 *   ref.current.reset() — clears the widget (call after a failed submit, since
 *                          a Turnstile token is single-use)
 */
const Turnstile = forwardRef(function Turnstile({ onVerify, onExpire, onError, theme = 'dark' }, ref) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const [scriptState, setScriptState] = useState(SITE_KEY ? 'loading' : 'misconfigured')

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (window.turnstile && widgetIdRef.current !== null) {
        window.turnstile.reset(widgetIdRef.current)
      }
    },
  }))

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return

    let cancelled = false
    let pollTimer = null

    const renderWidget = () => {
      if (cancelled || !containerRef.current || widgetIdRef.current !== null) return
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme,
        callback: token => onVerify?.(token),
        'expired-callback': () => onExpire?.(),
        'error-callback': errorCode => {
          // eslint-disable-next-line no-console
          console.error(`[Turnstile] error-callback: ${errorCode}. If this is 110200, the current domain isn't allow-listed for this site key in the Cloudflare dashboard.`)
          setScriptState('error')
          onError?.(errorCode)
        },
      })
      setScriptState('ready')
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      pollTimer = setInterval(() => {
        if (window.turnstile) {
          clearInterval(pollTimer)
          renderWidget()
        }
      }, 150)
    }

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
      if (window.turnstile && widgetIdRef.current !== null) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (scriptState === 'misconfigured') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#f85149' }}>
        <ShieldAlert size={13} /> Verification unavailable — missing site key
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', minHeight: 65 }}>
      {scriptState === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#8b949e' }}>
          <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading verification…
        </div>
      )}
      {scriptState === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#f85149' }}>
          <ShieldAlert size={13} /> Verification failed to load. Please refresh the page.
        </div>
      )}
      <div ref={containerRef} />
    </div>
  )
})

export default Turnstile
