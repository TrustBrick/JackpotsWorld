// src/services/apiClient.js
// Shared fetch wrapper for public read APIs (Events / Poker / Promotions).
// Plain fetch + retry-with-backoff, consistent with the rest of the app
// (no axios/react-query dependency is used anywhere else in this project).

import { getToken } from "./authStorage"

const API_BASE = import.meta.env.VITE_API_URL || ""

async function withRetry(fn, retries = 2, baseDelayMs = 400) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)))
      }
    }
  }
  throw lastErr
}

function buildQuery(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") qs.set(key, value)
  })
  const str = qs.toString()
  return str ? `?${str}` : ""
}

export async function apiGet(path, params = {}) {
  const url = `${API_BASE}${path}${buildQuery(params)}`
  return withRetry(async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Request to ${path} failed (${res.status})`)
    return res.json()
  })
}

/**
 * apiGet, but it sends the bearer token when the visitor happens to have one.
 *
 * For endpoints that are PUBLIC (AllowAny) yet answer a little differently for
 * a signed-in member — the game listings, whose event payloads carry
 * `is_registered` / `can_register` computed from request.user. Fetched with
 * plain apiGet those fields are always false, because the request arrives
 * anonymous no matter who is looking, and the card can never say "Registered".
 *
 * Not a substitute for apiGetAuthed: this one is for routes that must still
 * work with no token at all, so a missing or expired token degrades to the
 * public answer instead of failing. Anything that genuinely requires
 * authentication should use apiGetAuthed and get its 401.
 *
 * CACHING: a response from this helper depends on WHO asked, so any cache in
 * front of it must key on that too — see `authKey()` below.
 */
export async function apiGetMaybeAuthed(path, params = {}) {
  const url = `${API_BASE}${path}${buildQuery(params)}`
  const token = getToken("access")
  return withRetry(async () => {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Request to ${path} failed (${res.status})`)
    return res.json()
  })
}

/**
 * Cache-key fragment identifying whose answer a cached response is.
 *
 * Just "signed in or not" — never the token itself, which would put a
 * credential into a Map key and into anything that ever logs one. Within one
 * browser tab the signed-in visitor is always the same person, so the
 * distinction that actually matters is signed-in vs signed-out: it stops a
 * cached "Registered" surviving a sign-out, and stops a signed-out payload
 * being reused once the same visitor signs in.
 */
export function authKey() {
  return getToken("access") ? "u" : "anon"
}

// ── Small TTL cache, shared by eventService/pokerService/promotionService ──
export function createCache(ttlMs = 60_000) {
  const store = new Map()
  return {
    get(key) {
      const hit = store.get(key)
      if (!hit) return undefined
      if (Date.now() - hit.time > ttlMs) { store.delete(key); return undefined }
      return hit.data
    },
    set(key, data) {
      store.set(key, { data, time: Date.now() })
    },
    // Drops every cached entry so the next get() is a guaranteed miss —
    // for services that need to invalidate after a write they know about
    // (e.g. an admin save) rather than waiting out the full TTL. Each
    // createCache() call owns an independent Map, so this only ever
    // clears the caller's own cache, never another service's.
    clear() {
      store.clear()
    },
  }
}

export async function apiPostAuthed(path, body) {
  const token = getToken("access")
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

// Same envelope as apiPostAuthed, for the two verbs Teen Patti registration
// needs beyond POST: an authed read (the signed-in user's own registrations)
// and a DELETE (releasing a seat).
export async function apiGetAuthed(path, params = {}) {
  const token = getToken("access")
  const res = await fetch(`${API_BASE}${path}${buildQuery(params)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export async function apiDeleteAuthed(path) {
  const token = getToken("access")
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}
