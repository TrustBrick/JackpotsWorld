// src/services/authRevoke.js
// Calls the backend logout endpoint to blacklist the refresh token before
// the caller clears localStorage. Without this, a leaked refresh token
// stays valid until it naturally expires even after the user "logs out"
// client-side. Best-effort: if the request fails, we still proceed with
// clearing local state — logout should never get the user stuck.

import { getToken } from "./authStorage"

const API_BASE = import.meta.env.VITE_API_URL || ""

export async function revokeSession(accessKey, refreshKey) {
  const access = getToken(accessKey)
  const refresh = getToken(refreshKey)
  if (!access || !refresh) return

  try {
    await fetch(`${API_BASE}/api/auth/logout/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access}`,
      },
      body: JSON.stringify({ refresh }),
    })
  } catch {
    // Network failure — proceed with local logout regardless.
  }
}
