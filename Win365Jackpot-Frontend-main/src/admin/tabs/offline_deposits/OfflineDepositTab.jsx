/**
 * OfflineDepositTab.jsx — REFACTORED ORCHESTRATOR
 *
 * 4 tabs, each its own component:
 *   RollingPoints  → win365jackpot/src/admin/tabs/offline_deposits/RollingPoints.jsx
 *   CashWallet     → win365jackpot/src/admin/tabs/offline_deposits/CashWallet.jsx
 *   NonCash        → win365jackpot/src/admin/tabs/offline_deposits/NonCash.jsx
 *   OtpWallet      → win365jackpot/src/admin/tabs/offline_deposits/OtpWallet.jsx
 */

import React, { useState, useEffect } from "react";
import {
  Search, TrendingUp, DollarSign, Gift, Zap,
  LogIn, RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { adminFetch, API, fmt, fmtDT } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

// ── Sub-components ─────────────────────────────────────────────────────────────
import RollingPoints from "./RollingPoints";
import CashWallet    from "./CashWallet";
import NonCash       from "./NonCash";
import OtpWallet     from "./OtpWallet";

// ─── VIP HELPERS ──────────────────────────────────────────────────────────────
const VIP_LEVELS = [
  { lvl:1, label:"VIP" },
  { lvl:2, label:"VIP Bronze" },
  { lvl:3, label:"Silver" },
  { lvl:4, label:"Gold" },
  { lvl:5, label:"Jackpot I" },
  { lvl:6, label:"Jackpot II" },
  { lvl:7, label:"Jackpot III" },
  { lvl:8, label:"Jackpot Platinum" },
  { lvl:9, label:"Jackpot Diamond" },
];
const VIP_BY_LVL = Object.fromEntries(VIP_LEVELS.map(v => [v.lvl, v]));
const VIP_COLORS = ["#f59e0b","#cd7f32","#94a3b8","#fbbf24","#a78bfa","#34d399","#22d3ee","#6366f1","#e879f9"];

// ─── ADMIN WALLET FIELD MAP ───────────────────────────────────────────────────
const WALLET_META = {
  C:  { label:"Cash",     color:"#34d399", adminField:"cash_balance"     },
  NC: { label:"Non-Cash", color:"#60a5fa", adminField:"non_cash_balance"  },
  O:  { label:"OTP",      color:"#a78bfa", adminField:"otp_balance"       },
};

// ─── MAIN TABS ────────────────────────────────────────────────────────────────
const MAIN_TABS = [
  { id:"rolling", label:"Rolling Points", Icon:TrendingUp, color:"#a78bfa" },
  { id:"C",       label:"Cash Wallet",    Icon:DollarSign, color:"#34d399" },
  { id:"NC",      label:"Non Cash",       Icon:Gift,       color:"#60a5fa" },
  { id:"O",       label:"OTP Wallet",     Icon:Zap,        color:"#a855f7" },
];

// ─── STYLES ──────────────────────────────────────────────────────────────────
// Takes the current theme's C object since this is a plain function, not a
// component, and can't call hooks itself. Usage: inp(accentColor, C)
const inp = (accent, C) => ({
  background:C.inputBg,
  border:`1px solid ${accent?accent+"44":C.border}`,
  color:C.text, borderRadius:8, padding:"9px 12px", fontSize:13,
  width:"100%", outline:"none", boxSizing:"border-box",
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function OfflineDepositTab({ onToast }) {
  const { C } = useAdminTheme();
  const [tab,           setTab]          = useState("rolling");
  const [query,         setQuery]        = useState("");
  const [searchResults, setSearchResults]= useState([]);
  const [userInfo,      setUserInfo]     = useState(null);
  const [accounts,      setAccounts]     = useState([]);
  const [history,       setHistory]      = useState([]);
  const [searching,     setSearching]    = useState(false);
  const [submitting,    setSubmitting]   = useState(false);
  const [casinos,       setCasinos]      = useState({});
  const [adminWallet,   setAdminWallet]  = useState(null);
  const [filtered, setFiltered] = useState([]);

const handleSearchInput = (val) => {
  setQuery(val);
  if (!val.trim()) { setFiltered([]); return; }
  const lo = val.toLowerCase();
  setFiltered(
    searchResults.filter(u =>
      u.name?.toLowerCase().includes(lo) ||
      u.email?.toLowerCase().includes(lo) ||
      u.user_uid?.toLowerCase().includes(lo)
    )
  );
};

  useEffect(() => {
    adminFetch(`${API}/api/admin-panel/deposits/casinos/`)
      .then(r => r.json()).then(j => setCasinos(j.casinos || {})).catch(() => {});
    loadAdminWallet();
  }, []);

  const loadAdminWallet = () => {
    adminFetch(`${API}/api/super-admin/wallet/balance/`)
      .then(r => r.json()).then(j => setAdminWallet(j)).catch(() => {});
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true); setUserInfo(null); setSearchResults([]);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/users/?q=${encodeURIComponent(query.trim())}`);
      const j = await r.json();
      if (j.results?.length) setSearchResults(j.results);
      else onToast("No users found", false);
    } catch { onToast("Search failed", false); }
    setSearching(false);
  };

  const selectUser = async (u) => {
    setUserInfo(u); setSearchResults([]);
    await Promise.all([loadAccounts(u.id), loadHistory(u.id)]);
  };

  const [userTotalCash, setUserTotalCash] = useState(null); // ← add this state at top

const loadAccounts = async (uid) => {
  try {
    const r = await adminFetch(`${API}/api/admin-panel/wallet/accounts/user/${uid}/`);
    const j = await r.json();
    setAccounts(j.accounts || []);
    setUserTotalCash(j.total_cash_balance ?? null); // ← add this
  } catch { setAccounts([]); }
};

  const loadHistory = async (uid) => {
    try {
      const r = await adminFetch(`${API}/api/admin-panel/deposits/history/?user_id=${uid}`);
      const j = await r.json(); setHistory(j.results || []);
    } catch { setHistory([]); }
  };

  const refreshUser = async () => {
    if (!userInfo) return;
    try {
      const r = await adminFetch(`${API}/api/admin-panel/users/${userInfo.id}/`);
      if (r.ok) { const j = await r.json(); setUserInfo(j); }
      await Promise.all([loadAccounts(userInfo.id), loadHistory(userInfo.id)]);
    } catch {}
    loadAdminWallet();
  };

  const activeTab = MAIN_TABS.find(t => t.id === tab);

  // shared props passed to every sub-tab
  const sharedProps = {
  userInfo, accounts, casinos,
  submitting, setSubmitting,
  onToast, refreshUser,
  adminWallet, loadAdminWallet,
  userTotalCash,  // ← add this
};

  return (
    <div style={{ maxWidth:1100, fontFamily:"'Manrope',sans-serif" }}>

      {/* ── TOP TABS ── */}
      <div style={{
        display:"flex", gap:6, marginBottom:20, padding:"4px",
        borderRadius:12, background:C.hoverBg,
        border:`1px solid ${C.border}`, width:"fit-content",
      }}>
        {MAIN_TABS.map(({ id, label, Icon, color }) => {
          const active   = tab === id;
          const meta     = WALLET_META[id];
          const adminBal = adminWallet && meta?.adminField
            ? Number(adminWallet[meta.adminField] || 0) : null;
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              display:"flex", alignItems:"center", gap:8,
              padding:"10px 18px", borderRadius:9, fontSize:12,
              fontWeight:active?700:500, cursor:"pointer",
              transition:"all 0.18s", border:"none",
              background: active ? `${color}18` : "transparent",
              outline: active ? `1px solid ${color}40` : "none",
              color: active ? color : C.muted,
            }}>
              <Icon size={13}/> {label}
              {adminBal !== null && (
                <span style={{
                  fontSize:9, fontWeight:800, fontFamily:"monospace",
                  padding:"1px 6px", borderRadius:10,
                  background: active ? `${color}25` : C.hoverBg,
                  color: active ? color : C.muted,
                }}>
                  {fmt(adminBal)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── SEARCH BAR ── */}
      <div style={{
        padding:"14px 16px", borderRadius:12, marginBottom:14,
        background:`${activeTab?.color}06`,
        border:`1px solid ${activeTab?.color}18`,
      }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
          <Search size={13} style={{ color:activeTab?.color }}/> Find User
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <input
  value={query}
  onChange={e => handleSearchInput(e.target.value)}
  onKeyDown={e => e.key === "Enter" && search()}
  placeholder="Search by email, UID or name…"
  style={inp(activeTab?.color, C)}
/>
          <button onClick={search} disabled={searching} style={{
            padding:"9px 18px", borderRadius:8, border:"none",
            fontWeight:700, fontSize:12,
            background: activeTab?.color || "#a78bfa", color:"#000",
            cursor:searching?"not-allowed":"pointer",
            opacity:searching?0.6:1, whiteSpace:"nowrap",
          }}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Search Results */}
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              style={{ marginTop:12, display:"flex", flexDirection:"column", gap:6 }}>
              <div style={{ fontSize:10, color:C.muted, marginBottom:2 }}>
                {searchResults.length} user{searchResults.length!==1?"s":""} found
              </div>
              {searchResults.map(u => (
                <div key={u.id} style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"10px 14px", borderRadius:9,
                  background:C.hoverBg, border:`1px solid ${C.border}`,
                  cursor:"pointer", transition:"border-color 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor=`${activeTab?.color}40`}
                  onMouseLeave={e => e.currentTarget.style.borderColor=C.border}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{u.name||u.email}</div>
                    <div style={{ display:"flex", gap:8, marginTop:3, alignItems:"center" }}>
                      <span style={{ fontSize:10, fontFamily:"monospace", color:"#60a5fa", background:"rgba(96,165,250,0.1)", padding:"1px 6px", borderRadius:4 }}>{u.user_uid}</span>
                      <span style={{ fontSize:11, color:C.muted }}>{u.email}</span>
                      {u.vip_level && (
                        <span style={{ fontSize:10, fontWeight:700, color:VIP_COLORS[(u.vip_level||1)-1], background:`${VIP_COLORS[(u.vip_level||1)-1]}18`, padding:"1px 6px", borderRadius:4 }}>
                          {VIP_BY_LVL[u.vip_level]?.label||`VIP ${u.vip_level}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => selectUser(u)} style={{
                    display:"flex", alignItems:"center", gap:6,
                    padding:"7px 14px", borderRadius:7,
                    background:`${activeTab?.color}18`, border:`1px solid ${activeTab?.color}40`,
                    color:activeTab?.color, fontWeight:700, fontSize:12, cursor:"pointer",
                  }}>
                    <LogIn size={13}/> Select
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected User Badge */}
        {userInfo && (
          <div style={{
            marginTop:10, padding:"10px 14px", borderRadius:9,
            background:`${activeTab?.color}08`, border:`1px solid ${activeTab?.color}25`,
            display:"flex", justifyContent:"space-between", alignItems:"center",
          }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:activeTab?.color }}>✓ {userInfo.name||userInfo.email}</div>
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                {userInfo.user_uid} · {VIP_BY_LVL[userInfo.vip_level]?.label||`VIP ${userInfo.vip_level}`} · {userInfo.email}
              </div>
            </div>
            <button onClick={() => { setUserInfo(null); setQuery(""); setSearchResults([]); setUserTotalCash(null); }}
              style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer", fontSize:18, lineHeight:1 }}>✕</button>
          </div>
        )}
      </div>

      {/* ── TAB CONTENT ── */}
      <AnimatePresence mode="wait">
        {tab === "rolling" && (
          <motion.div key="rolling" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
            <RollingPoints {...sharedProps}/>
          </motion.div>
        )}
        {tab === "C" && (
          <motion.div key="C" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
            <CashWallet {...sharedProps}/>
          </motion.div>
        )}
        {tab === "NC" && (
          <motion.div key="NC" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
            <NonCash {...sharedProps}/>
          </motion.div>
        )}
        {tab === "O" && (
          <motion.div key="O" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
            <OtpWallet {...sharedProps}/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SESSION HISTORY ── */}
      {userInfo && (
        <div style={{ marginTop:20 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.text }}>
              Session History — <span style={{ color:C.muted }}>{userInfo.name||userInfo.email}</span>
            </div>
            <button onClick={refreshUser} style={{
              display:"flex", alignItems:"center", gap:6, padding:"6px 12px",
              borderRadius:7, fontSize:11, fontWeight:600, background:"transparent",
              border:`1px solid ${C.border}`, color:C.muted, cursor:"pointer",
            }}>
              <RefreshCw size={11}/> Refresh
            </button>
          </div>
          <HistoryTable history={history}/>
        </div>
      )}
    </div>
  );
}

// ─── HISTORY TABLE ────────────────────────────────────────────────────────────
const VIP_COLORS_H = ["#f59e0b","#cd7f32","#94a3b8","#fbbf24","#a78bfa","#34d399","#22d3ee","#6366f1","#e879f9"];
const VIP_BY_LVL_H = Object.fromEntries(
  [1,2,3,4,5,6,7,8,9].map((lvl, i) => [lvl, { label:["VIP","VIP Bronze","Silver","Gold","Jackpot I","Jackpot II","Jackpot III","Jackpot Platinum","Jackpot Diamond"][i] }])
);

function HistoryTable({ history }) {
  const { C } = useAdminTheme();
  return (
    <div style={{ borderRadius:12, overflow:"hidden", border:`1px solid ${C.border}` }}>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
          <thead>
            <tr style={{ background:C.hoverBg }}>
              {["Date","Type","Slip","Bet Date","Casino","VIP","Details","RP Added","RP Total","Cash Bal","LU?","By"].map(h => (
                <th key={h} style={{ padding:"9px 11px", textAlign:"left", fontSize:9, color:C.sub, fontWeight:800, textTransform:"uppercase", borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap", textShadow:"0 0 8px rgba(212,175,55,0.25)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.length===0 ? (
              <tr><td colSpan={12} style={{ padding:28, textAlign:"center", color:C.muted, fontSize:12 }}>No sessions recorded yet.</td></tr>
            ) : history.map(h => (
              <tr key={h.id} style={{ borderBottom:`1px solid ${C.border}` }}
                onMouseEnter={e => e.currentTarget.style.background=C.hoverBg}
                onMouseLeave={e => e.currentTarget.style.background=""}>
                <td style={{ padding:"9px 11px", fontSize:10, color:C.muted, whiteSpace:"nowrap" }}>{fmtDT(h.created_at)}</td>
                <td style={{ padding:"9px 11px" }}>
                  <span style={{
                    fontSize:9, padding:"2px 7px", borderRadius:20, fontWeight:700,
                    background:h.entry_type==="cash"?"rgba(52,211,153,0.12)":"rgba(167,139,250,0.12)",
                    color:h.entry_type==="cash"?"#34d399":"#a78bfa",
                  }}>
                    {h.entry_type==="cash"?"CASH":"RP"}
                  </span>
                </td>
                <td style={{ padding:"9px 11px", fontSize:10, color:"#a78bfa", fontFamily:"monospace" }}>{h.slip_number||"—"}</td>
                <td style={{ padding:"9px 11px", fontSize:10, color:C.muted }}>{h.betting_date?new Date(h.betting_date).toLocaleDateString("en-IN"):"—"}</td>
                <td style={{ padding:"9px 11px", fontSize:10, color:C.muted }}>{h.casino_name||"—"}</td>
                <td style={{ padding:"9px 11px" }}>
                  <span style={{ fontSize:9, color:VIP_COLORS_H[(h.vip_level_at_time||1)-1], fontWeight:700 }}>
                    {VIP_BY_LVL_H[h.vip_level_at_time]?.label||`L${h.vip_level_at_time}`}
                  </span>
                </td>
                <td style={{ padding:"9px 11px", fontSize:10, color:C.muted }}>
                  {h.entry_type==="cash"
                    ? `Dep:${fmt(h.total_deposited)} Won:${fmt(h.total_won)} Wd:${fmt(h.total_withdrawn)}`
                    : `${h.total_bets||0} bets · $${Number(h.total_bet_amount||0).toLocaleString("en-IN")}`}
                </td>
                <td style={{ padding:"9px 11px", fontFamily:"monospace", color:"#a78bfa", fontWeight:700 }}>
                  {h.entry_type==="rolling_points"?`+${Number(h.rolling_points_added).toLocaleString("en-IN")}`:"—"}
                </td>
                <td style={{ padding:"9px 11px", fontFamily:"monospace", color:C.text, fontWeight:600 }}>
                  {h.entry_type==="rolling_points"?Number(h.rolling_points_total).toLocaleString("en-IN"):"—"}
                </td>
                <td style={{ padding:"9px 11px", fontFamily:"monospace", color:"#34d399", fontWeight:700 }}>
                  {h.entry_type==="cash"?fmt(h.available_balance):"—"}
                </td>
                <td style={{ padding:"9px 11px", textAlign:"center" }}>
                  {h.level_up_triggered
                    ? <span style={{ color:"#34d399" }}>✅</span>
                    : <span style={{ color:C.dim }}>—</span>}
                </td>
                <td style={{ padding:"9px 11px", fontSize:10, color:C.muted }}>{h.recorded_by||"—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}