// src/config/session.js
// Single source of truth for the inactivity session timeout. Nothing else in
// the app hardcodes these durations — change them here and every panel (User,
// Affiliate, Admin, Super Admin) picks the new values up.
//
// Backend note: backend/settings.py derives SIMPLE_JWT.ACCESS_TOKEN_LIFETIME
// from SESSION_IDLE_TIMEOUT_MINUTES, which must stay equal to IDLE_TIMEOUT_MS
// below. If you change one, change the other (or set the SESSION_IDLE_TIMEOUT_MINUTES
// env var), otherwise access tokens outlive the client-side timeout.

const MINUTE = 60 * 1000

// ── Durations ───────────────────────────────────────────────────────────────
export const IDLE_TIMEOUT_MS = 15 * MINUTE   // auto logout
export const WARNING_AT_MS   = 14 * MINUTE   // warning modal appears

// How often the manager re-evaluates idle time. One shared interval for the
// whole app — the modal's countdown needs second-level resolution.
export const TICK_MS = 1000

// Activity is kept in localStorage so every tab shares one clock. Writing on
// every mousemove would hammer storage, so writes are throttled; the in-memory
// timestamp is always exact, storage is at most this stale.
export const ACTIVITY_WRITE_THROTTLE_MS = 5000

// ── Behaviour flags ─────────────────────────────────────────────────────────
// While the warning modal is up, ignore ordinary activity (mousemove etc.) so
// the modal can't be dismissed by the very mouse movement the user makes to
// reach its buttons. "Stay Logged In" is the explicit, intentional reset.
// Set to false to let any activity dismiss the warning.
export const PAUSE_ACTIVITY_DURING_WARNING = true

// Count time spent with the app closed as inactivity. true = returning after
// more than IDLE_TIMEOUT_MS lands on the login page (a closed tab is still an
// idle session). false = the clock restarts on each page load.
export const EXPIRE_WHILE_AWAY = true

// ── Storage keys ────────────────────────────────────────────────────────────
export const ACTIVITY_KEY  = 'w365_last_activity'   // shared idle clock
export const BROADCAST_KEY = 'w365_session_event'   // cross-tab logout channel

// Non-token cached user data wiped alongside the session on logout.
export const CACHED_USER_KEYS = {
  local:   ['spin_last_shown'],
  session: ['chatbot_messages', 'referral_code', 'jw_scroll_target'],
}

// ── Roles ───────────────────────────────────────────────────────────────────
// Each panel owns its own token namespace and its own login screen. Order
// matters only for picking a fallback redirect when several are active.
export const SESSION_ROLES = {
  user: {
    label: 'User',
    accessKey: 'access', refreshKey: 'refresh', userKey: 'user',
    loginPath: '/sign-in',
  },
  affiliate: {
    label: 'Affiliate',
    accessKey: 'affiliate_token', refreshKey: 'affiliate_refresh', userKey: 'affiliate_user',
    loginPath: '/affiliate-login',
  },
  admin: {
    label: 'Admin',
    accessKey: 'admin_token', refreshKey: 'admin_refresh', userKey: 'admin_user',
    loginPath: '/admin-panel',
  },
  superadmin: {
    label: 'Super Admin',
    accessKey: 'sa_token', refreshKey: 'sa_refresh', userKey: 'sa_user',
    loginPath: '/super-admin',
  },
}

export const ROLE_ORDER = ['user', 'affiliate', 'admin', 'superadmin']

export function roleKeys(role) {
  const r = SESSION_ROLES[role]
  return r ? [r.accessKey, r.refreshKey, r.userKey] : []
}

// Which panel a given route belongs to. Public pages fall back to 'user',
// which is correct: the Navbar keeps a logged-in user session on them.
// Prefixes are exact enough that the public /affiliates and /affiliate-register
// pages are *not* treated as the affiliate panel.
export function roleForPath(pathname) {
  const p = (pathname || '/').toLowerCase()
  if (p.startsWith('/super-admin'))      return 'superadmin'
  if (p.startsWith('/admin-panel'))      return 'admin'
  if (p.startsWith('/affiliate-panel'))  return 'affiliate'
  if (p.startsWith('/affiliate-login'))  return 'affiliate'
  return 'user'
}
