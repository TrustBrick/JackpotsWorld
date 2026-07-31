import { getToken, setToken } from "../../services/authStorage";
import { handleUnauthorized } from "../../services/sessionManager";

const API = import.meta.env.VITE_API_URL
// console.log("API VALUE:", API); use for dev
export { API };

// ─── Auth-aware fetch with token refresh ──────────────────────────────────────
export const authFetch = async (url, opts = {}) => {
  let token = getToken("access");
  if (!token) { window.location.replace("/sign-in"); return; }

  // FormData bodies (file uploads) need the browser to set their own
  // multipart boundary — forcing Content-Type:application/json on top of
  // one silently breaks the upload, so this is the one case that omits it.
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;

  let res = await fetch(url, {
    ...opts,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });

  if (res.status === 401) {
    const refresh = getToken("refresh");
    if (refresh) {
      const rr = await fetch(`${API}/api/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (rr.ok) {
        const d = await rr.json();
        setToken("access", d.access);
        // ROTATE_REFRESH_TOKENS is on server-side: the old refresh token is
        // blacklisted the moment it's used, so the rotated one it hands back
        // must replace it or the *next* refresh fails and drops the session.
        if (d.refresh) setToken("refresh", d.refresh);
        res = await fetch(url, {
          ...opts,
          headers: {
            ...(isFormData ? {} : { "Content-Type": "application/json" }),
            Authorization: `Bearer ${d.access}`,
            ...(opts.headers || {}),
          },
        });
      } else {
        // Refresh rejected — session is genuinely over (expired, revoked, or
        // idle-expired server-side). Clear everything and land on User Login.
        await handleUnauthorized("user");
        return;
      }
    } else {
      await handleUnauthorized("user");
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

// ─── Generate transaction reference ──────────────────────────────────────────
export const genRef = (type = "TXN") => {
  const now = new Date();
  const p = v => String(v).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${type.toUpperCase().slice(0, 4)}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}${ms}`;
};