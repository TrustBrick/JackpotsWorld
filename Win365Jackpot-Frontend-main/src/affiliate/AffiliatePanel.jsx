import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Key, Eye, EyeOff, AlertCircle, LogOut, Users, Wallet,
  TrendingUp, CheckCircle2, Search, ChevronLeft, ChevronRight,
} from "lucide-react";
import { API, affiliateFetch, fmt, fmtD } from "./helpers";

const C = {
  bg: "#06080E", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)",
  gold: "#D4AF37", green: "#34D399", red: "#F87171", blue: "#60A5FA",
};

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Login screen
// ─────────────────────────────────────────────────────────────────────────────

function AffiliateLoginScreen({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError("");
    if (!email || !password) { setError("Email and password are required."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/affiliate/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (res.ok) {
        localStorage.setItem("affiliate_token", json.tokens?.access);
        localStorage.setItem("affiliate_refresh", json.tokens?.refresh);
        localStorage.setItem("affiliate_user", JSON.stringify(json.user));
        onSuccess();
      } else {
        setError(json.error || "Invalid affiliate credentials.");
      }
    } catch { setError("Network error. Please try again."); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${C.gold}18, transparent 60%)` }} />
      </div>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ width: "100%", maxWidth: 420, padding: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: C.gold, letterSpacing: 3, marginBottom: 4 }}>JACKPOTS WORLD</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: "0.4em", textTransform: "uppercase" }}>Affiliate Portal</div>
        </div>
        <Card style={{ padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C.gold}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Key size={16} style={{ color: C.gold }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Affiliate Login</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Approved affiliates only</div>
            </div>
          </div>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••"
                  style={{ width: "100%", padding: "11px 44px 11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", padding: 0 }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertCircle size={13} /> {error}
              </div>
            )}
            <button type="submit" disabled={loading || !email || !password}
              style={{ width: "100%", padding: "12px 0", borderRadius: 10, fontSize: 14, fontWeight: 800, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: (!email || !password) ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? "Authenticating…" : <><Key size={14} /> Sign In</>}
            </button>
          </form>
        </Card>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          Not an affiliate yet? <a href="/affiliates" style={{ color: C.gold, textDecoration: "none" }}>Learn about the program</a>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function AffiliateDashboard({ affiliateUser, onLogout }) {
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    const res = await affiliateFetch(`${API}/api/affiliate/dashboard/`);
    if (res?.ok) setStats(await res.json());
  }, []);

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page, q, status: statusFilter });
    const res = await affiliateFetch(`${API}/api/affiliate/referrals/?${params}`);
    if (res?.ok) {
      const json = await res.json();
      setReferrals(json.results || []);
      setCount(json.count || 0);
    }
    setLoading(false);
  }, [page, q, statusFilter]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadReferrals(); }, [loadReferrals]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Space Grotesk', sans-serif", padding: "0 0 60px" }}>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.gold }}>JACKPOTS WORLD</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.3em", textTransform: "uppercase" }}>Affiliate Portal</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{affiliateUser?.name || affiliateUser?.email}</div>
          <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "rgba(248,113,113,0.1)", border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <LogOut size={13} /> Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px" }}>
        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Referred", value: stats?.stats?.total_referred ?? "—", icon: Users, color: C.blue },
            { label: "Active Referrals", value: stats?.stats?.active_referred ?? "—", icon: CheckCircle2, color: C.green },
            { label: "Commission Earned", value: stats ? fmt(stats.stats.commission_earned) : "—", icon: TrendingUp, color: C.gold },
            { label: "Commission Pending", value: stats ? fmt(stats.stats.commission_pending) : "—", icon: Wallet, color: "#FB923C" },
            { label: "Commission Paid", value: stats ? fmt(stats.stats.commission_paid) : "—", icon: Wallet, color: C.green },
          ].map(s => (
            <Card key={s.label}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <s.icon size={14} style={{ color: s.color }} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "white", fontFamily: "monospace" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.label}</div>
            </Card>
          ))}
        </div>

        {stats?.affiliate_profile && (
          <Card style={{ marginBottom: 20, background: `${C.gold}06`, border: `1px solid ${C.gold}25` }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              Your commission rate: <b style={{ color: C.gold }}>{stats.affiliate_profile.commission_rate}%</b> of every referred player's cash deposit.
            </div>
          </Card>
        )}

        {/* Search + filter */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
              placeholder="Search by name, email or UID…"
              style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: "9px 12px", borderRadius: 8, background: "rgba(12,14,22,0.95)", border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none" }}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Referrals table */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["User", "Joined", "Status", "Earned", "Pending", "Paid"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>Loading…</td></tr>
                ) : referrals.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>No referrals yet.</td></tr>
                ) : referrals.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ fontWeight: 700, color: "white" }}>{r.name || r.email?.split("@")[0]}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{r.email} · {r.user_uid}</div>
                    </td>
                    <td style={{ padding: "11px 14px", color: "rgba(255,255,255,0.5)" }}>{fmtD(r.date_joined)}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: r.is_active ? `${C.green}15` : "rgba(255,255,255,0.05)", color: r.is_active ? C.green : "rgba(255,255,255,0.4)" }}>
                        {r.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", fontFamily: "monospace", color: C.gold, fontWeight: 700 }}>{fmt(r.commission_earned)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "monospace", color: "#FB923C" }}>{fmt(r.commission_pending)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: "monospace", color: C.green }}>{fmt(r.commission_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Page {page} of {totalPages} · {count} total</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  style={{ width: 28, height: 28, borderRadius: 7, background: C.surface, border: `1px solid ${C.border}`, color: page <= 1 ? "rgba(255,255,255,0.15)" : "white", cursor: page <= 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  style={{ width: 28, height: 28, borderRadius: 7, background: C.surface, border: `1px solid ${C.border}`, color: page >= totalPages ? "rgba(255,255,255,0.15)" : "white", cursor: page >= totalPages ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export default function AffiliatePanel() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [affiliateUser, setAffiliateUser] = useState(null);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("affiliate_user") || "null");
      const token = localStorage.getItem("affiliate_token");
      if (user && token) { setAuthed(true); setAffiliateUser(user); }
    } catch {}
  }, []);

  const logout = () => {
    ["affiliate_token", "affiliate_refresh", "affiliate_user"].forEach(k => localStorage.removeItem(k));
    navigate("/");
  };

  if (!authed) {
    return (
      <AffiliateLoginScreen onSuccess={() => {
        try { setAffiliateUser(JSON.parse(localStorage.getItem("affiliate_user") || "null")); } catch {}
        setAuthed(true);
      }} />
    );
  }

  return <AffiliateDashboard affiliateUser={affiliateUser} onLogout={logout} />;
}
