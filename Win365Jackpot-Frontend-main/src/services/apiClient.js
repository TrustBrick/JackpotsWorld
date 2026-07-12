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
