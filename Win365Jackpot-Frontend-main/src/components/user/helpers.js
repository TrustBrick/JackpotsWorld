import { getToken, setToken, clearSession } from "../../services/authStorage";

const API = import.meta.env.VITE_API_URL
// console.log("API VALUE:", API); use for dev
export { API };

// ─── Auth-aware fetch with token refresh ──────────────────────────────────────
export const authFetch = async (url, opts = {}) => {
  let token = getToken("access");
  if (!token) { window.location.href = "/sign-in"; return; }

  let res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
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
        res = await fetch(url, {
          ...opts,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${d.access}`,
            ...(opts.headers || {}),
          },
        });
      } else {
        clearSession(["access", "refresh", "user"]);
        window.location.href = "/sign-in";
        return;
      }
    } else {
      clearSession(["access", "refresh", "user"]);
      window.location.href = "/sign-in";
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