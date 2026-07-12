/**
 * SuperAdminPanel.jsx — REDESIGNED
 * Luxury dark theme · Lucide React icons · Production-grade UI
 */

import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Wallet, ArrowRightLeft, Users, History,
  LogOut, ShieldCheck, TrendingUp, TrendingDown, RefreshCw,
  Search, Plus, X, ChevronLeft, ChevronRight, CheckCircle,
  Clock, AlertCircle, Banknote, Gem, Zap, Gift, Star,
  Eye, EyeOff, ArrowUpRight, ArrowDownLeft, Activity,
  CreditCard, User, Lock, Mail,
} from "lucide-react";
import { revokeSession } from "../services/authRevoke";
import { AdminThemeProvider, useAdminTheme } from "./context/AdminThemeContext";

// ─── API base ─────────────────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY   = "sa_token";
const REFRESH_KEY = "sa_refresh";
const USER_KEY    = "sa_user";

// ─── saFetch ──────────────────────────────────────────────────────────────────
const saFetch = async (url, opts = {}) => {
  let token = localStorage.getItem(TOKEN_KEY);
  let res = await fetch(`${BASE}${url}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (refresh) {
      const rr = await fetch(`${BASE}/api/auth/token/refresh/`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh }),
      });
      if (rr.ok) {
        const d = await rr.json();
        localStorage.setItem(TOKEN_KEY, d.access);
        res = await fetch(`${BASE}${url}`, {
          ...opts,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${d.access}`, ...(opts.headers || {}) },
        });
      } else {
        [TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(k => localStorage.removeItem(k));
        return null;
      }
    } else {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  }
  return res;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const WALLETS = [
  { key: "C",  label: "Cash",     field: "cash_balance",     color: "#34d399", dim: "rgba(52,211,153,0.1)",  Icon: Banknote },
  { key: "NC", label: "Non-Cash", field: "non_cash_balance", color: "#a78bfa", dim: "rgba(167,139,250,0.1)", Icon: Gem      },
  { key: "O",  label: "OTP",      field: "otp_balance",      color: "#38bdf8", dim: "rgba(56,189,248,0.1)",  Icon: Zap      },
];

const TXN_BY_WALLET = {
  C:  ["LUB","WBA","MBA","RMB","WIN","GBE","CBG"],
  NC: ["CBGNC","LUBNC"],
  O:  ["CBGOT","LUBOT"],
};
const TXN_LABELS = {
  LUB:"Level Up Bonus", WBA:"Weekly Bonus", MBA:"Monthly Bonus",
  RMB:"Reimbursement",  WIN:"Winnings",      GBE:"Gift Encashment",
  CBG:"Cashback Gift",  CBGNC:"NC Cashback", LUBNC:"NC Level Up Bonus",
  CBGOT:"OTP Cashback", LUBOT:"OTP Level Up Bonus",
};

const fmt   = n => `$${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const fmtDT = d => d ? new Date(d).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";

// ─── CSS Variables injected once ──────────────────────────────────────────────
const injectGlobalStyles = () => {
  if (document.getElementById("sa-panel-styles")) return;
  const el = document.createElement("style");
  el.id = "sa-panel-styles";
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap');
    :root {
      --bg:        #060810;
      --surface:   rgba(255,255,255,0.03);
      --surface2:  rgba(255,255,255,0.055);
      --border:    rgba(255,255,255,0.07);
      --border2:   rgba(255,255,255,0.13);
      --gold:      #D4AF37;
      --gold-dim:  rgba(212,175,55,0.12);
      --green:     #34d399;
      --red:       #f87171;
      --purple:    #a78bfa;
      --blue:      #60a5fa;
      --teal:      #38bdf8;
      --text:      rgba(255,255,255,0.88);
      --muted:     rgba(255,255,255,0.4);
      --faint:     rgba(255,255,255,0.18);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); }
    .sa-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
    .sa-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .sa-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
    .sa-input { transition: border-color 0.18s; }
    .sa-input:focus { border-color: rgba(212,175,55,0.5) !important; }
    .sa-input::placeholder { color: rgba(255,255,255,0.2); }
    .sa-row-hover:hover { background: rgba(255,255,255,0.028) !important; }
    .sa-tab-btn { transition: all 0.15s; }
    .sa-tab-btn:hover { opacity: 1 !important; color: rgba(255,255,255,0.75) !important; }
    .sa-card-hover { transition: border-color 0.2s; }
    .sa-card-hover:hover { border-color: rgba(255,255,255,0.14) !important; }
    @keyframes sa-fade-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
    @keyframes sa-pulse { 0%,100%{ opacity:1; } 50%{ opacity:0.4; } }
    .sa-animate { animation: sa-fade-in 0.25s ease forwards; }
    .sa-pulse { animation: sa-pulse 2s infinite; }
  `;
  document.head.appendChild(el);
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  page:   { minHeight:"100vh", background:"var(--bg)", color:"var(--text)", fontFamily:"'Manrope', sans-serif", padding:"28px 32px" },
  card:   { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"22px 24px" },
  input:  { width:"100%", padding:"10px 13px", borderRadius:9, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", color:"white", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"'Manrope', sans-serif" },
  select: { width:"100%", padding:"10px 13px", borderRadius:9, background:"rgba(10,12,20,0.9)", border:"1px solid rgba(255,255,255,0.1)", color:"white", fontSize:13, outline:"none", boxSizing:"border-box", cursor:"pointer", fontFamily:"'Manrope', sans-serif" },
  label:  { display:"block", fontSize:10, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.09em", marginBottom:6, fontFamily:"'Manrope', sans-serif" },
  mono:   { fontFamily:"'Manrope', sans-serif" },
};


// ─── Shared components ────────────────────────────────────────────────────────
function Toast({ msg, ok, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3800); return () => clearTimeout(t); }, [onClose]);
  const color = ok ? "#34d399" : "#f87171";
  return (
    <div style={{ position:"fixed", bottom:28, right:28, zIndex:9999, display:"flex", alignItems:"center", gap:10, padding:"13px 20px", borderRadius:12, background: ok?"rgba(52,211,153,0.1)":"rgba(248,113,113,0.1)", border:`1px solid ${color}40`, backdropFilter:"blur(12px)", maxWidth:380, boxShadow:`0 8px 32px rgba(0,0,0,0.4)` }}>
      {ok ? <CheckCircle size={16} color={color} /> : <AlertCircle size={16} color={color} />}
      <span style={{ fontSize:13, fontWeight:600, color }}>{msg}</span>
    </div>
  );
}

function Card({ children, style, title, icon: Icon, accent }) {
  return (
    <div className="sa-card-hover" style={{ ...T.card, ...style }}>
      {title && (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18, paddingBottom:14, borderBottom:"1px solid var(--border)" }}>
          {Icon && <div style={{ width:28, height:28, borderRadius:7, background: accent ? `${accent}15` : "var(--surface2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Icon size={13} color={accent || "var(--muted)"} />
          </div>}
          <span style={{ fontSize:12, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.09em", fontFamily:"'Manrope', sans-serif" }}>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function Btn({ children, onClick, color="#D4AF37", variant="solid", disabled, style, size="md" }) {
  const pad = size === "sm" ? "7px 14px" : "11px 22px";
  const fs  = size === "sm" ? 12 : 13;
  const base = { display:"flex", alignItems:"center", justifyContent:"center", gap:7, padding:pad, borderRadius:9, border:"none", fontWeight:700, fontSize:fs, cursor:disabled?"not-allowed":"pointer", fontFamily:"'Manrope', sans-serif", transition:"all 0.15s", opacity: disabled ? 0.45 : 1, ...style };
  if (variant === "ghost") return <button onClick={!disabled ? onClick : undefined} style={{ ...base, background:"transparent", border:"1px solid var(--border2)", color:"var(--muted)" }}>{children}</button>;
  if (variant === "danger") return <button onClick={!disabled ? onClick : undefined} style={{ ...base, background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)", color:"#f87171" }}>{children}</button>;
  return <button onClick={!disabled ? onClick : undefined} style={{ ...base, background:color, color: color === "#D4AF37" || color === "#34d399" ? "#050709" : "white" }}>{children}</button>;
}

function Badge({ children, color="#94a3b8" }) {
  return <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:700, background:`${color}18`, border:`1px solid ${color}30`, color }}>{children}</span>;
}

function Spinner() {
  return <div style={{ width:20, height:20, border:"2px solid rgba(255,255,255,0.08)", borderTopColor:"var(--gold)", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />;
}

function WalletGrid({ balance, loading }) {
  if (loading) return <div style={{ display:"flex", gap:12 }}>{WALLETS.map(w => <div key={w.key} style={{ flex:1, height:96, borderRadius:12, background:"var(--surface)" }} className="sa-pulse" />)}</div>;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
      {WALLETS.map(w => (
        <div key={w.key} style={{ padding:"18px 20px", borderRadius:14, background:w.dim, border:`1px solid ${w.color}22`, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", right:-10, top:-10, width:60, height:60, borderRadius:"50%", background:w.dim, filter:"blur(12px)" }} />
          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12 }}>
            <div style={{ width:26, height:26, borderRadius:6, background:`${w.color}20`, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <w.Icon size={13} color={w.color} />
            </div>
            <span style={{ fontSize:10, fontWeight:700, color:w.color, textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:"'Manrope',sans-serif" }}>{w.label}</span>
          </div>
          <div style={{ fontSize:22, fontWeight:800, ...T.mono, color:"white" }}>{fmt(balance?.[w.field] ?? 0)}</div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:4 }}>Admin Wallet · {w.key}</div>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize:10, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:14, fontFamily:"'Manrope',sans-serif" }}>{children}</div>;
}

function DataRow({ label, value, color, mono }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
      <span style={{ fontSize:11, color:"var(--muted)" }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:700, color: color || "rgba(255,255,255,0.75)", ...(mono ? T.mono : {}) }}>{value}</span>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function SuperAdminLogin({ onSuccess }) {
  useEffect(() => injectGlobalStyles(), []);
  const { C } = useAdminTheme();
  const [email,   setEmail]   = useState("");
  const [pw,      setPw]      = useState("");
  const [showPw,  setShowPw]  = useState(false);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const login = async (e) => {
    e?.preventDefault();
    setError("");
    if (!email || !pw) { setError("Email and password are required."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/super-admin-login/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: pw }),
});
      const json = await res.json();
      if (!res.ok) { setError(json.error || json.detail || "Invalid credentials."); setLoading(false); return; }
      if (!json.user?.is_superuser) {
  setError("Access denied. Super Admin only.");
  setLoading(false);
  return;
}
      localStorage.setItem(TOKEN_KEY,   json.tokens?.access  || json.access  || "");
      localStorage.setItem(REFRESH_KEY, json.tokens?.refresh || json.refresh || "");
      localStorage.setItem(USER_KEY,    JSON.stringify(json.user));
      onSuccess(json.user);
    } catch { setError("Network error. Check your connection."); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Manrope',sans-serif", position:"relative", overflow:"hidden" }}>
      {/* Background grid */}
      <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)", backgroundSize:"48px 48px" }} />
      <div style={{ position:"absolute", top:"20%", left:"30%", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(212,175,55,0.07) 0%,transparent 70%)", filter:"blur(40px)" }} />

      <div className="sa-animate" style={{ width:"100%", maxWidth:420, padding:"0 20px", position:"relative", zIndex:1 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:52, height:52, borderRadius:14, background:"rgba(212,175,55,0.1)", border:"1px solid rgba(212,175,55,0.3)", marginBottom:18 }}>
            <ShieldCheck size={24} color="#D4AF37" />
          </div>
          <div style={{ fontSize:11, fontWeight:700, color:"#D4AF37", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:8, fontFamily:"'Manrope',sans-serif" }}>Super Admin</div>
          <div style={{ fontSize:28, fontWeight:900, color:C.text, fontFamily:"'Manrope',sans-serif" }}>Control Panel</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Superuser access only — all actions are logged</div>
        </div>

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"30px 28px", backdropFilter:"blur(10px)" }}>
          <form onSubmit={login}>
            <div style={{ marginBottom:16 }}>
              <label style={{ ...T.label, color:C.muted }}>Email Address</label>
              <div style={{ position:"relative" }}>
                <Mail size={13} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.muted }} />
                <input type="email" value={email} autoFocus onChange={e => setEmail(e.target.value)}
                  placeholder="superadmin@domain.com"
                  className="sa-input" style={{ ...T.input, paddingLeft:36, background:C.inputBg, border:`1px solid ${C.border}`, color:C.text }} />
              </div>
            </div>
            <div style={{ marginBottom:22 }}>
              <label style={{ ...T.label, color:C.muted }}>Password</label>
              <div style={{ position:"relative" }}>
                <Lock size={13} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.muted }} />
                <input type={showPw ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)}
                  placeholder="••••••••••••"
                  className="sa-input" style={{ ...T.input, paddingLeft:36, paddingRight:40, background:C.inputBg, border:`1px solid ${C.border}`, color:C.text }} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:C.muted, display:"flex", alignItems:"center" }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {error && (
              <div style={{ marginBottom:18, padding:"11px 14px", borderRadius:9, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.25)", color:"#f87171", fontSize:12, display:"flex", gap:8, alignItems:"center" }}>
                <AlertCircle size={13} /> {error}
              </div>
            )}
            <Btn type="submit" onClick={login} disabled={loading || !email || !pw} style={{ width:"100%" }}>
              {loading ? <><Spinner /> Authenticating…</> : <><ShieldCheck size={14} /> Sign In as Super Admin</>}
            </Btn>
          </form>
        </div>
        <div style={{ textAlign:"center", marginTop:16, fontSize:11, color:C.muted }}>
          Regular admins → /admin-panel
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Dashboard
// ═══════════════════════════════════════════════════════════════════════════
function DashboardTab({ toast }) {
  const [stats,   setStats]   = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      saFetch("/api/super-admin/stats/").then(r => r?.json()),
      saFetch("/api/super-admin/wallet/balance/").then(r => r?.json()),
    ]).then(([s, b]) => { if (s) setStats(s); if (b) setBalance(b); }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const StatBox = ({ icon: Icon, label, value, color, sub }) => (
    <div style={{ padding:"20px 22px", borderRadius:14, background:"var(--surface)", border:"1px solid var(--border)", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", right:-8, bottom:-8, width:56, height:56, borderRadius:"50%", background:`${color}10` }} />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:`${color}15`, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Icon size={15} color={color} />
        </div>
        {sub && <span style={{ fontSize:10, color:"rgba(255,255,255,0.45)" }}>{sub}</span>}
      </div>
      <div style={{ fontSize:24, fontWeight:800, ...T.mono, color:"white" }}>{value}</div>
      <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>{label}</div>
    </div>
  );

  return (
    <div className="sa-animate" style={{ display:"flex", flexDirection:"column", gap:24 }}>
      <div>
        <SectionLabel>Admin Wallet Balances</SectionLabel>
        <WalletGrid balance={balance} loading={loading} />
      </div>
      {stats && (
        <>
          <div>
            <SectionLabel>Fund Flow</SectionLabel>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
              <StatBox icon={ArrowDownLeft}   label="Total Credited"      value={fmt(stats.totals?.credited)}    color="#34d399" />
              <StatBox icon={ArrowUpRight}    label="Total Debited"       value={fmt(stats.totals?.debited)}     color="#f87171" />
              <StatBox icon={ArrowRightLeft}  label="Transferred to Users" value={fmt(stats.totals?.transferred)} color="#D4AF37" />
            </div>
          </div>
          <div>
            <SectionLabel>Platform Stats</SectionLabel>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:14 }}>
              <StatBox icon={Users}      label="Total Users"  value={stats.counts?.users}  color="#60a5fa" />
              <StatBox icon={ShieldCheck} label="Total Admins" value={stats.counts?.admins} color="#a78bfa" />
            </div>
          </div>
        </>
      )}
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <Btn variant="ghost" onClick={load} size="sm"><RefreshCw size={12} /> Refresh</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Admin Wallet
// ═══════════════════════════════════════════════════════════════════════════
function AdminWalletTab({ toast }) {
  const [balance,    setBalance]    = useState(null);
  const [balLoading, setBalLoading] = useState(true);
  const [mode,       setMode]       = useState("credit");
  const [walletType, setWalletType] = useState("C");
  const [amount,     setAmount]     = useState("");
  const [note,       setNote]       = useState("");
  const [loading,    setLoading]    = useState(false);
  const [admins,     setAdmins]     = useState([]);
  const [adminId,    setAdminId]    = useState("");

  const loadBal = useCallback(() => {
    setBalLoading(true);
    saFetch("/api/super-admin/wallet/balance/").then(r => r?.json()).then(j => j && setBalance(j)).finally(() => setBalLoading(false));
  }, []);
  useEffect(() => { loadBal(); }, [loadBal]);
  useEffect(() => {
    saFetch("/api/super-admin/admins/").then(r => r?.json()).then(j => j && setAdmins(j.results || []));
  }, []);

  const submit = async () => {
    if (!amount || parseFloat(amount) <= 0) return toast("Enter a valid amount", false);
    if (!adminId) return toast("Select which admin this is for", false);
    setLoading(true);
    const url = mode === "credit" ? "/api/super-admin/wallet/credit/" : "/api/super-admin/wallet/debit/";
    const r = await saFetch(url, { method:"POST", body:JSON.stringify({ wallet_type:walletType, amount:parseFloat(amount), note, admin_id:Number(adminId) }) });
    if (!r) { toast("Session expired", false); setLoading(false); return; }
    const j = await r.json();
    toast(r.ok ? (j.message || "Done") : (j.error || "Failed"), r.ok);
    if (r.ok) { setAmount(""); setNote(""); loadBal(); }
    setLoading(false);
  };

  const sel = WALLETS.find(w => w.key === walletType);
  const isCredit = mode === "credit";
  const btnColor = isCredit ? "#34d399" : "#f87171";

  return (
    <div className="sa-animate" style={{ display:"flex", flexDirection:"column", gap:22 }}>
      <div>
        <SectionLabel>Current Balances</SectionLabel>
        <WalletGrid balance={balance} loading={balLoading} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"480px 1fr", gap:22, alignItems:"start" }}>
        <Card title={isCredit ? "Credit Admin Wallet" : "Debit Admin Wallet"} icon={isCredit ? ArrowDownLeft : ArrowUpRight} accent={btnColor}>
          {/* Mode toggle */}
          <div style={{ display:"flex", gap:8, marginBottom:20, padding:4, background:"rgba(255,255,255,0.03)", borderRadius:10, border:"1px solid var(--border)" }}>
            {[{ id:"credit", label:"Credit", Icon:ArrowDownLeft, color:"#34d399" }, { id:"debit", label:"Debit", Icon:ArrowUpRight, color:"#f87171" }].map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:7, padding:"9px 0", borderRadius:7, border:"none", fontWeight:700, fontSize:12, cursor:"pointer", background:mode===m.id?`${m.color}15`:"transparent", outline:mode===m.id?`1px solid ${m.color}35`:"none", color:mode===m.id?m.color:"rgba(255,255,255,0.35)", fontFamily:"'Manrope',sans-serif", transition:"all 0.15s" }}>
                <m.Icon size={13} /> {m.label}
              </button>
            ))}
          </div>

          {/* Wallet type */}
          <div style={{ marginBottom:16 }}>
            <label style={T.label}>Wallet Type</label>
            <div style={{ display:"flex", gap:8 }}>
              {WALLETS.map(w => (
                <button key={w.key} onClick={() => setWalletType(w.key)} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"9px 0", borderRadius:8, fontWeight:700, fontSize:11, cursor:"pointer", border:`1px solid ${walletType===w.key?w.color:"rgba(255,255,255,0.08)"}`, background:walletType===w.key?w.dim:"transparent", color:walletType===w.key?w.color:"rgba(255,255,255,0.35)", fontFamily:"'Manrope',sans-serif", transition:"all 0.15s" }}>
                  <w.Icon size={11}/> {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Current balance indicator */}
          {balance && sel && (
            <div style={{ marginBottom:16, padding:"10px 14px", borderRadius:9, background:`${sel.color}07`, border:`1px solid ${sel.color}20`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:11, color:"var(--muted)" }}>Current {sel.label} Balance</span>
              <span style={{ ...T.mono, fontWeight:700, color:sel.color, fontSize:14 }}>{fmt(balance[sel.field])}</span>
            </div>
          )}

          {/* Attribute to admin */}
          <div style={{ marginBottom:14 }}>
            <label style={T.label}>Attribute to Admin</label>
            <select value={adminId} onChange={e => setAdminId(e.target.value)} style={T.select}>
              <option value="" style={{ background: "var(--bg)", color: "white" }}>Select admin…</option>
              {admins.map(a => (
                <option key={a.id} value={a.id} style={{ background: "var(--bg)", color: "white" }}>{a.user_uid} — {a.name || a.email}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div style={{ marginBottom:14 }}>
            <label style={T.label}>Amount (USD)</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00"
              className="sa-input" style={{ ...T.input, borderColor:`${sel?.color}30`, ...T.mono, fontSize:15 }} />
            <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
              {[1000,5000,10000,25000,50000,100000].map(a => (
                <button key={a} onClick={() => setAmount(String(a))} style={{ padding:"4px 11px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", background:amount===String(a)?`${sel?.color}18`:"rgba(255,255,255,0.04)", border:`1px solid ${amount===String(a)?sel?.color+"40":"rgba(255,255,255,0.07)"}`, color:amount===String(a)?sel?.color:"rgba(255,255,255,0.35)", fontFamily:"'Manrope',sans-serif", transition:"all 0.12s" }}>
                  ${a >= 1000 ? (a/1000)+"k" : a}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div style={{ marginBottom:20 }}>
            <label style={T.label}>Note <span style={{ fontSize:9, opacity:0.6 }}>(optional)</span></label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Monthly allocation"
              className="sa-input" style={T.input} />
          </div>

          <Btn onClick={submit} disabled={loading || !amount || !adminId} color={btnColor} style={{ width:"100%" }}>
            {loading ? <><Spinner /> Processing…</> : isCredit ? <><ArrowDownLeft size={14} /> Credit Admin Wallet</> : <><ArrowUpRight size={14} /> Debit Admin Wallet</>}
          </Btn>
        </Card>

        {/* Live preview */}
        {amount && parseFloat(amount) > 0 && sel && balance && (
          <Card title="Transaction Preview" icon={Activity} accent="#D4AF37">
            <DataRow label="Operation"     value={isCredit ? "➕ Credit" : "➖ Debit"} color={btnColor} />
            <DataRow label="Wallet"        value={sel.label} color={sel.color} mono />
            <DataRow label="Amount"        value={fmt(amount)} color={btnColor} mono />
            <DataRow label="Current"       value={fmt(balance[sel.field])} mono />
            <DataRow
              label="After"
              value={fmt(Math.max(0, parseFloat(balance[sel.field]) + (isCredit ? 1 : -1) * parseFloat(amount || 0)))}
              color={!isCredit && parseFloat(amount) > parseFloat(balance[sel.field]) ? "#f87171" : "#34d399"}
              mono
            />
          </Card>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Transfer to User
// ═══════════════════════════════════════════════════════════════════════════
function TransferTab({ toast }) {
  const [balance,    setBalance]    = useState(null);
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState([]);
  const [user,       setUser]       = useState(null);
  const [searching,  setSearching]  = useState(false);
  const [walletType, setWalletType] = useState("C");
  const [txnType,    setTxnType]    = useState("LUB");
  const [amount,     setAmount]     = useState("");
  const [note,       setNote]       = useState("");
  const [loading,    setLoading]    = useState(false);

  useEffect(() => { saFetch("/api/super-admin/wallet/balance/").then(r => r?.json()).then(j => j && setBalance(j)); }, []);
  useEffect(() => { setTxnType(TXN_BY_WALLET[walletType]?.[0] || ""); }, [walletType]);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const r = await saFetch(`/api/admin-panel/users/?q=${encodeURIComponent(query.trim())}`);
    if (!r) { toast("Session expired", false); setSearching(false); return; }
    const j = await r.json();
    setResults(j.results || []);
    if (!j.results?.length) toast("No users found", false);
    setSearching(false);
  };

  const submit = async () => {
    if (!user) return toast("Select a user", false);
    if (!amount || parseFloat(amount) <= 0) return toast("Enter a valid amount", false);
    const sel = WALLETS.find(w => w.key === walletType);
    if (parseFloat(amount) > parseFloat(balance?.[sel?.field] ?? 0)) return toast(`Insufficient ${sel?.label} balance`, false);
    setLoading(true);
    const r = await saFetch("/api/super-admin/wallet/transfer/", { method:"POST", body:JSON.stringify({ user_id:user.id, wallet_type:walletType, transaction_type:txnType, amount:parseFloat(amount), note }) });
    if (!r) { toast("Session expired", false); setLoading(false); return; }
    const j = await r.json();
    toast(r.ok ? (j.message || "Transfer successful") : (j.error || "Failed"), r.ok);
    if (r.ok) { setAmount(""); setNote(""); setUser(null); setResults([]); saFetch("/api/super-admin/wallet/balance/").then(r2 => r2?.json()).then(j2 => j2 && setBalance(j2)); }
    setLoading(false);
  };

  const sel = WALLETS.find(w => w.key === walletType);

  return (
    <div className="sa-animate" style={{ display:"flex", flexDirection:"column", gap:22 }}>
      {/* Balance strip */}
      <div style={{ padding:"16px 20px", borderRadius:12, background:"rgba(212,175,55,0.06)", border:"1px solid rgba(212,175,55,0.2)", display:"flex", gap:32, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <Star size={13} color="#D4AF37" />
          <span style={{ fontSize:11, fontWeight:700, color:"#D4AF37", textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:"'Manrope',sans-serif" }}>Admin Wallet</span>
        </div>
        {WALLETS.map(w => (
          <div key={w.key} style={{ display:"flex", alignItems:"center", gap:10 }}>
            <w.Icon size={12} color={w.color} />
            <div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)" }}>{w.label}</div>
              <div style={{ ...T.mono, fontSize:14, fontWeight:800, color:w.color }}>{fmt(balance?.[w.field] ?? 0)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"420px 1fr", gap:22, alignItems:"start" }}>
        <Card title="Transfer to User" icon={ArrowRightLeft} accent="#D4AF37">
          {/* User search */}
          <div style={{ marginBottom:16 }}>
            <label style={T.label}>Find User</label>
            <div style={{ display:"flex", gap:8 }}>
              <div style={{ flex:1, position:"relative" }}>
                <Search size={12} style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color:"rgba(255,255,255,0.25)" }} />
                <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}
                  placeholder="Email / UID / name…" className="sa-input" style={{ ...T.input, paddingLeft:34 }} />
              </div>
              <Btn variant="ghost" onClick={search} disabled={searching} size="sm">
                {searching ? <Spinner /> : <Search size={12} />}
              </Btn>
            </div>
          </div>

          {/* Results */}
          {results.length > 0 && !user && (
            <div style={{ marginBottom:16, display:"flex", flexDirection:"column", gap:6, maxHeight:180, overflowY:"auto" }} className="sa-scrollbar">
              {results.map(u => (
                <div key={u.id}
                  onClick={() => { setUser(u); setResults([]); setQuery(""); }}
                  style={{ padding:"10px 13px", borderRadius:9, background:"var(--surface)", border:"1px solid var(--border)", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", transition:"border-color 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(96,165,250,0.4)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{u.name || u.email}</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", marginTop:2, ...T.mono }}>{u.user_uid} · {u.email}</div>
                  </div>
                  <Badge color="#60a5fa">Select →</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Selected user */}
          {user && (
            <div style={{ marginBottom:16, padding:"11px 14px", borderRadius:10, background:"rgba(52,211,153,0.06)", border:"1px solid rgba(52,211,153,0.25)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:"rgba(52,211,153,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <User size={14} color="#34d399" />
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#34d399" }}>{user.name || user.email}</div>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", marginTop:1, ...T.mono }}>{user.user_uid} · VIP {user.vip_level}</div>
                </div>
              </div>
              <button onClick={() => { setUser(null); setQuery(""); }} style={{ background:"none", border:"none", color:"rgba(248,113,113,0.6)", cursor:"pointer", display:"flex", alignItems:"center" }}>
                <X size={16} />
              </button>
            </div>
          )}

          {/* Wallet */}
          <div style={{ marginBottom:14 }}>
            <label style={T.label}>Wallet</label>
            <div style={{ display:"flex", gap:8 }}>
              {WALLETS.map(w => (
                <button key={w.key} onClick={() => setWalletType(w.key)} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"8px 0", borderRadius:8, fontWeight:700, fontSize:11, cursor:"pointer", border:`1px solid ${walletType===w.key?w.color:"rgba(255,255,255,0.08)"}`, background:walletType===w.key?w.dim:"transparent", color:walletType===w.key?w.color:"rgba(255,255,255,0.35)", fontFamily:"'Manrope',sans-serif", transition:"all 0.12s" }}>
                  <w.Icon size={11}/> {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Txn type */}
          <div style={{ marginBottom:14 }}>
            <label style={T.label}>Transaction Type</label>
            <select value={txnType} onChange={e => setTxnType(e.target.value)} style={T.select}>
              {(TXN_BY_WALLET[walletType] || []).map(t => <option key={t} value={t} style={{ background: "var(--bg)", color: "white" }}>{t} — {TXN_LABELS[t]}</option>)}
            </select>
          </div>

          {/* Amount */}
          <div style={{ marginBottom:14 }}>
            <label style={T.label}>Amount (USD)</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00"
              className="sa-input" style={{ ...T.input, borderColor:`${sel?.color}30`, ...T.mono, fontSize:15 }} />
            {balance && sel && <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:4 }}>Max: <span style={{ color:sel.color, fontWeight:700 }}>{fmt(balance[sel.field])}</span></div>}
          </div>

          <div style={{ marginBottom:20 }}>
            <label style={T.label}>Note <span style={{ fontSize:9, opacity:0.6 }}>(optional)</span></label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Monthly bonus"
              className="sa-input" style={T.input} />
          </div>

          <Btn onClick={submit} disabled={loading || !user || !amount} color="#D4AF37" style={{ width:"100%" }}>
            {loading ? <><Spinner /> Transferring…</> : <><ArrowRightLeft size={14} /> Transfer Funds</>}
          </Btn>
        </Card>

        {/* Preview */}
        {user && amount && parseFloat(amount) > 0 && (
          <Card title="Transfer Preview" icon={Activity} accent="#D4AF37">
            <DataRow label="Recipient"  value={`${user.name || user.email}`} />
            <DataRow label="UID"        value={user.user_uid} color="#60a5fa" mono />
            <DataRow label="Wallet"     value={sel?.label} color={sel?.color} />
            <DataRow label="Type"       value={`${txnType} — ${TXN_LABELS[txnType]}`} />
            <DataRow label="Amount"     value={fmt(amount)} color="#34d399" mono />
            <DataRow label="Admin After" value={fmt(Math.max(0, parseFloat(balance?.[sel?.field] ?? 0) - parseFloat(amount)))} color={parseFloat(balance?.[sel?.field] ?? 0) - parseFloat(amount) < 0 ? "#f87171" : "white"} mono />
            {parseFloat(balance?.[sel?.field] ?? 0) < parseFloat(amount) && (
              <div style={{ marginTop:14, padding:"10px 12px", borderRadius:8, background:"rgba(248,113,113,0.07)", border:"1px solid rgba(248,113,113,0.25)", fontSize:11, color:"#f87171", display:"flex", gap:7, alignItems:"center" }}>
                <AlertCircle size={12} /> Insufficient funds
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Manage Admins  — FIXED
// ═══════════════════════════════════════════════════════════════════════════
function AdminsTab({ toast }) {
  const [admins,   setAdmins]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ email:"", name:"", password:"", user_uid:"" });
  const [creating, setCreating] = useState(false);
  const [showPw,   setShowPw]   = useState(false);

  // ── Single source of truth for fetching ──────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    saFetch("/api/super-admin/admins/")
      .then(r => r?.json())
      .then(j => j && setAdmins(j.results || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);   // ← only this useEffect, nothing else

  // ── Create ────────────────────────────────────────────────────────────────
  const create = async () => {
    if (!form.email || !form.name || !form.password || !form.user_uid)
      return toast("Fill all fields", false);
    setCreating(true);
    const r = await saFetch("/api/super-admin/admins/create/", {
      method: "POST",
      body: JSON.stringify(form),
    });
    if (!r) { toast("Session expired", false); setCreating(false); return; }
    const j = await r.json();
    if (r.ok) {
      toast("Admin created successfully", true);
      setShowForm(false);
      setForm({ email:"", name:"", password:"", user_uid:"" });
      load();                               // ← refresh table
    } else {
      toast(j.email?.[0] || j.user_uid?.[0] || j.error || "Failed", false);
    }
    setCreating(false);
  };

  // ── Deactivate ────────────────────────────────────────────────────────────
  const deactivate = async (id, email) => {
    if (!window.confirm(`Deactivate ${email}?`)) return;
    const r = await saFetch(`/api/super-admin/admins/${id}/`, { method: "DELETE" });
    if (!r) { toast("Session expired", false); return; }
    const j = await r.json();
    toast(j.message || j.error, r.ok);
    if (r.ok) load();                       // ← refresh table
  };

  const formFields = [
    { key:"name",     label:"Full Name",    type:"text",     placeholder:"John Smith",       Icon: User   },
    { key:"user_uid", label:"Admin UID", type:"text", placeholder:"ADM-001", Icon: CreditCard },
    { key:"email",    label:"Email Address",type:"email",    placeholder:"admin@domain.com", Icon: Mail   },
    { key:"password", label:"Password",     type:"password", placeholder:"Strong password",  Icon: Lock, showToggle: true },
  ];

  return (
    <div className="sa-animate" style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {/* ── Header row ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, fontFamily:"'Manrope',sans-serif" }}>Admin Accounts</div>
          <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>
            {admins.length} admin{admins.length !== 1 ? "s" : ""} total
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="ghost" onClick={load} size="sm"><RefreshCw size={12} /> Refresh</Btn>
          <Btn
            onClick={() => setShowForm(v => !v)}
            color={showForm ? "rgba(255,255,255,0.08)" : "#D4AF37"}
            variant={showForm ? "ghost" : "solid"}
            size="sm"
          >
            {showForm ? <><X size={12}/> Cancel</> : <><Plus size={12}/> Create Admin</>}
          </Btn>
        </div>
      </div>

      {/* ── Create form ── */}
      {showForm && (
        <Card
          title="New Admin Account" icon={Plus} accent="#D4AF37"
          style={{ maxWidth:560, background:"rgba(212,175,55,0.03)", border:"1px solid rgba(212,175,55,0.18)" }}
        >
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:18 }}>
            {formFields.map(({ key, label, type, placeholder, Icon, showToggle }) => (
              <div key={key}>
                <label style={T.label}>{label}</label>
                <div style={{ position:"relative" }}>
                  <Icon size={12} style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color:"rgba(255,255,255,0.3)" }} />
                  <input
                    value={form[key]}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                    type={showToggle ? (showPw ? "text" : "password") : type}
                    placeholder={placeholder}
                    className="sa-input"
                    style={{ ...T.input, paddingLeft:32, paddingRight: showToggle ? 36 : 12 }}
                  />
                  {showToggle && (
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.3)", display:"flex" }}
                    >
                      {showPw ? <EyeOff size={13}/> : <Eye size={13}/>}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Btn onClick={create} disabled={creating} color="#D4AF37" style={{ width:"100%" }}>
            {creating ? <><Spinner/> Creating…</> : <><Plus size={13}/> Create Admin Account</>}
          </Btn>
        </Card>
      )}

      {/* ── Table ── */}
      <Card style={{ padding:0, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }} className="sa-scrollbar">
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:700 }}>
            <thead>
              <tr style={{ background:"rgba(255,255,255,0.02)", borderBottom:"1px solid var(--border)" }}>
                {["UID","Name","Email","Status","Joined","Last Login",""].map(h => (
                  <th key={h} style={{ padding:"11px 16px", fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.09em", color:"rgba(255,255,255,0.7)", textAlign:"left", whiteSpace:"nowrap", fontFamily:"'Manrope',sans-serif", textShadow:"0 0 8px rgba(212,175,55,0.25)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding:40, textAlign:"center" }}>
                    <div style={{ display:"flex", justifyContent:"center" }}><Spinner/></div>
                  </td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding:40, textAlign:"center", color:"var(--muted)", fontSize:13 }}>
                    No admins created yet
                  </td>
                </tr>
              ) : admins.map(a => (
                <tr key={a.id} className="sa-row-hover" style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", transition:"background 0.12s" }}>
                  <td style={{ padding:"12px 16px", ...T.mono, color:"#D4AF37", fontWeight:700, fontSize:12 }}>{a.user_uid}</td>
                  <td style={{ padding:"12px 16px", fontWeight:600, fontSize:13 }}>{a.name || "—"}</td>
                  <td style={{ padding:"12px 16px", color:"rgba(255,255,255,0.5)", fontSize:12 }}>{a.email}</td>
                  <td style={{ padding:"12px 16px" }}>
                    <Badge color={a.is_active ? "#34d399" : "#f87171"}>
                      {a.is_active
                        ? <><CheckCircle size={9}/> Active</>
                        : <><AlertCircle size={9}/> Inactive</>}
                    </Badge>
                  </td>
                  <td style={{ padding:"12px 16px", color:"rgba(255,255,255,0.4)", fontSize:11 }}>{fmtDT(a.date_joined)}</td>
                  <td style={{ padding:"12px 16px", color:"rgba(255,255,255,0.4)", fontSize:11 }}>{fmtDT(a.last_login)}</td>
                  <td style={{ padding:"12px 16px" }}>
                    {a.is_active && (
                      <Btn variant="danger" size="sm" onClick={() => deactivate(a.id, a.email)}>
                        <X size={11}/> Deactivate
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: History
// ═══════════════════════════════════════════════════════════════════════════
function HistoryTab({ toast }) {
  const [txns,     setTxns]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [txnTypeF,  setTxnTypeF]  = useState("");
  const [walletF,   setWalletF]   = useState("");
  const [userTypeF, setUserTypeF] = useState("");
  const PER = 20;

  const load = useCallback((pg = 1) => {
    setLoading(true);
    const p = new URLSearchParams();
    if (txnTypeF)  p.set("txn_type", txnTypeF);
    if (walletF)   p.set("wallet_type", walletF);
    if (userTypeF) p.set("user_type", userTypeF);
    p.set("page", pg); p.set("page_size", PER);
    saFetch(`/api/super-admin/wallet/history/?${p}`)
      .then(r => r?.json())
      .then(j => { if (j) { setTxns(j.results || []); setTotal(j.count || 0); setPage(pg); } })
      .finally(() => setLoading(false));
  }, [txnTypeF, walletF, userTypeF]);

  useEffect(() => { load(1); }, [load]);

  const TC = { SA_CREDIT:"#34d399", SA_DEBIT:"#f87171", ADM_TRANSFER:"#D4AF37" };
  const TL = { SA_CREDIT:"Credit", SA_DEBIT:"Debit", ADM_TRANSFER:"Transfer" };
  const TI = { SA_CREDIT:ArrowDownLeft, SA_DEBIT:ArrowUpRight, ADM_TRANSFER:ArrowRightLeft };
  const pages = Math.max(1, Math.ceil(total / PER));

  return (
    <div className="sa-animate" style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Filters */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
        <select value={txnTypeF} onChange={e => setTxnTypeF(e.target.value)} style={{ ...T.select, width:"auto", minWidth:170 }}>
          <option value="" style={{ background: "var(--bg)", color: "white" }}>All Types</option>
          <option value="SA_CREDIT" style={{ background: "var(--bg)", color: "white" }}>SA Credit</option>
          <option value="SA_DEBIT" style={{ background: "var(--bg)", color: "white" }}>SA Debit</option>
          <option value="ADM_TRANSFER" style={{ background: "var(--bg)", color: "white" }}>Transfer → User</option>
        </select>
        <select value={walletF} onChange={e => setWalletF(e.target.value)} style={{ ...T.select, width:"auto", minWidth:140 }}>
          <option value="" style={{ background: "var(--bg)", color: "white" }}>All Wallets</option>
          {WALLETS.map(w => <option key={w.key} value={w.key} style={{ background: "var(--bg)", color: "white" }}>{w.label}</option>)}
        </select>
        <select value={userTypeF} onChange={e => setUserTypeF(e.target.value)} style={{ ...T.select, width:"auto", minWidth:140 }}>
          <option value="" style={{ background: "var(--bg)", color: "white" }}>All User Types</option>
          <option value="admin" style={{ background: "var(--bg)", color: "white" }}>Admin</option>
          <option value="user" style={{ background: "var(--bg)", color: "white" }}>User</option>
        </select>
        <Btn variant="ghost" onClick={() => load(1)} size="sm"><RefreshCw size={12} /> Refresh</Btn>
        <span style={{ marginLeft:"auto", fontSize:12, color:"var(--muted)" }}>{total} records</span>
      </div>

      <Card style={{ padding:0, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }} className="sa-scrollbar">
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:820 }}>
            <thead>
              <tr style={{ background:"rgba(255,255,255,0.02)", borderBottom:"1px solid var(--border)" }}>
                {["Reference","Type","User Type","Wallet","Amount","Before → After","Target User","Performed By","Date"].map(h => (
                  <th key={h} style={{ padding:"11px 14px", fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.09em", color:"rgba(255,255,255,0.7)", textAlign:"left", whiteSpace:"nowrap", fontFamily:"'Manrope',sans-serif", textShadow:"0 0 8px rgba(212,175,55,0.25)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding:48, textAlign:"center" }}><div style={{ display:"flex", justifyContent:"center" }}><Spinner /></div></td></tr>
              ) : txns.length === 0 ? (
                <tr><td colSpan={9} style={{ padding:48, textAlign:"center", color:"var(--muted)", fontSize:13 }}>No transactions found</td></tr>
              ) : txns.map(t => {
                const w   = WALLETS.find(x => x.key === t.wallet_type) || WALLETS[0];
                const col = TC[t.txn_type] || "#888";
                const TxnIcon = TI[t.txn_type] || Activity;
                return (
                  <tr key={t.id} className="sa-row-hover" style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding:"11px 14px", ...T.mono, fontSize:10, color:"rgba(255,255,255,0.35)" }}>{t.reference}</td>
                    <td style={{ padding:"11px 14px" }}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 9px", borderRadius:20, fontSize:10, fontWeight:700, background:`${col}15`, border:`1px solid ${col}25`, color:col }}>
                        <TxnIcon size={9}/> {TL[t.txn_type] || t.txn_type}
                      </span>
                    </td>
                    <td style={{ padding:"11px 14px" }}>
                      <Badge color={t.txn_type === "ADM_TRANSFER" ? "#60a5fa" : "#a78bfa"}>
                        {t.txn_type === "ADM_TRANSFER" ? "User" : "Admin"}
                      </Badge>
                    </td>
                    <td style={{ padding:"11px 14px" }}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:10, fontWeight:700, color:w.color }}>
                        <w.Icon size={10}/> {w.label}
                      </span>
                    </td>
                    <td style={{ padding:"11px 14px", ...T.mono, fontWeight:700, color:col, fontSize:12 }}>
                      {t.txn_type === "SA_CREDIT" ? "+" : "−"}{fmt(t.amount)}
                    </td>
                    <td style={{ padding:"11px 14px", ...T.mono, fontSize:11, color:"rgba(255,255,255,0.4)" }}>
                      {fmt(t.admin_wallet_before)} → {fmt(t.admin_wallet_after)}
                    </td>
                    <td style={{ padding:"11px 14px" }}>
                      {t.target_user_uid
                        ? <span style={{ ...T.mono, fontSize:11, color:"#60a5fa", fontWeight:600 }}>{t.target_user_uid}</span>
                        : <span style={{ color:"rgba(255,255,255,0.18)", fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:"11px 14px", ...T.mono, fontSize:11, color:"#D4AF37" }}>{t.performed_by_uid || "—"}</td>
                    <td style={{ padding:"11px 14px", fontSize:11, color:"rgba(255,255,255,0.4)" }}>{fmtDT(t.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize:12, color:"var(--muted)" }}>Page {page} of {pages}</span>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <Btn variant="ghost" onClick={() => load(page - 1)} disabled={page <= 1} size="sm"><ChevronLeft size={13}/> Prev</Btn>
            <span style={{ fontSize:12, ...T.mono, padding:"5px 12px", borderRadius:7, background:"var(--surface)", border:"1px solid var(--border)", color:"rgba(255,255,255,0.5)" }}>{page}</span>
            <Btn variant="ghost" onClick={() => load(page + 1)} disabled={page >= pages} size="sm">Next <ChevronRight size={13}/></Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════
const TABS = [
  { id:"dashboard", label:"Dashboard",       Icon:LayoutDashboard },
  { id:"wallet",    label:"Admin Wallet",    Icon:Wallet          },
  { id:"transfer",  label:"Transfer",        Icon:ArrowRightLeft  },
  { id:"admins",    label:"Manage Admins",   Icon:Users           },
  { id:"history",   label:"History",         Icon:History         },
];

export default function SuperAdminPanel() {
  return (
    <AdminThemeProvider>
      <SuperAdminPanelInner />
    </AdminThemeProvider>
  );
}

function SuperAdminPanelInner() {
  useEffect(() => injectGlobalStyles(), []);
  const { C } = useAdminTheme();

  const [authed, setAuthed] = useState(false);
  const [saUser, setSaUser] = useState(null);
  const [tab,    setTab]    = useState("dashboard");
  const [toast,  setToast]  = useState(null);

  useEffect(() => {
  const init = async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const user  = JSON.parse(localStorage.getItem(USER_KEY) || "null");
      if (!token || !user) return;

      // Only superusers can access this panel
      if (!user?.is_superuser) {
        [TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(k => localStorage.removeItem(k));
        return;
      }

      // Re-validate token against backend on every page refresh
      const r = await saFetch("/api/super-admin/stats/");
      if (r && r.ok) {
        setAuthed(true);
        setSaUser(user);
      } else {
        [TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(k => localStorage.removeItem(k));
      }
    } catch {
      [TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(k => localStorage.removeItem(k));
    }
  };
  init();
}, []);

  const logout = async () => {
    await revokeSession(TOKEN_KEY, REFRESH_KEY);
    [TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(k => localStorage.removeItem(k));
    setAuthed(false); setSaUser(null);
  };

  const showToast = (msg, ok = true) => setToast({ msg, ok });

  if (!authed) return <SuperAdminLogin onSuccess={u => { setAuthed(true); setSaUser(u); }} />;

  const activeTab = TABS.find(t => t.id === tab);

  return (
    <div style={{ ...T.page, background:C.bg, color:C.text }}>
      {/* ── Top bar ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28, paddingBottom:20, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:"rgba(212,175,55,0.1)", border:"1px solid rgba(212,175,55,0.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ShieldCheck size={18} color="#D4AF37" />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"#D4AF37", textTransform:"uppercase", letterSpacing:"0.16em", fontFamily:"'Manrope',sans-serif" }}>Super Admin</div>
            <div style={{ fontSize:18, fontWeight:900, fontFamily:"'Manrope',sans-serif", lineHeight:1.2, color:C.text }}>Control Panel</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{saUser?.name || saUser?.email}</div>
            <div style={{ fontSize:10, ...T.mono, color:C.muted }}>{saUser?.user_uid}</div>
          </div>
          <div style={{ padding:"5px 11px", borderRadius:7, background:"rgba(212,175,55,0.08)", border:"1px solid rgba(212,175,55,0.25)", fontSize:9, fontWeight:800, color:"#D4AF37", textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:"'Manrope',sans-serif" }}>
            Superuser
          </div>
          <Btn variant="danger" onClick={logout} size="sm"><LogOut size={12}/> Logout</Btn>
        </div>
      </div>

      {/* ── Nav tabs ── */}
      <div style={{ display:"flex", gap:4, marginBottom:26, padding:"4px", borderRadius:12, background:C.hoverBg, border:`1px solid ${C.border}`, width:"fit-content" }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className="sa-tab-btn"
              style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 18px", borderRadius:9, fontSize:12, fontWeight:active ? 700 : 500, cursor:"pointer", border:"none", background:active ? C.hoverBg : "transparent", outline:active ? `1px solid ${C.border2}` : "none", color:active ? C.text : C.muted, fontFamily:"'Manrope',sans-serif", transition:"all 0.15s" }}>
              <t.Icon size={13} color={active ? "#D4AF37" : undefined} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div>
        {tab === "dashboard" && <DashboardTab toast={showToast} />}
        {tab === "wallet"    && <AdminWalletTab toast={showToast} />}
        {tab === "transfer"  && <TransferTab toast={showToast} />}
        {tab === "admins"    && <AdminsTab toast={showToast} />}
        {tab === "history"   && <HistoryTab toast={showToast} />}
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}