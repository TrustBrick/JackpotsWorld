/**
 * UsersTab.jsx — Admin Panel
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, RefreshCw, X, Eye, User, Phone, Globe, Calendar,
  CreditCard, TrendingUp, Star, Clock, CheckCircle, Info,
  Zap, Gift, DollarSign, Plane, Hash, Award, Users,
  ShieldCheck, AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Spinner, UidBadge, Pagination } from "../components/SharedUI";
import { adminFetch, API, fmt, fmtN, fmtDT } from "../helpers";

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const LEVEL_NAMES = [
  "", "VIP", "VIP Bronze", "Silver", "Gold",
  "Jackpot I", "Jackpot II", "Jackpot III",
  "Jackpot Platinum", "Jackpot Diamond", "Master",
];

const LEVEL_COLORS = {
  1: "#9CA3AF", 2: "#34D399", 3: "#60A5FA", 4: "#A78BFA",
  5: "#D4AF37", 6: "#F59E0B", 7: "#EF4444", 8: "#EC4899",
  9: "#8B5CF6", 10: "#D4AF37",
};

const VIP_LEVELS_PTS = [0, 5000, 15000, 30000, 75000, 150000, 350000, 750000, 1500000];

const WALLET_META = {
  C:              { label: "Cash",         icon: <DollarSign size={11} />, color: "#34D399", abbr: "CASH" },
  NC:             { label: "Non-Cash",     icon: <Gift size={11} />,       color: "#A78BFA", abbr: "NC"   },
  O:              { label: "OTP Credits",  icon: <Zap size={11} />,        color: "#2DD4BF", abbr: "OTP"  },
  RP:             { label: "Rolling Pts",  icon: <TrendingUp size={11} />, color: "#D4AF37", abbr: "RP"   },
  cash:           { label: "Cash",         icon: <DollarSign size={11} />, color: "#34D399", abbr: "CASH" },
  non_cash:       { label: "Non-Cash",     icon: <Gift size={11} />,       color: "#A78BFA", abbr: "NC"   },
  otp:            { label: "OTP Credits",  icon: <Zap size={11} />,        color: "#2DD4BF", abbr: "OTP"  },
  rolling_points: { label: "Rolling Pts",  icon: <TrendingUp size={11} />, color: "#D4AF37", abbr: "RP"   },
};

const isRPType = (wt) => wt === "RP" || wt === "rolling_points";

const TX_COLORS = {
  C:              { bg: "rgba(52,211,153,0.12)",  color: "#34D399", init: "$"  },
  cash:           { bg: "rgba(52,211,153,0.12)",  color: "#34D399", init: "$"  },
  NC:             { bg: "rgba(167,139,250,0.12)", color: "#A78BFA", init: "NC" },
  non_cash:       { bg: "rgba(167,139,250,0.12)", color: "#A78BFA", init: "NC" },
  O:              { bg: "rgba(45,212,191,0.12)",  color: "#2DD4BF", init: "⚡" },
  otp:            { bg: "rgba(45,212,191,0.12)",  color: "#2DD4BF", init: "⚡" },
  RP:             { bg: "rgba(212,175,55,0.12)",  color: "#D4AF37", init: "RP" },
  rolling_points: { bg: "rgba(212,175,55,0.12)",  color: "#D4AF37", init: "RP" },
};

const PER_PAGE    = 10;
const TX_PER_PAGE = 10;

/* ═══════════════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════════════ */
const S = {
  th: {
    padding: "10px 14px", textAlign: "left", fontSize: 10,
    color: "rgba(255,255,255,0.3)", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap",
  },
  td: { padding: "12px 14px" },
  input: {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "white", fontSize: 13, outline: "none",
  },
  sectionTitle: {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)",
    marginBottom: 10,
  },
};

// ── Pulse keyframe injected once ──────────────────────────
const _style = document.createElement("style");
_style.textContent = `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`;
document.head.appendChild(_style);

// Skeleton shimmer bar used in balance cells while loading
function Shimmer({ width = 60 }) {
  return (
    <div style={{
      width, height: 13, borderRadius: 4,
      background: "rgba(255,255,255,0.07)",
      animation: "pulse 1.4s ease-in-out infinite",
    }} />
  );
}

/* ═══════════════════════════════════════════════════════════
   API HELPERS
═══════════════════════════════════════════════════════════ */
async function fetchMainWallets(userId) {
  try {
    const r = await adminFetch(`${API}/api/admin-panel/wallet/accounts/user/${userId}/`);
    if (!r.ok) return [];
    const j = await r.json();
    return j.accounts || [];
  } catch { return []; }
}

async function fetchCasinoWallets(userId) {
  try {
    const r = await adminFetch(`${API}/api/admin-panel/wallet/casino-balances/user/${userId}/`);
    if (!r.ok) return [];
    const j = await r.json();
    return j.casinos || [];
  } catch { return []; }
}

async function fetchTransactions(userId, page = 1, perPage = TX_PER_PAGE, walletType = "all") {
  try {
    const p = new URLSearchParams({ page, page_size: perPage });
    if (walletType !== "all") p.set("wallet_type", walletType);
    const r = await adminFetch(`${API}/api/admin-panel/wallet/transactions/user/${userId}/?${p}`);
    if (!r.ok) return { results: [], count: 0 };
    return await r.json();
  } catch { return { results: [], count: 0 }; }
}

async function fetchTravelHistory(userId, page = 1, perPage = 5) {
  try {
    const p = new URLSearchParams({ page, page_size: perPage });
    const r = await adminFetch(`${API}/api/admin-panel/users/${userId}/travel-history/?${p}`);
    if (!r.ok) return { results: [], count: 0 };
    return await r.json();
  } catch { return { results: [], count: 0 }; }
}

async function fetchUserLevel(userId) {
  try {
    const r = await adminFetch(`${API}/api/admin-panel/users/${userId}/level/`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function computeBalances(mainWallets, casinoList) {
  const cashAcct = (mainWallets || []).find(
    a => a.wallet_type === "C" || a.wallet_type === "cash"
  );
  const availableCash = Number(cashAcct?.balance || 0);
  const casinoCash = (casinoList || []).reduce((sum, c) => {
    const cw = (c.wallets || []).find(
      w => w.wallet_type === "C" || w.wallet_type === "cash" || w.label === "Cash"
    );
    return sum + Number(cw?.balance || 0);
  }, 0);
  return { availableCash, totalMainBalance: availableCash + casinoCash };
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function UsersTab({ onToast }) {
  const [users,        setUsers]        = useState([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [q,            setQ]            = useState("");
  const [loading,      setLoading]      = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoad,   setDetailLoad]   = useState(false);

  // Cache so re-opening a user is instant
  const detailCache = useRef({});

  /* ── Load list ── */
  const loadUsers = useCallback(async (pg) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: pg, page_size: PER_PAGE });
      if (q) p.set("q", q);
      const r = await adminFetch(`${API}/api/admin-panel/users/?${p}`);
      const j = await r.json();
      const raw = j.results || [];

      // ✅ Render list instantly — balances show shimmer (null)
      setUsers(raw.map(u => ({
        ...u,
        _level:            u.vip_level ?? 1,
        _availableCash:    null,
        _totalMainBalance: null,
      })));
      setTotal(j.count || 0);

      // ✅ Background enrich — 3 users at a time
      const BATCH = 3;
      for (let i = 0; i < raw.length; i += BATCH) {
        const batch = raw.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (u) => {
            try {
              const [lvlJson, mainWallets, casinoList] = await Promise.all([
                fetchUserLevel(u.id),
                fetchMainWallets(u.id),
                fetchCasinoWallets(u.id),
              ]);
              const { availableCash, totalMainBalance } = computeBalances(mainWallets, casinoList);
              setUsers(prev => prev.map(row =>
                row.id === u.id
                  ? { ...row, _level: lvlJson?.level ?? u.vip_level ?? 1, _availableCash: availableCash, _totalMainBalance: totalMainBalance }
                  : row
              ));
            } catch { /* leave shimmer, don't crash */ }
          })
        );
      }
    } catch {
      onToast("Failed to load users", false);
    }
    setLoading(false);
  }, [q, onToast]);

  useEffect(() => { loadUsers(page); }, [page, loadUsers]);

  const handleSearch = useCallback(() => {
    if (page === 1) loadUsers(1);
    else setPage(1);
  }, [page, loadUsers]);

  /* ── Open detail panel ── */
  const openDetail = async (u) => {
    // Return from cache immediately if available
    if (detailCache.current[u.id]) {
      setSelectedUser(detailCache.current[u.id]);
      return;
    }

    // Show profile instantly from row data, load rest in background
    setSelectedUser({
      profile:     u,
      level:       null,
      mainWallets: null,
      casinos:     null,
      txData:      null,
      travelData:  null,
      _loading:    true,
    });

    try {
      // Wave 1: profile + level (fast, shown first)
      const [userRes, levelRes] = await Promise.all([
        adminFetch(`${API}/api/admin-panel/users/${u.id}/`),
        adminFetch(`${API}/api/admin-panel/users/${u.id}/level/`),
      ]);
      const profile = userRes.ok  ? await userRes.json()  : u;
      const level   = levelRes.ok ? await levelRes.json() : null;
      setSelectedUser(s => ({ ...s, profile, level }));

      // Wave 2: wallets + transactions + travel (heavier)
      const [mainWallets, casinos, txData, travelData] = await Promise.all([
        fetchMainWallets(u.id),
        fetchCasinoWallets(u.id),
        fetchTransactions(u.id, 1, TX_PER_PAGE),
        fetchTravelHistory(u.id, 1, 5),
      ]);
      const final = { profile, level, mainWallets, casinos, txData, travelData, _loading: false };
      detailCache.current[u.id] = final;   // cache for instant re-open
      setSelectedUser(final);
    } catch {
      onToast("Error fetching user details", false);
    }
  };

  const closeDetail = () => setSelectedUser(null);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: (selectedUser || detailLoad) ? "1fr 480px" : "1fr",
      gap: 18,
      alignItems: "start",
    }}>

      {/* ── LEFT: TABLE ── */}
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)" }} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Search UID, Email or Name…"
              style={{ ...S.input, paddingLeft: 34 }}
            />
          </div>
          <button onClick={handleSearch} style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <Search size={12} /> Search
          </button>
          <button onClick={() => { detailCache.current = {}; loadUsers(page); }} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
            <RefreshCw size={13} />
          </button>
        </div>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                {["UID", "User", "Level", "Available Balance", "Total Balance", "Status", "Actions"].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center" }}><Spinner /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: selectedUser?.profile?.id === u.id ? "rgba(212,175,55,0.04)" : "transparent" }}>
                  <td style={S.td}><UidBadge uid={u.user_uid} /></td>
                  <td style={S.td}>
                    <div style={{ fontWeight: 600, color: "white" }}>{u.name || "—"}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{u.email}</div>
                  </td>
                  <td style={S.td}><LevelBadge level={u._level} /></td>

                  {/* ✅ Available Balance — shimmer while null */}
                  <td style={S.td}>
                    {u._availableCash === null ? (
                      <Shimmer width={72} />
                    ) : (
                      <>
                        <div style={{ fontFamily: "monospace", color: "#34D399", fontWeight: 700 }}>{fmt(u._availableCash)}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Can deposit/payout</div>
                      </>
                    )}
                  </td>

                  {/* ✅ Total Balance — shimmer while null */}
                  <td style={S.td}>
                    {u._totalMainBalance === null ? (
                      <Shimmer width={72} />
                    ) : (
                      <>
                        <div style={{ fontFamily: "monospace", color: "#60A5FA", fontWeight: 700 }}>{fmt(u._totalMainBalance)}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Incl. all casinos</div>
                      </>
                    )}
                  </td>

                  <td style={S.td}><StatusBadge kycStatus={u.kyc_status} isActive={u.is_active} /></td>
                  <td style={S.td}>
                    <button onClick={() => openDetail(u)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: selectedUser?.profile?.id === u.id ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.05)", color: "white", fontSize: 11, cursor: "pointer" }}>
                      <Eye size={12} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={pg => setPage(pg)} />
          </div>
        </Card>
      </div>

      {/* ── RIGHT: DETAIL PANEL ── */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            style={{ position: "sticky", top: 20 }}
          >
            <UserDetailPanel
              data={selectedUser}
              onClose={closeDetail}
              onToast={onToast}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   USER DETAIL PANEL
═══════════════════════════════════════════════════════════ */
function UserDetailPanel({ data, onClose, onToast }) {
  const { profile: u, level: lvl, mainWallets, casinos, txData, travelData, _loading } = data;

  const [txState, setTxState] = useState({
    results: txData?.results || [],
    count:   txData?.count   || 0,
    page:    1,
    loading: false,
    filter:  "all",
  });
  const [travelState, setTravelState] = useState({
    results: travelData?.results || [],
    count:   travelData?.count   || 0,
    page:    1,
    loading: false,
  });
  const [selectedCasino, setSelectedCasino] = useState(casinos?.[0]?.casino_name || "");
  const [expandedTx,     setExpandedTx]     = useState(null);

  // Sync tx/travel when data arrives from parent wave-2 fetch
  useEffect(() => {
    if (txData)     setTxState(s => ({ ...s, results: txData.results || [], count: txData.count || 0 }));
  }, [txData]);
  useEffect(() => {
    if (travelData) setTravelState(s => ({ ...s, results: travelData.results || [], count: travelData.count || 0 }));
  }, [travelData]);
  useEffect(() => {
    if (casinos?.[0]) setSelectedCasino(casinos[0].casino_name);
  }, [casinos]);

  const curLvl   = lvl?.level || u?.vip_level || 1;
  const lvlColor = LEVEL_COLORS[curLvl] || "#9CA3AF";
  const { availableCash, totalMainBalance } = computeBalances(mainWallets, casinos);

  const pts         = lvl?.points || 0;
  const nextPts     = VIP_LEVELS_PTS[curLvl] || null;
  const prevPts     = VIP_LEVELS_PTS[curLvl - 1] || 0;
  const progressPct = nextPts
    ? Math.min(((pts - prevPts) / (nextPts - prevPts)) * 100, 100)
    : 100;

  const loadTx = useCallback(async (pg, filter) => {
    setTxState(s => ({ ...s, loading: true }));
    const j = await fetchTransactions(u.id, pg, TX_PER_PAGE, filter);
    setTxState(s => ({ ...s, results: j.results || [], count: j.count || 0, page: pg, loading: false }));
  }, [u.id]);

  const loadTravel = useCallback(async (pg) => {
    setTravelState(s => ({ ...s, loading: true }));
    const j = await fetchTravelHistory(u.id, pg, 5);
    setTravelState(s => ({ ...s, results: j.results || [], count: j.count || 0, page: pg, loading: false }));
  }, [u.id]);

  const selectedCasinoData = casinos?.find(c => c.casino_name === selectedCasino);
  const KYC_COLOR = {
    approved: "#34D399", rejected: "#F87171",
    submitted: "#FBBF24", pending: "rgba(255,255,255,0.35)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "calc(100vh - 100px)", overflowY: "auto", paddingRight: 2 }}>

      {/* ── 1. PROFILE HEADER ── */}
      <Card style={{ position: "relative", background: `linear-gradient(135deg, ${lvlColor}10, rgba(0,0,0,0))`, border: `1px solid ${lvlColor}25` }}>
        <button onClick={onClose} style={{ position: "absolute", right: 12, top: 12, background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer" }}>
          <X size={18} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: `linear-gradient(135deg, ${lvlColor}, ${lvlColor}70)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "#06080E", flexShrink: 0 }}>
            {u?.avatar_url
              ? <img src={u.avatar_url} alt="av" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
              : (u?.name || u?.email || "U")[0].toUpperCase()
            }
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>{u?.name || "—"}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{u?.email}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <UidBadge uid={u?.user_uid} />
          <LevelBadge level={curLvl} />
          <StatusBadge kycStatus={u?.kyc_status} isActive={u?.is_active} />
        </div>
        {u?.is_active === false && (
          <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 6, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", fontSize: 11, color: "#F87171", display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={11} /> Account is banned / inactive
          </div>
        )}
      </Card>

      {/* ── 2. BALANCE SUMMARY ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {_loading ? (
          <>
            <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.15)" }}>
              <Shimmer width={80} /><div style={{ marginTop: 10 }}><Shimmer width={50} /></div>
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.15)" }}>
              <Shimmer width={80} /><div style={{ marginTop: 10 }}><Shimmer width={50} /></div>
            </div>
          </>
        ) : (
          <>
            <BalanceCard label="Available Cash" sub="Can deposit / payout" value={fmt(availableCash)}     color="#34D399" bg="rgba(52,211,153,0.06)"  border="rgba(52,211,153,0.25)"  />
            <BalanceCard label="Total Balance"  sub="Main + all casinos"   value={fmt(totalMainBalance)}  color="#60A5FA" bg="rgba(96,165,250,0.06)"  border="rgba(96,165,250,0.25)"  />
          </>
        )}
      </div>

      {/* ── 3. MAIN WALLET ACCOUNTS ── */}
      <Card>
        <div style={S.sectionTitle}>💳 Main Wallet Accounts</div>
        {_loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}><Shimmer width={40} /><div style={{ marginTop: 8 }}><Shimmer width={60} /></div></div>)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(mainWallets || []).map(w => {
              const m = WALLET_META[w.wallet_type] || { label: w.wallet_type, color: "#888", icon: <Info size={11} />, abbr: "?" };
              const isRP = isRPType(w.wallet_type);
              return (
                <div key={w.id || w.wallet_type} style={{ padding: "10px 12px", borderRadius: 8, background: `${m.color}08`, border: `1px solid ${m.color}20` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 3 }}>
                    {m.icon} {m.label}
                  </div>
                  {w.account_number && (
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "monospace", marginBottom: 4 }}>{w.account_number}</div>
                  )}
                  <div style={{ fontSize: 15, fontWeight: 900, color: m.color, fontFamily: "monospace" }}>
                    {isRP ? `${fmtN(w.balance)} RP` : fmt(w.balance)}
                  </div>
                </div>
              );
            })}
            {(!mainWallets || mainWallets.length === 0) && (
              <div style={{ gridColumn: "1/-1", fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: 10 }}>No wallet data</div>
            )}
          </div>
        )}
      </Card>

      {/* ── 4. CASINO WALLETS ── */}
      {(casinos && casinos.length > 0) && (
        <Card>
          <div style={S.sectionTitle}>🎰 Casino Wallets ({casinos.length} casino{casinos.length > 1 ? "s" : ""})</div>
          {casinos.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {casinos.map(c => (
                <button key={c.casino_name} onClick={() => setSelectedCasino(c.casino_name)}
                  style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", border: `1px solid ${selectedCasino === c.casino_name ? "rgba(212,175,55,0.6)" : "rgba(255,255,255,0.1)"}`, background: selectedCasino === c.casino_name ? "rgba(212,175,55,0.12)" : "transparent", color: selectedCasino === c.casino_name ? "#D4AF37" : "rgba(255,255,255,0.45)", fontWeight: selectedCasino === c.casino_name ? 700 : 400 }}>
                  {c.casino_name}
                </button>
              ))}
            </div>
          )}
          {selectedCasinoData ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
              {(selectedCasinoData.wallets || []).map(w => {
                const color = w.color || WALLET_META[w.wallet_type]?.color || "#888";
                const label = w.label || WALLET_META[w.wallet_type]?.label || w.wallet_type;
                return (
                  <div key={w.wallet_type} style={{ padding: "10px 12px", borderRadius: 8, background: `${color}08`, border: `1px solid ${color}20` }}>
                    <div style={{ fontSize: 9, color, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 900, fontFamily: "monospace", color: "white" }}>
                      {isRPType(w.wallet_type) ? `${fmtN(w.balance)} RP` : fmt(w.balance)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "8px 0", marginBottom: 10 }}>Select a casino above</div>
          )}
          <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.08em" }}>Cash balance per casino</div>
            {casinos.map(c => {
              const cw  = (c.wallets || []).find(w => w.wallet_type === "C" || w.wallet_type === "cash" || w.label === "Cash");
              const bal = Number(cw?.balance || 0);
              return (
                <div key={c.casino_name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>{c.casino_name}</span>
                  <span style={{ fontFamily: "monospace", color: "#34D399", fontWeight: 700 }}>{fmt(bal)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── 5. TRANSACTION HISTORY ── */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={S.sectionTitle}>📋 Transaction History</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[{ key: "all", label: "All" }, { key: "C", label: "Cash" }, { key: "NC", label: "NC" }, { key: "O", label: "OTP" }, { key: "RP", label: "RP" }].map(f => (
              <button key={f.key} onClick={() => { setTxState(s => ({ ...s, filter: f.key, page: 1 })); loadTx(1, f.key); }}
                style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, cursor: "pointer", border: `1px solid ${txState.filter === f.key ? "rgba(212,175,55,0.6)" : "rgba(255,255,255,0.1)"}`, background: txState.filter === f.key ? "rgba(212,175,55,0.12)" : "transparent", color: txState.filter === f.key ? "#D4AF37" : "rgba(255,255,255,0.4)" }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {(_loading || txState.loading) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, alignItems: "center", padding: "6px 0" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.06)", animation: "pulse 1.4s ease-in-out infinite" }} />
                <div><Shimmer width={120} /><div style={{ marginTop: 5 }}><Shimmer width={80} /></div></div>
                <Shimmer width={50} />
              </div>
            ))}
          </div>
        ) : txState.results.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>No transactions found</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {txState.results.map(tx => {
              const isCredit  = tx.direction === "credit";
              const isOpen    = expandedTx === tx.id;
              const wt        = tx.wallet_type || "C";
              const wc        = TX_COLORS[wt] || { bg: "rgba(150,150,150,0.1)", color: "#aaa", init: "?" };
              const isRP      = isRPType(wt);
              const typeLabel = tx.transaction_type_label || tx.transaction_type || "Transaction";
              return (
                <div key={tx.id}>
                  <div onClick={() => setExpandedTx(isOpen ? null : tx.id)}
                    style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", alignItems: "center" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: wc.bg, color: wc.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{wc.init}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {typeLabel}
                        {tx.casino_name && <span style={{ marginLeft: 5, fontSize: 9, color: "#A78BFA", background: "rgba(167,139,250,0.1)", padding: "1px 5px", borderRadius: 3, border: "1px solid rgba(167,139,250,0.2)" }}>{tx.casino_name}</span>}
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                        {fmtDT(tx.created_at)}
                        {tx.transaction_reference && <span style={{ fontFamily: "monospace", marginLeft: 6 }}>{tx.transaction_reference}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: isCredit ? "#34D399" : "#F87171" }}>
                        {isCredit ? "+" : "−"}{isRP ? `${fmtN(tx.amount)} RP` : fmt(tx.amount)}
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>bal: {isRP ? `${fmtN(tx.balance_after)} RP` : fmt(tx.balance_after)}</div>
                    </div>
                  </div>
                  <div style={{ overflow: "hidden", maxHeight: isOpen ? 200 : 0, transition: "max-height 0.25s ease", background: "rgba(255,255,255,0.015)", borderBottom: isOpen ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <div style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px 12px" }}>
                      {[
                        { label: "Before", value: isRP ? `${fmtN(tx.balance_before)} RP` : fmt(tx.balance_before) },
                        { label: "After",  value: isRP ? `${fmtN(tx.balance_after)}  RP` : fmt(tx.balance_after)  },
                        { label: "Status", value: (tx.validation_status || tx.status || "approved").toUpperCase() },
                        { label: "Type",   value: tx.transaction_type  || "—" },
                        { label: "By",     value: tx.performed_by_name || "System" },
                        { label: "Wallet", value: WALLET_META[wt]?.label || wt },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>{value}</div>
                        </div>
                      ))}
                      {tx.note && (
                        <div style={{ gridColumn: "1/-1" }}>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 2 }}>Note</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{tx.note}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {txState.count > TX_PER_PAGE && (
          <MiniPagination page={txState.page} total={txState.count} perPage={TX_PER_PAGE} onChange={pg => loadTx(pg, txState.filter)} />
        )}
      </Card>

      {/* ── 6. CASINO TRAVEL HISTORY ── */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <Plane size={12} style={{ color: "#60A5FA" }} />
          <div style={S.sectionTitle}>Casino Visit History</div>
          <div style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{travelState.count} visits</div>
        </div>
        {(_loading || travelState.loading) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0,1].map(i => <div key={i} style={{ borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: 12 }}><Shimmer width={100} /><div style={{ marginTop: 8 }}><Shimmer width={200} /></div></div>)}
          </div>
        ) : travelState.results.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>No casino visits recorded</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {travelState.results.map(t => {
              const vipColor = LEVEL_COLORS[(t.vip_level_at_time || 1)] || "#9CA3AF";
              const vipName  = LEVEL_NAMES[(t.vip_level_at_time || 1)]  || "VIP";
              return (
                <div key={t.id} style={{ borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
                  <div style={{ height: 2, background: `linear-gradient(90deg, ${vipColor}, transparent)` }} />
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "white" }}>{t.casino_name || "—"}</div>
                        <div style={{ display: "flex", gap: 5, marginTop: 3 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: `${vipColor}18`, color: vipColor, border: `1px solid ${vipColor}30` }}>{vipName}</span>
                          {t.level_up_triggered && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(52,211,153,0.12)", color: "#34D399", border: "1px solid rgba(52,211,153,0.3)" }}>⬆ Leveled Up</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 3 }}>
                          <Calendar size={9} />
                          {t.betting_date
                            ? new Date(t.betting_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                            : (t.created_at ? fmtDT(t.created_at) : "—")}
                        </div>
                        {t.slip_number && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 2, fontFamily: "monospace" }}>#{t.slip_number}</div>}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                      {[
                        { label: "Bets",      value: (t.total_bets || 0).toLocaleString("en-IN"),                         color: "rgba(255,255,255,0.6)" },
                        { label: "Bet Amt",   value: `$${Number(t.total_bet_amount || 0).toLocaleString("en-IN")}`,        color: "#D4AF37"               },
                        { label: "RP Earned", value: `+${Number(t.rolling_points_added || 0).toLocaleString("en-IN")} RP`, color: "#A78BFA"               },
                        { label: "Total RP",  value: `${Number(t.rolling_points_total || 0).toLocaleString("en-IN")} RP`,  color: "rgba(255,255,255,0.45)" },
                      ].map(({ label, value, color }) => (
                        <div key={label}>
                          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {t.note && <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>{t.note}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {travelState.count > 5 && <MiniPagination page={travelState.page} total={travelState.count} perPage={5} onChange={pg => loadTravel(pg)} />}
      </Card>

      {/* ── 7. VIP RANK PROGRESS ── */}
      <Card>
        <div style={S.sectionTitle}>⭐ VIP Rank Progress</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: lvlColor }}>{LEVEL_NAMES[curLvl] || `Level ${curLvl}`}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>{pts.toLocaleString()} pts</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
          <div style={{ width: `${progressPct}%`, height: "100%", background: lvlColor, boxShadow: `0 0 10px ${lvlColor}50`, transition: "width 0.5s ease" }} />
        </div>
        {nextPts && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 5 }}>
            <span>{LEVEL_NAMES[curLvl]}</span>
            <span>Next: {nextPts.toLocaleString()} pts → {LEVEL_NAMES[curLvl + 1] || `Level ${curLvl + 1}`}</span>
          </div>
        )}
      </Card>

      {/* ── 9. REFERRAL INFO ── */}
      <Card>
        <div style={S.sectionTitle}>👥 Referral Info</div>
        <DetailRow icon={<Star size={10} />}       label="Referral Code"     value={u?.referral_code || "—"} mono />
        <DetailRow icon={<Users size={10} />}      label="Referred Count"    value={u?.referral_count ?? "0"} />
        <DetailRow icon={<DollarSign size={10} />} label="Referral Earnings" value={fmt(u?.referral_earnings || 0)} mono />
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 6 }}>Referred By</div>
          {u?.referred_by_uid ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.18)" }}>
              <User size={11} color="#D4AF37" />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#D4AF37", fontFamily: "monospace" }}>{u.referred_by_uid}</span>
              {u.referred_by_name && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>· {u.referred_by_name}</span>}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>None</div>
          )}
        </div>
        {u?.referred_users?.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 6 }}>Referred Users ({u.referred_users.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {u.referred_users.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)" }}>
                  <User size={10} color="#60A5FA" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#60A5FA", fontFamily: "monospace" }}>{r.uid}</span>
                  {r.name && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>· {r.name}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── 10. IDENTITY & ACCOUNT ── */}
      <Card>
        <div style={S.sectionTitle}>🪪 Identity & Account</div>
        <DetailRow icon={<Phone size={10} />}         label="Phone"              value={u?.phone || "Not provided"} />
        <DetailRow icon={<Globe size={10} />}         label="Country"            value={u?.country || "—"} />
        <DetailRow icon={<Calendar size={10} />}      label="Date of Birth"      value={u?.date_of_birth || "—"} />
        <DetailRow icon={<Calendar size={10} />}      label="Member Since"       value={fmtDT(u?.date_joined)} />
        <DetailRow icon={<Clock size={10} />}         label="Last Login"         value={u?.last_login ? fmtDT(u.last_login) : "Never"} />
        <DetailRow icon={<ShieldCheck size={10} />}   label="KYC Status"         value={
          <span style={{ color: KYC_COLOR[u?.kyc_status] || KYC_COLOR.pending, fontWeight: 700, textTransform: "capitalize" }}>{u?.kyc_status || "Pending"}</span>
        } />
        <DetailRow icon={<CheckCircle size={10} />}   label="Email Verified"     value={
          <span style={{ color: u?.is_verified ? "#34D399" : "#F87171" }}>{u?.is_verified ? "Yes" : "No"}</span>
        } />
        <DetailRow icon={<AlertTriangle size={10} />} label="Account Active"     value={
          <span style={{ color: u?.is_active !== false ? "#34D399" : "#F87171" }}>{u?.is_active !== false ? "Active" : "Banned / Inactive"}</span>
        } />
        {u?.profile_locked_until && (
          <DetailRow icon={<AlertTriangle size={10} />} label="Profile Locked Until" value={fmtDT(u.profile_locked_until)} />
        )}
      </Card>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SMALL REUSABLE COMPONENTS
═══════════════════════════════════════════════════════════ */
function BalanceCard({ label, sub, value, color, bg, border }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
      <div style={{ fontSize: 9, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginBottom: 6 }}>{sub}</div>
      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "monospace", color }}>{value}</div>
    </div>
  );
}

function MiniPagination({ page, total, perPage, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage + 1;
  const end   = Math.min(page * perPage, total);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
      <span>{start}–{end} of {total}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: page === 1 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 10 }}>
          ← Prev
        </button>
        <span style={{ padding: "0 4px" }}>{page}/{totalPages}</span>
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: page >= totalPages ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)", cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: 10 }}>
          Next →
        </button>
      </div>
    </div>
  );
}

function LevelBadge({ level }) {
  const lvl   = Number(level) || 1;
  const name  = LEVEL_NAMES[lvl] || `Level ${lvl}`;
  const color = LEVEL_COLORS[lvl] || "#9CA3AF";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: `${color}15`, border: `1px solid ${color}30`, fontSize: 10, fontWeight: 800, color }}>
      <Star size={10} fill={color} /> {name}
    </span>
  );
}

function StatusBadge({ kycStatus, isActive }) {
  if (isActive === false) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", fontSize: 10, fontWeight: 700, color: "#F87171" }}>
        <X size={10} /> Banned
      </span>
    );
  }
  const map = {
    approved:  { color: "#34D399", label: "Active",       icon: <CheckCircle size={10} /> },
    submitted: { color: "#60A5FA", label: "Reviewing",    icon: <Clock size={10} /> },
    pending:   { color: "#FBBF24", label: "KYC Pending",  icon: <Clock size={10} /> },
    rejected:  { color: "#F87171", label: "KYC Rejected", icon: <X size={10} /> },
  };
  const s = map[kycStatus] || map.pending;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: `${s.color}15`, border: `1px solid ${s.color}30`, fontSize: 10, fontWeight: 700, color: s.color }}>
      {s.icon} {s.label}
    </span>
  );
}

function DetailRow({ icon, label, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: mono ? "monospace" : "inherit" }}>
        {value}
      </div>
    </div>
  );
}