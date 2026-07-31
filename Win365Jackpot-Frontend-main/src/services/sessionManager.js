// src/services/sessionManager.js
// One global inactivity-session manager for the whole SPA — User, Affiliate,
// Admin and Super Admin panels all share it. Exactly one interval and one set
// of activity listeners exist per tab, no matter how many routes/panels mount.
//
// Design notes
// ────────────
// • The idle clock is a single timestamp in localStorage (ACTIVITY_KEY), so
//   every tab reads the same "last activity" value. Activity in one tab keeps
//   the others alive, which is what "keep the timeout synchronized across
//   tabs" means in practice.
// • Idle time is derived from timestamps, never accumulated by the timer, so
//   background-tab timer throttling, laptop sleep and clock jitter can't
//   stretch the window.
// • Logout is broadcast on a second localStorage key (BROADCAST_KEY). The
//   `storage` event only fires in *other* tabs, which is precisely the
//   semantics needed — no echo suppression required.
// • Authenticated API traffic deliberately does NOT count as activity: this
//   app polls (notification counts every 5s, chat, etc.), so treating requests
//   as activity would keep an abandoned session alive forever.

import { clearSession } from './authStorage'
import { revokeSession } from './authRevoke'
import {
  SESSION_ROLES, ROLE_ORDER, roleKeys, roleForPath,
  IDLE_TIMEOUT_MS, WARNING_AT_MS, TICK_MS, ACTIVITY_WRITE_THROTTLE_MS,
  ACTIVITY_KEY, BROADCAST_KEY, CACHED_USER_KEYS,
  PAUSE_ACTIVITY_DURING_WARNING, EXPIRE_WHILE_AWAY,
} from '../config/session'

// Genuine user input only. `focus`/`visibilitychange` are handled separately:
// returning to a tab must not resurrect a session that already expired while
// it was hidden.
const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'mouseup', 'click',
  'keydown', 'scroll', 'wheel',
  'touchstart', 'touchmove',
]

// Longest we'll wait for the server-side token revocation before tearing the
// session down locally anyway.
const REVOKE_TIMEOUT_MS = 2500

const state = {
  refCount: 0,        // StrictMode mounts the provider twice in dev
  lastActivity: 0,
  lastWrite: 0,
  warning: false,
  secondsLeft: Math.round((IDLE_TIMEOUT_MS - WARNING_AT_MS) / 1000),
  tickId: null,
  endingSession: false,
  subscribers: new Set(),
}

// ── Storage helpers (never throw: private mode / disabled storage) ──────────
const lsGet = k => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch {} }
const lsDel = k => { try { localStorage.removeItem(k) } catch {} }

function tokenFor(role) {
  const key = SESSION_ROLES[role]?.accessKey
  if (!key) return null
  try { return localStorage.getItem(key) ?? sessionStorage.getItem(key) } catch { return null }
}

/** Roles with a token present right now (a browser may hold several). */
export function activeRoles() {
  return ROLE_ORDER.filter(tokenFor)
}

export function hasActiveSession() {
  return activeRoles().length > 0
}

// ── Subscribers (the warning modal) ────────────────────────────────────────
function emit() {
  const snapshot = { open: state.warning, secondsLeft: state.secondsLeft }
  state.subscribers.forEach(fn => { try { fn(snapshot) } catch {} })
}

export function subscribe(fn) {
  state.subscribers.add(fn)
  fn({ open: state.warning, secondsLeft: state.secondsLeft })
  return () => state.subscribers.delete(fn)
}

function setWarning(open, secondsLeft) {
  const nextSeconds = open
    ? secondsLeft
    : Math.round((IDLE_TIMEOUT_MS - WARNING_AT_MS) / 1000)
  if (state.warning === open && state.secondsLeft === nextSeconds) return
  state.warning = open
  state.secondsLeft = nextSeconds
  emit()
}

// ── Activity clock ─────────────────────────────────────────────────────────
function readStoredActivity() {
  const raw = Number(lsGet(ACTIVITY_KEY))
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

/**
 * Record user activity and reset the idle window.
 * @param {boolean} force  bypass the write throttle and the warning-modal
 *                         pause — used for logins, navigation and the
 *                         "Stay Logged In" button.
 */
export function markActivity(force = false) {
  if (state.endingSession) return
  if (state.warning && PAUSE_ACTIVITY_DURING_WARNING && !force) return

  const now = Date.now()
  state.lastActivity = now
  if (force || now - state.lastWrite >= ACTIVITY_WRITE_THROTTLE_MS) {
    state.lastWrite = now
    lsSet(ACTIVITY_KEY, String(now))
  }
  if (force && state.warning) setWarning(false)
}

/** "Stay Logged In" — explicit extension from the warning modal. */
export function extendSession() {
  setWarning(false)
  markActivity(true)
  broadcast({ type: 'extend', at: Date.now() })
}

/** Call right after a successful login so the new session starts fresh. */
export function noteLogin() {
  state.endingSession = false
  setWarning(false)
  markActivity(true)
  broadcast({ type: 'extend', at: Date.now() })
}

// ── Cross-tab channel ──────────────────────────────────────────────────────
// Write-then-delete so two identical consecutive messages still each fire a
// `storage` event in the other tabs (a repeated identical value would not).
function broadcast(payload) {
  try {
    localStorage.setItem(BROADCAST_KEY, JSON.stringify(payload))
    localStorage.removeItem(BROADCAST_KEY)
  } catch {}
}

// ── Logout ─────────────────────────────────────────────────────────────────
function clearCachedUserData() {
  CACHED_USER_KEYS.local.forEach(lsDel)
  CACHED_USER_KEYS.session.forEach(k => {
    try { sessionStorage.removeItem(k) } catch {}
  })
}

function loginPathFor(roles) {
  const here = roleForPath(window.location.pathname)
  if (roles.includes(here)) return SESSION_ROLES[here].loginPath
  if (roles.length === 1)   return SESSION_ROLES[roles[0]].loginPath
  return SESSION_ROLES.user.loginPath
}

function redirect(path) {
  // A full document replace (rather than a client-side navigate) is deliberate:
  // it guarantees every panel's in-memory React state — cached profile, admin
  // user, tab data — is gone, and `replace` keeps the authenticated view out
  // of session history so Back can't return to it.
  window.location.replace(path)
}

/**
 * Tear down one or more sessions.
 *
 * @param {string[]} [opts.roles]      roles to end; defaults to every active role
 * @param {string}   [opts.reason]     'timeout' | 'manual' | 'expired' | 'remote'
 * @param {string}   [opts.redirectTo] override the destination
 * @param {boolean}  [opts.revoke]     blacklist the refresh token server-side first
 * @param {boolean}  [opts.broadcast]  tell the other tabs (false when mirroring one)
 * @param {boolean}  [opts.navigate]   set false to clear state without leaving the page
 */
export async function endSession(opts = {}) {
  const {
    roles, reason = 'manual', redirectTo,
    revoke = true, broadcast: doBroadcast = true, navigate = true,
  } = opts

  if (state.endingSession) return
  state.endingSession = true
  setWarning(false)

  const list = (roles?.length ? roles : activeRoles()).filter(r => SESSION_ROLES[r])
  const target = redirectTo || loginPathFor(list.length ? list : ['user'])

  // Blacklist refresh tokens before wiping storage — revokeSession reads them.
  // Bounded: fetch has no timeout of its own, and a hung request must never
  // leave a session that is supposed to be over sitting live in storage. If
  // the deadline wins, the request is still in flight and usually lands; the
  // local teardown below happens regardless.
  if (revoke) {
    const revokes = Promise.all(list.map(r =>
      revokeSession(SESSION_ROLES[r].accessKey, SESSION_ROLES[r].refreshKey).catch(() => {})
    ))
    await Promise.race([
      revokes,
      new Promise(resolve => setTimeout(resolve, REVOKE_TIMEOUT_MS)),
    ])
  }

  list.forEach(r => clearSession(roleKeys(r)))
  clearCachedUserData()
  lsDel(ACTIVITY_KEY)
  state.lastActivity = Date.now()
  state.lastWrite = 0

  if (doBroadcast) {
    broadcast({ type: 'logout', roles: list, reason, at: Date.now() })
  }

  if (navigate) redirect(target)
  else state.endingSession = false
}

/** "Logout Now" from the warning modal. */
export function logoutNow() {
  return endSession({ reason: 'manual' })
}

/**
 * Called by the fetch helpers when the backend rejects a session (401 with a
 * refresh that no longer works). Sends the user to that panel's login page.
 */
export function handleUnauthorized(role) {
  return endSession({
    roles: [role],
    reason: 'expired',
    redirectTo: SESSION_ROLES[role]?.loginPath || SESSION_ROLES.user.loginPath,
    // The token is already invalid — a revoke call would only 401 again.
    revoke: false,
  })
}

// ── Tick ───────────────────────────────────────────────────────────────────
function tick() {
  if (state.endingSession) return

  const roles = activeRoles()
  if (roles.length === 0) {
    // Anonymous — nothing to expire. Keep the clock moving so a login that
    // happens later doesn't inherit a stale timestamp.
    if (state.warning) setWarning(false)
    return
  }

  const idle = Date.now() - state.lastActivity

  if (idle >= IDLE_TIMEOUT_MS) {
    endSession({ roles, reason: 'timeout' })
    return
  }

  if (idle >= WARNING_AT_MS) {
    setWarning(true, Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000)))
  } else if (state.warning) {
    setWarning(false)
  }
}

// ── Event wiring ───────────────────────────────────────────────────────────
function onActivity() { markActivity(false) }

function onVisibility() {
  // Not activity — just re-evaluate immediately instead of waiting for the
  // next tick, since hidden tabs get their timers throttled.
  if (document.visibilityState === 'visible') tick()
}

function onStorage(e) {
  if (!e.key) return // localStorage.clear() from elsewhere

  if (e.key === ACTIVITY_KEY) {
    if (!e.newValue) return
    const v = Number(e.newValue)
    if (Number.isFinite(v) && v > state.lastActivity) {
      state.lastActivity = v
      if (state.warning) setWarning(false)
    }
    return
  }

  if (e.key === BROADCAST_KEY && e.newValue) {
    let msg
    try { msg = JSON.parse(e.newValue) } catch { return }

    if (msg?.type === 'extend') {
      if (typeof msg.at === 'number' && msg.at > state.lastActivity) state.lastActivity = msg.at
      setWarning(false)
      return
    }

    if (msg?.type === 'logout') {
      const affected = Array.isArray(msg.roles) ? msg.roles : []
      // localStorage was already wiped by the originating tab, but sessionStorage
      // is per-tab ("Remember me" unchecked), so clear this tab's copy too.
      affected.forEach(r => clearSession(roleKeys(r)))
      clearCachedUserData()
      setWarning(false)

      // Only leave the page if this tab is actually showing one of the panels
      // that just logged out — an unrelated panel in another tab keeps working.
      if (affected.includes(roleForPath(window.location.pathname))) {
        state.endingSession = true
        redirect(loginPathFor(affected))
      }
    }
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
export function start() {
  state.refCount += 1
  if (state.refCount > 1) return   // already running (StrictMode double-mount)

  const stored = readStoredActivity()
  if (!stored) {
    state.lastActivity = Date.now()
    lsSet(ACTIVITY_KEY, String(state.lastActivity))
    state.lastWrite = state.lastActivity
  } else if (!EXPIRE_WHILE_AWAY && Date.now() - stored > IDLE_TIMEOUT_MS) {
    state.lastActivity = Date.now()
    lsSet(ACTIVITY_KEY, String(state.lastActivity))
    state.lastWrite = state.lastActivity
  } else {
    // Survives refresh: an idle window that already elapsed while the tab was
    // closed is expired by the first tick below.
    state.lastActivity = stored
  }
  state.endingSession = false

  ACTIVITY_EVENTS.forEach(ev =>
    window.addEventListener(ev, onActivity, { passive: true, capture: true })
  )
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('storage', onStorage)

  state.tickId = setInterval(tick, TICK_MS)
  tick()
}

export function stop() {
  state.refCount = Math.max(0, state.refCount - 1)
  if (state.refCount > 0) return

  ACTIVITY_EVENTS.forEach(ev =>
    window.removeEventListener(ev, onActivity, { capture: true })
  )
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('storage', onStorage)

  if (state.tickId) { clearInterval(state.tickId); state.tickId = null }
  setWarning(false)
}

export default {
  start, stop, subscribe, markActivity, extendSession, noteLogin,
  endSession, logoutNow, handleUnauthorized, activeRoles, hasActiveSession,
}
