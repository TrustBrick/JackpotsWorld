import { ADMIN_API } from "./constants";

export { ADMIN_API as API };

// ─── Auth-aware fetch with token refresh ──────────────────────────────────────
// When opts.body is a FormData instance (file/image uploads), the browser
// must set its own multipart Content-Type header (with boundary) — forcing
// "application/json" would send a malformed request the backend can't parse.
const buildHeaders = (token, opts) => {
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
  return {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    Authorization: `Bearer ${token}`,
    ...(opts.headers || {}),
  };
};

export const adminFetch = async (url, opts = {}) => {
  let token = localStorage.getItem("admin_token");
  let res = await fetch(url, { ...opts, headers: buildHeaders(token, opts) });
  if (res.status === 401) {
    const refresh = localStorage.getItem("admin_refresh");
    if (refresh) {
      const rr = await fetch(`${ADMIN_API}/api/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (rr.ok) {
        const d = await rr.json();
        localStorage.setItem("admin_token", d.access);
        res = await fetch(url, { ...opts, headers: buildHeaders(d.access, opts) });
      } else {
        ["admin_token", "admin_refresh", "admin_user"].forEach(k => localStorage.removeItem(k));
        window.location.href = "/admin-panel";
        return;
      }
    } else {
      localStorage.removeItem("admin_token");
      window.location.href = "/admin-panel";
      return;
    }
  }
  return res;
};

// ─── Formatters ───────────────────────────────────────────────────────────────
export const fmt   = n => `$${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtN  = n => Number(n || 0).toLocaleString("en-IN");
export const fmtDT = d => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtD  = d => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

// ─── Bonus calculator (mirrors backend) ──────────────────────────────────────
export const calcBonus = (amount) => {
  const a = Number(amount) || 0;
  if (a <= 0)       return 0;
  if (a < 25000)    return +(a * 0.03).toFixed(2);
  if (a < 50000)    return +(a * 0.025).toFixed(2);
  if (a < 100000)   return +(a * 0.015).toFixed(2);
  return               +(a * 0.01).toFixed(2);
};

export const calcVipXP = (amount) => Math.floor((Number(amount) || 0) / 2000);