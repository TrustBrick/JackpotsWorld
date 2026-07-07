export const API = import.meta.env.VITE_API_URL || ""

const buildHeaders = (token, opts) => {
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData
  return {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  }
}

// Separate token namespace from the regular user session ("access"/"user")
// and the admin session ("admin_token"/"admin_user") — the affiliate role is
// a genuinely separate login, not an upgrade of the user dashboard.
export const affiliateFetch = async (url, opts = {}) => {
  const token = localStorage.getItem("affiliate_token")
  const res = await fetch(url, { ...opts, headers: buildHeaders(token, opts) })
  if (res.status === 401) {
    localStorage.removeItem("affiliate_token")
    localStorage.removeItem("affiliate_refresh")
    localStorage.removeItem("affiliate_user")
    window.location.href = "/affiliate-login"
    return
  }
  return res
}

export const fmt  = n => `$${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const fmtD = d => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
