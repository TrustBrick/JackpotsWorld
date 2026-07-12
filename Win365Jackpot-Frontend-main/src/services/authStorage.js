// src/services/authStorage.js
// Thin storage adapter implementing "Remember Me": checked → persist to
// localStorage (survives browser restarts, today's default behavior);
// unchecked → persist to sessionStorage (cleared when the tab/browser
// closes, so reopening the app requires signing in again). Every read
// checks both stores so already-logged-in ("remembered") sessions keep
// working unchanged. Key names are passed through as-is (e.g. 'access',
// 'affiliate_token') so this is a drop-in replacement for the equivalent
// direct localStorage calls used throughout the app.

export function setSession(keys, tokens, user, remember) {
  const store = remember ? localStorage : sessionStorage
  const other = remember ? sessionStorage : localStorage

  if (tokens?.access !== undefined) store.setItem(keys.access, tokens.access)
  if (keys.refresh && tokens?.refresh !== undefined) store.setItem(keys.refresh, tokens.refresh)
  if (keys.user && user !== undefined) store.setItem(keys.user, JSON.stringify(user))

  // Clear any stale copy in the other store so a prior "remembered" or
  // "session-only" login for the same role can't linger and get picked up.
  other.removeItem(keys.access)
  if (keys.refresh) other.removeItem(keys.refresh)
  if (keys.user) other.removeItem(keys.user)
}

export function getToken(key) {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key)
}

export function getUser(key) {
  const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setToken(key, value) {
  // Used for access-token refresh — keep the token in whichever store it
  // already lives in (remembered vs session-only) rather than assuming one.
  if (localStorage.getItem(key) !== null) localStorage.setItem(key, value)
  else sessionStorage.setItem(key, value)
}

export function clearSession(keys) {
  keys.forEach(k => {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  })
}
